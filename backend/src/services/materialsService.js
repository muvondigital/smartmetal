const { connectDb } = require('../db/supabaseClient');

/**
 * Gets all materials ordered by category and material_code
 *
 * Materials are tenant-scoped (migration 058+).
 * tenant_id is required and NOT NULL.
 *
 * @param {string} tenantId - Tenant UUID (required)
 * @returns {Promise<Array>} Array of material objects
 */
async function getAllMaterials(tenantId) {
  if (!tenantId) {
    throw new Error('tenantId is required (materials are tenant-scoped)');
  }

  const db = await connectDb();

  // Filter by tenant_id to ensure tenant isolation
  const result = await db.query(
    `SELECT *
     FROM materials
     WHERE tenant_id = $1
     ORDER BY category, material_code`,
    [tenantId]
  );
  return result.rows;
}

/**
 * Gets a material by material_code
 *
 * Materials are tenant-scoped (migration 058+).
 * tenant_id is required and NOT NULL.
 *
 * @param {string} materialCode - The material code to search for
 * @param {string} tenantId - Tenant UUID (required)
 * @returns {Promise<Object|null>} Material object or null if not found
 */
async function getMaterialByCode(materialCode, tenantId) {
  if (!tenantId) {
    throw new Error('tenantId is required (materials are tenant-scoped)');
  }

  const db = await connectDb();

  // Filter by tenant_id to ensure tenant isolation
  const result = await db.query(
    `SELECT * FROM materials 
     WHERE tenant_id = $1 AND material_code = $2 
     LIMIT 1`,
    [tenantId, materialCode]
  );
  return result.rows.length > 0 ? result.rows[0] : null;
}

/**
 * Gets multiple materials by material codes (batch query for performance)
 *
 * Materials are tenant-scoped (migration 058+).
 * tenant_id is required and NOT NULL.
 *
 * @param {string[]} materialCodes - Array of material codes to search for
 * @param {string} tenantId - Tenant UUID (required)
 * @returns {Promise<Map<string, Object>>} Map of material_code -> material object
 */
async function getMaterialsByCodes(materialCodes, tenantId) {
  if (!tenantId) {
    throw new Error('tenantId is required (materials are tenant-scoped)');
  }

  if (!materialCodes || materialCodes.length === 0) {
    return new Map();
  }

  const db = await connectDb();

  // Filter out null/undefined codes
  const validCodes = materialCodes.filter(code => code);

  if (validCodes.length === 0) {
    return new Map();
  }

  // Filter by tenant_id to ensure tenant isolation
  const result = await db.query(
    `SELECT * FROM materials 
     WHERE tenant_id = $1 AND material_code = ANY($2)`,
    [tenantId, validCodes]
  );

  // Create a map for O(1) lookup
  const materialsMap = new Map();
  for (const material of result.rows) {
    materialsMap.set(material.material_code, material);
  }

  return materialsMap;
}

/**
 * Gets a material by ID
 *
 * Materials are tenant-scoped (migration 058+).
 * tenant_id is required and NOT NULL.
 *
 * @param {string} id - The material UUID
 * @param {string} tenantId - Tenant UUID (required)
 * @returns {Promise<Object|null>} Material object or null if not found
 */
async function getMaterialById(id, tenantId) {
  if (!tenantId) {
    throw new Error('tenantId is required (materials are tenant-scoped)');
  }

  const db = await connectDb();

  // Filter by tenant_id to ensure tenant isolation
  const result = await db.query(
    `SELECT * FROM materials 
     WHERE tenant_id = $1 AND id = $2`,
    [tenantId, id]
  );
  return result.rows.length > 0 ? result.rows[0] : null;
}

/**
 * Creates a new material safely (catalog write-safety contract)
 *
 * SAFE FOR COMMERCIAL REQUEST FLOWS:
 * - Inserts if material does not exist
 * - Returns existing material WITHOUT updates if (tenant_id, material_code) already exists
 * - Uses ON CONFLICT DO NOTHING to prevent accidental catalog mutation
 *
 * Materials are tenant-scoped (migration 058+).
 * tenant_id is required and NOT NULL.
 *
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
 * @param {string} tenantId - Tenant UUID (required)
 * @returns {Promise<Object>} Created or existing material object
 */
