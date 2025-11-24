const { query, transaction } = require('../db/supabaseClient');

/**
 * Price Agreements Service
 * Handles all business logic for price agreements management
 */

/**
 * Creates a new price agreement
 * @param {Object} data - Agreement data
 * @returns {Promise<Object>} Created agreement
 */
async function createPriceAgreement(data) {

  // Validate required fields
  if (!data.client_id) {
    throw new Error('client_id is required');
  }

  if (!data.base_price || data.base_price <= 0) {
    throw new Error('base_price must be a positive number');
  }

  if (!data.valid_from || !data.valid_until) {
    throw new Error('valid_from and valid_until are required');
  }

  // Validate material_id XOR category
  const hasMaterial = !!data.material_id;
  const hasCategory = !!data.category;

  if (hasMaterial === hasCategory) {
    throw new Error('Must specify either material_id or category, not both');
  }

  // Validate dates
  const validFrom = new Date(data.valid_from);
  const validUntil = new Date(data.valid_until);

  if (validUntil < validFrom) {
    throw new Error('valid_until must be after valid_from');
  }

  // Validate volume tiers if provided
  if (data.volume_tiers) {
    validateVolumeTiers(data.volume_tiers);
  }

  // Insert agreement
  const result = await query(
    `INSERT INTO price_agreements (
      client_id, material_id, category, base_price, currency,
      volume_tiers, valid_from, valid_until, payment_terms,
      delivery_terms, notes, created_by, status
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    RETURNING *`,
    [
      data.client_id,
      data.material_id || null,
      data.category || null,
      data.base_price,
      data.currency || 'USD',
      data.volume_tiers ? JSON.stringify(data.volume_tiers) : null,
      data.valid_from,
      data.valid_until,
      data.payment_terms || null,
      data.delivery_terms || null,
      data.notes || null,
      data.created_by || 'System',
      'active',
    ]
  );

  return result.rows[0];
}

/**
 * Validates volume tiers structure
 * @param {Array} tiers - Volume tiers array
 */
function validateVolumeTiers(tiers) {
  if (!Array.isArray(tiers)) {
    throw new Error('volume_tiers must be an array');
  }

  if (tiers.length === 0) {
    throw new Error('volume_tiers cannot be empty');
  }

  // Check each tier has required fields
  for (let i = 0; i < tiers.length; i++) {
    const tier = tiers[i];

    if (typeof tier.min_qty !== 'number' || tier.min_qty < 0) {
      throw new Error(`Tier ${i}: min_qty must be a non-negative number`);
    }

    if (tier.max_qty !== null && (typeof tier.max_qty !== 'number' || tier.max_qty < 0)) {
      throw new Error(`Tier ${i}: max_qty must be a non-negative number or null`);
    }

    if (typeof tier.price !== 'number' || tier.price <= 0) {
      throw new Error(`Tier ${i}: price must be a positive number`);
    }

    // Validate range
    if (tier.max_qty !== null && tier.max_qty < tier.min_qty) {
      throw new Error(`Tier ${i}: max_qty must be greater than min_qty`);
    }

    // Check for overlaps with previous tier
    if (i > 0) {
      const prevTier = tiers[i - 1];
      if (prevTier.max_qty === null) {
        throw new Error(`Tier ${i - 1} has no upper limit, cannot have subsequent tiers`);
      }

      if (tier.min_qty <= prevTier.max_qty) {
        throw new Error(`Tier ${i}: overlaps with previous tier`);
      }
    }
  }
}

/**
 * Gets all price agreements with optional filtering
 * @param {Object} filters - Filter options
 * @returns {Promise<Object>} Agreements and pagination
 */
