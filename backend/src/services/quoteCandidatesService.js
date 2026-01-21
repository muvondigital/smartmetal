/**
 * Quote Candidates Service
 * 
 * Manages quote candidates (approved pricing runs) that can be converted to Price Agreements.
 * Bridges the workflow between approved quotes and Price Agreement dashboard.
 */

const { connectDb } = require('../db/supabaseClient');
const { withTenantContext } = require('../db/tenantContext');

/**
 * Get quote candidates for a tenant
 * @param {string} tenantId - Tenant UUID (required)
 * @param {Object} options - Query options
 * @param {string} options.status - Filter by status (pending, converted, dismissed)
 * @returns {Promise<Array>} Quote candidates with pricing run details
 */
async function getQuoteCandidates(tenantId, options = {}) {
  if (!tenantId || typeof tenantId !== 'string' || tenantId.trim() === '') {
    throw new Error('tenantId is required and must be a valid UUID string');
  }

  const { status } = options;

  return await withTenantContext(tenantId, async (client) => {
    let query = `
      SELECT 
        qc.*,
        pr.version_number,
        pr.is_current,
        pr.approval_status,
        pr.approved_at,
        pr.approved_by,
        r.rfq_number,
        r.rfq_name
      FROM quote_candidates qc
      JOIN pricing_runs pr ON qc.pricing_run_id = pr.id
      JOIN rfqs r ON qc.rfq_id = r.id
      WHERE qc.tenant_id = $1::uuid
    `;
    const params = [tenantId];

    if (status) {
      query += ` AND qc.status = $2`;
      params.push(status);
    }

    query += ` ORDER BY qc.created_at DESC, pr.version_number DESC`;

    const result = await client.query(query, params);
    return result.rows;
  });
}

/**
 * Update quote candidate status
 * @param {string} candidateId - Quote candidate UUID
 * @param {string} tenantId - Tenant UUID (required)
 * @param {Object} updates - Update fields
 * @param {string} updates.status - New status (pending, converted, dismissed)
 * @param {string} updates.converted_price_agreement_id - Price agreement ID if converted
 * @returns {Promise<Object>} Updated quote candidate
 */
async function updateQuoteCandidateStatus(candidateId, tenantId, updates) {
  if (!candidateId || typeof candidateId !== 'string' || candidateId.trim() === '') {
    throw new Error('candidateId is required and must be a valid UUID string');
  }
  if (!tenantId || typeof tenantId !== 'string' || tenantId.trim() === '') {
    throw new Error('tenantId is required and must be a valid UUID string');
  }

  const { status, converted_price_agreement_id } = updates;

  if (!status || !['pending', 'converted', 'dismissed'].includes(status)) {
    throw new Error('status must be one of: pending, converted, dismissed');
  }

  return await withTenantContext(tenantId, async (client) => {
    // First verify the candidate belongs to this tenant
    const checkResult = await client.query(
      `SELECT id FROM quote_candidates WHERE id = $1::uuid AND tenant_id = $2::uuid`,
      [candidateId, tenantId]
    );

    if (checkResult.rows.length === 0) {
      throw new Error('Quote candidate not found or access denied');
    }

    // Build update query
    const updateFields = [];
    const updateParams = [];
    let paramIndex = 1;

    updateFields.push(`status = $${paramIndex++}`);
    updateParams.push(status);

    if (converted_price_agreement_id) {
      updateFields.push(`converted_price_agreement_id = $${paramIndex++}`);
      updateParams.push(converted_price_agreement_id);
    }

    updateFields.push(`updated_at = NOW()`);

    updateParams.push(candidateId, tenantId);

    const updateQuery = `
      UPDATE quote_candidates
      SET ${updateFields.join(', ')}
      WHERE id = $${paramIndex++}::uuid AND tenant_id = $${paramIndex++}::uuid
      RETURNING *
    `;

    const result = await client.query(updateQuery, updateParams);
    
    if (result.rows.length === 0) {
      throw new Error('Failed to update quote candidate');
    }

    return result.rows[0];
  });
}

/**
 * Get quote candidate by ID
 * @param {string} candidateId - Quote candidate UUID
 * @param {string} tenantId - Tenant UUID (required)
 * @returns {Promise<Object>} Quote candidate with pricing run details
 */
async function getQuoteCandidateById(candidateId, tenantId) {
  if (!candidateId || typeof candidateId !== 'string' || candidateId.trim() === '') {
    throw new Error('candidateId is required and must be a valid UUID string');
  }
  if (!tenantId || typeof tenantId !== 'string' || tenantId.trim() === '') {
    throw new Error('tenantId is required and must be a valid UUID string');
  }

  return await withTenantContext(tenantId, async (client) => {
    const result = await client.query(
      `SELECT 
        qc.*,
        pr.version_number,
        pr.is_current,
        pr.approval_status,
        pr.approved_at,
        pr.approved_by,
        r.rfq_number,
        r.rfq_name
      FROM quote_candidates qc
      JOIN pricing_runs pr ON qc.pricing_run_id = pr.id
      JOIN rfqs r ON qc.rfq_id = r.id
      WHERE qc.id = $1::uuid AND qc.tenant_id = $2::uuid`,
      [candidateId, tenantId]
    );

    if (result.rows.length === 0) {
      throw new Error('Quote candidate not found');
    }

    return result.rows[0];
  });
}

module.exports = {
  getQuoteCandidates,
  updateQuoteCandidateStatus,
  getQuoteCandidateById,
};

