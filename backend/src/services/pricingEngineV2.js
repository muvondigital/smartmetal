const { connectDb } = require('../db/supabaseClient');
const { ValidationError } = require('../middleware/errorHandler');

// Condition ordering per pricing procedure v1
const CONDITION_ORDER = [
  'BASE_PRICE',
  'DISCOUNT',
  'SURCHARGE',
  'FREIGHT',
  'TAX',
  'LME_ADJUSTMENT',
];

/**
 * Evaluate scale tiers if present.
 * Picks the first tier where scale_from <= qty < scale_to (or open-ended).
 */
function pickScale(scales, quantity) {
  if (!Array.isArray(scales) || scales.length === 0) return null;
  for (const scale of scales) {
    const fromOk = quantity >= Number(scale.scale_from);
    const toOk = scale.scale_to === null || quantity < Number(scale.scale_to);
    if (fromOk && toOk) {
      return scale;
    }
  }
  return null;
}

/**
 * Apply a single condition to the running totals.
 */
function applyCondition(condition, quantity, totals) {
  const { condition_type, rate_type, rate_value, scales, has_scale } = condition;
  let effectiveRate = Number(rate_value);

  if (has_scale && scales && scales.length > 0) {
    const selectedScale = pickScale(scales, quantity);
    if (selectedScale) {
      effectiveRate = Number(selectedScale.scale_rate_value);
    }
  }

  switch (condition_type) {
    case 'BASE_PRICE': {
      if (rate_type === 'AMOUNT') {
        totals.base_price += effectiveRate;
      } else if (rate_type === 'PERCENTAGE') {
        // Percentage on base is uncommon for base price; treat as amount if provided incorrectly
        totals.base_price += effectiveRate;
      }
      break;
    }
    case 'DISCOUNT': {
      if (rate_type === 'AMOUNT') {
        totals.discounts += effectiveRate;
      } else {
        totals.discounts += totals.base_price * (effectiveRate / 100);
      }
      break;
    }
    case 'SURCHARGE': {
      if (rate_type === 'AMOUNT') {
        totals.surcharges += effectiveRate;
      } else {
        totals.surcharges += totals.base_price * (effectiveRate / 100);
      }
      break;
    }
    case 'FREIGHT': {
      if (rate_type === 'AMOUNT') {
        totals.freight += effectiveRate;
      } else {
        totals.freight += totals.base_price * (effectiveRate / 100);
      }
      break;
    }
    case 'TAX': {
      if (rate_type === 'AMOUNT') {
        totals.tax += effectiveRate;
      } else {
        // Tax applies on subtotal after discounts/surcharges/freight
        const taxable = totals.base_price - totals.discounts + totals.surcharges + totals.freight;
        totals.tax += taxable * (effectiveRate / 100);
      }
      break;
    }
    case 'LME_ADJUSTMENT': {
      if (rate_type === 'AMOUNT') {
        totals.lme_adjustment += effectiveRate;
      } else {
        totals.lme_adjustment += totals.base_price * (effectiveRate / 100);
      }
      break;
    }
    default:
      break;
  }
}

/**
 * Access sequence (v2):
 * 1) customer + material
 * 2) customer + material_group
 * 3) any agreement for material_group (customer null)
 * 4) fallback: any BASE_PRICE for the material (customer nullable)
 */