async function getPriceAgreements(filters = {}) {
  const db = await connectDb();

  const {
    client_id,
    status,
    material_id,
    category,
    page = 1,
    limit = 20,
  } = filters;

  const offset = (page - 1) * limit;
  const conditions = [];
  const params = [];
  let paramCount = 0;

  // Build WHERE clause
  if (client_id) {
    paramCount++;
    conditions.push(`pa.client_id = $${paramCount}`);
    params.push(client_id);
  }

  if (status) {
    paramCount++;
    conditions.push(`pa.status = $${paramCount}`);
    params.push(status);
  }

  if (material_id) {
    paramCount++;
    conditions.push(`pa.material_id = $${paramCount}`);
    params.push(material_id);
  }

  if (category) {
    paramCount++;
    conditions.push(`pa.category = $${paramCount}`);
    params.push(category);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Get total count
  const countResult = await db.query(
    `SELECT COUNT(*) FROM price_agreements pa ${whereClause}`,
    params
  );
  const total = parseInt(countResult.rows[0].count);

  // Get agreements with client and material details
  params.push(limit, offset);
  const result = await db.query(
    `SELECT
      pa.*,
      c.name as client_name,
      m.material_code,
      CASE WHEN pa.volume_tiers IS NOT NULL THEN true ELSE false END as has_volume_tiers
    FROM price_agreements pa
    JOIN clients c ON pa.client_id = c.id
    LEFT JOIN materials m ON pa.material_id = m.id
    ${whereClause}
    ORDER BY pa.created_at DESC
    LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`,
    params
  );

  return {
    agreements: result.rows,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      total_pages: Math.ceil(total / limit),
      has_next: page * limit < total,
      has_prev: page > 1,
    },
  };
}

/**
 * Gets a single price agreement by ID
 * @param {string} agreementId - Agreement UUID
 * @returns {Promise<Object>} Agreement details
 */
async function getPriceAgreementById(agreementId) {
  const db = await connectDb();

  const result = await db.query(
    `SELECT
      pa.*,
      c.name as client_name,
      m.material_code,
      m.category as material_category,
      m.spec_standard,
      m.grade
    FROM price_agreements pa
    JOIN clients c ON pa.client_id = c.id
    LEFT JOIN materials m ON pa.material_id = m.id
    WHERE pa.id = $1`,
    [agreementId]
  );

  if (result.rows.length === 0) {
    throw new Error('Price agreement not found');
  }

  return result.rows[0];
}

/**
 * Updates a price agreement
 * @param {string} agreementId - Agreement UUID
 * @param {Object} data - Fields to update
 * @returns {Promise<Object>} Updated agreement
 */
async function updatePriceAgreement(agreementId, data) {
  const db = await connectDb();

  // Build dynamic UPDATE query
  const updates = [];
  const params = [];
  let paramCount = 0;

  const allowedFields = [
    'base_price',
    'currency',
    'volume_tiers',
    'valid_from',
    'valid_until',
    'payment_terms',
    'delivery_terms',
    'notes',
    'status',
  ];

  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      paramCount++;
      if (field === 'volume_tiers') {
        updates.push(`${field} = $${paramCount}`);
        params.push(data[field] ? JSON.stringify(data[field]) : null);
      } else {
        updates.push(`${field} = $${paramCount}`);
        params.push(data[field]);
      }
    }
  }

  if (updates.length === 0) {
    throw new Error('No fields to update');
  }

  // Validate volume tiers if updating
  if (data.volume_tiers) {
    validateVolumeTiers(data.volume_tiers);
  }

  paramCount++;
  params.push(agreementId);

  const result = await db.query(
    `UPDATE price_agreements
     SET ${updates.join(', ')}, updated_at = NOW()
     WHERE id = $${paramCount}
     RETURNING *`,
    params
  );

  if (result.rows.length === 0) {
    throw new Error('Price agreement not found');
  }

  return result.rows[0];
}

/**
 * Soft deletes a price agreement (sets status to 'cancelled')
 * @param {string} agreementId - Agreement UUID
 * @returns {Promise<Object>} Result
 */
async function deletePriceAgreement(agreementId) {
  const db = await connectDb();

  const result = await db.query(
    `UPDATE price_agreements
     SET status = 'cancelled', updated_at = NOW()
     WHERE id = $1
     RETURNING id`,
    [agreementId]
  );

  if (result.rows.length === 0) {
    throw new Error('Price agreement not found');
  }

  return {
    message: 'Price agreement cancelled successfully',
    agreement_id: agreementId,
  };
}

