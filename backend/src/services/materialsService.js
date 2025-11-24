const { connectDb } = require('../db/supabaseClient');

/**
 * Gets all materials ordered by category and material_code
 * @returns {Promise<Array>} Array of material objects
 */
async function getAllMaterials() {
  const db = await connectDb();
  const result = await db.query(`
    SELECT *
    FROM materials
    ORDER BY category, material_code
  `);
  return result.rows;
}

/**
 * Gets a material by material_code
 * @param {string} materialCode - The material code to search for
 * @returns {Promise<Object|null>} Material object or null if not found
 */
async function getMaterialByCode(materialCode) {
  const db = await connectDb();
  const result = await db.query(
    `SELECT * FROM materials WHERE material_code = $1`,
    [materialCode]
  );
  return result.rows.length > 0 ? result.rows[0] : null;
}

/**
 * Gets a material by ID
 * @param {string} id - The material UUID
 * @returns {Promise<Object|null>} Material object or null if not found
 */
async function getMaterialById(id) {
  const db = await connectDb();
  const result = await db.query(
    `SELECT * FROM materials WHERE id = $1`,
    [id]
  );
  return result.rows.length > 0 ? result.rows[0] : null;
}

/**
 * Creates a new material
 * @param {Object} payload - Material data
 * @param {string} payload.material_code - Unique material code (required)
 * @param {string} payload.category - Category (required)
 * @param {string} payload.origin_type - Origin type CHINA or NON_CHINA (required)
 * @param {number} payload.base_cost - Base cost (required)
 * @param {string} [payload.spec_standard] - Specification standard
 * @param {string} [payload.grade] - Grade
 * @param {string} [payload.material_type] - Material type
 * @param {string} [payload.size_description] - Size description
 * @param {string} [payload.currency] - Currency code (default: USD)
 * @param {string} [payload.notes] - Notes
 * @returns {Promise<Object>} Created material object
 */
async function createMaterial(payload) {
  const db = await connectDb();

  // Validate required fields
  if (!payload.material_code || !payload.category || !payload.origin_type || payload.base_cost === undefined) {
    throw new Error('material_code, category, origin_type, and base_cost are required');
  }

  const result = await db.query(
    `INSERT INTO materials (
      material_code, category, spec_standard, grade, material_type,
      origin_type, size_description, base_cost, currency, notes
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING *`,
    [
      payload.material_code,
      payload.category,
      payload.spec_standard || null,
      payload.grade || null,
      payload.material_type || null,
      payload.origin_type,
      payload.size_description || null,
      payload.base_cost,
      payload.currency || 'USD',
      payload.notes || null,
    ]
  );

  return result.rows[0];
}

/**
 * Updates an existing material
 * @param {string} id - Material UUID
 * @param {Object} payload - Updated material data
 * @returns {Promise<Object>} Updated material object
 */
async function updateMaterial(id, payload) {
  const db = await connectDb();

  // Check if material exists
  const existing = await getMaterialById(id);
  if (!existing) {
    throw new Error('Material not found');
  }

  // Build dynamic update query
  const fields = [];
  const values = [];
  let paramIndex = 1;

  const allowedFields = [
    'material_code',
    'category',
    'spec_standard',
    'grade',
    'material_type',
    'origin_type',
    'size_description',
    'base_cost',
    'currency',
    'notes',
  ];

  for (const field of allowedFields) {
    if (payload[field] !== undefined) {
      fields.push(`${field} = $${paramIndex}`);
      values.push(payload[field]);
      paramIndex++;
    }
  }

  if (fields.length === 0) {
    return existing; // No updates provided
  }

  values.push(id);
  const result = await db.query(
    `UPDATE materials SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    values
  );

  return result.rows[0];
}

/**
 * Deletes a material (hard delete)
 * @param {string} id - Material UUID
 * @returns {Promise<boolean>} True if deleted, false if not found
 */
async function deleteMaterial(id) {
  const db = await connectDb();
  const result = await db.query(
    `DELETE FROM materials WHERE id = $1 RETURNING id`,
    [id]
  );
  return result.rows.length > 0;
}

module.exports = {
  getAllMaterials,
  getMaterialByCode,
  getMaterialById,
  createMaterial,
  updateMaterial,
  deleteMaterial,
};