async function findApplicableConditions({ tenantId, customerId, materialId, materialGroup, date, region, incoterm, db }) {
  const searchDate = date || new Date().toISOString().split('T')[0];

  // Helper to run a lookup with arbitrary WHERE fragments
  async function lookup(whereFragments, params) {
    const filters = [...whereFragments];
    // Optional region/incoterm matching (allows nulls to remain generic)
    if (region) {
      params.push(region);
      filters.push(`(ac.key_region IS NULL OR ac.key_region = $${params.length})`);
    }
    if (incoterm) {
      params.push(incoterm);
      filters.push(`(ac.key_incoterm IS NULL OR ac.key_incoterm = $${params.length})`);
    }

    const res = await db.query(
      `SELECT ac.*, ah.agreement_code
       FROM agreement_conditions ac
       JOIN agreement_headers ah ON ah.id = ac.agreement_id
       WHERE ${filters.join(' AND ')}
         AND ah.status = 'released'
         AND ac.status = 'active'
         AND (ac.valid_from IS NULL OR ac.valid_from <= $${params.length - 1})
         AND (ac.valid_to   IS NULL OR ac.valid_to   >= $${params.length})
       ORDER BY ac.condition_priority ASC, ac.created_at ASC`,
      params
    );
    return res.rows;
  }

  // 1) customer + material
  if (customerId && materialId) {
    const rows = await lookup(
      [
        'ac.tenant_id = $1',
        'ah.tenant_id = $1',
        'ah.customer_id = $2',
        'ac.key_customer_id = $2',
        'ac.key_material_id = $3',
        'ah.valid_from <= $4',
        'ah.valid_to >= $5',
      ],
      [tenantId, customerId, materialId, searchDate, searchDate]
    );
    if (rows.length > 0) return rows;
  }

  // 2) customer + material_group
  if (customerId && materialGroup) {
    const rows = await lookup(
      [
        'ac.tenant_id = $1',
        'ah.tenant_id = $1',
        'ah.customer_id = $2',
        'ac.key_customer_id = $2',
        'ac.key_material_group = $3',
        'ah.valid_from <= $4',
        'ah.valid_to >= $5',
      ],
      [tenantId, customerId, materialGroup, searchDate, searchDate]
    );
    if (rows.length > 0) return rows;
  }

  // 3) any agreement for material_group (customer null)
  if (materialGroup) {
    const rows = await lookup(
      [
        'ac.tenant_id = $1',
        'ah.tenant_id = $1',
        'ac.key_material_group = $2',
        'ah.valid_from <= $3',
        'ah.valid_to >= $4',
      ],
      [tenantId, materialGroup, searchDate, searchDate]
    );
    if (rows.length > 0) return rows;
  }

  // 4) fallback base_price condition for material (customer nullable)
  if (materialId) {
    const rows = await lookup(
      [
        'ac.tenant_id = $1',
        'ah.tenant_id = $1',
        'ac.key_material_id = $2',
        "ac.condition_type = 'BASE_PRICE'",
        'ah.valid_from <= $3',
        'ah.valid_to >= $4',
      ],
      [tenantId, materialId, searchDate, searchDate]
    );
    if (rows.length > 0) return rows;
  }

  return [];
}

/**
 * Evaluate pricing for an item.
 *
 * @param {Object} params
 * @param {string} params.tenantId
 * @param {string|null} params.customerId
 * @param {string|null} params.materialId
 * @param {string|null} params.materialGroup
 * @param {number} params.quantity
 * @param {string} [params.date]
 * @returns pricing breakdown and applied condition IDs
 */
async function priceItemWithAgreementsV2(params) {
  const { tenantId, customerId, materialId, materialGroup, quantity, date, region, incoterm } = params;
  if (!tenantId) throw new ValidationError('tenantId is required');
  if (!materialId && !materialGroup) throw new ValidationError('materialId or materialGroup is required');

  const db = await connectDb();
  const conditions = await findApplicableConditions({
    tenantId,
    customerId,
    materialId,
    materialGroup,
    date,
    region,
    incoterm,
    db,
  });

  if (!conditions || conditions.length === 0) {
    return null;
  }

  // Group scales by condition id
  const conditionIds = conditions.map(c => c.id);
  let scalesByCondition = {};
  if (conditionIds.length > 0) {
    const scaleRes = await db.query(
      `SELECT * FROM agreement_scales
       WHERE condition_id = ANY($1::uuid[])
       ORDER BY scale_from ASC`,
      [conditionIds]
    );
    scalesByCondition = scaleRes.rows.reduce((acc, scale) => {
      if (!acc[scale.condition_id]) acc[scale.condition_id] = [];
      acc[scale.condition_id].push(scale);
      return acc;
    }, {});
  }

  // Sort conditions by pricing procedure order, then priority
  const sorted = conditions.slice().sort((a, b) => {
    const orderA = CONDITION_ORDER.indexOf(a.condition_type);
    const orderB = CONDITION_ORDER.indexOf(b.condition_type);
    if (orderA === orderB) {
      return a.condition_priority - b.condition_priority;
    }
    return orderA - orderB;
  });

  const totals = {
    base_price: 0,
    discounts: 0,
    surcharges: 0,
    freight: 0,
    tax: 0,
    lme_adjustment: 0,
    applied_conditions: [],
  };

  for (const cond of sorted) {
    const condWithScales = {
      ...cond,
      scales: scalesByCondition[cond.id] || [],
    };
    applyCondition(condWithScales, quantity, totals);
    totals.applied_conditions.push(cond.id);
  }

  const net_price =
    totals.base_price
    - totals.discounts
    + totals.surcharges
    + totals.freight
    + totals.tax
    + totals.lme_adjustment;

  return {
    base_price: Number(totals.base_price.toFixed(4)),
    discounts: Number(totals.discounts.toFixed(4)),
    surcharges: Number(totals.surcharges.toFixed(4)),
    freight: Number(totals.freight.toFixed(4)),
    tax: Number(totals.tax.toFixed(4)),
    lme_adjustment: Number(totals.lme_adjustment.toFixed(4)),
    net_price: Number(net_price.toFixed(4)),
    applied_conditions: totals.applied_conditions,
  };
}

module.exports = {
  priceItemWithAgreementsV2,
  findApplicableConditions,
  CONDITION_ORDER,
};

