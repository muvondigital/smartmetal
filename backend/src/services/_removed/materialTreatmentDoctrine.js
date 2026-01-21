/**
 * Material Treatment Doctrine v1
 *
 * Classifies RFQ items into treatment types:
 * - CANONICAL: Standard catalog items
 * - PARAMETERIZED: Items with cut lengths, plate sizes, etc.
 * - PROJECT_SPECIFIC: Custom fabrications, assemblies
 *
 * Developed by Muvon Digital (Muvon Energy)
 */

const TREATMENT_TYPES = {
  CANONICAL: 'CANONICAL',
  PARAMETERIZED: 'PARAMETERIZED',
  PROJECT_SPECIFIC: 'PROJECT_SPECIFIC',
};

/**
 * Extract parameters from item description
 * Looks for: LENGTH, CUT TO, CUT, plate dimensions
 *
 * @param {string} description - Item description
 * @returns {Object|null} Extracted parameters or null
 */
function extractItemParameters(description) {
  if (!description || typeof description !== 'string') {
    return null;
  }

  const params = {};
  const desc = description.toUpperCase();

  // Extract LENGTH in meters (e.g., "LENGTH 3.7M", "LENGTH 3700MM", "LENGTH 12FT")
  const lengthMatch = desc.match(/LENGTH\s+(\d+(?:\.\d+)?)\s*(M|MM|FT)/);
  if (lengthMatch) {
    let value = parseFloat(lengthMatch[1]);
    const unit = lengthMatch[2];
    if (unit === 'MM') value = value / 1000;
    if (unit === 'FT') value = value * 0.3048;
    params.length_m = value;
  }

  // Extract CUT TO in meters
  const cutToMatch = desc.match(/CUT\s+TO\s+(\d+(?:\.\d+)?)\s*(M|MM|FT)/);
  if (cutToMatch) {
    let value = parseFloat(cutToMatch[1]);
    const unit = cutToMatch[2];
    if (unit === 'MM') value = value / 1000;
    if (unit === 'FT') value = value * 0.3048;
    params.cut_to_m = value;
  }

  // Extract CUT (without TO)
  const cutMatch = desc.match(/(?<!TO\s)CUT\s+(\d+(?:\.\d+)?)\s*(M|MM|FT)(?!\s+TO)/);
  if (cutMatch && !params.cut_to_m) {
    let value = parseFloat(cutMatch[1]);
    const unit = cutMatch[2];
    if (unit === 'MM') value = value / 1000;
    if (unit === 'FT') value = value * 0.3048;
    params.cut_m = value;
  }

  // Extract plate dimensions (e.g., "2.4 x 6.0 meters")
  const plateMatch = desc.match(/(\d+(?:\.\d+)?)\s*[xX×]\s*(\d+(?:\.\d+)?)\s*M(?:ETERS)?/);
  if (plateMatch) {
    params.plate_cut_size_m = {
      width_m: parseFloat(plateMatch[1]),
      length_m: parseFloat(plateMatch[2]),
    };
  }

  // Check for LONG LENGTH flag
  if (desc.includes('LONG LENGTH')) {
    params.long_length = true;
  }

  return Object.keys(params).length > 0 ? params : null;
}

/**
 * Infer treatment type for an item
 *
 * @param {Object} item - Item object with description
 * @param {string} item.description - Item description
 * @param {Object} [item.extractedParams] - Pre-extracted parameters
 * @returns {string} Treatment type: CANONICAL, PARAMETERIZED, or PROJECT_SPECIFIC
 */
function inferTreatmentType(item) {
  if (!item || !item.description) {
    return TREATMENT_TYPES.CANONICAL;
  }

  const desc = item.description.toUpperCase();
  const extractedParams = item.extractedParams || extractItemParameters(item.description);

  // PROJECT_SPECIFIC indicators (highest priority)
  const fabricationKeywords = [
    'FABRICATION',
    'FABRICATED',
    'ASSEMBLY',
    'SPOOL',
    'SKID',
    'CUSTOM',
    'WELDED',
    'TRANSITION CONE',
  ];

  for (const keyword of fabricationKeywords) {
    if (desc.includes(keyword)) {
      return TREATMENT_TYPES.PROJECT_SPECIFIC;
    }
  }

  // PARAMETERIZED if parameters were extracted
  if (extractedParams && Object.keys(extractedParams).length > 0) {
    return TREATMENT_TYPES.PARAMETERIZED;
  }

  // Default to CANONICAL (standard catalog item)
  return TREATMENT_TYPES.CANONICAL;
}

module.exports = {
  TREATMENT_TYPES,
  extractItemParameters,
  inferTreatmentType,
};
