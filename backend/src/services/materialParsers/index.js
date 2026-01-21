/**
 * Material Parsers Module
 * 
 * Specialized parsers for extracting material attributes from various formats:
 * - Structural beams (W36X194, HEA 1000 x 300 x 272)
 * - Tubulars (30000x25, 1828.80x44.5, 457 x 39.61 x 11800)
 * - Plates (PL60, PL50, PL40)
 * - European standards (EN10210 S355 K2H, EN10225 S355 MLO)
 */

/**
 * Parses structural beam specifications
 * Handles: W36X194, W14x38, HEA 1000 x 300 x 272, HEB, I-beam formats
 * 
 * @param {string} description - Material description
 * @returns {Object|null} Parsed beam attributes or null if not a beam
 */
function parseStructuralBeam(description) {
  if (!description) return null;

  const desc = description.toUpperCase().trim();
  const result = {
    type: 'BEAM',
    beam_type: null,
    beam_depth_mm: null,
    beam_weight_per_m_kg: null,
    beam_width_mm: null,
    web_thickness_mm: null,
    confidence: 0
  };

  // Pattern 1: W-shape (e.g., W36X194, W14x38)
  // Format: W{depth}X{weight_per_ft}
  const wBeamMatch = desc.match(/W\s*(\d+(?:\.\d+)?)\s*[Xx]\s*(\d+(?:\.\d+)?)/i);
  if (wBeamMatch) {
    const depthInches = parseFloat(wBeamMatch[1]);
    const weightPerFt = parseFloat(wBeamMatch[2]);
    
    result.beam_type = 'W';
    result.beam_depth_mm = depthInches * 25.4; // Convert inches to mm
    result.beam_weight_per_m_kg = weightPerFt * 1.488; // Convert lb/ft to kg/m
    result.confidence = 0.95;
    return result;
  }

  // Pattern 2: HEA/HEB format (e.g., HEA 1000 x 300 x 272)
  // Format: HEA/HEB {depth} x {width} x {web_thickness}
  const heaMatch = desc.match(/H(EA|EB)\s+(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)/i);
  if (heaMatch) {
    result.beam_type = heaMatch[1]; // EA or EB
    result.beam_depth_mm = parseFloat(heaMatch[2]);
    result.beam_width_mm = parseFloat(heaMatch[3]);
    result.web_thickness_mm = parseFloat(heaMatch[4]);
    result.confidence = 0.95;
    return result;
  }

  // Pattern 3: I-beam format (e.g., I 200 x 100)
  const iBeamMatch = desc.match(/\bI\s+(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)/i);
  if (iBeamMatch) {
    result.beam_type = 'I';
    result.beam_depth_mm = parseFloat(iBeamMatch[1]);
    result.beam_width_mm = parseFloat(iBeamMatch[2]);
    result.confidence = 0.85;
    return result;
  }

  // Pattern 4: Generic beam mention
  if (desc.includes('BEAM') && (desc.includes('W') || desc.includes('HEA') || desc.includes('HEB'))) {
    result.confidence = 0.5;
    return result;
  }

  return null;
}

/**
 * Parses tubular specifications (OD x Wall format)
 * Handles: 30000x25, 1828.80x44.5, 457 x 39.61 x 11800
 * 
 * @param {string} description - Material description
 * @returns {Object|null} Parsed tubular attributes or null if not a tubular
 */
function parseTubular(description) {
  if (!description) return null;

  const desc = description.toUpperCase().trim();
  const result = {
    type: 'TUBULAR',
    od_mm: null,
    wall_thickness_mm: null,
    length_mm: null,
    id_mm: null,
    confidence: 0
  };

  // Pattern: {OD}x{Wall} or {OD} x {Wall} x {Length}
  // Examples: 30000x25, 1828.80x44.5, 457 x 39.61 x 11800
  const tubularMatch = desc.match(/(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)(?:\s*x\s*(\d+(?:\.\d+)?))?/i);
  
  if (tubularMatch) {
    const od = parseFloat(tubularMatch[1]);
    const wall = parseFloat(tubularMatch[2]);
    const length = tubularMatch[3] ? parseFloat(tubularMatch[3]) : null;

    // Determine if this is a tubular based on size
    // Large OD (>500mm) = tubular, smaller might be pipe
    if (od > 500 || desc.includes('TUBULAR') || desc.includes('TUBE')) {
      result.od_mm = od;
      result.wall_thickness_mm = wall;
      result.length_mm = length;
      
      // Calculate ID if OD and wall are available
      if (od && wall) {
        result.id_mm = od - (2 * wall);
      }
      
      result.confidence = 0.9;
      return result;
    }
    
    // Smaller sizes might be pipes - return with lower confidence
    if (od > 50 && od <= 500) {
      result.od_mm = od;
      result.wall_thickness_mm = wall;
      result.length_mm = length;
      result.confidence = 0.7; // Could be pipe or tubular
      return result;
    }
  }

  return null;
}

/**
 * Parses plate specifications
 * Handles: PL60, PL50, PL40, PL 60mm
 * 
 * @param {string} description - Material description
 * @returns {Object|null} Parsed plate attributes or null if not a plate
 */
