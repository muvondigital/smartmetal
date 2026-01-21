/**
 * Logistics Cost Service - Phase 9: Landed Cost Engine V2
 *
 * Provides comprehensive logistics cost estimation for landed cost calculations:
 * - Freight cost estimation (weight-based, value-based, volume-based)
 * - Insurance cost calculation (marine insurance, cargo insurance)
 * - Handling cost estimation (port charges, customs clearance)
 * - Local charges (delivery, documentation, bank charges)
 *
 * All calculations are configurable per tenant and support multiple estimation methods.
 */

const { getLogisticsConfigForTenant, isLogisticsCostEnabled } = require('../config/logisticsCostConfig');
const { log } = require('../utils/logger');

/**
 * Estimate freight cost for an item
 *
 * @param {Object} item - RFQ item or pricing run item
 * @param {Object} context - Additional context
 * @param {string} context.tenantId - Tenant ID
 * @param {string} context.originCountry - Country of origin (e.g., 'CN', 'JP')
 * @param {string} context.category - Material category
 * @param {number} context.quantity - Item quantity
 * @param {number} context.unitPrice - Unit price (for value-based calculation)
 * @param {number} context.weight - Item weight in kg (optional)
 * @param {number} context.volume - Item volume in cubic meters (optional)
 * @returns {number} Estimated freight cost
 */
function estimateFreightCost(item, context) {
  const { tenantId, originCountry = 'DEFAULT', category = 'DEFAULT', quantity = 1, unitPrice = 0 } = context;

  // Check if feature is enabled
  if (!isLogisticsCostEnabled(tenantId)) {
    return 0;
  }

  const config = getLogisticsConfigForTenant(tenantId);
  const freightConfig = config.freight;
  const method = freightConfig.method;

  let freightCost = 0;

  try {
    switch (method) {
      case 'WEIGHT_BASED': {
        // Estimate weight if not provided
        const weight = context.weight || estimateWeight(item, category, quantity, config);
        const ratePerKg = freightConfig.weightRates[originCountry] || freightConfig.weightRates.DEFAULT;
        freightCost = weight * ratePerKg;
        log.debug('Freight (weight-based)', { weight, ratePerKg, freightCost });
        break;
      }

      case 'VALUE_BASED': {
        const valuePct = freightConfig.valuePct[originCountry] || freightConfig.valuePct.DEFAULT;
        const itemValue = unitPrice * quantity;
        freightCost = itemValue * valuePct;
        log.debug('Freight (value-based)', { itemValue, valuePct, freightCost });
        break;
      }

      case 'VOLUME_BASED': {
        const volume = context.volume || estimateVolume(item, category, quantity);
        const ratePerCbm = freightConfig.volumeRates[originCountry] || freightConfig.volumeRates.DEFAULT;
        freightCost = volume * ratePerCbm;
        log.debug('Freight (volume-based)', { volume, ratePerCbm, freightCost });
        break;
      }

      case 'FLAT_RATE': {
        freightCost = freightConfig.flatRates[category] || freightConfig.flatRates.DEFAULT;
        log.debug('Freight (flat-rate)', { category, freightCost });
        break;
      }

      default: {
        // Fallback to weight-based
        const weight = context.weight || estimateWeight(item, category, quantity, config);
        const ratePerKg = freightConfig.weightRates[originCountry] || freightConfig.weightRates.DEFAULT;
        freightCost = weight * ratePerKg;
        break;
      }
    }

    // Apply minimum charge
    freightCost = Math.max(freightCost, freightConfig.minimumCharge || 0);

    return parseFloat(freightCost.toFixed(2));
  } catch (error) {
    log.error('Error estimating freight cost', { error, item, context });
    return 0;
  }
}

/**
 * Estimate insurance cost for an item
 *
 * @param {Object} item - RFQ item or pricing run item
 * @param {Object} context - Additional context
 * @param {string} context.tenantId - Tenant ID
 * @param {string} context.originCountry - Country of origin
 * @param {string} context.category - Material category
 * @param {number} context.quantity - Item quantity
 * @param {number} context.unitPrice - Unit price
 * @param {number} context.freightCost - Already calculated freight cost (for CIF calculation)
 * @returns {number} Estimated insurance cost
 */
