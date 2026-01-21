/**
 * Material Matching Service
 * 
 * This service matches parsed RFQ line items to materials in the database.
 * 
 * FALLBACK MATCHING (for MTO-style RFQs with sparse attributes):
 * 
 * When normal matching returns 0 results, the service uses fallback matchers:
 * 
 * 1. **Pipe Fallback Matcher** (`fallbackPipeMatcher`):
 *    - Triggers when item description indicates a pipe but normal matching found nothing
 *    - Extracts NPS (Nominal Pipe Size) from description using heuristics:
 *      * Pattern matching: "24\"", "6 IN", "DN150" → converts to NPS
 *    - Queries `pipes` table directly for matching NPS
 *    - Finds materials linked via `pipe_id` or searches materials with matching NPS in `notes` JSON
 *    - Returns low-confidence matches (score 30-50) instead of 0 matches
 *    - Only used when normal matching returns 0 results
 * 
 * 2. **Generic Fallback Matcher** (`fallbackGenericMatcher`):
 *    - Triggers for non-pipe items (flanges, gaskets, spades, etc.)
 *    - Infers category from description keywords (FLANGE, GASKET, etc.)
 *    - Extracts size/NPS if available
 *    - Searches materials table by category + size
 *    - Returns low-confidence matches (score 20-40)
 * 
 * **When to disable**: Set `minScore` very high (>50) to effectively disable fallback matches,
 * or modify the fallback functions to return empty arrays.
 * 
 * **Why it exists**: MTO PDFs often have sparse technical attributes (e.g., "PIPE 6C1 18 m 24\"")
 * where schedule, standard, and grade are missing. The fallback ensures we still get reasonable
 * matches based on size alone, rather than returning 0 matches.
 */

const materialsService = require('./materialsService');
const materialParsers = require('./materialParsers');
const typeIdentifier = require('./materialParsers/typeIdentifier');
const pipesService = require('./pipesService');
const { connectDb } = require('../db/supabaseClient');

// Cache for materials
const cacheService = require('./cacheService');
const CACHE_TTL_SECONDS = 5 * 60; // 5 minutes in seconds

// Debug logging for PIPE items
let pipeDebugLoggedCount = 0;
const MAX_PIPE_DEBUG_LOGS = 3;

function debugLogPipeItem(item) {
  if (pipeDebugLoggedCount >= MAX_PIPE_DEBUG_LOGS) return;
  pipeDebugLoggedCount++;

  try {
    console.log("[PIPE DEBUG] Full PIPE item object:", JSON.stringify(item, null, 2));
    console.log("[PIPE DEBUG] PIPE item keys:", Object.keys(item));
  } catch (err) {
    console.log("[PIPE DEBUG] Error logging PIPE item:", err);
  }
}

/**
 * Normalizes a size value for comparison
 * @param {string|null|undefined} value - Size value to normalize
 * @returns {string|null} Normalized size or null
 */
function normalizeSize(value) {
  if (!value) return null;
  return value
    .toString()
    .toUpperCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[""]/g, '"') // Normalize quotes
    .replace(/['']/g, "'");
}

/**
 * Normalizes a schedule value for comparison
 * @param {string|null|undefined} value - Schedule value to normalize
 * @returns {string|null} Normalized schedule or null
 */
function normalizeSchedule(value) {
  if (!value) return null;
  return value
    .toString()
    .toUpperCase()
    .trim()
    .replace(/^SCH(EDULE)?\s*/i, 'SCH') // Normalize "SCHEDULE" or "SCH" prefix
    .replace(/\s+/g, '');
}

/**
 * Normalizes a standard value for comparison
 * @param {string|null|undefined} value - Standard value to normalize
 * @returns {string|null} Normalized standard or null
 */
