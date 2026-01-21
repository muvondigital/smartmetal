/**
 * NSC Pricing Rules Configuration
 *
 * This file contains REAL NSC pricing policies based on "NSC Pricing Policies (Filled).docx"
 * Updated to replace placeholder values with actual business rules.
 *
 * DO NOT MODIFY without NSC approval.
 * Last Updated: December 2025
 */

/**
 * Quantity Break Configuration
 *
 * Defines volume discounts by material category.
 * Adjustments are negative percentages (e.g., -5 means 5% discount)
 */
const quantityBreaks = {
  // Carbon Steel quantity breaks
  carbon_steel: [
    { minQty: 1,   maxQty: 20,  adjustmentPct: 0 },    // No discount for 1-20 units
    { minQty: 21,  maxQty: 100, adjustmentPct: -5 },   // 5% discount for 21-100 units
    { minQty: 101, maxQty: null, adjustmentPct: -10 }, // 10% discount for 101+ units
  ],

  // Stainless Steel quantity breaks
  stainless_steel: [
    { minQty: 1,  maxQty: 10,  adjustmentPct: 0 },    // No discount for 1-10 units
    { minQty: 11, maxQty: 50,  adjustmentPct: -3 },   // 3% discount for 11-50 units
    { minQty: 51, maxQty: null, adjustmentPct: -7 },  // 7% discount for 51+ units
  ],

  // Alloy Steel quantity breaks
  alloy: [
    { minQty: 1,  maxQty: 10,  adjustmentPct: 0 },    // No discount for 1-10 units
    { minQty: 11, maxQty: 50,  adjustmentPct: -4 },   // 4% discount for 11-50 units
    { minQty: 51, maxQty: null, adjustmentPct: -9 },  // 9% discount for 51+ units
  ],
};

/**
 * Client Segment Margin Configuration
 *
 * Defines margin and discount policies by client type.
 * - minMarginPct: Absolute floor margin (cannot go below)
 * - targetMarginPct: Default margin to apply
 * - maxDiscountPct: Maximum discount allowed without approval flag
 */
const clientSegmentMargins = {
  strategic: {
    minMarginPct: 15,
    targetMarginPct: 20,
    maxDiscountPct: 2,
  },
  normal: {
    minMarginPct: 20,
    targetMarginPct: 20,
    maxDiscountPct: 3,
  },
  distributor: {
    minMarginPct: 20,
    targetMarginPct: 20,
    maxDiscountPct: 2,
  },
  project: {
    minMarginPct: 20,
    targetMarginPct: 20,
    maxDiscountPct: 2,
  },
};

/**
 * Category-Specific Margin Overrides
 *
 * Material category margin policies that override or merge with client segment margins.
 * Effective margin = max(segment.min, category.min)
 */
const categoryMarginOverrides = {
  pipe: {
    minMarginPct: 20,
    targetMarginPct: 20,
  },
  fittings: {
    minMarginPct: 20,
    targetMarginPct: 20,
  },
  valves: {
    minMarginPct: 20,
    targetMarginPct: 20,
  },
  structural: {
    minMarginPct: 20,
    targetMarginPct: 20,
  },
};

/**
 * Rounding Rules by Category
 *
 * All categories round to nearest 10 for consistency.
 */
const roundingRules = {
  materials: 10,      // Round to nearest 10
  fabrication: 10,    // Round to nearest 10
  services: 10,       // Round to nearest 10
};

/**
 * Approval Trigger Thresholds for Pricing
 *
 * These thresholds set pricing-related flags that enrich approval context.
 * They DO NOT replace Stage 7 approval rules (margin bands 10/20%, discount bands 2/5%).
 *
 * Flags set by pricing engine:
 * - marginBelowPricingThreshold: true if margin < 18%
 * - discountAbovePricingThreshold: true if discount > 2%
 */
const approvalTriggers = {
  marginBelowPct: 18,    // Flag if margin drops below 18%
  discountAbovePct: 2,   // Flag if discount exceeds 2%
};

/**
 * Fixed-Margin Clients
 *
 * These clients cannot have margin drop below targetMarginPct.
 * Stricter enforcement for strategic accounts.
 */
const fixedMarginClients = {
  "MALAYSIA MARINE HEAVY ENGINEERIGN SDN BHD": true,
  "PVD TUBULARS MANAGEMENT CO., LTD": true,
  "MCCONNEL DOWELL PHILIPPINES INC.": true,
  "PT. AINUL HAYAT SEJAHTERA": true,
  "PT. INDOTURBINE": true,
  "TSM MAINTENANCE AND CONSTRUCTION SERVICES SDN BHD": true,
};

/**
 * Regional Adjustments
 *
 * Regional pricing adjustments by country/region.
 * Format: { minAdjPct, maxAdjPct }
 *
 * If engine expects a single scalar, use midpoint: (min + max) / 2
 */
const regionalAdjustments = {
  malaysia: {
    minAdjPct: 0,
    maxAdjPct: 2,
  },
  indonesia: {
    minAdjPct: 3,
    maxAdjPct: 5,
  },
  vietnam: {
    minAdjPct: 2,
    maxAdjPct: 4,
  },
};

