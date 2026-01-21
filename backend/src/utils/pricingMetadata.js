/**
 * Pricing Metadata Utilities
 * Stage 1 finishing: Helper functions for extracting and working with pricing metadata
 */

/**
 * Extracts pricing metadata from notes field
 * @param {string} notes - Notes string that may contain metadata
 * @returns {Object|null} Extracted metadata or null if not found
 */
function extractPricingMetadata(notes) {
  if (!notes || typeof notes !== 'string') {
    return null;
  }

  const metadataPattern = /\[METADATA\](.*?)\[\/METADATA\]/s;
  const match = notes.match(metadataPattern);

  if (!match) {
    return null;
  }

  try {
    return JSON.parse(match[1]);
  } catch (error) {
    console.warn('Failed to parse pricing metadata:', error);
    return null;
  }
}

/**
 * Gets clean notes without metadata markers
 * @param {string} notes - Notes string with metadata
 * @returns {string} Clean notes without metadata
 */
function getCleanNotes(notes) {
  if (!notes || typeof notes !== 'string') {
    return notes || '';
  }

  return notes.replace(/\[METADATA\].*?\[\/METADATA\]/s, '').trim();
}

/**
 * Formats pricing metadata for display
 * @param {Object} metadata - Pricing metadata object
 * @returns {Object} Formatted metadata for display
 */
function formatMetadataForDisplay(metadata) {
  if (!metadata) {
    return null;
  }

  return {
    calculated_at: metadata.calculation_timestamp,
    base_cost: metadata.base_cost,
    pricing_method: metadata.pricing_method,
    rounding_applied: metadata.rounding_applied,
    rounding_method: metadata.rounding_method,
    rounding_amount: metadata.rounding_amount,
    rule_applied: metadata.rule_applied,
    agreement_applied: metadata.agreement_applied,
    currency: metadata.currency,
    origin_type: metadata.origin_type,
    category: metadata.category,
  };
}

module.exports = {
  extractPricingMetadata,
  getCleanNotes,
  formatMetadataForDisplay,
};

