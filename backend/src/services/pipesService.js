const { connectDb } = require('../db/supabaseClient');

/**
 * Gets a pipe by NPS and schedule
 * @param {number} npsInch - Nominal pipe size in inches
 * @param {string} schedule - Pipe schedule (e.g., "40", "80", "STD", "XS")
 * @param {string} [standard] - Optional standard filter (e.g., "ASME B36.10", "API 5L")
 * @returns {Promise<Object|null>} Pipe object or null if not found
 */
async function getPipeByNpsSchedule(npsInch, schedule, standard = null) {
  try {
    const db = await connectDb();

    let query = `
      SELECT *
      FROM pipes
      WHERE nps_inch = $1
        AND schedule = $2
    `;
    const params = [npsInch, schedule];

    // Add standard filter if provided
    if (standard) {
      query += ` AND standard = $3`;
      params.push(standard);
    }

    // Prefer is_preferred pipes, then order by most recent
    query += `
      ORDER BY is_preferred DESC, created_at DESC
      LIMIT 1
    `;

    const result = await db.query(query, params);
    return result.rows.length > 0 ? result.rows[0] : null;
  } catch (error) {
    console.error('Error fetching pipe by NPS and schedule:', error);
    return null;
  }
}

/**
 * Gets a pipe by DN (metric) and schedule
 * @param {number} dnMm - DN size in millimeters (e.g., 50, 100, 200)
 * @param {string} schedule - Pipe schedule (e.g., "40", "80", "STD", "XS")
 * @param {string} [standard] - Optional standard filter (e.g., "ASME B36.10", "API 5L")
 * @returns {Promise<Object|null>} Pipe object or null if not found
 */
async function getPipeByDnAndSchedule(dnMm, schedule, standard = null) {
  try {
    const db = await connectDb();

    let query = `
      SELECT *
      FROM pipes
      WHERE dn_mm = $1
        AND schedule = $2
    `;
    const params = [dnMm, schedule];

    // Add standard filter if provided
    if (standard) {
      query += ` AND standard = $3`;
      params.push(standard);
    }

    // Prefer is_preferred pipes, then order by most recent
    query += `
      ORDER BY is_preferred DESC, created_at DESC
      LIMIT 1
    `;

    const result = await db.query(query, params);
    return result.rows.length > 0 ? result.rows[0] : null;
  } catch (error) {
    console.error('Error fetching pipe by DN and schedule:', error);
    return null;
  }
}

/**
 * Gets all pipes with a specific NPS
 * @param {number} nps - Nominal pipe size in inches
 * @returns {Promise<Array>} Array of pipe objects
 */
async function getPipesByNps(nps) {
  const query = `
    SELECT *
    FROM pipes
    WHERE nps_inch = $1
  `;
  const db = await connectDb();
  const result = await db.query(query, [nps]);
  return result.rows;
}

/**
 * Gets all pipes with optional filters
 * @param {Object} filters - Filter options
 * @param {number} [filters.npsInch] - Filter by NPS
 * @param {string} [filters.schedule] - Filter by schedule
 * @param {string} [filters.standard] - Filter by standard
 * @param {string} [filters.materialSpec] - Filter by material specification
 * @param {boolean} [filters.isStainless] - Filter by stainless flag
 * @param {boolean} [filters.isPreferred] - Filter by preferred flag
 * @param {number} [filters.limit=50] - Maximum number of results
 * @returns {Promise<Array>} Array of pipe objects
 */
async function getAllPipes(filters = {}) {
  try {
    const db = await connectDb();

    let query = `SELECT * FROM pipes WHERE 1=1`;
    const params = [];
    let paramIndex = 1;

    // Apply filters
    if (filters.npsInch !== undefined) {
      query += ` AND nps_inch = $${paramIndex}`;
      params.push(filters.npsInch);
      paramIndex++;
    }

    if (filters.schedule) {
      query += ` AND schedule = $${paramIndex}`;
      params.push(filters.schedule);
      paramIndex++;
    }

    if (filters.standard) {
      query += ` AND standard = $${paramIndex}`;
      params.push(filters.standard);
      paramIndex++;
    }

    if (filters.materialSpec) {
      query += ` AND material_spec = $${paramIndex}`;
      params.push(filters.materialSpec);
      paramIndex++;
    }

    if (filters.isStainless !== undefined) {
      query += ` AND is_stainless = $${paramIndex}`;
      params.push(filters.isStainless);
      paramIndex++;
    }

    if (filters.isPreferred !== undefined) {
      query += ` AND is_preferred = $${paramIndex}`;
      params.push(filters.isPreferred);
      paramIndex++;
    }

    // Order by preferred first, then by NPS and schedule
    query += ` ORDER BY is_preferred DESC, nps_inch ASC, schedule ASC`;

    // Apply limit
    const limit = filters.limit || 50;
    query += ` LIMIT $${paramIndex}`;
    params.push(limit);

    const result = await db.query(query, params);
    return result.rows;
  } catch (error) {
    console.error('Error fetching pipes:', error);
    throw error;
  }
}

/**
 * Gets a pipe by ID
 * @param {string} id - Pipe UUID
 * @returns {Promise<Object|null>} Pipe object or null if not found
 */
