const materialsService = require('./materialsService');

// Cache for materials (per request, can be improved with proper caching)
let materialsCache = null;
let materialsCacheTimestamp = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

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
 * @returns {string|null} Inferred product type (pipe, flange, fitting, etc.)
 */
function inferProductType(description) {
  if (!description) return null;
  const desc = description.toUpperCase();
  
  if (desc.includes('PIPE') || desc.includes('TUBE')) {
    return 'pipe';
  }
  if (desc.includes('FLANGE')) {
    return 'flange';
  }
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
 * Extracts pipe-specific attributes from a parsed line item
 * @param {Object} input - Input object with description, size, standard, grade, etc.
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
  };

  const desc = (input.description || '').toUpperCase();
  const size = input.size || '';
  const schedule = input.schedule || '';
  const standard = input.standard || '';
  const grade = input.grade || '';

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
 * Scores a material match against a parsed line item
 * Uses pipe-specific scoring when the material is a pipe or the description indicates a pipe
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
 * @returns {Promise<Array>} Array of materials
 */
async function loadMaterials() {
  const now = Date.now();
  
  // Use cache if valid
  if (materialsCache && materialsCacheTimestamp && (now - materialsCacheTimestamp) < CACHE_TTL_MS) {
    return materialsCache;
  }

  // Load from database
  const materials = await materialsService.getAllMaterials();
  
  // Update cache
  materialsCache = materials;
  materialsCacheTimestamp = now;
  
  return materials;
}

/**
 * Matches materials for a parsed line item
 * @param {Object} parsedItem - Parsed line item from AI
 * @param {Object} options - Matching options
 * @param {number} options.maxResults - Maximum number of results to return (default: 3)
 * @param {number} options.minScore - Minimum score threshold (default: 40)
 * @returns {Promise<Array>} Array of matched materials with scores
 */
async function matchMaterialsForLineItem(parsedItem, options = {}) {
  const { maxResults = 3, minScore = 40 } = options;

  try {
    // Load all materials
    const materials = await loadMaterials();

    if (materials.length === 0) {
      console.warn('[Material Match] No materials found in database');
      return [];
    }

    // Score each material
    const scored = materials.map(material => {
      const matchResult = scoreMaterialMatch(parsedItem, material);
      
      // Generate human-readable reason text for pipes
      let reasonText = matchResult.reasons || null;
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
    const results = filtered.slice(0, maxResults);

    console.log(`[Material Match] Matched ${results.length} materials for item "${parsedItem.description?.substring(0, 50)}..." (from ${materials.length} total materials)`);

    return results;
  } catch (error) {
    console.error('[Material Match] Error matching materials:', error);
    throw new Error(`Material matching failed: ${error.message}`);
  }
}

module.exports = {
  matchMaterialsForLineItem,
  // Export normalization functions for testing if needed
  normalizeSize,
  normalizeSchedule,
  normalizeStandard,
  normalizeGrade,
};

