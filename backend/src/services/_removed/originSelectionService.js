/**
 * Origin Selection Service
 *
 * Determines the origin country for pricing calculations
 * and whether dual pricing (origin + destination) should be calculated
 *
 * Developed by Muvon Digital (Muvon Energy)
 */

/**
 * Select origin country for pricing
 *
 * @param {Object} options - Selection options
 * @param {string} [options.clientCountry] - Client's country
 * @param {string} [options.projectCountry] - Project country
 * @param {string} [options.defaultOrigin] - Default origin (fallback)
 * @returns {string} Selected origin country code
 */
function selectOrigin(options = {}) {
  const { clientCountry, projectCountry, defaultOrigin = 'MY' } = options;

  // Priority order:
  // 1. Project country (if specified)
  // 2. Client country (if specified)
  // 3. Default origin (Malaysia)

  if (projectCountry) {
    return projectCountry;
  }

  if (clientCountry) {
    return clientCountry;
  }

  return defaultOrigin;
}

/**
 * Determine if dual pricing should be calculated
 * (both origin and destination pricing)
 *
 * @param {Object} options - Options
 * @param {string} [options.origin] - Origin country
 * @param {string} [options.destination] - Destination country
 * @returns {boolean} True if dual pricing needed
 */
function shouldCalculateDualPricing(options = {}) {
  const { origin, destination } = options;

  // Calculate dual pricing if origin and destination are different
  if (origin && destination && origin !== destination) {
    return true;
  }

  return false;
}

module.exports = {
  selectOrigin,
  shouldCalculateDualPricing,
};