function parsePlate(description) {
  if (!description) return null;

  const desc = description.toUpperCase().trim();
  const result = {
    type: 'PLATE',
    plate_thickness_mm: null,
    confidence: 0
  };

  // Pattern 1: PL{number} (e.g., PL60, PL50, PL40)
  const plateCodeMatch = desc.match(/PL\s*(\d+(?:\.\d+)?)/i);
  if (plateCodeMatch) {
    result.plate_thickness_mm = parseFloat(plateCodeMatch[1]);
    result.confidence = 0.95;
    return result;
  }

  // Pattern 2: PLATE {thickness}mm or {thickness}mm PLATE
  const plateThicknessMatch = desc.match(/(?:PLATE|PL)\s*(\d+(?:\.\d+)?)\s*MM/i) || 
                               desc.match(/(\d+(?:\.\d+)?)\s*MM\s*(?:PLATE|PL)/i);
  if (plateThicknessMatch) {
    result.plate_thickness_mm = parseFloat(plateThicknessMatch[1]);
    result.confidence = 0.9;
    return result;
  }

  // Pattern 3: Generic plate mention
  if (desc.includes('PLATE') && /\d+/.test(desc)) {
    const numberMatch = desc.match(/(\d+(?:\.\d+)?)/);
    if (numberMatch) {
      const thickness = parseFloat(numberMatch[1]);
      // Reasonable plate thickness range: 6mm to 200mm
      if (thickness >= 6 && thickness <= 200) {
        result.plate_thickness_mm = thickness;
        result.confidence = 0.6;
        return result;
      }
    }
  }

  return null;
}

/**
 * Parses European standard specifications
 * Handles: EN10210 S355 K2H, EN10225 S355 MLO
 * 
 * @param {string} description - Material description
 * @returns {Object|null} Parsed European standard attributes or null if not found
 */
function parseEuropeanStandard(description) {
  if (!description) return null;

  const desc = description.toUpperCase().trim();
  const result = {
    european_standard: null,
    european_grade: null,
    european_designation: null,
    confidence: 0
  };

  // Pattern: EN{number} {grade} {designation}
  // Examples: EN10210 S355 K2H, EN10225 S355 MLO
  const enMatch = desc.match(/EN\s*(\d+)\s+([A-Z]\d+[A-Z]?)\s+([A-Z]\d+[A-Z]+)/i);
  if (enMatch) {
    result.european_standard = `EN${enMatch[1]}`;
    result.european_grade = enMatch[2];
    result.european_designation = enMatch[3];
    result.confidence = 0.95;
    return result;
  }

  // Pattern: EN{number} {grade} (without designation)
  const enMatchSimple = desc.match(/EN\s*(\d+)\s+([A-Z]\d+[A-Z]?)/i);
  if (enMatchSimple) {
    result.european_standard = `EN${enMatchSimple[1]}`;
    result.european_grade = enMatchSimple[2];
    result.confidence = 0.85;
    return result;
  }

  // Pattern: Just EN{number}
  const enOnlyMatch = desc.match(/EN\s*(\d+)/i);
  if (enOnlyMatch) {
    result.european_standard = `EN${enOnlyMatch[1]}`;
    result.confidence = 0.7;
    return result;
  }

  return null;
}

/**
 * Extracts all material attributes from a description
 * Tries all parsers and returns the best match
 * 
 * @param {string} description - Material description
 * @returns {Object} Combined attributes from all parsers
 */
function extractAllAttributes(description) {
  if (!description) return null;

  const result = {
    description: description,
    material_type: null,
    attributes: {},
    confidence: 0
  };

  // Try each parser
  const beamAttrs = parseStructuralBeam(description);
  const tubularAttrs = parseTubular(description);
  const plateAttrs = parsePlate(description);
  const enStandardAttrs = parseEuropeanStandard(description);

  // Combine results (highest confidence wins for material type)
  if (beamAttrs && beamAttrs.confidence > result.confidence) {
    result.material_type = 'BEAM';
    result.attributes = { ...beamAttrs };
    result.confidence = beamAttrs.confidence;
  }

  if (tubularAttrs && tubularAttrs.confidence > result.confidence) {
    result.material_type = 'TUBULAR';
    result.attributes = { ...tubularAttrs };
    result.confidence = tubularAttrs.confidence;
  }

  if (plateAttrs && plateAttrs.confidence > result.confidence) {
    result.material_type = 'PLATE';
    result.attributes = { ...plateAttrs };
    result.confidence = plateAttrs.confidence;
  }

  // European standard can apply to any material type
  if (enStandardAttrs) {
    result.attributes = {
      ...result.attributes,
      ...enStandardAttrs
    };
    if (enStandardAttrs.confidence > result.confidence) {
      result.confidence = enStandardAttrs.confidence;
    }
  }

  return result.material_type ? result : null;
}

module.exports = {
  parseStructuralBeam,
  parseTubular,
  parsePlate,
  parseEuropeanStandard,
  extractAllAttributes,
};