/**
 * Finds the best active price agreement for a given client, material/category, and date
 * @param {Object} params - Search parameters
 * @returns {Promise<Object|null>} Agreement or null
 */
async function findActiveAgreement({ clientId, materialId, category, quantity, date }) {
  const db = await connectDb();

  const searchDate = date || new Date().toISOString().split('T')[0];

  // Try to find material-specific agreement first
  let query;
  let params;

  if (materialId) {
    query = `
      SELECT * FROM price_agreements
      WHERE client_id = $1
        AND material_id = $2
        AND status = 'active'
        AND valid_from <= $3
        AND valid_until >= $3
      ORDER BY created_at DESC
      LIMIT 1
    `;
    params = [clientId, materialId, searchDate];
  } else if (category) {
    query = `
      SELECT * FROM price_agreements
      WHERE client_id = $1
        AND category = $2
        AND status = 'active'
        AND valid_from <= $3
        AND valid_until >= $3
      ORDER BY created_at DESC
      LIMIT 1
    `;
    params = [clientId, category, searchDate];
  } else {
    return null;
  }

  const result = await db.query(query, params);

  if (result.rows.length === 0) {
    // Try category-level agreement if material-specific not found
    if (materialId) {
      const material = await db.query(
        'SELECT category FROM materials WHERE id = $1',
        [materialId]
      );

      if (material.rows.length > 0) {
        const materialCategory = material.rows[0].category;
        return findActiveAgreement({ clientId, category: materialCategory, quantity, date: searchDate });
      }
    }

    return null;
  }

  const agreement = result.rows[0];

  // Calculate applicable price based on volume tiers
  if (quantity && agreement.volume_tiers) {
    const tiers = JSON.parse(agreement.volume_tiers);
    const applicableTier = findApplicableVolumeTier(tiers, quantity);

    if (applicableTier) {
      return {
        ...agreement,
        applicable_price: applicableTier.price,
        volume_tier_applied: applicableTier,
      };
    }
  }

  return {
    ...agreement,
    applicable_price: agreement.base_price,
    volume_tier_applied: null,
  };
}

/**
 * Finds the applicable volume tier for a given quantity
 * @param {Array} tiers - Volume tiers
 * @param {number} quantity - Quantity
 * @returns {Object|null} Applicable tier
 */
function findApplicableVolumeTier(tiers, quantity) {
  for (const tier of tiers) {
    if (quantity >= tier.min_qty && (tier.max_qty === null || quantity <= tier.max_qty)) {
      return tier;
    }
  }
  return null;
}

/**
 * Checks if an agreement exists for a specific item and returns pricing
 * @param {Object} params - Check parameters
 * @returns {Promise<Object>} Agreement check result
 */
async function checkAgreementForItem({ clientId, materialId, category, quantity, date }) {
  const agreement = await findActiveAgreement({ clientId, materialId, category, quantity, date });

  if (!agreement) {
    return {
      has_agreement: false,
      reason: 'No active agreement found for this client and material/category',
    };
  }

  return {
    has_agreement: true,
    agreement: {
      id: agreement.id,
      base_price: parseFloat(agreement.base_price),
      applicable_price: parseFloat(agreement.applicable_price),
      currency: agreement.currency,
      volume_tier_applied: agreement.volume_tier_applied,
      payment_terms: agreement.payment_terms,
      delivery_terms: agreement.delivery_terms,
      valid_until: agreement.valid_until,
    },
  };
}

/**
 * Gets all agreements for a specific client
 * @param {string} clientId - Client UUID
 * @param {Object} options - Filter options
 * @returns {Promise<Array>} Client agreements
 */
async function getAgreementsByClient(clientId, options = {}) {
  return getPriceAgreements({
    client_id: clientId,
    ...options,
  });
}

module.exports = {
  createPriceAgreement,
  getPriceAgreements,
  getPriceAgreementById,
  updatePriceAgreement,
  deletePriceAgreement,
  findActiveAgreement,
  checkAgreementForItem,
  getAgreementsByClient,
  validateVolumeTiers,
  findApplicableVolumeTier,
};