async function createMaterialSafe(payload, tenantId) {
  const db = await connectDb();

  // Validate required fields
  if (!payload.material_code || !payload.category || !payload.origin_type || payload.base_cost === undefined) {
    throw new Error('material_code, category, origin_type, and base_cost are required');
  }

  // Validate tenantId is provided
  if (!tenantId) {
    throw new Error('tenantId is required (materials are tenant-scoped)');
  }

  // Insert material with ON CONFLICT DO NOTHING (catalog write-safety)
  const result = await db.query(
    `INSERT INTO materials (
      tenant_id, material_code, category, spec_standard, grade, material_type,
      origin_type, size_description, base_cost, currency, notes
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    ON CONFLICT (tenant_id, material_code) DO NOTHING
    RETURNING *`,
    [
      tenantId,  // tenant_id (required, NOT NULL)
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

  // If conflict occurred (material already exists), fetch and return existing material
  if (result.rows.length === 0) {
    const existingResult = await db.query(
      `SELECT * FROM materials WHERE tenant_id = $1 AND material_code = $2`,
      [tenantId, payload.material_code]
    );
    return existingResult.rows[0];
  }

  return result.rows[0];
}

/**
 * Creates or updates a material (upsert) - SEED/IMPORT ONLY
 *
 * ⚠️ WARNING: NEVER call this from commercial request (RFQ) flows! ⚠️
 * This function OVERWRITES existing catalog data on conflict.
 * Use createMaterialSafe() for all runtime/user-facing operations.
 *
 * ONLY use this function for:
 * - Seed scripts
 * - Admin catalog import operations
 * - Initial data population
 *
 * Materials are tenant-scoped (migration 058+).
 * tenant_id is required and NOT NULL.
 *
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
 * @param {string} tenantId - Tenant UUID (required)
 * @returns {Promise<Object>} Created or updated material object
 */
async function upsertMaterialForSeed(payload, tenantId) {
  const db = await connectDb();

  // Validate required fields
  if (!payload.material_code || !payload.category || !payload.origin_type || payload.base_cost === undefined) {
    throw new Error('material_code, category, origin_type, and base_cost are required');
  }

  // Validate tenantId is provided
  if (!tenantId) {
    throw new Error('tenantId is required (materials are tenant-scoped)');
  }

  // Create or update material with ON CONFLICT DO UPDATE (upsert for seeds)
  const result = await db.query(
    `INSERT INTO materials (
      tenant_id, material_code, category, spec_standard, grade, material_type,
      origin_type, size_description, base_cost, currency, notes
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    ON CONFLICT (tenant_id, material_code) DO UPDATE
    SET category = EXCLUDED.category,
        spec_standard = EXCLUDED.spec_standard,
        grade = EXCLUDED.grade,
        material_type = EXCLUDED.material_type,
        origin_type = EXCLUDED.origin_type,
        size_description = EXCLUDED.size_description,
        base_cost = EXCLUDED.base_cost,
        currency = EXCLUDED.currency,
        notes = EXCLUDED.notes,
        updated_at = NOW()
    RETURNING *`,
    [
      tenantId,  // tenant_id (required, NOT NULL)
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
 * Legacy alias for backward compatibility with existing code
 * @deprecated Use createMaterialSafe() or upsertMaterialForSeed() explicitly
 */
async function createMaterial(payload, tenantId) {
  // Default to safe behavior for legacy callers
  return createMaterialSafe(payload, tenantId);
}

/**
 * Updates an existing material
 *
 * Materials are tenant-scoped (migration 058+).
 * tenant_id is required and NOT NULL.
 *
 * @param {string} id - Material UUID
 * @param {Object} payload - Updated material data
 * @param {string} tenantId - Tenant UUID (required)
 * @returns {Promise<Object>} Updated material object
 */
async function updateMaterial(id, payload, tenantId) {
  if (!tenantId) {
    throw new Error('tenantId is required (materials are tenant-scoped)');
  }

  const db = await connectDb();

  // Check if material exists and belongs to tenant
  const existing = await getMaterialById(id, tenantId);
  if (!existing) {
    throw new Error('Material not found or access denied');
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

  // Update material with tenant filter to ensure tenant isolation
  values.push(tenantId, id);
  const result = await db.query(
    `UPDATE materials SET ${fields.join(', ')}, updated_at = NOW()
     WHERE tenant_id = $${paramIndex} AND id = $${paramIndex + 1}
     RETURNING *`,
    values
  );

  if (result.rows.length === 0) {
    throw new Error('Material not found or access denied');
  }

  return result.rows[0];
}

/**
 * Deletes a material (hard delete)
 *
 * Materials are tenant-scoped (migration 058+).
 * tenant_id is required and NOT NULL.
 *
 * @param {string} id - Material UUID
 * @param {string} tenantId - Tenant UUID (required)
 * @returns {Promise<boolean>} True if deleted, false if not found
 */
async function deleteMaterial(id, tenantId) {
  if (!tenantId) {
    throw new Error('tenantId is required (materials are tenant-scoped)');
  }

  const db = await connectDb();

  // Delete material with tenant filter to ensure tenant isolation
  const result = await db.query(
    `DELETE FROM materials
     WHERE tenant_id = $1 AND id = $2
     RETURNING id`,
    [tenantId, id]
  );
  return result.rows.length > 0;
}

module.exports = {
  getAllMaterials,
  getMaterialByCode,
  getMaterialsByCodes,
  getMaterialById,
  createMaterial, // Legacy alias (defaults to createMaterialSafe)
  createMaterialSafe, // NEW: Safe material creation (no overwrite on conflict)
  upsertMaterialForSeed, // NEW: Upsert for seed scripts only
  updateMaterial,
  deleteMaterial,
};