function normalizeStandard(value) {
  if (!value) return null;
  return value
    .toString()
    .toUpperCase()
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Normalizes a grade value for comparison
 * @param {string|null|undefined} value - Grade value to normalize
 * @returns {string|null} Normalized grade or null
 */
function normalizeGrade(value) {
  if (!value) return null;
  return value
    .toString()
    .toUpperCase()
    .trim()
    .replace(/^GR(ADE)?\s*/i, 'GR') // Normalize "GRADE" or "GR" prefix
    .replace(/\s+/g, '');
}

/**
 * Checks if two strings match (exact or contains)
 * @param {string|null} a - First string
 * @param {string|null} b - Second string
 * @param {boolean} exact - If true, require exact match; if false, allow contains
 * @returns {boolean} True if matches
 */
function stringMatches(a, b, exact = false) {
  if (!a || !b) return false;
  if (exact) {
    return a === b;
  }
  return a.includes(b) || b.includes(a);
}

/**
 * Infers product type from description
 * @param {string} description - Item description
 * @returns {string|null} Inferred product type (pipe, flange, fitting, beam, tubular, plate, etc.)
 */
function inferProductType(description) {
  if (!description) return null;
  const desc = description.toUpperCase();
  
  // Structural beams
  if (/W\s*\d+\s*[Xx]\s*\d+/.test(desc) || /H(EA|EB)\s+\d+/.test(desc) || 
      (desc.includes('BEAM') && (desc.includes('W') || desc.includes('HEA') || desc.includes('HEB')))) {
    return 'beam';
  }
  
  // Tubulars (large OD x wall format)
  const tubularMatch = desc.match(/(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)/);
  if (tubularMatch) {
    const od = parseFloat(tubularMatch[1]);
    if (od > 500 || desc.includes('TUBULAR') || desc.includes('TUBE')) {
      return 'tubular';
    }
  }
  
  // Plates
  if (/PL\s*\d+/.test(desc) || (desc.includes('PLATE') && /\d+\s*MM/.test(desc))) {
    return 'plate';
  }
  
  // Pipes
  if (desc.includes('PIPE') || desc.includes('TUBE')) {
    return 'pipe';
  }
  
  // Flanges
  if (desc.includes('FLANGE')) {
    return 'flange';
  }
  
  // Fittings
  if (desc.includes('ELBOW') || desc.includes('TEE') || desc.includes('REDUCER') || 
      desc.includes('CAP') || desc.includes('COUPLING') || desc.includes('FITTING')) {
    return 'fitting';
  }
  
  return null;
}

/**
 * Checks if a description refers to a pipe
 * Pipe descriptions typically contain keywords like "pipe", "line pipe", "seamless", "ERW",
 * or match patterns like inch size + schedule (e.g., "6\" SCH40")
 * @param {string} description - Item description
 * @returns {boolean} True if description appears to be a pipe
 */
function isPipeDescription(description) {
  if (!description) return false;
  const desc = description.toUpperCase();
  
  // Direct pipe keywords
  if (desc.includes('PIPE') || desc.includes('LINE PIPE') || desc.includes('TUBE')) {
    return true;
  }
  
  // Pattern: size in inches + schedule (e.g., "6\" SCH40", "2\" SCH10")
  const pipePattern = /(\d+(\.\d+)?)\s*[""]\s*SCH\s*([0-9XxSs]+)/i;
  if (pipePattern.test(desc)) {
    return true;
  }
  
  // Seamless/welded keywords often indicate pipes
  if ((desc.includes('SEAMLESS') || desc.includes('WELDED') || desc.includes('ERW')) &&
      (desc.includes('SCH') || /\d+\s*[""]/.test(desc))) {
    return true;
  }
  
  return false;
}

/**
 * Checks if a parsed item is a pipe
 * @param {Object} item - Parsed line item
 * @returns {boolean} True if item is a pipe
 */
function isPipeItem(item) {
  const d = (item.description || "").toLowerCase();
  return d.startsWith("pipe") || d.includes(" pipe ");
}

/**
 * Extracts NPS from a parsed item using multiple heuristics
 * @param {Object} item - Parsed line item
 * @returns {number|null} NPS in inches, or null if not found
 */
function extractNpsFromItem(item) {
  const candidates = [
    item.size1,
    item.size2,
    item.description
  ];

  for (const field of candidates) {
    if (!field || typeof field !== "string") continue;
    const text = field.toLowerCase();

    // Patterns: 6", 6 IN, NPS 6, 6 inch, 6in
    const patterns = [
      /(\d+)\s*"/,
      /(\d+)\s*in\b/,
      /nps\s*(\d+)/,
      /(\d+)\s*inch/,
      /(\d+)\s*in\./,
      /\b(\d+)\b/
    ];

    for (const re of patterns) {
      const m = text.match(re);
      if (m && m[1]) {
        const nps = parseInt(m[1], 10);
        if (!isNaN(nps)) return nps;
      }
    }
  }

  return null;
}

/**
 * Extracts pipe-specific attributes from a parsed line item
 * Also handles tubular formats (OD x Wall) that might be described as pipes
 * @param {Object} input - Input object with description, size, schedule, standard, grade, etc.
 * @returns {Object} Extracted pipe attributes
 */
function extractPipeAttributes(input) {
  const result = {
    nps_inch: null,
    schedule: null,
    material_family: null,
    standard: null,
    grade: null,
    form: null,
    // Tubular attributes (if detected)
    od_mm: null,
    wall_thickness_mm: null,
  };

  const desc = (input.description || '').toUpperCase();
  const size = input.size || '';
  const schedule = input.schedule || '';
  const standard = input.standard || '';
  const grade = input.grade || '';

  // First, check if this is actually a tubular format (OD x Wall)
  // Examples: 30000x25, 1828.80x44.5, 457 x 39.61
  const tubularMatch = desc.match(/(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)/);
  if (tubularMatch) {
    const od = parseFloat(tubularMatch[1]);
    const wall = parseFloat(tubularMatch[2]);
    
    // If OD is large (>500mm), this is likely a tubular, not a pipe
    if (od > 500 || desc.includes('TUBULAR') || desc.includes('TUBE')) {
      result.od_mm = od;
      result.wall_thickness_mm = wall;
      // Convert OD to approximate NPS for matching purposes
      result.nps_inch = od / 25.4;
      return result;
    }
    
    // Smaller sizes might still be pipes - store both
    result.od_mm = od;
    result.wall_thickness_mm = wall;
  }

  // Extract NPS (Nominal Pipe Size) in inches
  // Pattern: "6\"", "2\"", "1.5\"", "DN150" (convert DN to inches if needed)
  const npsMatch = size.match(/(\d+(\.\d+)?)\s*[""]/i) || desc.match(/(\d+(\.\d+)?)\s*[""]/i);
  if (npsMatch) {
    result.nps_inch = parseFloat(npsMatch[1]);
  } else {
    // Try DN pattern (DN150 = 6", DN50 = 2", etc.)
    const dnMatch = size.match(/DN\s*(\d+)/i) || desc.match(/DN\s*(\d+)/i);
    if (dnMatch) {
      const dnValue = parseInt(dnMatch[1], 10);
      // Approximate DN to NPS conversion (DN50≈2", DN100≈4", DN150≈6", DN200≈8", DN250≈10", DN300≈12", DN500≈20")
      const dnToNps = { 50: 2, 100: 4, 150: 6, 200: 8, 250: 10, 300: 12, 500: 20 };
      if (dnToNps[dnValue]) {
        result.nps_inch = dnToNps[dnValue];
      }
    }
  }

  // Extract schedule
  // Pattern: "SCH40", "SCH 40", "SCH-40", "XS", "XXS"
  const scheduleMatch = schedule.match(/SCH\s*([0-9XxSs]+)/i) || 
                        desc.match(/SCH(EDULE)?\s*([0-9XxSs]+)/i);
  if (scheduleMatch) {
    result.schedule = scheduleMatch[1] || scheduleMatch[2];
  } else if (/^[Xx]{1,2}[Ss]$/i.test(schedule)) {
    result.schedule = schedule.toUpperCase();
  }

  // Extract material family
  // CS (Carbon Steel), LTCS (Low Temp CS), SS (Stainless Steel), ALLOY
  if (desc.includes('CARBON STEEL') || desc.includes(' CS ') || desc.includes('CS,') || 
      desc.includes('CS-') || desc.includes('CS/') || /^CS\s/.test(desc)) {
    if (desc.includes('LOW TEMP') || desc.includes('LTCS') || desc.includes('LT CS')) {
      result.material_family = 'LTCS';
    } else {
      result.material_family = 'CS';
    }
  } else if (desc.includes('STAINLESS STEEL') || desc.includes(' SS ') || 
             desc.includes('SS304') || desc.includes('SS316') || desc.includes('SS316L') ||
             desc.includes('SS,') || desc.includes('SS-') || desc.includes('SS/') || /^SS\s/.test(desc)) {
    result.material_family = 'SS';
  } else if (desc.includes('ALLOY')) {
    result.material_family = 'ALLOY';
  }

  // Extract standard
  // ASTM A106, A333, A312, API 5L, etc.
  if (standard) {
    result.standard = standard.toUpperCase();
  } else {
    const standardMatch = desc.match(/(ASTM\s*[A]\d+[A-Z]?|API\s*5L|ASME\s*[A-Z]\d+)/i);
    if (standardMatch) {
      result.standard = standardMatch[1].toUpperCase();
    }
  }

  // Extract grade
  // GR.B, GR.A, GR.6, TP304, TP316L, X42, X52, etc.
  if (grade) {
    result.grade = grade.toUpperCase();
  } else {
    const gradeMatch = desc.match(/(GR\.?\s*[AB]|GR\.?\s*\d+|TP\d+[L]?|X\d{2})/i);
    if (gradeMatch) {
      result.grade = gradeMatch[1].toUpperCase().replace(/\s+/g, '');
    }
  }

  // Extract form (seamless vs welded)
  if (desc.includes('SEAMLESS')) {
    result.form = 'seamless';
  } else if (desc.includes('WELDED') || desc.includes('ERW') || desc.includes('SAW')) {
    result.form = 'welded';
  }

  return result;
}

/**
 * Parses pipe attributes from material notes (JSON)
 * @param {string|null} notes - Notes field from material (may contain JSON)
 * @returns {Object|null} Parsed pipe attributes or null
 */
function parsePipeAttributesFromMaterial(notes) {
  if (!notes) return null;
  try {
    const parsed = JSON.parse(notes);
    if (parsed.nps_inch !== undefined || parsed.schedule) {
      return parsed;
    }
  } catch (e) {
    // Not JSON or invalid JSON
  }
  return null;
}

/**
 * Scores a pipe material match using pipe-specific attributes
 * @param {Object} parsedPipeAttrs - Extracted pipe attributes from parsed item
 * @param {Object} materialPipeAttrs - Pipe attributes from material (from notes JSON)
 * @param {Object} parsedItem - Original parsed item
 * @param {Object} material - Material from database
 * @returns {Object} Score and reasons
 */
function scorePipeMatch(parsedPipeAttrs, materialPipeAttrs, parsedItem, material) {
  let score = 0;
  const reasons = [];

  // NPS match (30 points) - most important for pipes
  if (parsedPipeAttrs.nps_inch !== null && materialPipeAttrs?.nps_inch !== undefined) {
    const npsDiff = Math.abs(parsedPipeAttrs.nps_inch - materialPipeAttrs.nps_inch);
    if (npsDiff === 0) {
      score += 30;
      reasons.push(`exact_nps_${parsedPipeAttrs.nps_inch}in`);
    } else if (npsDiff <= 0.5) {
      score += 20;
      reasons.push(`close_nps_${parsedPipeAttrs.nps_inch}in_vs_${materialPipeAttrs.nps_inch}in`);
    }
  }

  // Schedule match (25 points)
  const parsedSchedule = normalizeSchedule(parsedPipeAttrs.schedule);
  const materialSchedule = normalizeSchedule(materialPipeAttrs?.schedule || material.size_description);
  if (parsedSchedule && materialSchedule) {
    if (parsedSchedule === materialSchedule) {
      score += 25;
      reasons.push(`exact_schedule_${parsedSchedule}`);
    } else if (stringMatches(parsedSchedule, materialSchedule, false)) {
      score += 15;
      reasons.push(`partial_schedule_${parsedSchedule}`);
    }
  }

  // Material family match (15 points)
  if (parsedPipeAttrs.material_family && materialPipeAttrs?.material_family) {
    if (parsedPipeAttrs.material_family === materialPipeAttrs.material_family) {
      score += 15;
      reasons.push(`exact_material_family_${parsedPipeAttrs.material_family}`);
    }
  } else {
    // Fallback: try to infer from material_type
    const materialType = (material.material_type || '').toUpperCase();
    if (parsedPipeAttrs.material_family === 'CS' && 
        (materialType.includes('CARBON') || materialType.includes('CS'))) {
      score += 15;
      reasons.push('material_family_match_cs');
    } else if (parsedPipeAttrs.material_family === 'SS' && 
               materialType.includes('STAINLESS')) {
      score += 15;
      reasons.push('material_family_match_ss');
    } else if (parsedPipeAttrs.material_family === 'LTCS' && 
               materialType.includes('LOW TEMP')) {
      score += 15;
      reasons.push('material_family_match_ltcs');
    }
  }

  // Standard match (15 points)
  const parsedStandard = normalizeStandard(parsedPipeAttrs.standard || parsedItem.standard);
  const materialStandard = normalizeStandard(material.spec_standard);
  if (parsedStandard && materialStandard) {
    if (stringMatches(parsedStandard, materialStandard, true)) {
      score += 15;
      reasons.push('exact_standard');
    } else if (stringMatches(parsedStandard, materialStandard, false)) {
      score += 10;
      reasons.push('partial_standard');
    }
  }

  // Grade match (10 points)
  const parsedGrade = normalizeGrade(parsedPipeAttrs.grade || parsedItem.grade);
  const materialGrade = normalizeGrade(material.grade);
  if (parsedGrade && materialGrade) {
    if (stringMatches(parsedGrade, materialGrade, true)) {
      score += 10;
      reasons.push('exact_grade');
    } else if (stringMatches(parsedGrade, materialGrade, false)) {
      score += 5;
      reasons.push('partial_grade');
    }
  }

  // Form match (5 points) - seamless vs welded
  if (parsedPipeAttrs.form && materialPipeAttrs?.form) {
    if (parsedPipeAttrs.form === materialPipeAttrs.form) {
      score += 5;
      reasons.push(`form_match_${parsedPipeAttrs.form}`);
    }
  }

  // Description keyword similarity (up to 10 points)
  // Use material_code and size_description for comparison
  if (parsedItem.description) {
    const desc = parsedItem.description.toUpperCase();
    const matCode = (material.material_code || '').toUpperCase();
    const matSize = (material.size_description || '').toUpperCase();
    let keywordScore = 0;
    const keywords = ['SEAMLESS', 'WELDED', 'PIPE', 'SCH'];
    keywords.forEach(keyword => {
      if (desc.includes(keyword) && (matCode.includes(keyword) || matSize.includes(keyword))) {
        keywordScore += 2;
      }
    });
    if (keywordScore > 0) {
      score += Math.min(keywordScore, 10);
      reasons.push('keyword_similarity');
    }
  }

  // Cap at 100
  score = Math.min(score, 100);

  return {
    score,
    reasons: reasons.join(', '),
  };
}

/**
 * Scores a beam material match
 * @param {Object} parsedBeamAttrs - Extracted beam attributes from parsed item
 * @param {Object} material - Material from database
 * @returns {Object} Score and reasons
 */
function scoreBeamMatch(parsedBeamAttrs, material) {
  let score = 0;
  const reasons = [];

  // Beam type match (40 points)
  if (parsedBeamAttrs.beam_type && material.beam_type) {
    if (parsedBeamAttrs.beam_type.toUpperCase() === material.beam_type.toUpperCase()) {
      score += 40;
      reasons.push(`exact_beam_type_${material.beam_type}`);
    }
  }

  // Depth match (30 points) - within 1mm tolerance
  if (parsedBeamAttrs.beam_depth_mm !== null && material.beam_depth_mm !== null) {
    const depthDiff = Math.abs(parsedBeamAttrs.beam_depth_mm - material.beam_depth_mm);
    if (depthDiff === 0) {
      score += 30;
      reasons.push(`exact_depth_${material.beam_depth_mm}mm`);
    } else if (depthDiff <= 1) {
      score += 20;
      reasons.push(`close_depth_${depthDiff}mm_diff`);
    }
  }

  // Weight match (30 points) - within 5% tolerance
  if (parsedBeamAttrs.beam_weight_per_m_kg !== null && material.beam_weight_per_m_kg !== null) {
    const weightDiff = Math.abs(parsedBeamAttrs.beam_weight_per_m_kg - material.beam_weight_per_m_kg);
    const weightPercent = (weightDiff / material.beam_weight_per_m_kg) * 100;
    if (weightPercent === 0) {
      score += 30;
      reasons.push(`exact_weight_${material.beam_weight_per_m_kg}kg_m`);
    } else if (weightPercent <= 5) {
      score += 20;
      reasons.push(`close_weight_${weightPercent.toFixed(1)}%_diff`);
    }
  }

  // European standard match (bonus 10 points)
  if (parsedBeamAttrs.european_standard && material.european_standard) {
    if (parsedBeamAttrs.european_standard === material.european_standard) {
      score += 10;
      reasons.push('european_standard_match');
    }
  }

  score = Math.min(score, 100);

  return {
    score,
    reasons: reasons.join(', '),
  };
}

/**
 * Scores a tubular material match
 * @param {Object} parsedTubularAttrs - Extracted tubular attributes from parsed item
 * @param {Object} material - Material from database
 * @returns {Object} Score and reasons
 */
function scoreTubularMatch(parsedTubularAttrs, material) {
  let score = 0;
  const reasons = [];

  // OD match (50 points) - within 1% tolerance
  if (parsedTubularAttrs.od_mm !== null && material.od_mm !== null) {
    const odDiff = Math.abs(parsedTubularAttrs.od_mm - material.od_mm);
    const odPercent = (odDiff / material.od_mm) * 100;
    if (odPercent === 0) {
      score += 50;
      reasons.push(`exact_od_${material.od_mm}mm`);
    } else if (odPercent <= 1) {
      score += 40;
      reasons.push(`close_od_${odPercent.toFixed(2)}%_diff`);
    } else if (odPercent <= 5) {
      score += 25;
      reasons.push(`approximate_od_${odPercent.toFixed(2)}%_diff`);
    }
  }

  // Wall thickness match (50 points) - within 0.5mm or 5% tolerance
  if (parsedTubularAttrs.wall_thickness_mm !== null && material.wall_thickness_mm !== null) {
    const wallDiff = Math.abs(parsedTubularAttrs.wall_thickness_mm - material.wall_thickness_mm);
    const wallPercent = (wallDiff / material.wall_thickness_mm) * 100;
    if (wallDiff === 0) {
      score += 50;
      reasons.push(`exact_wall_${material.wall_thickness_mm}mm`);
    } else if (wallDiff <= 0.5 || wallPercent <= 5) {
      score += 40;
      reasons.push(`close_wall_${wallDiff.toFixed(2)}mm_diff`);
    } else if (wallDiff <= 2 || wallPercent <= 10) {
      score += 25;
      reasons.push(`approximate_wall_${wallDiff.toFixed(2)}mm_diff`);
    }
  }

  // European standard match (bonus 10 points)
  if (parsedTubularAttrs.european_standard && material.european_standard) {
    if (parsedTubularAttrs.european_standard === material.european_standard) {
      score += 10;
      reasons.push('european_standard_match');
    }
  }

  score = Math.min(score, 100);

  return {
    score,
    reasons: reasons.join(', '),
  };
}

/**
 * Scores a plate material match
 * @param {Object} parsedPlateAttrs - Extracted plate attributes from parsed item
 * @param {Object} material - Material from database
 * @returns {Object} Score and reasons
 */
function scorePlateMatch(parsedPlateAttrs, material) {
  let score = 0;
  const reasons = [];

  // Thickness match (60 points) - within 0.5mm tolerance
  if (parsedPlateAttrs.plate_thickness_mm !== null && material.plate_thickness_mm !== null) {
    const thicknessDiff = Math.abs(parsedPlateAttrs.plate_thickness_mm - material.plate_thickness_mm);
    if (thicknessDiff === 0) {
      score += 60;
      reasons.push(`exact_thickness_${material.plate_thickness_mm}mm`);
    } else if (thicknessDiff <= 0.5) {
      score += 50;
      reasons.push(`close_thickness_${thicknessDiff.toFixed(2)}mm_diff`);
    } else if (thicknessDiff <= 2) {
      score += 35;
      reasons.push(`approximate_thickness_${thicknessDiff.toFixed(2)}mm_diff`);
    }
  }

  // European standard match (bonus 20 points)
  if (parsedPlateAttrs.european_standard && material.european_standard) {
    if (parsedPlateAttrs.european_standard === material.european_standard) {
      score += 20;
      reasons.push('european_standard_match');
    }
  }

  // Grade match (bonus 20 points)
  if (parsedPlateAttrs.european_grade && material.european_grade) {
    if (parsedPlateAttrs.european_grade === material.european_grade) {
      score += 20;
      reasons.push('european_grade_match');
    }
  }

  score = Math.min(score, 100);

  return {
    score,
    reasons: reasons.join(', '),
  };
}

/**
 * Scores a material match against a parsed line item
 * Uses pipe-specific scoring when the material is a pipe or the description indicates a pipe
 * Now also supports beams, tubulars, and plates
 * @param {Object} parsedItem - Parsed line item from AI
 * @param {Object} material - Material from database
 * @returns {Object} Score and reasons
 */
function scoreMaterialMatch(parsedItem, material) {
  const materialCategory = material.category ? material.category.toLowerCase() : '';
  const isPipeMaterial = materialCategory === 'pipe';
  const isPipeDesc = isPipeDescription(parsedItem.description || '');

  // Use pipe-specific scoring if material is a pipe OR description indicates a pipe
  if (isPipeMaterial || isPipeDesc) {
    // Extract pipe attributes from parsed item
    const parsedPipeAttrs = extractPipeAttributes({
      description: parsedItem.description,
      size: parsedItem.size,
      schedule: parsedItem.schedule,
      standard: parsedItem.standard,
      grade: parsedItem.grade,
    });

    // Parse pipe attributes from material notes (JSON)
    const materialPipeAttrs = parsePipeAttributesFromMaterial(material.notes);

    // Use pipe-specific scoring
    return scorePipeMatch(parsedPipeAttrs, materialPipeAttrs, parsedItem, material);
  }

  // Try to identify material type and use specialized scoring
  const typeInfo = typeIdentifier.identifyMaterialType(parsedItem.description || '');
  const materialType = typeInfo.type;

  // Beam matching
  if (materialType === 'BEAM' || materialCategory === 'beam' || material.beam_type) {
    const parsedBeamAttrs = materialParsers.parseStructuralBeam(parsedItem.description || '');
    if (parsedBeamAttrs) {
      // Also extract European standard if present
      const enStandard = materialParsers.parseEuropeanStandard(parsedItem.description || '');
      if (enStandard) {
        parsedBeamAttrs.european_standard = enStandard.european_standard;
        parsedBeamAttrs.european_grade = enStandard.european_grade;
      }
      return scoreBeamMatch(parsedBeamAttrs, material);
    }
  }

  // Tubular matching
  if (materialType === 'TUBULAR' || materialCategory === 'tubular' || material.od_mm) {
    const parsedTubularAttrs = materialParsers.parseTubular(parsedItem.description || '');
    if (parsedTubularAttrs) {
      // Also extract European standard if present
      const enStandard = materialParsers.parseEuropeanStandard(parsedItem.description || '');
      if (enStandard) {
        parsedTubularAttrs.european_standard = enStandard.european_standard;
        parsedTubularAttrs.european_grade = enStandard.european_grade;
      }
      return scoreTubularMatch(parsedTubularAttrs, material);
    }
  }

  // Plate matching
  if (materialType === 'PLATE' || materialCategory === 'plate' || material.plate_thickness_mm) {
    const parsedPlateAttrs = materialParsers.parsePlate(parsedItem.description || '');
    if (parsedPlateAttrs) {
      // Also extract European standard if present
      const enStandard = materialParsers.parseEuropeanStandard(parsedItem.description || '');
      if (enStandard) {
        parsedPlateAttrs.european_standard = enStandard.european_standard;
        parsedPlateAttrs.european_grade = enStandard.european_grade;
      }
      return scorePlateMatch(parsedPlateAttrs, material);
    }
  }

  // Generic scoring for non-pipe materials (existing logic)
  let score = 0;
  const reasons = [];

  // Normalize values
  const parsedSize = normalizeSize(parsedItem.size);
  const parsedSchedule = normalizeSchedule(parsedItem.schedule);
  const parsedStandard = normalizeStandard(parsedItem.standard);
  const parsedGrade = normalizeGrade(parsedItem.grade);
  const materialSize = normalizeSize(material.size_description);
  const materialSchedule = normalizeSchedule(material.spec_standard); // Note: schedule might be in spec_standard or separate field
  const materialStandard = normalizeStandard(material.spec_standard);
  const materialGrade = normalizeGrade(material.grade);

  // Standard match (30 points)
  if (parsedStandard && materialStandard) {
    if (stringMatches(parsedStandard, materialStandard, true)) {
      score += 30;
      reasons.push('exact_standard');
    } else if (stringMatches(parsedStandard, materialStandard, false)) {
      score += 20;
      reasons.push('partial_standard');
    }
  }

  // Grade match (25 points)
  if (parsedGrade && materialGrade) {
    if (stringMatches(parsedGrade, materialGrade, true)) {
      score += 25;
      reasons.push('exact_grade');
    } else if (stringMatches(parsedGrade, materialGrade, false)) {
      score += 15;
      reasons.push('partial_grade');
    }
  }

  // Size match (25 points)
  if (parsedSize && materialSize) {
    if (stringMatches(parsedSize, materialSize, true)) {
      score += 25;
      reasons.push('exact_size');
    } else if (stringMatches(parsedSize, materialSize, false)) {
      score += 15;
      reasons.push('partial_size');
    }
  }

  // Schedule match (20 points)
  if (parsedSchedule && materialSchedule) {
    if (stringMatches(parsedSchedule, materialSchedule, true)) {
      score += 20;
      reasons.push('exact_schedule');
    } else if (stringMatches(parsedSchedule, materialSchedule, false)) {
      score += 10;
      reasons.push('partial_schedule');
    }
  }

  // Category/product type match (bonus 10 points)
  const inferredType = inferProductType(parsedItem.description);
  if (inferredType && material.category) {
    const materialCategory = material.category.toLowerCase();
    if (materialCategory.includes(inferredType)) {
      score += 10;
      reasons.push('category_match');
    }
  }

  // Description contains material code (bonus 5 points)
  if (parsedItem.description && material.material_code) {
    const desc = parsedItem.description.toUpperCase();
    const code = material.material_code.toUpperCase();
    if (desc.includes(code)) {
      score += 5;
      reasons.push('code_in_description');
    }
  }

  // Cap at 100
  score = Math.min(score, 100);

  return {
    score,
    reasons: reasons.join(', '),
  };
}

/**
 * Loads all materials (with caching)
 * 
 * Materials are tenant-scoped (migration 058+).
 * tenant_id is required and NOT NULL.
 * 
 * @param {string} tenantId - Tenant UUID (required)
 * @returns {Promise<Array>} Array of materials
 */
async function loadMaterials(tenantId) {
  if (!tenantId) {
    throw new Error('tenantId is required (materials are tenant-scoped)');
  }

  // Use cache with tenant-aware key
  const cacheKey = `materials:${tenantId}`;

  const materials = await cacheService.getOrSet(
    cacheKey,
    async () => {
      // Load from database with tenant filter
      return await materialsService.getAllMaterials(tenantId);
    },
    CACHE_TTL_SECONDS
  );
  
  return materials || [];
}

/**
 * Extracts NPS (Nominal Pipe Size) from sparse descriptions using best-effort heuristics
 * Tries multiple patterns: "24\"", "24 IN", "DN600", etc.
 * @param {Object} parsedItem - Parsed line item
 * @returns {number|null} NPS in inches, or null if not found
 */
function extractNpsFromSparseDescription(parsedItem) {
  const desc = (parsedItem.description || '').toUpperCase();
  const size = (parsedItem.size || parsedItem.size1 || parsedItem.size2 || '').toString().toUpperCase();
  const combined = `${desc} ${size}`;

  // Pattern 1: "24\"", "6\"", "2.5\""
  const inchPattern = /(\d+(?:\.\d+)?)\s*[""]/;
  const inchMatch = combined.match(inchPattern);
  if (inchMatch) {
    const nps = parseFloat(inchMatch[1]);
    if (nps > 0 && nps <= 100) { // Reasonable range
      return nps;
    }
  }

  // Pattern 2: "24 IN", "6 INCH", "2.5 INCHES"
  const inchWordPattern = /(\d+(?:\.\d+)?)\s*IN(?:CH|CHES)?/i;
  const inchWordMatch = combined.match(inchWordPattern);
  if (inchWordMatch) {
    const nps = parseFloat(inchWordMatch[1]);
    if (nps > 0 && nps <= 100) {
      return nps;
    }
  }

  // Pattern 3: DN (metric) - convert to approximate NPS
  // DN50≈2", DN100≈4", DN150≈6", DN200≈8", DN250≈10", DN300≈12", DN400≈16", DN500≈20", DN600≈24"
  const dnPattern = /DN\s*(\d+)/i;
  const dnMatch = combined.match(dnPattern);
  if (dnMatch) {
    const dnValue = parseInt(dnMatch[1], 10);
    const dnToNps = {
      50: 2, 100: 4, 150: 6, 200: 8, 250: 10, 300: 12,
      350: 14, 400: 16, 450: 18, 500: 20, 600: 24, 700: 28, 800: 32
    };
    if (dnToNps[dnValue]) {
      return dnToNps[dnValue];
    }
    // Approximate: DN / 25 ≈ NPS (rough conversion)
    const approximateNps = dnValue / 25;
    if (approximateNps > 0 && approximateNps <= 100) {
      return Math.round(approximateNps * 2) / 2; // Round to nearest 0.5
    }
  }

  return null;
}

/**
 * Fallback pipe matcher for sparse attributes
 * Queries pipes table directly when normal matching fails
 * @param {Object} item - Parsed line item with sparse attributes
 * @returns {Promise<Array>} Array of matched candidates
 */
async function fallbackPipeMatcher(item) {
  console.log("[PIPE MATCH] Fallback triggered:", item.description);

  const nps = extractNpsFromItem(item);
  if (!nps) {
    console.log("[PIPE MATCH] No NPS extracted.");
    return [];
  }

  console.log("[PIPE MATCH] Extracted NPS =", nps);

  const pipeRows = await pipesService.getPipesByNps(nps);
  if (!pipeRows || pipeRows.length === 0) {
    console.log("[PIPE MATCH] No pipes found for NPS", nps);
    return [];
  }

  console.log("[PIPE MATCH] Found", pipeRows.length, "pipe rows for NPS", nps);

  // Prefer: is_preferred → lowest schedule → first result
  pipeRows.sort((a, b) => {
    if (a.is_preferred && !b.is_preferred) return -1;
    if (!a.is_preferred && b.is_preferred) return 1;
    const sa = parseInt(a.schedule || "999", 10);
    const sb = parseInt(b.schedule || "999", 10);
    return sa - sb;
  });

  const selected = pipeRows[0];
  console.log("[PIPE MATCH] Selected pipe_id =", selected.id);

  const candidate = {
    material_id: selected.material_id || null,
    pipe_id: selected.id,
    category: "PIPE",
    confidence: 0.55,
    nps_inch: selected.nps_inch,
    schedule: selected.schedule,
    standard: selected.standard || null
  };

  return [candidate];
}

/**
 * Generic fallback matcher for non-pipe items (flanges, gaskets, etc.)
 * Uses category inference and size-based matching
 * @param {Object} parsedItem - Parsed line item
 * @param {number} minScore - Minimum score threshold
 * @returns {Promise<Array>} Array of matched materials with scores
 */
async function fallbackGenericMatcher(parsedItem, minScore = 25) {
  try {
    const desc = (parsedItem.description || '').toUpperCase();
    
    // Infer category from description
    let inferredCategory = null;
    if (desc.includes('FLANGE')) {
      inferredCategory = 'flange';
    } else if (desc.includes('GASKET')) {
      inferredCategory = 'gasket';
    } else if (desc.includes('SPADE') || desc.includes('SPECTACLE BLIND') || desc.includes('RING SPACER')) {
      inferredCategory = 'flange'; // These are often flange-related
    } else {
      // Can't infer category
      return [];
    }

    console.log(`[Material Match Fallback] Generic fallback triggered for "${parsedItem.description?.substring(0, 50)}..." - inferred category: ${inferredCategory}`);

    // Try to extract size (NPS) from description
    const npsInch = extractNpsFromSparseDescription(parsedItem);
    
    const db = await connectDb();
    let query = `
      SELECT * FROM materials
      WHERE LOWER(category) = LOWER($1)
    `;
    const params = [inferredCategory];

    // If we have a size, try to match it in size_description
    if (npsInch) {
      query += ` AND (
        size_description ILIKE $2 
        OR size_description ILIKE $3
        OR material_code ILIKE $4
      )`;
      params.push(`%${npsInch}"%`, `%${npsInch} %`, `%${npsInch}%`);
    }

    query += ` ORDER BY created_at DESC LIMIT 10`;

    const result = await db.query(query, params);
    
    if (result.rows.length === 0) {
      console.log(`[Material Match Fallback] No materials found for category ${inferredCategory}`);
      return [];
    }

    // Score candidates
    const candidates = result.rows.map(material => {
      let score = 20; // Base score for category match
      
      // Bonus for size match
      if (npsInch && material.size_description) {
        const sizeDesc = material.size_description.toUpperCase();
        if (sizeDesc.includes(`${npsInch}"`) || sizeDesc.includes(`${npsInch} `)) {
          score += 10;
        }
      }

      // Bonus for description keyword match
      const materialCode = (material.material_code || '').toUpperCase();
      if (desc.includes('SPADE') && materialCode.includes('SPADE')) score += 5;
      if (desc.includes('SPECTACLE') && materialCode.includes('SPECTACLE')) score += 5;
      if (desc.includes('RING') && materialCode.includes('RING')) score += 5;

      return {
        material_id: material.id,
        material_code: material.material_code,
        score: Math.min(score, 40), // Cap at 40 for generic fallback
        reason: `Fallback match: ${inferredCategory} (category + size match)`,
      };
    });

    const filtered = candidates.filter(c => c.score >= minScore);
    console.log(`[Material Match Fallback] Found ${filtered.length} fallback candidates for ${inferredCategory}`);
    return filtered;
  } catch (error) {
    console.error('[Material Match Fallback] Error in generic fallback matcher:', error);
    return [];
  }
}

/**
 * Gets relevant materials from database based on parsed item
 * @param {Object} parsedItem - Parsed line item from AI
 * @returns {Promise<Array>} Array of relevant materials
 */
/**
 * Gets relevant materials from database for matching against a parsed line item
 * 
 * @param {Object} parsedItem - Parsed line item from AI extraction
 * @param {string} [tenantId] - Optional tenant UUID. When provided, returns tenant-specific materials plus global materials.
 * @returns {Promise<Array>} Array of material objects from database
 */
async function getRelevantMaterials(parsedItem, tenantId) {
  const db = await connectDb();

  // Infer category from description
  const desc = (parsedItem.description || '').toUpperCase();
  let category = null;

  if (isPipeDescription(desc) || isPipeItem(parsedItem)) {
    category = 'pipe';
  } else if (desc.includes('FLANGE') || desc.includes('BLIND') || desc.includes('SPECTACLE') || desc.includes('SPADE')) {
    category = 'flange';
  } else if (desc.includes('FITTING') || desc.includes('ELBOW') || desc.includes('TEE') || desc.includes('REDUCER')) {
    category = 'fitting';
  } else if (desc.includes('GASKET')) {
    category = 'gasket';
  } else if (desc.includes('FASTENER') || desc.includes('BOLT') || desc.includes('NUT')) {
    category = 'fastener';
  }

  // Extract size if available
  const size = parsedItem.size || parsedItem.size1 || parsedItem.size2;
  const nps = extractNpsFromSparseDescription(parsedItem);

  let query = 'SELECT * FROM materials WHERE 1=1';
  const params = [];
  let paramCount = 0;

  // Tenant-aware filtering: if tenantId provided, filter by tenant_id or NULL (global)
  if (tenantId) {
    paramCount++;
    query += ` AND (tenant_id = $${paramCount} OR tenant_id IS NULL)`;
    params.push(tenantId);
  }

  // Filter by category (case-insensitive)
  if (category) {
    paramCount++;
    query += ` AND LOWER(category) = LOWER($${paramCount})`;
    params.push(category);
  }

  // Filter by size if available
  if (size || nps) {
    let sizeToMatch = nps ? `${nps}` : size;

    // Normalize single quote (foot) to double quote (inch)
    // Azure DI extracts 6' but database has 6"
    if (sizeToMatch && typeof sizeToMatch === 'string') {
      sizeToMatch = sizeToMatch.replace(/'/g, '"');
    }

    paramCount++;
    query += ` AND (
      size_description ILIKE $${paramCount}
      OR material_code ILIKE $${paramCount}
      OR notes::text ILIKE $${paramCount}
    )`;
    params.push(`%${sizeToMatch}%`);
  }

  // Limit results to prevent loading too many
  query += ` LIMIT 200`;

  const result = await db.query(query, params);

  console.log(`[Material Match] Database query returned ${result.rows.length} materials (category: ${category || 'any'}, size: ${size || nps || 'any'}, tenantId: ${tenantId || 'none'})`);

  return result.rows;
}

/**
 * Matches materials for a parsed line item
 * @param {Object} parsedItem - Parsed line item from AI
 * @param {Object} options - Matching options
 * @param {number} options.maxResults - Maximum number of results to return (default: 3)
 * @param {number} options.minScore - Minimum score threshold (default: 40)
 * @param {string} [options.tenantId] - Optional tenant UUID for tenant-aware material matching
 * @returns {Promise<Array>} Array of matched materials with scores
 */
async function matchMaterialsForLineItem(parsedItem, options = {}) {
  const { maxResults = 3, minScore = 40, tenantId } = options;

  try {
    // Get relevant materials from database (instead of loading all 1695)
    const materials = await getRelevantMaterials(parsedItem, tenantId);

    if (materials.length === 0) {
      console.log('[Material Match] No relevant materials found in database query, trying fallback...');

      // Jump straight to fallback logic
      if (isPipeItem(parsedItem)) {
        const fallback = await fallbackPipeMatcher(parsedItem);
        if (fallback.length > 0) {
          console.log(`[Material Match] Fallback pipe matcher returned ${fallback.length} candidates`);
          return fallback;
        }
      } else {
        const fallbackResults = await fallbackGenericMatcher(parsedItem, Math.max(minScore - 15, 20));
        if (fallbackResults.length > 0) {
          console.log(`[Material Match] Fallback generic matcher found ${fallbackResults.length} candidates`);
          return fallbackResults.slice(0, maxResults);
        }
      }

      return [];
    }

    // Score each material
    const scored = materials.map(material => {
      const matchResult = scoreMaterialMatch(parsedItem, material);
      
      // Generate human-readable reason text
      let reasonText = matchResult.reasons || null;
      
      // Pipes
      if (material.category?.toLowerCase() === 'pipe' && matchResult.score >= 40) {
        const pipeAttrs = parsePipeAttributesFromMaterial(material.notes);
        const parts = [];
        if (pipeAttrs?.nps_inch) parts.push(`${pipeAttrs.nps_inch}"`);
        if (pipeAttrs?.schedule) parts.push(`SCH${pipeAttrs.schedule}`);
        if (material.material_type) parts.push(material.material_type);
        if (material.grade) parts.push(material.grade);
        if (pipeAttrs?.form) parts.push(pipeAttrs.form);
        
        const pipeDesc = parts.length > 0 ? parts.join(' ') : material.material_code;
        reasonText = `Matched ${pipeDesc} pipe (${matchResult.reasons}) – score ${matchResult.score}`;
      }
      // Beams
      else if ((material.category?.toLowerCase() === 'beam' || material.beam_type) && matchResult.score >= 40) {
        const parts = [];
        if (material.beam_type) parts.push(material.beam_type);
        if (material.beam_depth_mm) parts.push(`${material.beam_depth_mm}mm`);
        if (material.beam_weight_per_m_kg) parts.push(`${material.beam_weight_per_m_kg}kg/m`);
        if (material.european_standard) parts.push(material.european_standard);
        if (material.european_grade) parts.push(material.european_grade);
        
        const beamDesc = parts.length > 0 ? parts.join(' ') : material.material_code;
        reasonText = `Matched ${beamDesc} beam (${matchResult.reasons}) – score ${matchResult.score}`;
      }
      // Tubulars
      else if ((material.category?.toLowerCase() === 'tubular' || material.od_mm) && matchResult.score >= 40) {
        const parts = [];
        if (material.od_mm) parts.push(`OD${material.od_mm}mm`);
        if (material.wall_thickness_mm) parts.push(`WT${material.wall_thickness_mm}mm`);
        if (material.european_standard) parts.push(material.european_standard);
        if (material.european_grade) parts.push(material.european_grade);
        
        const tubularDesc = parts.length > 0 ? parts.join(' ') : material.material_code;
        reasonText = `Matched ${tubularDesc} tubular (${matchResult.reasons}) – score ${matchResult.score}`;
      }
      // Plates
      else if ((material.category?.toLowerCase() === 'plate' || material.plate_thickness_mm) && matchResult.score >= 40) {
        const parts = [];
        if (material.plate_thickness_mm) parts.push(`PL${material.plate_thickness_mm}`);
        if (material.european_standard) parts.push(material.european_standard);
        if (material.european_grade) parts.push(material.european_grade);
        
        const plateDesc = parts.length > 0 ? parts.join(' ') : material.material_code;
        reasonText = `Matched ${plateDesc} plate (${matchResult.reasons}) – score ${matchResult.score}`;
      }
      
      return {
        material_id: material.id,
        material_code: material.material_code,
        score: matchResult.score,
        reason: reasonText,
      };
    });

    // Filter by minimum score
    const filtered = scored.filter(m => m.score >= minScore);

    // Sort by score descending
    filtered.sort((a, b) => b.score - a.score);

    // Return top results
    let results = filtered.slice(0, maxResults);

    // PIPE FALLBACK MATCHING: If item is a pipe, use dedicated fallback logic
    if (isPipeItem(parsedItem)) {
      debugLogPipeItem(parsedItem);

      // Try strict pipe matching first (normal flow)
      if (results.length > 0) {
        console.log(`[Material Match] Found ${results.length} strict pipe matches`);
        return results;
      }

      // No strict matches - use fallback
      const fallback = await fallbackPipeMatcher(parsedItem);
      if (fallback.length > 0) {
        console.log(`[Material Match] Fallback pipe matcher returned ${fallback.length} candidates`);
        return fallback;
      }

      // Last resort: return empty
      console.log(`[Material Match] No pipe matches found (strict or fallback)`);
      return [];
    }

    // NON-PIPE FALLBACK: For non-pipe items, use generic fallback if needed
    if (results.length === 0) {
      const fallbackResults = await fallbackGenericMatcher(parsedItem, Math.max(minScore - 15, 20));
      if (fallbackResults.length > 0) {
        results = fallbackResults.slice(0, maxResults);
        console.log(`[Material Match] Fallback generic matcher found ${results.length} candidates for item "${parsedItem.description?.substring(0, 50)}..."`);
      }
    }

    console.log(`[Material Match] Matched ${results.length} materials for item "${parsedItem.description?.substring(0, 50)}..." (from ${materials.length} total materials)`);

    return results;
  } catch (error) {
    console.error('[Material Match] Error matching materials:', error);
    throw new Error(`Material matching failed: ${error.message}`);
  }
}

/**
 * Auto-select material if confidence threshold is met
 * @param {Array} matches - Array of matched materials with scores
 * @param {number} threshold - Confidence threshold (default: 90)
 * @returns {Object|null} - Auto-selected material or null
 */
function autoSelectMaterial(matches, threshold = 90) {
  if (!matches || matches.length === 0) {
    return null;
  }

  // Get top match
  const topMatch = matches[0];

  // Check if score meets threshold
  if (topMatch.score >= threshold) {
    console.log(`[Material Match] Auto-selected material ${topMatch.material_code} with score ${topMatch.score}`);
    return {
      material_id: topMatch.material_id,
      material_code: topMatch.material_code,
      confidence: topMatch.score,
      auto_selected: true,
      reason: topMatch.reason
    };
  }

  // Score doesn't meet threshold
  console.log(`[Material Match] Top match score ${topMatch.score} below threshold ${threshold} - manual selection required`);
  return null;
}

/**
 * Batch match materials for multiple line items
 * @param {Array} lineItems - Array of parsed line items
 * @param {Object} options - Matching options
 * @returns {Promise<Array>} - Array of match results
 */
async function matchMaterialsBatch(lineItems, options = {}) {
  console.log(`[Material Match] Starting batch matching for ${lineItems.length} items...`);
  const startTime = Date.now();

  const results = [];

  for (let i = 0; i < lineItems.length; i++) {
    const item = lineItems[i];
    console.log(`   Processing item ${i + 1}/${lineItems.length}: "${item.description?.substring(0, 40)}..."`);

    try {
      const matches = await matchMaterialsForLineItem(item, options);
      const autoSelected = autoSelectMaterial(matches, options.autoSelectThreshold || 90);

      results.push({
        line_item: item,
        matches,
        auto_selected: autoSelected,
        needs_review: !autoSelected || matches.length === 0
      });
    } catch (error) {
      console.error(`   Failed to match item ${i + 1}:`, error.message);
      results.push({
        line_item: item,
        matches: [],
        auto_selected: null,
        needs_review: true,
        error: error.message
      });
    }
  }

  const duration = Date.now() - startTime;
  const autoSelectedCount = results.filter(r => r.auto_selected).length;
  console.log(`✅ Batch matching completed in ${(duration / 1000).toFixed(1)}s`);
  console.log(`   Auto-selected: ${autoSelectedCount}/${lineItems.length} (${((autoSelectedCount / lineItems.length) * 100).toFixed(1)}%)`);

  return results;
}

/**
 * Track user correction for material match (for feedback loop)
 * This can be used to improve matching algorithms over time
 * @param {Object} correction - Correction data
 * @returns {Promise<void>}
 */
async function trackUserCorrection(correction) {
  // TODO: Store correction in database for future analysis
  // This would help improve the matching algorithm over time
  console.log('[Material Match] User correction tracked:', {
    original_item: correction.original_description,
    suggested_material: correction.suggested_material_code,
    actual_material: correction.actual_material_code,
    score: correction.original_score
  });

  // For now, just log it. In a full implementation, we would:
  // 1. Store correction in a `material_match_corrections` table
  // 2. Periodically analyze corrections to identify patterns
  // 3. Adjust scoring weights based on correction frequency
  // 4. Retrain any ML models if applicable
}

module.exports = {
  matchMaterialsForLineItem,
  autoSelectMaterial,
  matchMaterialsBatch,
  trackUserCorrection,
  // Export normalization functions for testing if needed
  normalizeSize,
  normalizeSchedule,
  normalizeStandard,
  normalizeGrade,
};

