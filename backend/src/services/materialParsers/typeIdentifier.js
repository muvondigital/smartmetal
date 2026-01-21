/**
 * Material Type Identifier
 * 
 * Identifies material type from description using pattern matching.
 * Returns material type, pattern matched, and confidence score.
 */

/**
 * Identifies material type from description
 * 
 * @param {string} description - Material description
 * @returns {Object} { type: 'BEAM'|'TUBULAR'|'PLATE'|'PIPE'|'FLANGE'|null, pattern: string, confidence: 0.0-1.0 }
 */
function identifyMaterialType(description) {
  if (!description) {
    return { type: null, pattern: null, confidence: 0 };
  }

  const desc = description.toUpperCase().trim();

  // Structural Beams
  if (/W\s*\d+\s*[Xx]\s*\d+/.test(desc)) {
    return { type: 'BEAM', pattern: 'W_BEAM', confidence: 0.95 };
  }
  if (/H(EA|EB)\s+\d+/.test(desc)) {
    return { type: 'BEAM', pattern: 'HEA_HEB_BEAM', confidence: 0.95 };
  }
  if (/\bI\s+\d+\s*x\s*\d+/.test(desc) && desc.includes('BEAM')) {
    return { type: 'BEAM', pattern: 'I_BEAM', confidence: 0.85 };
  }
  if (desc.includes('BEAM') && (desc.includes('W') || desc.includes('HEA') || desc.includes('HEB'))) {
    return { type: 'BEAM', pattern: 'GENERIC_BEAM', confidence: 0.6 };
  }

  // Tubulars (OD x Wall format, large sizes)
  const tubularMatch = desc.match(/(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)/);
  if (tubularMatch) {
    const od = parseFloat(tubularMatch[1]);
    if (od > 500 || desc.includes('TUBULAR') || desc.includes('TUBE')) {
      return { type: 'TUBULAR', pattern: 'TUBULAR_OD_WALL', confidence: 0.9 };
    }
  }

  // Plates
  if (/PL\s*\d+/.test(desc)) {
    return { type: 'PLATE', pattern: 'PLATE_CODE', confidence: 0.95 };
  }
  if (desc.includes('PLATE') && /\d+\s*MM/.test(desc)) {
    return { type: 'PLATE', pattern: 'PLATE_THICKNESS', confidence: 0.85 };
  }

  // Pipes (existing patterns)
  if (/\d+\s*[""]\s*SCH/.test(desc) || desc.includes('PIPE') && /\d+\s*[""]/.test(desc)) {
    return { type: 'PIPE', pattern: 'PIPE_NPS_SCH', confidence: 0.9 };
  }

  // Flanges
  if (desc.includes('FLANGE') && /\d+\s*[""]/.test(desc) && /\d+#/.test(desc)) {
    return { type: 'FLANGE', pattern: 'FLANGE_SIZE_RATING', confidence: 0.9 };
  }

  // European Standards (can apply to any type)
  if (/EN\s*\d+/.test(desc)) {
    // If we have EN standard but no specific type identified, return null type but note the standard
    return { type: null, pattern: 'EUROPEAN_STANDARD', confidence: 0.7 };
  }

  return { type: null, pattern: null, confidence: 0 };
}

/**
 * Checks if description contains multiple material types (ambiguous)
 * 
 * @param {string} description - Material description
 * @returns {boolean} True if description is ambiguous
 */
function isAmbiguous(description) {
  if (!description) return false;

  const desc = description.toUpperCase();
  const types = [];

  if (/W\s*\d+\s*[Xx]\s*\d+/.test(desc) || /H(EA|EB)/.test(desc)) types.push('BEAM');
  if (/\d+\s*x\s*\d+/.test(desc) && desc.includes('TUBULAR')) types.push('TUBULAR');
  if (/PL\s*\d+/.test(desc)) types.push('PLATE');
  if (/\d+\s*[""]\s*SCH/.test(desc)) types.push('PIPE');

  return types.length > 1;
}

module.exports = {
  identifyMaterialType,
  isAmbiguous,
};

