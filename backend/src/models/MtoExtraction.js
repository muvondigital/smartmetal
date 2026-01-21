const { query } = require('../db/supabaseClient');

/**
 * MtoExtraction Model
 * Stores hierarchical MTO extraction results
 * Links to document_extractions for full document context
 */

class MtoExtraction {
  /**
   * Create a new MTO extraction record
   * @param {Object} data - MTO extraction data
   * @returns {Promise<Object>} Created MTO extraction record
   */
  static async create(data) {
    const {
      document_extraction_id,
      rfq_id = null,
      mto_structure, // Full hierarchical MTO structure (JSON)
      weight_verification, // Weight verification results (JSON)
      pricing_readiness, // Pricing readiness stats (JSON)
      confidence_score,
      extraction_notes
    } = data;

    const result = await query(
      `INSERT INTO mto_extractions (
        document_extraction_id,
        rfq_id,
        mto_structure,
        weight_verification,
        pricing_readiness,
        confidence_score,
        extraction_notes,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      RETURNING *`,
      [
        document_extraction_id,
        rfq_id,
        JSON.stringify(mto_structure),
        weight_verification ? JSON.stringify(weight_verification) : null,
        pricing_readiness ? JSON.stringify(pricing_readiness) : null,
        confidence_score,
        extraction_notes
      ]
    );

    if (result.rows.length === 0) {
      throw new Error('Failed to create MTO extraction: No rows returned');
    }

    const extraction = result.rows[0];
    
    // Parse JSONB fields back to objects
    if (extraction.mto_structure) {
      extraction.mto_structure = typeof extraction.mto_structure === 'string' 
        ? JSON.parse(extraction.mto_structure) 
        : extraction.mto_structure;
    }
    if (extraction.weight_verification) {
      extraction.weight_verification = typeof extraction.weight_verification === 'string'
        ? JSON.parse(extraction.weight_verification)
        : extraction.weight_verification;
    }
    if (extraction.pricing_readiness) {
      extraction.pricing_readiness = typeof extraction.pricing_readiness === 'string'
        ? JSON.parse(extraction.pricing_readiness)
        : extraction.pricing_readiness;
    }

    return extraction;
  }

  /**
   * Get MTO extraction by ID
   * @param {string} id - MTO extraction ID
   * @returns {Promise<Object>} MTO extraction record
   */
  static async getById(id) {
    const result = await query(
      `SELECT * FROM mto_extractions WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      throw new Error(`MTO extraction not found: ${id}`);
    }

    const extraction = result.rows[0];
    
    // Parse JSONB fields
    if (extraction.mto_structure && typeof extraction.mto_structure === 'object') {
      // Already parsed by pg
      extraction.mto_structure = extraction.mto_structure;
    }
    if (extraction.weight_verification && typeof extraction.weight_verification === 'object') {
      extraction.weight_verification = extraction.weight_verification;
    }
    if (extraction.pricing_readiness && typeof extraction.pricing_readiness === 'object') {
      extraction.pricing_readiness = extraction.pricing_readiness;
    }

    return extraction;
  }

  /**
   * Get MTO extraction by document extraction ID
   * @param {string} documentExtractionId - Document extraction ID
   * @returns {Promise<Object|null>} MTO extraction record or null
   */
  static async getByDocumentExtractionId(documentExtractionId) {
    const result = await query(
      `SELECT * FROM mto_extractions WHERE document_extraction_id = $1`,
      [documentExtractionId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const extraction = result.rows[0];
    
    // Parse JSONB fields if needed
    if (extraction.mto_structure && typeof extraction.mto_structure === 'object') {
      extraction.mto_structure = extraction.mto_structure;
    }
    if (extraction.weight_verification && typeof extraction.weight_verification === 'object') {
      extraction.weight_verification = extraction.weight_verification;
    }
    if (extraction.pricing_readiness && typeof extraction.pricing_readiness === 'object') {
      extraction.pricing_readiness = extraction.pricing_readiness;
    }

    return extraction;
  }

  /**
   * Get MTO extraction by RFQ ID
   * @param {string} rfqId - RFQ ID
   * @returns {Promise<Object|null>} MTO extraction record or null
   */
  static async getByRfqId(rfqId) {
    const result = await query(
      `SELECT * FROM mto_extractions WHERE rfq_id = $1`,
      [rfqId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const extraction = result.rows[0];
    
    // Parse JSONB fields if needed
    if (extraction.mto_structure && typeof extraction.mto_structure === 'object') {
      extraction.mto_structure = extraction.mto_structure;
    }
    if (extraction.weight_verification && typeof extraction.weight_verification === 'object') {
      extraction.weight_verification = extraction.weight_verification;
    }
    if (extraction.pricing_readiness && typeof extraction.pricing_readiness === 'object') {
      extraction.pricing_readiness = extraction.pricing_readiness;
    }

    return extraction;
  }

  /**
   * Link MTO extraction to RFQ
   * @param {string} mtoExtractionId - MTO extraction ID
   * @param {string} rfqId - RFQ ID
   * @returns {Promise<Object>} Updated MTO extraction record
   */
  static async linkToRFQ(mtoExtractionId, rfqId) {
    const result = await query(
      `UPDATE mto_extractions 
       SET rfq_id = $1, linked_at = NOW(), updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [rfqId, mtoExtractionId]
    );

    if (result.rows.length === 0) {
      throw new Error(`MTO extraction not found: ${mtoExtractionId}`);
    }

    const extraction = result.rows[0];
    
    // Parse JSONB fields if needed
    if (extraction.mto_structure && typeof extraction.mto_structure === 'object') {
      extraction.mto_structure = extraction.mto_structure;
    }
    if (extraction.weight_verification && typeof extraction.weight_verification === 'object') {
      extraction.weight_verification = extraction.weight_verification;
    }
    if (extraction.pricing_readiness && typeof extraction.pricing_readiness === 'object') {
      extraction.pricing_readiness = extraction.pricing_readiness;
    }

    return extraction;
  }

