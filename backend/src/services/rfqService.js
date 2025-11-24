const { connectDb } = require('../db/supabaseClient');

/**
 * Creates an RFQ from a payload. Handles both simple (customer_name) and detailed payloads.
 * 
 * @param {Object} payload - The RFQ payload
 * @param {string} [payload.customer_name] - Customer name (simple payload)
 * @param {string} [payload.client_id] - Client UUID (detailed payload)
 * @param {string} [payload.project_id] - Project UUID (detailed payload)
 * @param {string} [payload.title] - RFQ title (detailed payload)
 * @param {string} [payload.description] - RFQ description (detailed payload)
 * @returns {Promise<Object>} The created RFQ object
 */
async function createRfqFromPayload(payload) {
  const db = await connectDb();

  // If client_id and project_id are provided, use them directly
  if (payload.client_id && payload.project_id) {
    const title = payload.title || `RFQ for Client ${payload.client_id}`;
    const description = payload.description || null;

    const result = await db.query(
      `INSERT INTO rfqs (project_id, title, description, status)
       VALUES ($1, $2, $3, 'draft')
       RETURNING *`,
      [payload.project_id, title, description]
    );

    return result.rows[0];
  }

  // Otherwise, if customer_name is provided, create client and project
  if (payload.customer_name) {
    // Start a transaction
    await db.query('BEGIN');

    try {
      // Create or find client by name
      let clientResult = await db.query(
        `SELECT id FROM clients WHERE name = $1 LIMIT 1`,
        [payload.customer_name]
      );

      let clientId;
      if (clientResult.rows.length > 0) {
        clientId = clientResult.rows[0].id;
      } else {
        // Create new client
        const newClientResult = await db.query(
          `INSERT INTO clients (name) VALUES ($1) RETURNING id`,
          [payload.customer_name]
        );
        clientId = newClientResult.rows[0].id;
      }

      // Create a default project for this client
      const projectName = `Default Project for ${payload.customer_name}`;
      const projectResult = await db.query(
        `INSERT INTO projects (client_id, name) VALUES ($1, $2) RETURNING id`,
        [clientId, projectName]
      );
      const projectId = projectResult.rows[0].id;

      // Create the RFQ
      const rfqTitle = `RFQ for ${payload.customer_name}`;
      const rfqResult = await db.query(
        `INSERT INTO rfqs (project_id, title, description, status)
         VALUES ($1, $2, $3, 'draft')
         RETURNING *`,
        [projectId, rfqTitle, null]
      );

      await db.query('COMMIT');
      return rfqResult.rows[0];
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    }
  }

  throw new Error('Either customer_name or both client_id and project_id must be provided');
}

/**
 * Gets all RFQs with their related project and client information
 * @returns {Promise<Array>} Array of RFQ objects
 */
async function getAllRfqs() {
  const db = await connectDb();
  const result = await db.query(`
    SELECT 
      r.id,
      r.title,
      r.description,
      r.status,
      r.created_at,
      r.updated_at,
      p.id as project_id,
      p.name as project_name,
      c.id as client_id,
      c.name as client_name
    FROM rfqs r
    JOIN projects p ON r.project_id = p.id
    JOIN clients c ON p.client_id = c.id
    ORDER BY r.created_at DESC
  `);
  return result.rows;
}

/**
 * Gets a single RFQ by ID with related project and client information
 * @param {string} id - RFQ UUID
 * @returns {Promise<Object>} RFQ object
 */
async function getRfqById(id) {
  const db = await connectDb();
  const result = await db.query(`
    SELECT 
      r.id,
      r.title,
      r.description,
      r.status,
      r.created_at,
      r.updated_at,
      p.id as project_id,
      p.name as project_name,
      c.id as client_id,
      c.name as client_name
    FROM rfqs r
    JOIN projects p ON r.project_id = p.id
    JOIN clients c ON p.client_id = c.id
    WHERE r.id = $1
  `, [id]);

  if (result.rows.length === 0) {
    throw new Error('RFQ not found');
  }

  return result.rows[0];
}

/**
 * Gets all items for an RFQ
 * @param {string} rfqId - RFQ UUID
 * @returns {Promise<Array>} Array of RFQ item objects
 */
async function getRfqItems(rfqId) {
  const db = await connectDb();
  const result = await db.query(
    `SELECT * FROM rfq_items WHERE rfq_id = $1 ORDER BY line_number, created_at`,
    [rfqId]
  );
  return result.rows;
}

/**
 * Adds an item to an RFQ
 * @param {string} rfqId - RFQ UUID
 * @param {Object} payload - Item data
 * @param {string} payload.description - Item description (required)
 * @param {number} payload.quantity - Quantity (required)
 * @param {string} payload.unit - Unit (required)
 * @param {string} [payload.material_code] - Optional material code
 * @param {number} [payload.line_number] - Optional line number
 * @returns {Promise<Object>} Created RFQ item object
 */
async function addRfqItem(rfqId, payload) {
  const db = await connectDb();

  // Verify RFQ exists
  const rfqResult = await db.query(
    `SELECT id FROM rfqs WHERE id = $1`,
    [rfqId]
  );

  if (rfqResult.rows.length === 0) {
    throw new Error('RFQ not found');
  }

  // Validate required fields
  if (!payload.description || payload.quantity === undefined || !payload.unit) {
    throw new Error('description, quantity, and unit are required');
  }

  // Get next line number if not provided
  let lineNumber = payload.line_number;
  if (!lineNumber) {
    const maxLineResult = await db.query(
      `SELECT MAX(line_number) as max_line FROM rfq_items WHERE rfq_id = $1`,
      [rfqId]
    );
    lineNumber = maxLineResult.rows[0].max_line 
      ? maxLineResult.rows[0].max_line + 1 
      : 1;
  }

  const result = await db.query(
    `INSERT INTO rfq_items (rfq_id, description, quantity, unit, material_code, line_number)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      rfqId,
      payload.description,
      payload.quantity,
      payload.unit,
      payload.material_code || null,
      lineNumber,
    ]
  );

  return result.rows[0];
}

module.exports = {
  createRfqFromPayload,
  getAllRfqs,
  getRfqById,
  getRfqItems,
  addRfqItem,
};

