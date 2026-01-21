/**
 * Approval Rules Engine
 *
 * Evaluates approval requirements based on pricing run characteristics
 *
 * Developed by Muvon Digital (Muvon Energy)
 */

const { log } = require('../utils/logger');

/**
 * Evaluate if approval is required for a pricing run
 *
 * @param {Object} pricingRun - Pricing run object
 * @param {Object} approvalConfig - Tenant approval configuration
 * @returns {Object} Evaluation result
 */
function evaluateApprovalRequired(pricingRun, approvalConfig) {
  if (!pricingRun) {
    return {
      required: false,
      reason: 'No pricing run provided',
    };
  }

  if (!approvalConfig) {
    // Default: require approval for all runs if no config
    return {
      required: true,
      reason: 'Default policy: approval required',
    };
  }

  const { total_price, margin_percentage, discount_percentage } = pricingRun;

  // Check price threshold
  if (approvalConfig.price_threshold && total_price > approvalConfig.price_threshold) {
    return {
      required: true,
      reason: `Total price exceeds threshold (${total_price} > ${approvalConfig.price_threshold})`,
      threshold: 'price',
    };
  }

  // Check margin threshold
  if (approvalConfig.min_margin_percentage && margin_percentage < approvalConfig.min_margin_percentage) {
    return {
      required: true,
      reason: `Margin below minimum (${margin_percentage}% < ${approvalConfig.min_margin_percentage}%)`,
      threshold: 'margin',
    };
  }

  // Check discount threshold
  if (approvalConfig.max_discount_percentage && discount_percentage > approvalConfig.max_discount_percentage) {
    return {
      required: true,
      reason: `Discount exceeds maximum (${discount_percentage}% > ${approvalConfig.max_discount_percentage}%)`,
      threshold: 'discount',
    };
  }

  return {
    required: false,
    reason: 'Within approval thresholds',
  };
}

/**
 * Determine approval level required
 *
 * @param {Object} pricingRun - Pricing run object
 * @param {Object} approvalConfig - Tenant approval configuration
 * @returns {string} Approval level: 'MANAGER', 'DIRECTOR', 'CFO'
 */
function determineApprovalLevel(pricingRun, approvalConfig) {
  if (!approvalConfig || !pricingRun) {
    return 'MANAGER';
  }

  const { total_price, margin_percentage, discount_percentage } = pricingRun;

  // CFO approval for very high value or very low margin
  if (total_price > (approvalConfig.cfo_threshold || 1000000)) {
    return 'CFO';
  }

  if (margin_percentage < (approvalConfig.cfo_min_margin || 5)) {
    return 'CFO';
  }

  // Director approval for high value or low margin
  if (total_price > (approvalConfig.director_threshold || 500000)) {
    return 'DIRECTOR';
  }

  if (margin_percentage < (approvalConfig.director_min_margin || 10)) {
    return 'DIRECTOR';
  }

  // Manager approval for everything else
  return 'MANAGER';
}

module.exports = {
  evaluateApprovalRequired,
  determineApprovalLevel,
};
