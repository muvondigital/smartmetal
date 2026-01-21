// MUVOS Platform – SmartMetal CPQ runs on Muvon Unified Commercial Operating System
//
// This service operates within the MUVOS commercial operating system.
// SmartMetal is the AI-powered CPQ execution layer running on MUVOS.

const { connectDb, getPool, transaction } = require('../db/supabaseClient');
const { withTenantContext, withTenantTransaction } = require('../db/tenantContext');
const { log } = require('../utils/logger');
const { generateRfqCode, buildRfqTitle } = require('../utils/rfqNaming');
const { AppError } = require('../middleware/errorHandler');

const WORKFLOW_ERROR_CODE = 'WORKFLOW_CONTRACT_VIOLATION';
function workflowViolation(message, details = {}) {
  return new AppError(message, 400, WORKFLOW_ERROR_CODE, details);
}

/**
 * Creates an RFQ from a payload. Handles both simple (customer_name) and detailed payloads.
 * 
 * @param {Object} payload - The RFQ payload
 * @param {string} tenantId - Tenant UUID (required)
 * @param {Object} [context] - Optional context with correlationId
 * @param {string} [payload.customer_name] - Customer name (simple payload)
 * @param {string} [payload.client_id] - Client UUID (detailed payload)
 * @param {string} [payload.project_id] - Project UUID (detailed payload)
 * @param {string} [payload.title] - RFQ title (detailed payload)
 * @param {string} [payload.description] - RFQ description (detailed payload)
 * @returns {Promise<Object>} The created RFQ object
 */