function estimateInsuranceCost(item, context) {
  const { tenantId, originCountry = 'DEFAULT', category = 'DEFAULT', quantity = 1, unitPrice = 0, freightCost = 0 } = context;

  // Check if feature is enabled
  if (!isLogisticsCostEnabled(tenantId)) {
    return 0;
  }

  const config = getLogisticsConfigForTenant(tenantId);
  const insuranceConfig = config.insurance;

  try {
    // Calculate CIF value (Cost + Insurance + Freight)
    // Standard practice: Insurance is calculated on (Cost + Freight) * (1 + insurance rate)
    const itemValue = unitPrice * quantity;
    const cifBase = itemValue + freightCost;

    // Get base insurance rate
    let insuranceRate = insuranceConfig.baseRate;

    // Apply origin adjustment
    const originAdj = insuranceConfig.originAdjustments[originCountry] || insuranceConfig.originAdjustments.DEFAULT;
    insuranceRate *= originAdj;

    // Apply category adjustment
    const categoryAdj = insuranceConfig.categoryAdjustments[category] || insuranceConfig.categoryAdjustments.DEFAULT;
    insuranceRate *= categoryAdj;

    // Calculate insurance cost
    let insuranceCost = cifBase * insuranceRate;

    // Apply minimum charge
    insuranceCost = Math.max(insuranceCost, insuranceConfig.minimumCharge || 0);

    log.debug('Insurance cost calculated', {
      cifBase,
      insuranceRate,
      originAdj,
      categoryAdj,
      insuranceCost,
    });

    return parseFloat(insuranceCost.toFixed(2));
  } catch (error) {
    log.error('Error estimating insurance cost', { error, item, context });
    return 0;
  }
}

/**
 * Estimate handling cost for an item (port charges, customs clearance)
 *
 * @param {Object} item - RFQ item or pricing run item
 * @param {Object} context - Additional context
 * @param {string} context.tenantId - Tenant ID
 * @param {string} context.category - Material category
 * @param {number} context.quantity - Item quantity
 * @param {number} context.unitPrice - Unit price
 * @param {number} context.weight - Item weight
 * @param {number} context.totalItems - Total items in shipment (for distributing fixed costs)
 * @returns {number} Estimated handling cost
 */
function estimateHandlingCost(item, context) {
  const { tenantId, category = 'DEFAULT', quantity = 1, unitPrice = 0, totalItems = 1 } = context;

  // Check if feature is enabled
  if (!isLogisticsCostEnabled(tenantId)) {
    return 0;
  }

  const config = getLogisticsConfigForTenant(tenantId);
  const handlingConfig = config.handling;
  const method = handlingConfig.method;

  let handlingCost = 0;

  try {
    switch (method) {
      case 'FIXED_PER_ITEM': {
        handlingCost = handlingConfig.fixedPerItem[category] || handlingConfig.fixedPerItem.DEFAULT;
        break;
      }

      case 'WEIGHT_BASED': {
        const weight = context.weight || estimateWeight(item, category, quantity, config);
        handlingCost = weight * handlingConfig.weightRate;
        break;
      }

      case 'VALUE_BASED': {
        const itemValue = unitPrice * quantity;
        handlingCost = itemValue * handlingConfig.valuePct;
        break;
      }

      default: {
        // Default to weight-based
        const weight = context.weight || estimateWeight(item, category, quantity, config);
        handlingCost = weight * handlingConfig.weightRate;
        break;
      }
    }

    // Add distributed port charges (split across all items in shipment)
    const portChargesPerItem = handlingConfig.portCharges / totalItems;
    handlingCost += portChargesPerItem;

    // Add distributed customs clearance fee
    const customsFeePerItem = handlingConfig.customsClearanceFee / totalItems;
    handlingCost += customsFeePerItem;

    log.debug('Handling cost calculated', {
      method,
      handlingCost,
      portChargesPerItem,
      customsFeePerItem,
    });

    return parseFloat(handlingCost.toFixed(2));
  } catch (error) {
    log.error('Error estimating handling cost', { error, item, context });
    return 0;
  }
}

/**
 * Estimate local charges (delivery, documentation, bank charges)
 *
 * @param {Object} item - RFQ item or pricing run item
 * @param {Object} context - Additional context
 * @param {string} context.tenantId - Tenant ID
 * @param {string} context.category - Material category
 * @param {number} context.quantity - Item quantity
 * @param {number} context.unitPrice - Unit price
 * @param {number} context.totalItems - Total items in shipment
 * @returns {number} Estimated local charges
 */
function estimateLocalCharges(item, context) {
  const { tenantId, category = 'DEFAULT', quantity = 1, unitPrice = 0, totalItems = 1 } = context;

  // Check if feature is enabled
  if (!isLogisticsCostEnabled(tenantId)) {
    return 0;
  }

  const config = getLogisticsConfigForTenant(tenantId);
  const localConfig = config.localCharges;
  const method = localConfig.method;

  let localCharges = 0;

  try {
    switch (method) {
      case 'FLAT_RATE': {
        localCharges = localConfig.flatRatePerItem;
        break;
      }

      case 'VALUE_BASED': {
        const itemValue = unitPrice * quantity;
        localCharges = itemValue * localConfig.valuePct;
        break;
      }

      default: {
        localCharges = localConfig.flatRatePerItem;
        break;
      }
    }

    // Add distributed documentation fee
    const docFeePerItem = localConfig.documentationFee / totalItems;
    localCharges += docFeePerItem;

    // Add distributed bank charges
    const bankChargesPerItem = localConfig.bankCharges / totalItems;
    localCharges += bankChargesPerItem;

    // Add miscellaneous charges (percentage of item value)
    const itemValue = unitPrice * quantity;
    const miscCharges = itemValue * localConfig.miscellaneousPct;
    localCharges += miscCharges;

    log.debug('Local charges calculated', {
      method,
      localCharges,
      docFeePerItem,
      bankChargesPerItem,
      miscCharges,
    });

    return parseFloat(localCharges.toFixed(2));
  } catch (error) {
    log.error('Error estimating local charges', { error, item, context });
    return 0;
  }
}