  /**
   * Update MTO extraction
   * @param {string} id - MTO extraction ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} Updated MTO extraction record
   */
  static async update(id, updates) {
    // Build dynamic UPDATE query
    const fields = [];
    const values = [];
    let paramIndex = 1;

    if (updates.mto_structure !== undefined) {
      fields.push(`mto_structure = $${paramIndex}`);
      values.push(JSON.stringify(updates.mto_structure));
      paramIndex++;
    }
    if (updates.weight_verification !== undefined) {
      fields.push(`weight_verification = $${paramIndex}`);
      values.push(updates.weight_verification ? JSON.stringify(updates.weight_verification) : null);
      paramIndex++;
    }
    if (updates.pricing_readiness !== undefined) {
      fields.push(`pricing_readiness = $${paramIndex}`);
      values.push(updates.pricing_readiness ? JSON.stringify(updates.pricing_readiness) : null);
      paramIndex++;
    }
    if (updates.confidence_score !== undefined) {
      fields.push(`confidence_score = $${paramIndex}`);
      values.push(updates.confidence_score);
      paramIndex++;
    }
    if (updates.extraction_notes !== undefined) {
      fields.push(`extraction_notes = $${paramIndex}`);
      values.push(updates.extraction_notes);
      paramIndex++;
    }
    if (updates.rfq_id !== undefined) {
      fields.push(`rfq_id = $${paramIndex}`);
      values.push(updates.rfq_id);
      paramIndex++;
    }

    if (fields.length === 0) {
      throw new Error('No fields to update');
    }

    fields.push(`updated_at = NOW()`);
    values.push(id); // For WHERE clause

    const result = await query(
      `UPDATE mto_extractions 
       SET ${fields.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      throw new Error(`MTO extraction not found: ${id}`);
    }

    const extraction = result.rows[0];
    
    // Parse JSONB fields if needed
    if (extraction.mto_structure && typeof extraction.mto_structure === 'object') {
      extraction.mto_structure = extraction.mto_structure;
    }
    if (extraction.weight_verification && typeof extraction.weight_verification === 'object') {
      extraction.weight_verification = extraction.weight_verification;
    }
    if (extraction.pricing_readiness && typeof extraction.pricing_readiness === 'object') {
      extraction.pricing_readiness = extraction.pricing_readiness;
    }

    return extraction;
  }

  /**
   * Get MTO extraction statistics
   * @param {Object} filters - Optional filters
   * @returns {Promise<Object>} Statistics
   */
  static async getStatistics(filters = {}) {
    let whereClause = '';
    const params = [];
    let paramIndex = 1;

    if (filters.startDate) {
      whereClause += ` AND created_at >= $${paramIndex}`;
      params.push(filters.startDate);
      paramIndex++;
    }

    if (filters.endDate) {
      whereClause += ` AND created_at <= $${paramIndex}`;
      params.push(filters.endDate);
      paramIndex++;
    }

    const result = await query(
      `SELECT * FROM mto_extractions 
       WHERE 1=1 ${whereClause}`,
      params
    );

    const data = result.rows;

    const total = data.length;
    const linked = data.filter(e => e.rfq_id !== null).length;
    const highConfidence = data.filter(e => e.confidence_score >= 0.9).length;
    const avgConfidence = total > 0
      ? data.reduce((sum, e) => sum + (parseFloat(e.confidence_score) || 0), 0) / total
      : 0;

    // Calculate average sections, items, portions
    const avgSections = total > 0
      ? data.reduce((sum, e) => {
          const mtoStructure = typeof e.mto_structure === 'string' 
            ? JSON.parse(e.mto_structure) 
            : e.mto_structure;
          const sections = mtoStructure?.sections || [];
          return sum + sections.length;
        }, 0) / total
      : 0;

    const avgItems = total > 0
      ? data.reduce((sum, e) => {
          const mtoStructure = typeof e.mto_structure === 'string'
            ? JSON.parse(e.mto_structure)
            : e.mto_structure;
          const sections = mtoStructure?.sections || [];
          const itemCount = sections.reduce((s, section) => {
            const subsections = section.subsections || [];
            return s + subsections.reduce((ss, sub) => {
              return ss + (sub.items?.length || 0);
            }, 0);
          }, 0);
          return sum + itemCount;
        }, 0) / total
      : 0;

    return {
      total,
      linked,
      link_rate: total > 0 ? (linked / total) * 100 : 0,
      confidence: {
        high: highConfidence,
        avg: avgConfidence
      },
      structure: {
        avg_sections: avgSections,
        avg_items: avgItems
      }
    };
  }
}

module.exports = MtoExtraction;
