/**
 * Material Category Normalizer for MTO Pipeline
 * 
 * This function can be called by the MTO extraction pipeline to normalize
 * extracted material descriptions into SmartMetal categories and generate
 * material codes.
 * 
 * This is a safe, optional step that does not modify existing extraction logic.
 * It provides a normalization layer on top of raw MTO extraction results.
 * 
 * Usage in MTO pipeline:
 *   const { normalizeMtoExtraction } = require('./materialCategoryNormalizer');
 *   const normalized = normalizeMtoExtraction(extractedItem);
 */

const { normalizeMtoItem } = require('./mtoNormalizer');

/**
 * Attempts to classify and normalize an extracted MTO item
 * 
 * This function tries to match extracted descriptions to known patterns:
 * - W-beams: "W36x194", "W24x104", etc.
 * - Rolled tubular: "2338×40", "1828.8×44.5", etc.
 * - Seamless pipe: "406.4×25.4", "273.1×15.9", etc.
 * - Plates: "PL6", "PL10", "PL25", etc.
 * - Reducers: "1828.8→1371.6×38", etc.
 * 
 * @param {Object} extractedItem - Extracted MTO item from pipeline
 * @param {string} extractedItem.description - Material description
 * @param {string} [extractedItem.spec] - Specification standard
 * @param {string} [extractedItem.grade] - Material grade
 * @param {string} [extractedItem.material_type] - Material type
 * @param {string} [extractedItem.origin_type] - Origin type
 * @returns {Object|null} Normalized material data or null if cannot be classified
 */
function normalizeMtoExtraction(extractedItem) {
  const { description, spec, grade, material_type, origin_type } = extractedItem;
  
  if (!description) {
    return null;
  }
  
  const descUpper = description.toUpperCase().trim();
  
  // Try to match W-beam pattern
  const wBeamMatch = descUpper.match(/W(\d+)X(\d+)/);
  if (wBeamMatch) {
    try {
      return normalizeMtoItem({
        type: 'W_BEAM',
        designation: `W${wBeamMatch[1]}x${wBeamMatch[2]}`,
        spec_standard: spec,
        grade,
        material_type,
        origin_type,
      });
    } catch (e) {
      // If normalization fails, return null
      return null;
    }
  }
  
  // Try to match plate pattern (PL followed by number)
  const plateMatch = descUpper.match(/PL(\d+)/);
  if (plateMatch) {
    try {
      return normalizeMtoItem({
        type: 'PLATE',
        designation: `PL${plateMatch[1]}`,
        plate_size_m: '2.4×6.0', // Default, can be overridden if found in description
        spec_standard: spec,
        grade,
        material_type,
        origin_type,
      });
    } catch (e) {
      return null;
    }
  }
  
  // Try to match reducer pattern (from→to×thickness)
  const reducerMatch = descUpper.match(/(\d+(?:\.\d+)?)\s*[→->]\s*(\d+(?:\.\d+)?)\s*[×X]\s*(\d+(?:\.\d+)?)/);
  if (reducerMatch) {
    try {
      return normalizeMtoItem({
        type: 'REDUCER',
        dimensions: `${reducerMatch[1]}→${reducerMatch[2]}×${reducerMatch[3]}`,
        spec_standard: spec,
        grade,
        material_type,
        origin_type,
      });
    } catch (e) {
      return null;
    }
  }
  
  // Try to match OD×WT pattern (could be rolled tubular or seamless pipe)
  // Look for keywords to distinguish
  const odWtMatch = descUpper.match(/(\d+(?:\.\d+)?)\s*[×X]\s*(\d+(?:\.\d+)?)/);
  if (odWtMatch) {
    const dimensions = `${odWtMatch[1]}×${odWtMatch[2]}`;
    
    // Check for keywords to determine type
    const isSeamless = descUpper.includes('SEAMLESS') || descUpper.includes('SMLS') || descUpper.includes('PIPE');
    const isRolled = descUpper.includes('ROLLED') || descUpper.includes('TUBULAR') || descUpper.includes('TUBE');
    
    try {
      if (isSeamless || (!isRolled && parseFloat(odWtMatch[1]) < 1000)) {
        // Likely seamless pipe (smaller OD typically indicates pipe)
        return normalizeMtoItem({
          type: 'SEAMLESS_PIPE',
          dimensions,
          spec_standard: spec,
          grade,
          material_type,
          origin_type,
        });
      } else {
        // Likely rolled tubular (larger OD typically indicates structural tubular)
        return normalizeMtoItem({
          type: 'ROLLED_TUBULAR',
          dimensions,
          spec_standard: spec,
          grade,
          material_type,
          origin_type,
        });
      }
    } catch (e) {
      return null;
    }
  }
  
  // No match found
  return null;
}

/**
 * Batch normalizes multiple extracted MTO items
 * 
 * @param {Array<Object>} extractedItems - Array of extracted MTO items
 * @returns {Array<Object>} Array of normalized materials (nulls filtered out)
 */
function normalizeMtoExtractions(extractedItems) {
  const normalized = extractedItems
    .map(item => normalizeMtoExtraction(item))
    .filter(item => item !== null);
  
  return normalized;
}

module.exports = {
  normalizeMtoExtraction,
  normalizeMtoExtractions,
};
