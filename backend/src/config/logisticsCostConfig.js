/**
 * Logistics Cost Configuration - Phase 9: Landed Cost Engine V2
 *
 * Configuration for freight, insurance, handling, and local charges estimation.
 * All rates are configurable per tenant and can be overridden based on:
 * - Material category
 * - Origin country
 * - Weight/volume
 * - Order value
 *
 * Purpose:
 * - Provide transparent landed cost breakdown
 * - Support multi-origin freight estimation
 * - Enable tenant-specific logistics parameters
 */

/**
 * Default logistics cost configuration
 * Can be overridden by tenant-specific settings in tenant_settings table
 */
const defaultLogisticsConfig = {
  // Freight Cost Estimation
  freight: {
    // Estimation method: 'WEIGHT_BASED', 'VALUE_BASED', 'FLAT_RATE', 'VOLUME_BASED'
    method: 'WEIGHT_BASED',

    // Weight-based rates (per kg)
    weightRates: {
      // Origin country -> rate per kg in USD
      CN: 0.85, // China
      JP: 1.20, // Japan
      KR: 1.10, // South Korea
      IN: 0.75, // India
      TH: 0.70, // Thailand
      ID: 0.65, // Indonesia
      VN: 0.68, // Vietnam
      US: 1.50, // United States
      EU: 1.40, // European Union (average)
      DEFAULT: 1.00, // Default rate if origin not specified
    },

    // Value-based rates (percentage of item value)
    valuePct: {
      CN: 0.08, // 8% of item value
      JP: 0.06,
      KR: 0.07,
      IN: 0.09,
      TH: 0.07,
      ID: 0.08,
      VN: 0.08,
      US: 0.05,
      EU: 0.06,
      DEFAULT: 0.07, // 7% default
    },

    // Flat rates by category (fallback if no weight/value available)
    flatRates: {
      PIPE: 250.00,
      FLANGE: 150.00,
      FITTING: 100.00,
      FASTENER: 50.00,
      VALVE: 200.00,
      GRATING: 180.00,
      DEFAULT: 120.00,
    },

    // Volume-based rates (per cubic meter)
    volumeRates: {
      CN: 45.00,
      JP: 60.00,
      KR: 55.00,
      IN: 40.00,
      TH: 38.00,
      DEFAULT: 50.00,
    },

    // Minimum freight charge
    minimumCharge: 50.00,
  },

  // Insurance Cost Estimation
  insurance: {
    // Insurance as percentage of CIF value (Cost + Insurance + Freight)
    // Standard marine insurance rates
    baseRate: 0.015, // 1.5% of CIF value (industry standard)

    // Higher risk origins may have higher insurance rates
    originAdjustments: {
      CN: 1.0, // No adjustment
      JP: 0.8, // Lower risk, -20%
      KR: 0.9,
      IN: 1.2, // Higher risk, +20%
      VN: 1.1,
      DEFAULT: 1.0,
    },

    // Category-based adjustments (hazardous materials, special handling)
    categoryAdjustments: {
      PIPE: 1.0,
      FLANGE: 0.9,
      FITTING: 0.9,
      FASTENER: 0.8,
      VALVE: 1.2, // Higher value items
      GRATING: 1.0,
      DEFAULT: 1.0,
    },

    // Minimum insurance charge
    minimumCharge: 25.00,
  },

  // Handling Cost Estimation
  handling: {
    // Handling method: 'FIXED_PER_ITEM', 'VALUE_BASED', 'WEIGHT_BASED'
    method: 'WEIGHT_BASED',

    // Fixed per-item handling charges
    fixedPerItem: {
      PIPE: 15.00,
      FLANGE: 10.00,
      FITTING: 8.00,
      FASTENER: 5.00,
      VALVE: 12.00,
      GRATING: 18.00,
      DEFAULT: 10.00,
    },

    // Weight-based handling (per kg)
    weightRate: 0.12, // $0.12 per kg for handling/port charges

    // Value-based handling (percentage)
    valuePct: 0.02, // 2% of item value

    // Port/terminal charges (flat rate per shipment, distributed across items)
    portCharges: 150.00,

    // Customs clearance base fee (per shipment, distributed)
    customsClearanceFee: 100.00,
  },

  // Local Charges (delivery, documentation, misc)
  localCharges: {
    // Local delivery method: 'DISTANCE_BASED', 'FLAT_RATE', 'VALUE_BASED'
    method: 'FLAT_RATE',

    // Flat delivery charge per item
    flatRatePerItem: 25.00,

    // Value-based local delivery (percentage)
    valuePct: 0.015, // 1.5%

    // Documentation and administration fees (per shipment, distributed)
    documentationFee: 75.00,

    // Bank charges for international payments (per shipment, distributed)
    bankCharges: 50.00,

    // Miscellaneous local charges
    miscellaneousPct: 0.01, // 1% for misc local costs
  },

  // Weight estimation if not available
  estimatedWeights: {
    // Kg per unit by category (rough estimates)
    PIPE: {
      // By NPS (Nominal Pipe Size)
      '0.5': 1.5,
      '1': 3.0,
      '2': 6.5,
      '3': 12.0,
      '4': 18.0,
      '6': 35.0,
      '8': 55.0,
      '10': 80.0,
      '12': 110.0,
      DEFAULT: 25.0, // Default per meter
    },
    FLANGE: {
      // By NPS
      '0.5': 0.8,
      '1': 1.5,
      '2': 3.5,
      '3': 7.0,
      '4': 12.0,
      '6': 25.0,
      '8': 45.0,
      '10': 70.0,
      '12': 95.0,
      DEFAULT: 15.0, // Default per piece
    },
    FITTING: 5.0, // Per piece
    FASTENER: 0.1, // Per piece
    VALVE: 8.0, // Per piece
    GRATING: 12.0, // Per sq meter
    DEFAULT: 5.0,
  },
};

/**
 * Get logistics config for a tenant
 * @param {string} tenantId - Tenant UUID
 * @returns {Object} Merged logistics configuration
 */
function getLogisticsConfigForTenant(tenantId) {
  // TODO: In future, load tenant-specific overrides from tenant_settings
  // For Phase 9, use default config
  return defaultLogisticsConfig;
}

/**
 * Get freight estimation method for a tenant
 */
function getFreightMethod(tenantId) {
  const config = getLogisticsConfigForTenant(tenantId);
  return config.freight.method;
}

/**
 * Get insurance base rate
 */
function getInsuranceRate(tenantId) {
  const config = getLogisticsConfigForTenant(tenantId);
  return config.insurance.baseRate;
}

/**
 * Check if logistics cost calculation is enabled
 */
function isLogisticsCostEnabled(tenantId = null) {
  // Feature flag check - can be expanded to check tenant-specific settings
  return process.env.ENABLE_LANDED_COST_V2 === 'true';
}

module.exports = {
  defaultLogisticsConfig,
  getLogisticsConfigForTenant,
  getFreightMethod,
  getInsuranceRate,
  isLogisticsCostEnabled,
};