async function getPipeById(id) {
  try {
    const db = await connectDb();
    const result = await db.query(
      `SELECT * FROM pipes WHERE id = $1`,
      [id]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  } catch (error) {
    console.error('Error fetching pipe by ID:', error);
    return null;
  }
}

/**
 * Creates a new pipe
 * @param {Object} payload - Pipe data
 * @returns {Promise<Object>} Created pipe object
 */
async function createPipe(payload) {
  const db = await connectDb();

  // Validate required fields
  if (!payload.standard || payload.nps_inch === undefined) {
    throw new Error('standard and nps_inch are required');
  }

  const result = await db.query(
    `INSERT INTO pipes (
      standard, material_spec, manufacturing_method,
      nps_inch, dn_mm,
      outside_diameter_in, outside_diameter_mm,
      schedule, wall_thickness_in, wall_thickness_mm,
      weight_lb_per_ft, weight_kg_per_m, shipping_weight_m3,
      end_type, is_stainless, is_preferred, notes
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
    RETURNING *`,
    [
      payload.standard,
      payload.material_spec || null,
      payload.manufacturing_method || null,
      payload.nps_inch,
      payload.dn_mm || null,
      payload.outside_diameter_in || null,
      payload.outside_diameter_mm || null,
      payload.schedule || null,
      payload.wall_thickness_in || null,
      payload.wall_thickness_mm || null,
      payload.weight_lb_per_ft || null,
      payload.weight_kg_per_m || null,
      payload.shipping_weight_m3 || null,
      payload.end_type || 'PE',
      payload.is_stainless !== undefined ? payload.is_stainless : false,
      payload.is_preferred !== undefined ? payload.is_preferred : true,
      payload.notes || null,
    ]
  );

  return result.rows[0];
}

/**
 * Updates an existing pipe
 * @param {string} id - Pipe UUID
 * @param {Object} payload - Updated pipe data
 * @returns {Promise<Object>} Updated pipe object
 */
async function updatePipe(id, payload) {
  const db = await connectDb();

  // Check if pipe exists
  const existing = await getPipeById(id);
  if (!existing) {
    throw new Error('Pipe not found');
  }

  // Build dynamic update query
  const fields = [];
  const values = [];
  let paramIndex = 1;

  const allowedFields = [
    'standard',
    'material_spec',
    'manufacturing_method',
    'nps_inch',
    'dn_mm',
    'outside_diameter_in',
    'outside_diameter_mm',
    'schedule',
    'wall_thickness_in',
    'wall_thickness_mm',
    'weight_lb_per_ft',
    'weight_kg_per_m',
    'shipping_weight_m3',
    'end_type',
    'is_stainless',
    'is_preferred',
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
    `UPDATE pipes SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    values
  );

  return result.rows[0];
}

/**
 * Deletes a pipe (hard delete)
 * @param {string} id - Pipe UUID
 * @returns {Promise<boolean>} True if deleted, false if not found
 */
async function deletePipe(id) {
  const db = await connectDb();
  const result = await db.query(
    `DELETE FROM pipes WHERE id = $1 RETURNING id`,
    [id]
  );
  return result.rows.length > 0;
}

/**
 * Gets distinct pipe standards
 * @returns {Promise<Array<string>>} Array of standard names
 */
async function getPipeStandards() {
  try {
    const db = await connectDb();
    const result = await db.query(`
      SELECT DISTINCT standard
      FROM pipes
      ORDER BY standard ASC
    `);
    return result.rows.map(row => row.standard);
  } catch (error) {
    console.error('Error fetching pipe standards:', error);
    throw error;
  }
}

/**
 * Gets distinct pipe schedules
 * @returns {Promise<Array<string>>} Array of schedule names
 */
async function getPipeSchedules() {
  try {
    const db = await connectDb();
    const result = await db.query(`
      SELECT DISTINCT schedule
      FROM pipes
      WHERE schedule IS NOT NULL
      ORDER BY schedule ASC
    `);
    return result.rows.map(row => row.schedule);
  } catch (error) {
    console.error('Error fetching pipe schedules:', error);
    throw error;
  }
}

/**
 * Gets pipe weight in kg/m for pricing calculations
 * Tries DN lookup first, then falls back to NPS if not found
 *
 * @param {Object} opts - Search options
 * @param {number} [opts.dnMm] - DN size in millimeters
 * @param {number} [opts.npsInch] - NPS size in inches
 * @param {string} opts.schedule - Pipe schedule (required)
 * @param {string} [opts.standard] - Optional standard filter
 * @returns {Promise<number|null>} Weight in kg/m, or null if not found
 */
async function getPipeWeightKgPerM(opts) {
  const { dnMm, npsInch, schedule, standard } = opts;

  if (!schedule) {
    console.warn('getPipeWeightKgPerM: schedule is required');
    return null;
  }

  try {
    let pipe = null;

    // Try DN lookup first if provided
    if (dnMm !== undefined && dnMm !== null) {
      pipe = await getPipeByDnAndSchedule(dnMm, schedule, standard);
    }

    // Fall back to NPS if DN didn't find a match
    if (!pipe && npsInch !== undefined && npsInch !== null) {
      pipe = await getPipeByNpsSchedule(npsInch, schedule, standard);
    }

    // Return weight if found
    if (pipe && pipe.weight_kg_per_m !== null) {
      return parseFloat(pipe.weight_kg_per_m);
    }

    return null;
  } catch (error) {
    console.error('Error fetching pipe weight:', error);
    return null;
  }
}

module.exports = {
  getPipeByNpsSchedule,
  getPipeByDnAndSchedule,
  getPipesByNps,
  getAllPipes,
  getPipeById,
  createPipe,
  updatePipe,
  deletePipe,
  getPipeStandards,
  getPipeSchedules,
  getPipeWeightKgPerM,
};
