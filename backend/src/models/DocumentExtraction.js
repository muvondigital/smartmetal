const { query } = require('../db/supabaseClient');

/**
 * DocumentExtraction Model
 * Stores AI extraction results from RFQ documents and user corrections
 * Used for tracking extraction quality and building feedback loop
 */

class DocumentExtraction {
  /**
   * Create a new document extraction record
   * @param {Object} data - Extraction data
   * @returns {Promise<Object>} Created extraction record
   */
  static async create(data) {
    const {
      uploaded_by_user_id,
      file_name,
      file_type,
      file_size_bytes,
      extraction_method, // 'azure_doc_intelligence', 'gpt4_enrichment', 'manual'
      extracted_data, // JSON: metadata + items
      confidence_score,
      validation_issues, // JSON: array of issues
      needs_review,
      related_rfq_id = null,
      tenant_id = null,
      blob_url = null,
      blob_name = null
    } = data;

    const result = await query(
      `INSERT INTO document_extractions (
        uploaded_by_user_id,
        file_name,
        file_type,
        file_size_bytes,
        extraction_method,
        extracted_data,
        confidence_score,
        validation_issues,
        needs_review,
        related_rfq_id,
        tenant_id,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
      RETURNING *`,
      [
        uploaded_by_user_id || null,
        file_name,
        file_type,
        file_size_bytes || null,
        extraction_method || 'azure_doc_intelligence',
        JSON.stringify(extracted_data),
        confidence_score || null,
        validation_issues ? JSON.stringify(validation_issues) : JSON.stringify([]),
        needs_review !== undefined ? needs_review : false,
        related_rfq_id || null,
        tenant_id || null
      ]
    );

    if (result.rows.length === 0) {
      throw new Error('Failed to create document extraction: No rows returned');
    }

    const extraction = result.rows[0];
    
    // Parse JSONB fields back to objects
    if (extraction.extracted_data && typeof extraction.extracted_data === 'object') {
      // Already parsed by pg
      extraction.extracted_data = extraction.extracted_data;
    }
    if (extraction.validation_issues && typeof extraction.validation_issues === 'object') {
      extraction.validation_issues = extraction.validation_issues;
    }
    if (extraction.corrected_data && typeof extraction.corrected_data === 'object') {
      extraction.corrected_data = extraction.corrected_data;
    }

    return extraction;
  }

  /**
   * Get extraction by ID
   * @param {string} id - Extraction ID
   * @returns {Promise<Object>} Extraction record
   */
  static async getById(id) {
    const result = await query(
      `SELECT * FROM document_extractions WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      throw new Error(`Document extraction not found: ${id}`);
    }

    const extraction = result.rows[0];
    
    // JSONB fields are already parsed by pg driver
    return extraction;
  }

  /**
   * Get all extractions for a user
   * @param {string} userId - User ID
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Array of extraction records
   */
  static async getByUser(userId, options = {}) {
    const {
      limit = 50,
      offset = 0,
      needsReviewOnly = false
    } = options;

    let whereClause = 'WHERE uploaded_by_user_id = $1';
    const params = [userId];
    let paramIndex = 2;

    if (needsReviewOnly) {
      whereClause += ` AND needs_review = $${paramIndex}`;
      params.push(true);
      paramIndex++;
    }

    const result = await query(
      `SELECT * FROM document_extractions 
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    );

    return result.rows || [];
  }

  /**
   * Update extraction with user corrections
   * @param {string} id - Extraction ID
   * @param {Object} corrections - Corrected data
   * @returns {Promise<Object>} Updated extraction record
   */
  static async updateWithCorrections(id, corrections) {
    const {
      corrected_data,
      reviewed_by_user_id,
      review_notes
    } = corrections;

    const result = await query(
      `UPDATE document_extractions 
       SET corrected_data = $1,
           reviewed_by_user_id = $2,
           reviewed_at = NOW(),
           review_notes = $3,
           needs_review = false,
           updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [
        corrected_data ? JSON.stringify(corrected_data) : null,
        reviewed_by_user_id || null,
        review_notes || null,
        id
      ]
    );

    if (result.rows.length === 0) {
      throw new Error(`Document extraction not found: ${id}`);
    }

    return result.rows[0];
  }

  /**
   * Link extraction to created RFQ
   * @param {string} extractionId - Extraction ID
   * @param {string} rfqId - RFQ ID
   * @returns {Promise<Object>} Updated extraction record
   */
  static async linkToRFQ(extractionId, rfqId) {
    const result = await query(
      `UPDATE document_extractions 
       SET related_rfq_id = $1,
           converted_to_rfq = true,
           converted_at = NOW(),
           tenant_id = COALESCE(
             tenant_id,
             (SELECT tenant_id FROM rfqs WHERE id = $1 LIMIT 1)
           ),
           updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [rfqId, extractionId]
    );

    if (result.rows.length === 0) {
      throw new Error(`Document extraction not found: ${extractionId}`);
    }

    return result.rows[0];
  }

  /**
   * Get extraction statistics
   * @param {Object} filters - Optional filters (userId, dateRange, etc.)
   * @returns {Promise<Object>} Statistics
   */
  static async getStatistics(filters = {}) {
    let whereClause = '';
    const params = [];
    let paramIndex = 1;

    if (filters.userId) {
      whereClause += ` WHERE uploaded_by_user_id = $${paramIndex}`;
      params.push(filters.userId);
      paramIndex++;
    }

    if (filters.startDate) {
      const prefix = whereClause ? ' AND' : ' WHERE';
      whereClause += `${prefix} created_at >= $${paramIndex}`;
      params.push(filters.startDate);
      paramIndex++;
    }

    if (filters.endDate) {
      const prefix = whereClause ? ' AND' : ' WHERE';
      whereClause += `${prefix} created_at <= $${paramIndex}`;
      params.push(filters.endDate);
      paramIndex++;
    }

    const result = await query(
      `SELECT * FROM document_extractions ${whereClause}`,
      params
    );

    const data = result.rows;

    // Calculate statistics
    const total = data.length;
    const highConfidence = data.filter(e => parseFloat(e.confidence_score) >= 0.9).length;
    const mediumConfidence = data.filter(e => {
      const score = parseFloat(e.confidence_score);
      return score >= 0.7 && score < 0.9;
    }).length;
    const lowConfidence = data.filter(e => parseFloat(e.confidence_score) < 0.7).length;
    const converted = data.filter(e => e.converted_to_rfq).length;
    const needsReview = data.filter(e => e.needs_review).length;
    const reviewed = data.filter(e => e.reviewed_at !== null).length;

    const avgConfidence = total > 0
      ? data.reduce((sum, e) => sum + (parseFloat(e.confidence_score) || 0), 0) / total
      : 0;

    return {
      total,
      confidence_distribution: {
        high: highConfidence,
        medium: mediumConfidence,
        low: lowConfidence
      },
      conversion: {
        converted,
        conversion_rate: total > 0 ? (converted / total) * 100 : 0
      },
      review: {
        needs_review: needsReview,
        reviewed,
        review_rate: total > 0 ? (reviewed / total) * 100 : 0
      },
      avg_confidence: avgConfidence
    };
  }

  /**
   * Delete extraction
   * @param {string} id - Extraction ID
   * @returns {Promise<void>}
   */
  static async delete(id) {
    const result = await query(
      `DELETE FROM document_extractions WHERE id = $1`,
      [id]
    );

    if (result.rowCount === 0) {
      throw new Error(`Document extraction not found: ${id}`);
    }
  }
}

module.exports = DocumentExtraction;