async function createRfqFromPayload(payload, tenantId, context = {}) {
  const logContext = {
    correlationId: context.correlationId,
    tenantId,
    operation: 'rfq_creation_start',
  };
  log.logInfo('RFQ creation started', logContext);

  const { tenantCode, originalFilename } = context;
  const createdAt = new Date();

  // Use withTenantTransaction to ensure RLS policies are applied
  return await withTenantTransaction(tenantId, async (client) => {
    // Generate RFQ code within tenant context
    const rfqCode = await generateRfqCode(
      { tenantId, tenantCode, createdAt },
      client
    );

    // If client_id and project_id are provided, use them directly
    if (payload.client_id && payload.project_id) {
      // Verify project belongs to tenant and get client name for title generation
      const projectCheck = await client.query(
        `SELECT p.id, p.name as project_name, c.name as client_name
         FROM projects p
         JOIN clients c ON p.client_id = c.id
         WHERE p.id = $1 AND p.tenant_id = $2`,
        [payload.project_id, tenantId]
      );
      
      if (projectCheck.rows.length === 0) {
        throw new Error('Project not found or does not belong to tenant');
      }
      
      const projectRow = projectCheck.rows[0];
      const title =
        payload.title ||
        buildRfqTitle({
          customerName: projectRow.client_name,
          projectName: projectRow.project_name,
          originalFilename,
          rfqCode,
        });
      const description = payload.description || null;
      const projectType = payload.project_type || null;

      // Use document type from payload or context, default to 'RFQ'
      // NSC knows document type at upload (RFQ/MTO) - no inference needed
      const documentType = payload.document_type || context.document_type || 'RFQ';

      const result = await client.query(
        `INSERT INTO rfqs (project_id, rfq_name, notes, status, project_type, tenant_id, rfq_code, original_filename, document_type, created_at)
         VALUES ($1, $2, $3, 'draft', $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [payload.project_id, title, description, projectType, tenantId, rfqCode, originalFilename || null, documentType, createdAt]
      );

      const rfq = result.rows[0];
      log.logInfo('RFQ creation completed', {
        ...logContext,
        operation: 'rfq_creation_end',
        rfqId: rfq.id,
      });
      
      return rfq;
    }

    // Otherwise, if customer_name is provided, create client and project
    if (payload.customer_name) {
      // Create or find client by name within tenant
      let clientResult = await client.query(
        `SELECT id FROM clients WHERE name = $1 AND tenant_id = $2 LIMIT 1`,
        [payload.customer_name, tenantId]
      );

      let clientId;
      if (clientResult.rows.length > 0) {
        clientId = clientResult.rows[0].id;
      } else {
        // Create new client with tenant_id (RLS policy will allow this because app.tenant_id is set)
        const newClientResult = await client.query(
          `INSERT INTO clients (name, tenant_id) VALUES ($1, $2) RETURNING id`,
          [payload.customer_name, tenantId]
        );
        clientId = newClientResult.rows[0].id;
      }

      // Create a default project for this client
      const projectName = `Default Project for ${payload.customer_name}`;
      const projectResult = await client.query(
        `INSERT INTO projects (client_id, name, tenant_id) VALUES ($1, $2, $3) RETURNING id, name`,
        [clientId, projectName, tenantId]
      );
      const projectId = projectResult.rows[0].id;
      const projectNameCreated = projectResult.rows[0].name;

      // Create the RFQ
      const rfqTitle =
        payload.title ||
        buildRfqTitle({
          customerName: payload.customer_name,
          projectName: projectNameCreated,
          originalFilename,
          rfqCode,
        });
      const projectType = payload.project_type || null;

      // Use document type from payload or context, default to 'RFQ'
      // NSC knows document type at upload (RFQ/MTO) - no inference needed
      const documentType = payload.document_type || context.document_type || 'RFQ';
      const rfqResult = await client.query(
        `INSERT INTO rfqs (project_id, rfq_name, notes, status, project_type, tenant_id, rfq_code, original_filename, document_type, created_at)
         VALUES ($1, $2, $3, 'draft', $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [projectId, rfqTitle, null, projectType, tenantId, rfqCode, originalFilename || null, documentType, createdAt]
      );

      const rfq = rfqResult.rows[0];
      
      log.logInfo('RFQ creation completed', {
        ...logContext,
        operation: 'rfq_creation_end',
        rfqId: rfq.id,
      });
      
      return rfq;
    }

    const error = new Error('Either customer_name or both client_id and project_id must be provided');
    log.logError('RFQ creation failed - invalid payload', error, {
      ...logContext,
      operation: 'rfq_creation_error',
    });
    throw error;
  }).catch((error) => {
    log.logError('RFQ creation failed', error, {
      ...logContext,
      operation: 'rfq_creation_error',
    });
    throw error;
  });
}

/**
 * Gets all RFQs with their related project and client information
 * @param {string} tenantId - Tenant UUID (required)
 * @returns {Promise<Array>} Array of RFQ objects
 */
async function getAllRfqs(tenantId) {
  if (!tenantId) {
    throw new Error('tenantId is required for getAllRfqs');
  }
  
  try {
    // Use tenant context to ensure RLS policies are applied
    const result = await withTenantContext(tenantId, async (client) => {
      return await client.query(`
        SELECT
          r.id,
          r.rfq_code,
          r.rfq_name as title,
          r.notes as description,
          r.status,
          r.created_at,
          r.updated_at,
          r.project_type,
          r.original_filename,
          r.document_type,
          p.id as project_id,
          p.name as project_name,
          c.id as client_id,
          c.name as client_name
        FROM rfqs r
        JOIN projects p ON r.project_id = p.id
        JOIN clients c ON p.client_id = c.id
        ORDER BY r.created_at DESC
      `);
    });
    
    // Return empty array if no RFQs (don't throw error)
    // Note: RLS policy automatically filters to current tenant
    return result.rows || [];
  } catch (error) {
    log.logError('Error fetching RFQs', {
      tenantId,
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
}

/**
 * Gets a single RFQ by ID with related project and client information
 * @param {string} id - RFQ UUID
 * @param {string} tenantId - Tenant UUID (required)
 * @returns {Promise<Object>} RFQ object
 */
async function getRfqById(id, tenantId) {
  // Use tenant context to ensure RLS policies are applied
  const result = await withTenantContext(tenantId, async (client) => {
    return await client.query(`
      SELECT
        r.id,
        r.rfq_code,
        r.rfq_name as title,
        r.notes as description,
        r.status,
        r.created_at,
        r.updated_at,
        r.project_type,
        r.original_filename,
        r.document_type,
        p.id as project_id,
        p.name as project_name,
        c.id as client_id,
        c.name as client_name
      FROM rfqs r
      JOIN projects p ON r.project_id = p.id
      JOIN clients c ON p.client_id = c.id
      WHERE r.id = $1
    `, [id]);
  });

  if (result.rows.length === 0) {
    throw new Error('RFQ not found');
  }

  return result.rows[0];
}

/**
 * Gets all items for an RFQ
 * @param {string} rfqId - RFQ UUID
 * @param {string} tenantId - Tenant UUID (required)
 * @returns {Promise<Array>} Array of RFQ item objects
 */
async function getRfqItems(rfqId, tenantId) {
  // Strict validation for tenantId
  if (!tenantId || typeof tenantId !== 'string' || tenantId.trim() === '') {
    throw new Error('TENANT_ID_MISSING_IN_GET_RFQ_ITEMS');
  }

  // Strict validation for rfqId
  if (!rfqId || typeof rfqId !== 'string' || rfqId.trim() === '') {
    throw new Error('RFQ_ID_INVALID_IN_GET_RFQ_ITEMS');
  }

  // Trim whitespace to ensure we never pass empty strings to SQL
  const safeRfqId = rfqId.trim();
  const safeTenantId = tenantId.trim();

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(safeRfqId)) {
    throw new Error(`Invalid rfqId format: "${safeRfqId}". Expected a valid UUID.`);
  }
  if (!uuidRegex.test(safeTenantId)) {
    throw new Error(`Invalid tenantId format: "${safeTenantId}". Expected a valid UUID.`);
  }

  // Use tenant context to ensure RLS policies are applied
  const result = await withTenantContext(safeTenantId, async (client) => {
    return await client.query(
      `SELECT ri.* FROM rfq_items ri
       JOIN rfqs r ON ri.rfq_id = r.id
       WHERE ri.rfq_id = $1
       ORDER BY ri.line_number, ri.created_at`,
      [safeRfqId]
    );
  });

  return result.rows;
}

/**
 * Adds an item to a commercial request (RFQ)
 *
 * Applies Material Treatment Doctrine v1 to classify items and extract parameters.
 *
 * @param {string} rfqId - RFQ UUID
 * @param {Object} payload - Item data
 * @param {string} tenantId - Tenant UUID (required)
 * @param {string} payload.description - Item description (required)
 * @param {number} payload.quantity - Quantity (required)
 * @param {string} payload.unit - Unit (required)
 * @param {string} [payload.material_code] - Optional material code
 * @param {number} [payload.line_number] - Optional line number
 * @param {string} [payload.size_display] - Optional size display (e.g., "6\"" or "6\" × 2\"")
 * @param {string} [payload.size1_raw] - Optional primary size (e.g., "6\"")
 * @param {string} [payload.size2_raw] - Optional secondary size (e.g., "2\"")
 * @param {string} [payload.material_treatment_type] - Optional treatment type (auto-inferred if not provided)
 * @param {Object} [payload.item_parameters] - Optional parameters (auto-extracted if not provided)
 * @returns {Promise<Object>} Created RFQ item object
 */
async function addRfqItem(rfqId, payload, tenantId) {
  // Validation for required fields
  if (!payload.description || payload.quantity === undefined || !payload.unit) {
    throw new Error('Invalid payload: description, quantity, and unit are required');
  }

  // Prepare values (allow null for optional fields)
    const {
      description,
      quantity,
      unit,
      material_id = null,
      material_code = null,
      line_number = null,
      size_display = null,
      size1_raw = null,
      size2_raw = null,
      hs_code = null,
      import_duty_rate = null,
      import_duty_amount = null,
      hs_match_source = null,
      hs_confidence = null,
      origin_country = null,
      needs_review = false,
      quantity_source = null,
      confidence = null,
      supplier_options = null,
      supplier_selected_option = null,
      supplier_selected_at = null,
      trade_agreement = null,
      final_import_duty_rate = null,
      final_import_duty_amount = null
    } = payload;

  // Accept material_treatment_type and item_parameters from payload if provided
  // Default to 'CANONICAL' if not specified (database constraint requires NOT NULL)
  let material_treatment_type = payload.material_treatment_type || 'CANONICAL';
  let item_parameters = payload.item_parameters || null;

  try {
    // Use tenant context to ensure RLS policies are applied
    const result = await withTenantContext(tenantId, async (client) => {
      const insertQuery = `
        INSERT INTO rfq_items (
          tenant_id,
          rfq_id,
          description,
          quantity,
          unit,
          material_id,
          material_code,
          line_number,
          size_display,
          size1_raw,
          size2_raw,
          hs_code,
          import_duty_rate,
          import_duty_amount,
          hs_match_source,
          hs_confidence,
            origin_country,
            needs_review,
            quantity_source,
            confidence,
            supplier_options,
            supplier_selected_option,
            supplier_selected_at,
            trade_agreement,
            final_import_duty_rate,
            final_import_duty_amount,
            material_treatment_type,
            item_parameters
          )
          VALUES (
            $1, $2, $3, $4, $5,
            $6, $7, $8, $9, $10,
            $11, $12, $13, $14, $15,
            $16, $17, $18, $19, $20,
            $21, $22, $23, $24, $25,
            $26, $27, $28
          )
          RETURNING *
        `;

      return await client.query(insertQuery, [
        tenantId,
        rfqId,
        description,
        quantity,
        unit,
        material_id,
        material_code,
        line_number,
        size_display,
        size1_raw,
        size2_raw,
        hs_code,
        import_duty_rate,
        import_duty_amount,
        hs_match_source,
        hs_confidence,
          origin_country,
          needs_review,
          quantity_source,
          confidence,
          supplier_options ? JSON.stringify(supplier_options) : null,
          supplier_selected_option,
          supplier_selected_at,
          trade_agreement,
          final_import_duty_rate,
          final_import_duty_amount,
          material_treatment_type,
          item_parameters ? JSON.stringify(item_parameters) : null
      ]);
    });

    return result.rows[0];
  } catch (error) {
    console.error('[RFQ] Error inserting item:', error.message);
    
    // Check for foreign key violation on rfq_id
    if (error.code === '23503' && error.constraint === 'rfq_items_rfq_id_fkey') {
      throw new Error('RFQ_NOT_FOUND_FOR_TENANT');
    }
    
    throw error;
  }
}

/**
 * Batch adds multiple items to a commercial request (RFQ) - much faster than individual inserts
 *
 * Applies Material Treatment Doctrine v1 to classify items and extract parameters.
 *
 * @param {string} rfqId - RFQ UUID
 * @param {Array<Object>} items - Array of item data objects
 * @param {string} tenantId - Tenant UUID (required)
 * @returns {Promise<Array<Object>>} Array of created RFQ item objects
 */
async function addRfqItemsBatch(rfqId, items, tenantId) {
  // Validate UUIDs are not empty strings
  if (!rfqId || typeof rfqId !== 'string' || rfqId.trim() === '') {
    throw new Error('rfqId must be a non-empty string');
  }
  if (!tenantId || typeof tenantId !== 'string' || tenantId.trim() === '') {
    throw new Error('tenantId must be a non-empty string');
  }

  const trimmedRfqId = rfqId.trim();
  const trimmedTenantId = tenantId.trim();

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(trimmedRfqId)) {
    throw new Error(`Invalid rfqId format: ${rfqId}`);
  }
  if (!uuidRegex.test(trimmedTenantId)) {
    throw new Error(`Invalid tenantId format: ${tenantId}`);
  }

  if (!items || items.length === 0) {
    return [];
  }

  // Validate all items have required fields
  for (const item of items) {
    if (!item.description || item.quantity === undefined || !item.unit) {
      throw new Error('All items must have description, quantity, and unit');
    }
  }

  // Use withTenantContext to ensure RLS policies are applied
  return await withTenantContext(trimmedTenantId, async (db) => {
    // Verify RFQ exists and belongs to tenant
    const rfqResult = await db.query(
      `SELECT id, tenant_id FROM rfqs WHERE id = $1 AND tenant_id = $2`,
      [trimmedRfqId, trimmedTenantId]
    );

    if (rfqResult.rows.length === 0) {
      throw new Error('RFQ not found');
    }

    // Get max line number for auto-numbering items without line_number
    const maxLineResult = await db.query(
      `SELECT MAX(line_number) as max_line FROM rfq_items WHERE rfq_id = $1`,
      [trimmedRfqId]
    );
    let nextLineNumber = maxLineResult.rows[0].max_line
      ? maxLineResult.rows[0].max_line + 1
      : 1;

    // Build batch insert query with proper parameter indexing
    // Apply HS code suggestions to all items
    const itemsWithHs = await Promise.all(
      items.map(item => applyHsCodeSuggestion({ ...item }, {
        allowOverride: true,
        tenantId: trimmedTenantId,
        rfqId: trimmedRfqId,
      }))
    );

    // Accept material_treatment_type and item_parameters from items if provided
    // Default to 'CANONICAL' if not specified (database constraint requires NOT NULL)
      const itemsWithDoctrine = itemsWithHs.map((item) => {
        return {
          ...item,
          material_treatment_type: item.material_treatment_type || 'CANONICAL',
          item_parameters: item.item_parameters || null,
          needs_review: item.needs_review === true,
          quantity_source: item.quantity_source || null,
          confidence: item.confidence || null,
          supplier_options: item.supplier_options || null,
          supplier_selected_option: item.supplier_selected_option || null,
          supplier_selected_at: item.supplier_selected_at || null,
        };
      });

    const values = [];
    const params = [];
    let paramIndex = 1;
    let autoMappedCount = 0;

    itemsWithDoctrine.forEach((item, itemIdx) => {
      const lineNumber = item.line_number || nextLineNumber++;

      // Helper to convert empty strings to null (defensive validation)
      const nullIfEmpty = (val) => {
        if (val === '' || val === undefined) return null;
        return val;
      };

      // Prepare parameters with defensive validation
        const paramValues = [
          trimmedRfqId, // param 1: rfq_id (uuid, already validated)
          nullIfEmpty(item.description), // param 2: description
          item.quantity, // param 3: quantity
          nullIfEmpty(item.unit), // param 4: unit
          nullIfEmpty(item.material_code), // param 5: material_code
          lineNumber, // param 6: line_number
          nullIfEmpty(item.size_display), // param 7: size_display
          nullIfEmpty(item.size1_raw), // param 8: size1_raw
          nullIfEmpty(item.size2_raw), // param 9: size2_raw
          trimmedTenantId, // param 10: tenant_id (uuid, already validated)
          nullIfEmpty(item.hs_code), // param 11: hs_code
          item.import_duty_rate != null ? item.import_duty_rate : null, // param 12: import_duty_rate
          nullIfEmpty(item.hs_match_source), // param 13: hs_match_source
          item.hs_confidence != null ? item.hs_confidence : null, // param 14: hs_confidence
          nullIfEmpty(item.material_treatment_type), // param 15: material_treatment_type
          item.item_parameters ? JSON.stringify(item.item_parameters) : null, // param 16: item_parameters
          item.needs_review === true, // param 17: needs_review
          nullIfEmpty(item.quantity_source), // param 18: quantity_source
          nullIfEmpty(item.confidence), // param 19: confidence
          item.supplier_options ? JSON.stringify(item.supplier_options) : null, // param 20: supplier_options
          nullIfEmpty(item.supplier_selected_option), // param 21: supplier_selected_option
          item.supplier_selected_at || null, // param 22: supplier_selected_at
        ];

      // Debug log for empty string detection (only log first item to avoid spam)
      if (itemIdx === 0) {
        const emptyParams = [];
        paramValues.forEach((val, idx) => {
          if (val === '') {
              const paramNames = [
                'rfq_id', 'description', 'quantity', 'unit', 'material_code', 'line_number',
                'size_display', 'size1_raw', 'size2_raw', 'tenant_id', 'hs_code',
                'import_duty_rate', 'hs_match_source', 'hs_confidence', 'material_treatment_type', 'item_parameters',
                'needs_review', 'quantity_source', 'confidence', 'supplier_options', 'supplier_selected_option', 'supplier_selected_at'
              ];
            emptyParams.push(`param ${idx + 1} (${paramNames[idx]})`);
          }
        });
        if (emptyParams.length > 0) {
          console.warn(`[RFQ_BATCH_INSERT] First item has empty string values: ${emptyParams.join(', ')}`);
        }
      }

      values.push(
        `($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5}, $${paramIndex + 6}, $${paramIndex + 7}, $${paramIndex + 8}, $${paramIndex + 9}, $${paramIndex + 10}, $${paramIndex + 11}, $${paramIndex + 12}, $${paramIndex + 13}, $${paramIndex + 14}, $${paramIndex + 15}, $${paramIndex + 16}, $${paramIndex + 17}, $${paramIndex + 18}, $${paramIndex + 19}, $${paramIndex + 20}, $${paramIndex + 21})`
      );

      params.push(...paramValues);

      if (item.hs_code && item.hs_match_source && item.hs_match_source !== 'NONE') {
        autoMappedCount++;
      }

      paramIndex += 22; // 22 parameters per item (audit + supplier fields)
    });

      const query = `
        INSERT INTO rfq_items (
          rfq_id,
          description,
          quantity,
          unit,
          material_code,
          line_number,
          size_display,
          size1_raw,
          size2_raw,
          tenant_id,
          hs_code,
          import_duty_rate,
          hs_match_source,
          hs_confidence,
          material_treatment_type,
          item_parameters,
          needs_review,
          quantity_source,
          confidence,
          supplier_options,
          supplier_selected_option,
          supplier_selected_at
        )
        VALUES ${values.join(', ')}
        RETURNING *
      `;

    const result = await db.query(query, params);

    // Log batch HS mapping summary
    if (autoMappedCount > 0) {
      log.logInfo('addRfqItemsBatch: HS codes auto-mapped', {
        tenantId: trimmedTenantId,
        rfqId: trimmedRfqId,
        totalItems: items.length,
        autoMappedCount,
      });
    }

    return result.rows;
  });
}

/**
 * Deletes an RFQ by ID
 * Allows deletion of RFQs unless they have linked price agreements
 * Cascade delete will handle related records (rfq_items, pricing_runs, etc.)
 * @param {string} id - RFQ UUID
 * @param {string} tenantId - Tenant UUID (required)
 * @returns {Promise<boolean>} True if deleted, false if not found
 */
async function deleteRfq(id, tenantId) {
  console.log('[RFQ DELETE] Starting delete process', {
    rfqId: id,
    tenantId,
    timestamp: new Date().toISOString()
  });

  // Use withTenantContext to ensure RLS policies are respected
  return await withTenantContext(tenantId, async (db) => {
    // First, check if RFQ exists and get its status
    const rfqResult = await db.query(
      `SELECT id, status FROM rfqs WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );

    console.log('[RFQ DELETE] RFQ lookup result', {
      rfqId: id,
      tenantId,
      found: rfqResult.rows.length > 0,
      rowCount: rfqResult.rows.length
    });

    if (rfqResult.rows.length === 0) {
      console.log('[RFQ DELETE] RFQ not found - returning false', { rfqId: id, tenantId });
      return false; // RFQ not found
    }

    const rfq = rfqResult.rows[0];

    console.log('[RFQ DELETE] Proceeding with delete (no blocking checks)');

    // For draft RFQs, we need to manually delete approval-related records first
    // because approval_events has ON DELETE RESTRICT and an immutability trigger
    // withTenantContext already provides a transaction, so use the db client directly
    // Get all pricing runs for this RFQ
    const pricingRunsResult = await db.query(
        `SELECT id FROM pricing_runs WHERE rfq_id = $1 AND tenant_id = $2`,
        [id, tenantId]
      );

    const pricingRunIds = pricingRunsResult.rows.map(row => row.id);

    console.log('[RFQ DELETE] Found pricing runs', {
      rfqId: id,
      tenantId,
      pricingRunCount: pricingRunIds.length,
      pricingRunIds: pricingRunIds.slice(0, 3) // Log first 3 for brevity
    });

    if (pricingRunIds.length > 0) {
      // Delete approval_history first (no foreign key constraints)
      const historyResult = await db.query(
        `DELETE FROM approval_history WHERE pricing_run_id = ANY($1::uuid[]) AND tenant_id = $2`,
        [pricingRunIds, tenantId]
      );
      console.log('[RFQ DELETE] Deleted approval_history', { count: historyResult.rowCount });

      // Delete approval_events (has FK to pricing_runs)
      const eventsResult = await db.query(
        `DELETE FROM approval_events WHERE pricing_run_id = ANY($1::uuid[]) AND tenant_id = $2`,
        [pricingRunIds, tenantId]
      );
      console.log('[RFQ DELETE] Deleted approval_events', { count: eventsResult.rowCount });

      // Delete pricing_run_items
      const itemsResult = await db.query(
        `DELETE FROM pricing_run_items WHERE pricing_run_id = ANY($1::uuid[]) AND tenant_id = $2`,
        [pricingRunIds, tenantId]
      );
      console.log('[RFQ DELETE] Deleted pricing_run_items', { count: itemsResult.rowCount });

      // Finally delete pricing_runs
      const runsResult = await db.query(
        `DELETE FROM pricing_runs WHERE id = ANY($1::uuid[]) AND tenant_id = $2`,
        [pricingRunIds, tenantId]
      );
      console.log('[RFQ DELETE] Deleted pricing_runs', { count: runsResult.rowCount });
    }

    // Delete rfq_items (CASCADE should work, but being explicit)
    const rfqItemsResult = await db.query(
      `DELETE FROM rfq_items WHERE rfq_id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );
    console.log('[RFQ DELETE] Deleted rfq_items', { count: rfqItemsResult.rowCount });

    // Finally, delete the RFQ
    const deleteResult = await db.query(
      `DELETE FROM rfqs WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );

    console.log('[RFQ DELETE] Delete completed', {
      rfqId: id,
      tenantId,
      deleted: deleteResult.rowCount > 0,
      rowCount: deleteResult.rowCount
    });

    return deleteResult.rowCount > 0;
  });
}

/**
 * Gets all items for an RFQ with pricing information from the latest pricing run
 * @param {string} rfqId - RFQ UUID
 * @param {string} tenantId - Tenant UUID (required)
 * @returns {Promise<Array>} Array of RFQ item objects with pricing details
 */
async function getRfqItemsWithPricing(rfqId, tenantId) {
  // Validate inputs - return empty array for invalid inputs instead of throwing
  // This prevents 500 errors when the frontend passes invalid/empty UUIDs
  if (!rfqId || typeof rfqId !== 'string' || rfqId.trim() === '') {
    console.warn(`[getRfqItemsWithPricing] Invalid rfqId: ${JSON.stringify(rfqId)} (tenantId: ${tenantId}). Returning empty array.`);
    return [];
  }
  if (!tenantId || typeof tenantId !== 'string' || tenantId.trim() === '') {
    console.warn(`[getRfqItemsWithPricing] Invalid tenantId: ${JSON.stringify(tenantId)} (rfqId: ${rfqId}). Returning empty array.`);
    return [];
  }

  // Normalize: Trim and store validated UUIDs to ensure no whitespace in SQL queries
  const trimmedRfqId = rfqId.trim();
  const trimmedTenantId = tenantId.trim();
  
  // Validate UUID format after trimming
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!trimmedRfqId || trimmedRfqId === '' || !uuidRegex.test(trimmedRfqId)) {
    console.warn(`[getRfqItemsWithPricing] invalid param { rfqId: "${rfqId}", tenantId: "${tenantId}", badValueKey: "rfqId" }`);
    return [];
  }
  if (!trimmedTenantId || trimmedTenantId === '' || !uuidRegex.test(trimmedTenantId)) {
    console.warn(`[getRfqItemsWithPricing] invalid param { rfqId: "${rfqId}", tenantId: "${tenantId}", badValueKey: "tenantId" }`);
    return [];
  }

  // Check if columns exist in pricing_run_items table (doesn't need tenant context)
  const dbForSchema = await connectDb();
  let hasPriceAgreementIdColumn = false;
  let hasMarkupPctColumn = false;
  let hasMarkupPercentageColumn = false;
  let hasLogisticsCostColumn = false;
  let hasRiskPctColumn = false;
  let hasRiskCostColumn = false;
  let hasPricingMethodColumn = false;
  let hasCurrencyColumn = false;
  
  try {
    const columnCheck = await dbForSchema.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
      AND table_name = 'pricing_run_items'
      AND column_name IN (
        'markup_pct',
        'markup_percentage',
        'logistics_cost',
        'risk_pct',
        'risk_cost',
        'pricing_method',
        'currency'
      )
    `);

    const existingColumns = columnCheck.rows.map(row => row.column_name);
    hasMarkupPctColumn = existingColumns.includes('markup_pct');
    hasMarkupPercentageColumn = existingColumns.includes('markup_percentage');
    hasLogisticsCostColumn = existingColumns.includes('logistics_cost');
    hasRiskPctColumn = existingColumns.includes('risk_pct');
    hasRiskCostColumn = existingColumns.includes('risk_cost');
    hasPricingMethodColumn = existingColumns.includes('pricing_method');
    hasCurrencyColumn = existingColumns.includes('currency');
  } catch (err) {
    console.warn('Could not check for pricing_run_items columns:', err.message);
    hasMarkupPctColumn = false;
    hasMarkupPercentageColumn = false;
    hasLogisticsCostColumn = false;
    hasRiskPctColumn = false;
    hasRiskCostColumn = false;
    hasPricingMethodColumn = false;
    hasCurrencyColumn = false;
  }

  // Use withTenantContext to ensure RLS policies can see the RFQ
  return await withTenantContext(trimmedTenantId, async (db) => {

  // Determine which markup column to use (prefer markup_pct, fallback to markup_percentage)
  const markupColumn = hasMarkupPctColumn ? 'markup_pct' : (hasMarkupPercentageColumn ? 'markup_percentage' : null);
  // Safely reference the column, handling NULL from LEFT JOIN
  const markupSelect = markupColumn ? `pri.${markupColumn} as markup_pct` : 'NULL::numeric as markup_pct';
  
  // Build safe column selects for optional columns
  const logisticsCostSelect = hasLogisticsCostColumn ? 'pri.logistics_cost' : 'NULL::numeric as logistics_cost';
  const riskPctSelect = hasRiskPctColumn ? 'pri.risk_pct' : 'NULL::numeric as risk_pct';
  const riskCostSelect = hasRiskCostColumn ? 'pri.risk_cost' : 'NULL::numeric as risk_cost';
  const pricingMethodSelect = hasPricingMethodColumn ? 'pri.pricing_method' : 'NULL::text as pricing_method';
  const currencySelect = hasCurrencyColumn ? 'pri.currency' : 'NULL::text as currency';

  // Build query to retrieve RFQ items with latest pricing data
  // Use CAST() for UUID parameters to prevent empty string casting errors
  const query = `
    WITH latest_pricing_run AS (
      SELECT pr.id
      FROM pricing_runs pr
      WHERE pr.rfq_id = CAST($1 AS uuid) AND pr.tenant_id = CAST($2 AS uuid)
      ORDER BY pr.created_at DESC
      LIMIT 1
    )
    SELECT
      ri.*,
      pri.unit_cost as base_cost,
      pri.unit_price,
      pri.total_price,
      ${markupSelect},
      ${logisticsCostSelect},
      ${riskPctSelect},
      ${riskCostSelect},
      ${pricingMethodSelect},
      ${currencySelect}
    FROM rfq_items ri
    JOIN rfqs r ON ri.rfq_id = r.id
    LEFT JOIN latest_pricing_run lpr ON TRUE
    LEFT JOIN pricing_run_items pri
      ON pri.pricing_run_id = lpr.id
     AND pri.rfq_item_id = ri.id
    WHERE ri.rfq_id = CAST($1 AS uuid) AND r.tenant_id = CAST($2 AS uuid)
    ORDER BY ri.line_number, ri.created_at
  `;

  // Guard: Check if RFQ has any items before executing pricing joins
  // This prevents expensive queries when RFQ has 0 items
  try {
    // Final validation: ensure UUIDs are not empty and are valid format
    if (!trimmedRfqId || trimmedRfqId === '' || trimmedRfqId.length !== 36) {
      console.warn(`[getRfqItemsWithPricing] Invalid rfqId before count query: "${trimmedRfqId}" (length: ${trimmedRfqId?.length || 0}). Returning empty array.`);
      return [];
    }
    if (!trimmedTenantId || trimmedTenantId === '' || trimmedTenantId.length !== 36) {
      console.warn(`[getRfqItemsWithPricing] Invalid tenantId before count query: "${trimmedTenantId}" (length: ${trimmedTenantId?.length || 0}). Returning empty array.`);
      return [];
    }

    // Log the exact values being passed to the query for debugging
    console.log(`[getRfqItemsWithPricing] Checking item count with rfqId="${trimmedRfqId}" (length: ${trimmedRfqId.length}), tenantId="${trimmedTenantId}" (length: ${trimmedTenantId.length})`);

    // Validate parameters one more time before query - ensure no empty strings
    const params = [trimmedRfqId, trimmedTenantId];
    for (let i = 0; i < params.length; i++) {
      const param = params[i];
      if (!param || param === '' || typeof param !== 'string' || param.trim() === '') {
        console.warn(`[getRfqItemsWithPricing] Parameter ${i + 1} is invalid: ${JSON.stringify(param)} (type: ${typeof param}). Returning empty array.`);
        return [];
      }
      // Ensure parameter is not just whitespace
      if (param.trim().length !== 36) {
        console.warn(`[getRfqItemsWithPricing] Parameter ${i + 1} has invalid length: ${param.trim().length} (expected 36 for UUID). Value: ${JSON.stringify(param)}. Returning empty array.`);
        return [];
      }
    }
    
    // Log final parameters being sent to query
    console.log(`[getRfqItemsWithPricing] Query parameters validated - rfqId: "${params[0]}" (${params[0].length} chars), tenantId: "${params[1]}" (${params[1].length} chars)`);

    // First verify the RFQ exists and belongs to the tenant (prevents JOIN issues with NULL values)
    const rfqCheck = await db.query(
      `SELECT id, tenant_id FROM rfqs WHERE id = $1 LIMIT 1`,
      [params[0]]
    );
    
    if (rfqCheck.rows.length === 0) {
      console.log(`[getRfqItemsWithPricing] RFQ ${params[0]} does not exist. Returning empty array.`);
      return [];
    }
    
    const rfqTenantId = rfqCheck.rows[0].tenant_id;
    if (!rfqTenantId || rfqTenantId.toString() !== params[1]) {
      console.log(`[getRfqItemsWithPricing] RFQ ${params[0]} belongs to different tenant (expected: ${params[1]}, found: ${rfqTenantId}). Returning empty array.`);
      return [];
    }

    // Now count items for this RFQ (simpler query without JOIN on tenant_id)
    // Use CAST for explicit type safety
    const itemCountResult = await db.query(
      `SELECT COUNT(*) as count 
       FROM rfq_items 
       WHERE rfq_id = CAST($1 AS uuid) AND tenant_id = CAST($2 AS uuid)`,
      params
    );
    
    const itemCount = parseInt(itemCountResult.rows[0]?.count || '0', 10);
    console.log(`[getRfqItemsWithPricing] RFQ has ${itemCount} items (rfqId="${trimmedRfqId}", tenantId="${trimmedTenantId}")`);
    
    if (itemCount === 0) {
      console.log(`[getRfqItemsWithPricing] RFQ has 0 items, returning empty array without pricing query`);
      return [];
    }
  } catch (countError) {
    // If count query fails due to invalid UUID, return empty array immediately
    // Do NOT proceed with main query as it will also fail
    if (countError.message?.includes('invalid input syntax for type uuid') || 
        countError.message?.includes('uuid') && countError.message?.includes('""')) {
      console.warn(`[getRfqItemsWithPricing] Invalid UUID in count query (rfqId="${trimmedRfqId}", tenantId="${trimmedTenantId}"). Error: ${countError.message}. Returning empty array.`);
      return [];
    }
    console.warn(`[getRfqItemsWithPricing] Failed to check item count: ${countError.message}. Returning empty array.`);
    return [];
  }

  // Execute pricing query with trimmed UUIDs
  // Double-check UUIDs are not empty before query (defensive programming)
  if (!trimmedRfqId || trimmedRfqId === '' || !trimmedTenantId || trimmedTenantId === '') {
    console.warn(`[getRfqItemsWithPricing] Empty UUID detected before main query (rfqId="${trimmedRfqId}", tenantId="${trimmedTenantId}"). Returning empty array.`);
    return [];
  }

  console.log(`[getRfqItemsWithPricing] Executing pricing query with rfqId="${trimmedRfqId}", tenantId="${trimmedTenantId}"`);

  let result;
  try {
    // Final parameter validation before main query
    const mainParams = [trimmedRfqId, trimmedTenantId];
    console.log(`[getRfqItemsWithPricing] Executing main query with rfqId="${mainParams[0]}" (${mainParams[0]?.length || 0} chars), tenantId="${mainParams[1]}" (${mainParams[1]?.length || 0} chars)`);
    
    result = await db.query(query, mainParams);
  } catch (queryError) {
    // If main query fails due to invalid UUID, return empty array
    if (queryError.message?.includes('invalid input syntax for type uuid') || 
        (queryError.message?.includes('uuid') && queryError.message?.includes('""'))) {
      console.warn(`[getRfqItemsWithPricing] Invalid UUID in main query (rfqId="${trimmedRfqId}", tenantId="${trimmedTenantId}"). Error: ${queryError.message}. Returning empty array.`);
      return [];
    }
    // Re-throw other errors
    throw queryError;
  }

  return result.rows.map((row) => {
    const hasPricing = row.unit_price !== null && row.pricing_method !== null;
    const pricing = hasPricing
      ? {
          base_cost: parseFloat(row.base_cost),
          unit_price: parseFloat(row.unit_price),
          total_price: parseFloat(row.total_price),
          markup_pct: parseFloat(row.markup_pct),
          logistics_cost: parseFloat(row.logistics_cost),
          risk_pct: parseFloat(row.risk_pct),
          risk_cost: parseFloat(row.risk_cost),
          pricing_method: row.pricing_method,
          currency: row.currency,
        }
      : null;

    return {
      id: row.id,
      rfq_id: row.rfq_id,
      line_number: row.line_number,
      description: row.description,
      quantity: row.quantity,
      unit: row.unit,
      material_code: row.material_code,
      size_display: row.size_display,
      size1_raw: row.size1_raw,
      size2_raw: row.size2_raw,
      tenant_id: row.tenant_id,
      created_at: row.created_at,
      updated_at: row.updated_at,
      pricing,
      has_pricing: !!hasPricing,
    };
  });
  });
}

/**
 * Updates an RFQ by ID
 * @param {string} id - RFQ UUID
 * @param {Object} updates - Fields to update
 * @param {string} tenantId - Tenant UUID (required)
 * @param {string} [updates.title] - RFQ title
 * @param {string} [updates.description] - RFQ description
 * @param {string} [updates.status] - RFQ status
 * @returns {Promise<Object>} Updated RFQ object
 */
async function updateRfq(id, updates, tenantId) {
  const db = await connectDb();
  
  // Verify RFQ exists and belongs to tenant
  const rfqCheck = await db.query(
    `SELECT id FROM rfqs WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );

  if (rfqCheck.rows.length === 0) {
    throw new Error('RFQ not found');
  }

  // Prevent manual mutation of quoted state outside approval flow
  if (
    updates.status &&
    typeof updates.status === 'string' &&
    updates.status.trim().toLowerCase() === 'quoted'
  ) {
    throw workflowViolation(
      'RFQ status "quoted" can only be set via approval of the current pricing run.',
      {
        rfq_id: id,
        attempted_status: updates.status,
      }
    );
  }

  // Build dynamic update query
  // Map API field names to database column names
  const fieldMapping = {
    'title': 'rfq_name',
    'description': 'notes',
    'status': 'status',
    'document_type': 'document_type'
  };
  const setClauses = [];
  const values = [];
  let paramCount = 1;

  for (const [key, value] of Object.entries(updates)) {
    if (fieldMapping[key] && value !== undefined) {
      const dbColumn = fieldMapping[key];
      setClauses.push(`${dbColumn} = $${paramCount}`);
      values.push(value);
      paramCount++;
    }
  }

  if (setClauses.length === 0) {
    throw new Error('No valid fields to update');
  }

  // Add updated_at timestamp
  setClauses.push(`updated_at = NOW()`);
  
  // Add tenant ID and RFQ ID as final params
  values.push(tenantId, id);
  
  const result = await db.query(
    `UPDATE rfqs 
     SET ${setClauses.join(', ')}
     WHERE id = $${paramCount + 1} AND tenant_id = $${paramCount}
     RETURNING *`,
    values
  );

  if (result.rows.length === 0) {
    throw new Error('Failed to update RFQ');
  }

  // Get full RFQ with joins for consistent response
  return await getRfqById(id, tenantId);
}

/**
 * Apply HS Code suggestion to an RFQ item payload
 * Automatically maps material description to HS code using the regulatory service
 *
 * @param {Object} rfqItemPayload - RFQ item payload object
 * @param {Object} options - Optional configuration
 * @param {boolean} options.allowOverride - If false, skip mapping when hs_code is already set (default: true)
 * @param {string} [options.tenantId] - Tenant ID for learning event logging
 * @param {string} [options.rfqId] - RFQ ID for learning event logging
 * @param {string} [options.rfqItemId] - RFQ item ID for learning event logging
 * @returns {Promise<Object>} Updated payload with HS fields if mapping succeeded
 */
async function applyHsCodeSuggestion(rfqItemPayload, options = {}) {
  const { allowOverride = true, tenantId = null, rfqId = null, rfqItemId = null } = options;

  // Skip if hs_code is already set and override is not allowed
  if (!allowOverride && rfqItemPayload.hs_code) {
    return rfqItemPayload;
  }

  // Build material description string from available fields
  // Priority: description > material_code > specification
  const descriptionParts = [];
  
  if (rfqItemPayload.description) {
    descriptionParts.push(rfqItemPayload.description);
  }
  
  if (rfqItemPayload.material_code) {
    descriptionParts.push(rfqItemPayload.material_code);
  }
  
  if (rfqItemPayload.specification) {
    descriptionParts.push(rfqItemPayload.specification);
  }

  const materialString = descriptionParts.join(' ').trim();

  // If no description available, skip mapping
  if (!materialString || materialString.length === 0) {
    return rfqItemPayload;
  }

  try {
    // Regulatory service removed - skip HS code mapping
    /*
    const mappingResult = await regulatoryService.mapKeywordToHsCode(materialString, {
      includeDebug: false,
      tenantId,
    });

    if (mappingResult.matchSource !== 'NONE' && mappingResult.hsCode) {
      rfqItemPayload.hs_code = mappingResult.hsCode;
      rfqItemPayload.import_duty_rate = mappingResult.importDuty;
      rfqItemPayload.hs_match_source = mappingResult.matchSource;
      rfqItemPayload.hs_confidence = mappingResult.confidence;

      if (mappingResult.confidence < 0.6) {
        log.logWarn('applyHsCodeSuggestion: Low confidence HS mapping', {
          materialString,
          hsCode: mappingResult.hsCode,
          matchSource: mappingResult.matchSource,
          confidence: mappingResult.confidence,
        });

        learningService.logRegulatoryEvent({
          tenantId,
          rfqId,
          rfqItemId,
          materialDescription: materialString,
          hsCodeSuggested: mappingResult.hsCode,
          hsCodeFinal: mappingResult.hsCode,
          matchSource: mappingResult.matchSource,
          confidence: mappingResult.confidence,
          eventType: 'LOW_CONFIDENCE',
          metadata: {
            importDuty: mappingResult.importDuty,
            category: mappingResult.category,
          },
        }).catch(err => {
          // Don't fail on logging errors
          log.logError('Failed to log learning event', { error: err.message });
        });
      }
    } else {
      // No match found - leave fields as provided or null
      // Don't overwrite existing values
      if (!rfqItemPayload.hs_code) {
        rfqItemPayload.hs_match_source = 'NONE';
        rfqItemPayload.hs_confidence = 0;

        // Phase 6: Log NO_MATCH events for learning
        learningService.logRegulatoryEvent({
          tenantId,
          rfqId,
          rfqItemId,
          materialDescription: materialString,
          hsCodeSuggested: null,
          hsCodeFinal: null,
          matchSource: 'NONE',
          confidence: 0,
          eventType: 'NO_MATCH',
          metadata: {},
        }).catch(err => {
          log.logError('Failed to log learning event', { error: err.message });
        });
      }
    }
    */
  } catch (error) {
    // Regulatory service removed - skip HS code mapping
    log.logInfo('HS code mapping skipped - regulatory service removed');
  }

  return rfqItemPayload;
}

/**
 * Calculate and update final duty for an RFQ item
 * 
 * @param {Object} item - RFQ item with origin_country, hs_code, import_duty_rate, quantity, etc.
 * @returns {Promise<Object>} - Updated item with final duty fields
 */
async function calculateFinalDutyForItem(item) {
  if (!item.hs_code || !item.origin_country) {
    // No HS code or origin - clear final duty fields
    return {
      ...item,
      trade_agreement: null,
      final_import_duty_rate: null,
      final_import_duty_amount: null,
    };
  }

  try {
    // Regulatory service removed - skip duty calculation
    return {
      ...item,
      trade_agreement: null,
      final_import_duty_rate: null,
      final_import_duty_amount: null,
    };
  } catch (error) {
    log.logError('calculateFinalDutyForItem: Duty calculation skipped - regulatory service removed', {
      error: error.message,
      itemId: item.id,
      hsCode: item.hs_code,
      originCountry: item.origin_country,
    });
    return {
      ...item,
      trade_agreement: null,
      final_import_duty_rate: null,
      final_import_duty_amount: null,
    };
  }
}

/**
 * Updates an RFQ item by ID
 * @param {string} itemId - RFQ item UUID
 * @param {Object} updates - Fields to update
 * @param {string} tenantId - Tenant UUID (required)
 * @param {string} [updates.description] - Item description
 * @param {number} [updates.quantity] - Quantity
 * @param {string} [updates.unit] - Unit
 * @param {string} [updates.material_code] - Material code
 * @param {string} [updates.hs_code] - HS code (manual override)
 * @param {number} [updates.import_duty_rate] - Import duty rate (manual override)
 * @returns {Promise<Object>} Updated RFQ item object
 */
async function updateRfqItem(itemId, updates, tenantId) {
  const db = await connectDb();

  // Verify item exists and belongs to tenant
  const itemCheck = await db.query(
    `SELECT ri.* FROM rfq_items ri
     JOIN rfqs r ON ri.rfq_id = r.id
     WHERE ri.id = $1 AND r.tenant_id = $2`,
    [itemId, tenantId]
  );

  if (itemCheck.rows.length === 0) {
    throw new Error('RFQ item not found');
  }

  const existingItem = itemCheck.rows[0];

  // Build update payload
  const updatePayload = { ...existingItem, ...updates };

  // Determine if we should re-run HS mapping
  const descriptionChanged = updates.description !== undefined && updates.description !== existingItem.description;
  const materialCodeChanged = updates.material_code !== undefined && updates.material_code !== existingItem.material_code;
  const hsCodeCleared = updates.hs_code === null || updates.hs_code === '';

  // If user manually sets hs_code, treat as manual override
  if (updates.hs_code !== undefined && updates.hs_code !== null && updates.hs_code !== '') {
    updatePayload.hs_code = updates.hs_code;
    updatePayload.import_duty_rate = updates.import_duty_rate !== undefined ? updates.import_duty_rate : null;
    updatePayload.hs_match_source = 'MANUAL';
    updatePayload.hs_confidence = 1.0;
  } else if (hsCodeCleared || (descriptionChanged || materialCodeChanged) && !existingItem.hs_code) {
    // Re-run mapping if:
    // 1. HS code was explicitly cleared, OR
    // 2. Description/material changed AND no HS code currently exists
    await applyHsCodeSuggestion(updatePayload, { allowOverride: false });
  }

  // Check if origin_country, hs_code, or import_duty_rate changed - need to recalculate final duty
  const originChanged = updates.origin_country !== undefined && updates.origin_country !== existingItem.origin_country;
  const hsCodeChanged = updates.hs_code !== undefined && updates.hs_code !== existingItem.hs_code;
  const dutyRateChanged = updates.import_duty_rate !== undefined && updates.import_duty_rate !== existingItem.import_duty_rate;
  const needsDutyRecalc = originChanged || hsCodeChanged || dutyRateChanged;

  // Recalculate final duty if needed
  if (needsDutyRecalc) {
    const itemForDutyCalc = {
      ...updatePayload,
      origin_country: updatePayload.origin_country || existingItem.origin_country,
      hs_code: updatePayload.hs_code || existingItem.hs_code,
      import_duty_rate: updatePayload.import_duty_rate || existingItem.import_duty_rate,
      quantity: updatePayload.quantity || existingItem.quantity,
      unit_price: 0, // Will be calculated in pricing run
    };
    const itemWithFinalDuty = await calculateFinalDutyForItem(itemForDutyCalc);
    updatePayload.trade_agreement = itemWithFinalDuty.trade_agreement;
    updatePayload.final_import_duty_rate = itemWithFinalDuty.final_import_duty_rate;
    updatePayload.final_import_duty_amount = itemWithFinalDuty.final_import_duty_amount;
  }

  // Build dynamic update query
    const allowedFields = [
      'description',
      'quantity',
      'unit',
      'material_code',
      'line_number',
      'size_display',
      'size1_raw',
      'size2_raw',
      'hs_code',
      'import_duty_rate',
      'import_duty_amount',
      'hs_match_source',
      'hs_confidence',
      'origin_country',
      'trade_agreement',
      'final_import_duty_rate',
      'final_import_duty_amount',
      'needs_review',
      'quantity_source',
      'confidence',
      'supplier_options',
      'supplier_selected_option',
      'supplier_selected_at',
    ];
  const setClauses = [];
  const values = [];
  let paramCount = 1;

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key) && value !== undefined) {
        // Use value from updatePayload (which may have been modified by applyHsCodeSuggestion)
        let finalValue = updatePayload[key];
        if (key === 'supplier_options' && finalValue && typeof finalValue === 'object') {
          finalValue = JSON.stringify(finalValue);
        }
        setClauses.push(`${key} = $${paramCount}`);
        values.push(finalValue);
        paramCount++;
      }
    }

  // Also include HS fields if they were set by applyHsCodeSuggestion
  if (updatePayload.hs_code !== undefined && !setClauses.includes('hs_code')) {
    setClauses.push(`hs_code = $${paramCount}`);
    values.push(updatePayload.hs_code);
    paramCount++;
  }
  if (updatePayload.import_duty_rate !== undefined && !setClauses.includes('import_duty_rate')) {
    setClauses.push(`import_duty_rate = $${paramCount}`);
    values.push(updatePayload.import_duty_rate);
    paramCount++;
  }
  if (updatePayload.hs_match_source !== undefined && !setClauses.includes('hs_match_source')) {
    setClauses.push(`hs_match_source = $${paramCount}`);
    values.push(updatePayload.hs_match_source);
    paramCount++;
  }
  if (updatePayload.hs_confidence !== undefined && !setClauses.includes('hs_confidence')) {
    setClauses.push(`hs_confidence = $${paramCount}`);
    values.push(updatePayload.hs_confidence);
    paramCount++;
  }

  // Include final duty fields if they were calculated
  if (updatePayload.trade_agreement !== undefined && !setClauses.some(c => c.includes('trade_agreement'))) {
    setClauses.push(`trade_agreement = $${paramCount}`);
    values.push(updatePayload.trade_agreement);
    paramCount++;
  }
  if (updatePayload.final_import_duty_rate !== undefined && !setClauses.some(c => c.includes('final_import_duty_rate'))) {
    setClauses.push(`final_import_duty_rate = $${paramCount}`);
    values.push(updatePayload.final_import_duty_rate);
    paramCount++;
  }
  if (updatePayload.final_import_duty_amount !== undefined && !setClauses.some(c => c.includes('final_import_duty_amount'))) {
    setClauses.push(`final_import_duty_amount = $${paramCount}`);
    values.push(updatePayload.final_import_duty_amount);
    paramCount++;
  }

  if (setClauses.length === 0) {
    throw new Error('No valid fields to update');
  }

  // Add updated_at timestamp
  setClauses.push(`updated_at = NOW()`);

  // Add tenant ID and item ID as final params
  values.push(tenantId, itemId);

  const result = await db.query(
    `UPDATE rfq_items ri
     SET ${setClauses.join(', ')}
     FROM rfqs r
     WHERE ri.id = $${paramCount + 1} AND ri.rfq_id = r.id AND r.tenant_id = $${paramCount}
     RETURNING ri.*`,
    values
  );

  if (result.rows.length === 0) {
    throw new Error('Failed to update RFQ item');
  }

  return result.rows[0];
}

async function updateRfqItemSupplierSelection(rfqId, itemId, selection, tenantId) {
  const selectedOption = selection.selected_option || selection.supplier_selected_option || null;
  const supplierOptions = selection.supplier_options || selection.options || null;
  const selectedAt = selection.selected_at ? new Date(selection.selected_at) : new Date();

  if (!selectedOption || !['A', 'B', 'C'].includes(selectedOption)) {
    throw new Error('INVALID_SUPPLIER_OPTION');
  }

  return await withTenantContext(tenantId, async (client) => {
    const needsReviewCheck = await client.query(
      `SELECT COUNT(*) AS count
       FROM rfq_items ri
       JOIN rfqs r ON ri.rfq_id = r.id
       WHERE ri.rfq_id = $1 AND r.tenant_id = $2 AND ri.needs_review = true`,
      [rfqId, tenantId]
    );

    if (parseInt(needsReviewCheck.rows[0]?.count || 0, 10) > 0) {
      throw new Error('RFQ_ITEMS_NEED_REVIEW');
    }

    const result = await client.query(
      `UPDATE rfq_items ri
       SET supplier_options = COALESCE($1, ri.supplier_options),
           supplier_selected_option = $2,
           supplier_selected_at = $3,
           updated_at = NOW()
       FROM rfqs r
       WHERE ri.id = $4 AND ri.rfq_id = $5 AND r.id = ri.rfq_id AND r.tenant_id = $6
       RETURNING ri.*`,
      [
        supplierOptions ? JSON.stringify(supplierOptions) : null,
        selectedOption,
        selectedAt,
        itemId,
        rfqId,
        tenantId,
      ]
    );

    if (result.rows.length === 0) {
      throw new Error('RFQ_ITEM_NOT_FOUND');
    }

    return result.rows[0];
  });
}

/**
 * Bulk update supplier selection for all items in an RFQ
 * Sets supplier_selected_option to 'A' and stores supplier info in supplier_options
 * @param {string} rfqId - RFQ UUID
 * @param {string} supplierId - Supplier UUID to assign to all items
 * @param {string} tenantId - Tenant UUID (required)
 * @returns {Promise<{count: number}>} Number of items updated
 */
async function bulkUpdateSupplierSelection(rfqId, supplierId, tenantId) {
  return await withTenantContext(tenantId, async (client) => {
    // First get the supplier info
    const supplierResult = await client.query(
      `SELECT id, name, code, origin_type, country FROM suppliers WHERE id = $1 AND tenant_id = $2`,
      [supplierId, tenantId]
    );

    if (supplierResult.rows.length === 0) {
      throw new Error('SUPPLIER_NOT_FOUND');
    }

    const supplier = supplierResult.rows[0];

    // Build supplier_options JSON with supplier as option A
    const supplierOptions = {
      A: {
        supplier_id: supplier.id,
        supplier_name: supplier.name,
        supplier_code: supplier.code,
        origin_type: supplier.origin_type,
        country: supplier.country,
      }
    };

    // Update all items for this RFQ
    const result = await client.query(
      `UPDATE rfq_items
       SET supplier_selected_option = 'A',
           supplier_options = $1,
           updated_at = NOW()
       WHERE rfq_id = $2
       RETURNING id`,
      [JSON.stringify(supplierOptions), rfqId]
    );

    return { count: result.rowCount };
  });
}

/**
 * Deletes an RFQ item by ID
 * @param {string} itemId - RFQ item UUID
 * @param {string} tenantId - Tenant UUID (required)
 * @returns {Promise<boolean>} True if deletion was successful, false if item not found
 */
async function deleteRfqItem(itemId, tenantId) {
  try {
    // Use tenant context to ensure RLS policies are applied
    const result = await withTenantContext(tenantId, async (client) => {
      // Delete the item with tenant verification through parent RFQ
      // Use USING clause to join to rfqs table for tenant check
      // This handles cases where rfq_items.tenant_id might be NULL on older rows
      const query = `
        DELETE FROM rfq_items ri
        USING rfqs r
        WHERE ri.id = $1
          AND ri.rfq_id = r.id
          AND r.tenant_id = $2
        RETURNING ri.id
      `;

      return await client.query(query, [itemId, tenantId]);
    });

    // If no row was deleted, return false (item not found or wrong tenant)
    if (result.rows.length === 0) {
      console.log('[RFQ] Delete failed - item not found', {
        itemId,
        tenantId,
      });
      return false;
    }

    console.log('[RFQ] Item deleted successfully', {
      itemId,
      tenantId,
      deletedItemId: result.rows[0].id,
    });

    return true;
  } catch (error) {
    console.error('[RFQ] Error deleting RFQ item', {
      itemId,
      tenantId,
      message: error.message,
      stack: error.stack,
    });
    throw error;
  }
}

module.exports = {
  createRfqFromPayload,
  getAllRfqs,
  getRfqById,
  getRfqItems,
  addRfqItem,
  addRfqItemsBatch,
  deleteRfq,
  getRfqItemsWithPricing,
  updateRfq,
  updateRfqItem,
  updateRfqItemSupplierSelection,
  bulkUpdateSupplierSelection,
  deleteRfqItem,
  applyHsCodeSuggestion,
};