/**
 * Calculate complete logistics costs for an item
 *
 * @param {Object} item - RFQ item or pricing run item
 * @param {Object} context - Full context including all parameters
 * @returns {Object} Complete logistics cost breakdown
 */
function calculateItemLogisticsCosts(item, context) {
  const { tenantId } = context;

  if (!isLogisticsCostEnabled(tenantId)) {
    return {
      freight_cost: 0,
      insurance_cost: 0,
      handling_cost: 0,
      local_charges: 0,
      total_logistics_cost: 0,
    };
  }

  try {
    // Calculate freight first (needed for insurance calculation)
    const freight_cost = estimateFreightCost(item, context);

    // Calculate insurance (uses freight cost for CIF value)
    const insurance_cost = estimateInsuranceCost(item, { ...context, freightCost: freight_cost });

    // Calculate handling costs
    const handling_cost = estimateHandlingCost(item, context);

    // Calculate local charges
    const local_charges = estimateLocalCharges(item, context);

    // Total logistics cost
    const total_logistics_cost = freight_cost + insurance_cost + handling_cost + local_charges;

    return {
      freight_cost: parseFloat(freight_cost.toFixed(2)),
      insurance_cost: parseFloat(insurance_cost.toFixed(2)),
      handling_cost: parseFloat(handling_cost.toFixed(2)),
      local_charges: parseFloat(local_charges.toFixed(2)),
      total_logistics_cost: parseFloat(total_logistics_cost.toFixed(2)),
    };
  } catch (error) {
    log.error('Error calculating item logistics costs', { error, item, context });
    return {
      freight_cost: 0,
      insurance_cost: 0,
      handling_cost: 0,
      local_charges: 0,
      total_logistics_cost: 0,
    };
  }
}

/**
 * Estimate weight for an item if not provided
 *
 * @param {Object} item - Item data
 * @param {string} category - Material category
 * @param {number} quantity - Quantity
 * @param {Object} config - Logistics configuration
 * @returns {number} Estimated weight in kg
 */
function estimateWeight(item, category, quantity, config) {
  const weights = config.estimatedWeights;

  // Try to get category-specific weight
  if (weights[category]) {
    // For PIPE and FLANGE, try to match by size
    if ((category === 'PIPE' || category === 'FLANGE') && item.size) {
      const sizeKey = String(item.size).replace(/['"]/g, '');
      const weightPerUnit = weights[category][sizeKey] || weights[category].DEFAULT;
      return weightPerUnit * quantity;
    }

    // For other categories, use default weight
    const weightPerUnit = typeof weights[category] === 'number' ? weights[category] : weights[category].DEFAULT;
    return weightPerUnit * quantity;
  }

  // Fallback to default weight
  return (weights.DEFAULT || 5.0) * quantity;
}

/**
 * Estimate volume for an item if not provided
 *
 * @param {Object} item - Item data
 * @param {string} category - Material category
 * @param {number} quantity - Quantity
 * @returns {number} Estimated volume in cubic meters
 */
function estimateVolume(item, category, quantity) {
  // Rough volume estimation based on weight (assuming density)
  // 1 cubic meter ≈ 500 kg for steel products (rough average)
  const estimatedWeight = estimateWeight(item, category, quantity, { estimatedWeights: require('../config/logisticsCostConfig').defaultLogisticsConfig.estimatedWeights });
  return estimatedWeight / 500; // Convert kg to cubic meters
}

/**
 * Calculate aggregate logistics costs for a pricing run
 *
 * @param {Array} items - Array of pricing run items with logistics costs
 * @returns {Object} Aggregated totals
 */
function aggregateLogisticsCosts(items) {
  const totals = {
    total_freight_cost: 0,
    total_insurance_cost: 0,
    total_handling_cost: 0,
    total_local_charges: 0,
    total_logistics_cost: 0,
  };

  for (const item of items) {
    totals.total_freight_cost += item.freight_cost || 0;
    totals.total_insurance_cost += item.insurance_cost || 0;
    totals.total_handling_cost += item.handling_cost || 0;
    totals.total_local_charges += item.local_charges || 0;
  }

  totals.total_logistics_cost =
    totals.total_freight_cost +
    totals.total_insurance_cost +
    totals.total_handling_cost +
    totals.total_local_charges;

  // Round all totals
  for (const key in totals) {
    totals[key] = parseFloat(totals[key].toFixed(2));
  }

  return totals;
}

module.exports = {
  estimateFreightCost,
  estimateInsuranceCost,
  estimateHandlingCost,
  estimateLocalCharges,
  calculateItemLogisticsCosts,
  aggregateLogisticsCosts,
  estimateWeight,
  estimateVolume,
};