/**
 * Industry Adjustments
 *
 * Industry-specific pricing adjustments.
 * Format: { minAdjPct, maxAdjPct }
 *
 * Negative values indicate discounts (e.g., fabrication industry gets discounts).
 * If engine expects a single scalar, use midpoint: (min + max) / 2
 */
const industryAdjustments = {
  oil_and_gas: {
    minAdjPct: 5,
    maxAdjPct: 10,
  },
  power: {
    minAdjPct: 3,
    maxAdjPct: 6,
  },
  geothermal: {
    minAdjPct: 2,
    maxAdjPct: 5,
  },
  fabrication: {
    minAdjPct: -3,
    maxAdjPct: 0,
  },
};

/**
 * Helper: Get quantity break adjustment for category and quantity
 */
function getQuantityBreakAdjustment(category, quantity) {
  // Map material categories to quantity break keys
  const categoryMap = {
    'PIPE': 'carbon_steel',
    'PLATE': 'carbon_steel',
    'BEAM': 'carbon_steel',
    'STRUCTURAL': 'carbon_steel',
    'STAINLESS': 'stainless_steel',
    'ALLOY': 'alloy',
    'FITTING': 'carbon_steel',
    'FLANGE': 'carbon_steel',
    'VALVE': 'carbon_steel',
  };

  const breakKey = categoryMap[category?.toUpperCase()] || 'carbon_steel';
  const breaks = quantityBreaks[breakKey];

  if (!breaks) {
    return 0;
  }

  // Find matching tier
  for (const tier of breaks) {
    if (quantity >= tier.minQty && (tier.maxQty === null || quantity <= tier.maxQty)) {
      return tier.adjustmentPct;
    }
  }

  return 0;
}

/**
 * Helper: Get client segment margins
 */
function getClientSegmentMargins(clientSegment) {
  const segment = clientSegmentMargins[clientSegment] || clientSegmentMargins.normal;
  return segment;
}

/**
 * Helper: Get category margin overrides
 */
function getCategoryMarginOverrides(category) {
  const normalizedCategory = category?.toLowerCase();
  return categoryMarginOverrides[normalizedCategory] || null;
}

/**
 * Helper: Calculate effective margin (merge segment and category)
 */
function calculateEffectiveMargin(clientSegment, category) {
  const segmentMargins = getClientSegmentMargins(clientSegment);
  const categoryOverrides = getCategoryMarginOverrides(category);

  if (!categoryOverrides) {
    return segmentMargins;
  }

  // Effective min margin = max of segment and category
  const effectiveMinMargin = Math.max(
    segmentMargins.minMarginPct,
    categoryOverrides.minMarginPct
  );

  // Effective target margin = max of segment and category
  const effectiveTargetMargin = Math.max(
    segmentMargins.targetMarginPct,
    categoryOverrides.targetMarginPct
  );

  return {
    minMarginPct: effectiveMinMargin,
    targetMarginPct: effectiveTargetMargin,
    maxDiscountPct: segmentMargins.maxDiscountPct,
  };
}

/**
 * Helper: Check if client has fixed margin requirement
 */
function isFixedMarginClient(clientName) {
  if (!clientName) {
    return false;
  }
  return fixedMarginClients[clientName] === true;
}

/**
 * Helper: Get regional adjustment midpoint
 */
function getRegionalAdjustment(region) {
  const adjustment = regionalAdjustments[region?.toLowerCase()];
  if (!adjustment) {
    return 0;
  }
  // Return midpoint
  return (adjustment.minAdjPct + adjustment.maxAdjPct) / 2;
}

/**
 * Helper: Get industry adjustment midpoint
 */
function getIndustryAdjustment(industry) {
  const adjustment = industryAdjustments[industry?.toLowerCase()];
  if (!adjustment) {
    return 0;
  }
  // Return midpoint
  return (adjustment.minAdjPct + adjustment.maxAdjPct) / 2;
}

/**
 * Helper: Apply rounding rules
 */
function applyRoundingRule(price, category) {
  const roundingTarget = roundingRules[category?.toLowerCase()] || roundingRules.materials;
  return Math.round(price / roundingTarget) * roundingTarget;
}

/**
 * Helper: Check if pricing triggers approval flags
 */
function checkApprovalFlags(margin, discount) {
  return {
    marginBelowPricingThreshold: margin < approvalTriggers.marginBelowPct,
    discountAbovePricingThreshold: discount > approvalTriggers.discountAbovePct,
  };
}

module.exports = {
  // Raw configuration objects
  quantityBreaks,
  clientSegmentMargins,
  categoryMarginOverrides,
  roundingRules,
  approvalTriggers,
  fixedMarginClients,
  regionalAdjustments,
  industryAdjustments,

  // Helper functions
  getQuantityBreakAdjustment,
  getClientSegmentMargins,
  getCategoryMarginOverrides,
  calculateEffectiveMargin,
  isFixedMarginClient,
  getRegionalAdjustment,
  getIndustryAdjustment,
  applyRoundingRule,
  checkApprovalFlags,
};
