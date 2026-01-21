// SmartMetal CPQ - A product from Muvon Digital, an innovation arm of Muvon Energy
// Developed by Muvon Digital, the innovation arm of Muvon Energy.
// Copyright (c) 2025 Muvon Energy. All rights reserved.
// Proprietary & Confidential — Not for distribution.

const express = require('express');
const router = express.Router();
const { tenantMiddleware } = require('../middleware/tenant');
const { log } = require('../utils/logger');
const rfqService = require('../services/rfqService');
const pricingService = require('../services/pricingService');
const approvalService = require('../services/approvalService');
// Price agreements removed (de-engineered)
const { matchMaterialsBatch } = require('../services/materialMatchService');
const { connectDb } = require('../db/supabaseClient');
const DocumentExtraction = require('../models/DocumentExtraction');

/**
 * Admin Routes
 * 
 * Internal-only admin endpoints for debugging and support.
 * 
 * Security: Guarded by ADMIN_API_ENABLED env flag.
 * TODO: Add proper authentication/authorization in production.
 */

// Admin API guard middleware
function adminGuard(req, res, next) {
  if (process.env.ADMIN_API_ENABLED !== 'true') {
    return res.status(403).json({
      error: 'Admin API is not enabled',
      message: 'Set ADMIN_API_ENABLED=true to enable admin endpoints'
    });
  }
  next();
}

// Apply admin guard to all routes
router.use(adminGuard);

// Apply tenant middleware (admin can work across tenants via X-Tenant-Code header)
router.use(tenantMiddleware);

/**
 * GET /api/admin/rfqs
 * Search RFQs with filters
 * 
 * Query params:
 * - tenantCode (optional, uses X-Tenant-Code header or default)
 * - clientName (optional)
 * - rfqNumber or rfqId (optional)
 * - status (optional)
 * - dateFrom, dateTo (optional)
 */
router.get('/rfqs', async (req, res) => {
  try {
    const { clientName, rfqNumber, rfqId, status, dateFrom, dateTo } = req.query;
    const tenantId = req.tenantId;
    const correlationId = req.correlationId;

    log.logInfo('Admin RFQ search started', {
      correlationId,
      tenantId,
      operation: 'admin_rfqs_search_start',
      filters: { clientName, rfqNumber, rfqId, status, dateFrom, dateTo }
    });

    const db = await connectDb();
    
    // Build query with filters
    let query = `
      SELECT 
        r.id,
        r.rfq_name as title,
        r.description,
        r.status,
        r.created_at,
        r.updated_at,
        r.project_type,
        p.id as project_id,
        p.name as project_name,
        c.id as client_id,
        c.name as client_name,
        (SELECT COUNT(*) FROM rfq_items WHERE rfq_id = r.id) as total_items
      FROM rfqs r
      JOIN projects p ON r.project_id = p.id
      JOIN clients c ON p.client_id = c.id
      WHERE r.tenant_id = $1
    `;
    
    const params = [tenantId];
    let paramCount = 1;

    if (rfqId) {
      paramCount++;
      query += ` AND r.id = $${paramCount}`;
      params.push(rfqId);
    }

    if (clientName) {
      paramCount++;
      query += ` AND c.name ILIKE $${paramCount}`;
      params.push(`%${clientName}%`);
    }

    if (status) {
      paramCount++;
      query += ` AND r.status = $${paramCount}`;
      params.push(status);
    }

    if (dateFrom) {
      paramCount++;
      query += ` AND r.created_at >= $${paramCount}`;
      params.push(dateFrom);
    }

    if (dateTo) {
      paramCount++;
      query += ` AND r.created_at <= $${paramCount}`;
      params.push(dateTo);
    }

    query += ` ORDER BY r.created_at DESC LIMIT 100`;

    const result = await db.query(query, params);
    
    log.logInfo('Admin RFQ search completed', {
      correlationId,
      tenantId,
      operation: 'admin_rfqs_search_end',
      resultCount: result.rows.length
    });

    res.json({
      rfqs: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    log.logError('Admin RFQ search failed', error, {
      correlationId: req.correlationId,
      tenantId: req.tenantId,
      operation: 'admin_rfqs_search_error'
    });
    res.status(500).json({
      error: 'Failed to search RFQs',
      details: error.message
    });
  }
});

/**
 * GET /api/admin/rfqs/:rfqId
 * Get detailed RFQ information including items, pricing runs, approvals, and agreements
 */
router.get('/rfqs/:rfqId', async (req, res) => {
  try {
    const { rfqId } = req.params;
    const tenantId = req.tenantId;
    const correlationId = req.correlationId;

    log.logInfo('Admin RFQ detail fetch', {
      correlationId,
      tenantId,
      rfqId,
      operation: 'admin_rfq_detail_fetch'
    });

    // Get RFQ header
    const rfq = await rfqService.getRfqById(rfqId, tenantId);
    
    // Get RFQ items
    const items = await rfqService.getRfqItems(rfqId, tenantId);
    
    // Get pricing runs
    const pricingRuns = await pricingService.getPricingRunsByRfqId(rfqId, tenantId);
    
    // Get approvals (via pricing runs)
    const approvals = [];
    for (const run of pricingRuns) {
      try {
        const history = await approvalService.getApprovalHistory(run.id, tenantId);
        if (history.history && history.history.length > 0) {
          approvals.push(...history.history.map(h => ({
            ...h,
            pricing_run_id: run.id
          })));
        }
      } catch (err) {
        // Skip if no approval history
      }
    }
    
    // Get linked price agreements (via pricing run items)
    const db = await connectDb();
    const agreementsResult = await db.query(`
      SELECT DISTINCT pa.*
      FROM price_agreements pa
      JOIN pricing_run_items pri ON pa.id = pri.price_agreement_id
      JOIN pricing_runs pr ON pri.pricing_run_id = pr.id
      WHERE pr.rfq_id = $1 AND pa.tenant_id = $2
    `, [rfqId, tenantId]);
    
    // Get document extraction metadata if available
    const extractionResult = await db.query(`
      SELECT id, file_name, extraction_method, confidence_score, created_at, needs_review
      FROM document_extractions
      WHERE related_rfq_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `, [rfqId]);
    
    const extraction = extractionResult.rows.length > 0 ? extractionResult.rows[0] : null;

    res.json({
      rfq,
      items,
      pricing_runs: pricingRuns.map(run => ({
        id: run.id,
        status: run.status,
        total_price: run.total_price,
        created_at: run.created_at,
        approval_status: run.approval_status
      })),
      approvals,
      agreements: agreementsResult.rows,
      extraction_metadata: extraction
    });
  } catch (error) {
    log.logError('Admin RFQ detail fetch failed', error, {
      correlationId: req.correlationId,
      tenantId: req.tenantId,
      rfqId: req.params.rfqId,
      operation: 'admin_rfq_detail_error'
    });
    
    if (error.message === 'RFQ not found') {
      return res.status(404).json({
        error: 'RFQ not found',
        rfq_id: req.params.rfqId
      });
    }
    
    res.status(500).json({
      error: 'Failed to fetch RFQ details',
      details: error.message
    });
  }
});

/**
 * POST /api/admin/rfqs/:rfqId/reextract
 * Re-run material matching for RFQ items
 * 
 * Note: This re-runs material matching only. Full document re-extraction
 * would require the original file, which is not stored.
 */
router.post('/rfqs/:rfqId/reextract', async (req, res) => {
  try {
    const { rfqId } = req.params;
    const tenantId = req.tenantId;
    const correlationId = req.correlationId;

    log.logInfo('Admin RFQ re-extract started', {
      correlationId,
      tenantId,
      rfqId,
      operation: 'admin_rfq_reextract_start'
    });

    // Get RFQ and verify it exists
    const rfq = await rfqService.getRfqById(rfqId, tenantId);
    
    // Get RFQ items
    const items = await rfqService.getRfqItems(rfqId, tenantId);
    
    if (items.length === 0) {
      return res.status(400).json({
        error: 'RFQ has no items to re-extract'
      });
    }

    // Re-run material matching for all items
    const itemsForMatching = items.map(item => ({
      description: item.description,
      quantity: item.quantity,
      unit: item.unit,
      size_display: item.size_display,
      size1_raw: item.size1_raw,
      size2_raw: item.size2_raw,
      material_code: item.material_code
    }));

    const materialMatches = await matchMaterialsBatch(itemsForMatching, {
      autoSelectThreshold: 90
    });

    // Update RFQ items with best matches
    const db = await connectDb();
    let updatedCount = 0;
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const matchResult = materialMatches[i];
      
      // Use auto_selected if available, otherwise use first match with score >= 90
      const bestMatch = matchResult?.auto_selected || 
        (matchResult?.matches && matchResult.matches.length > 0 && matchResult.matches[0].score >= 90 
          ? matchResult.matches[0] 
          : null);
      
      if (bestMatch && bestMatch.material_code) {
        await db.query(
          `UPDATE rfq_items SET material_code = $1 WHERE id = $2`,
          [bestMatch.material_code, item.id]
        );
        updatedCount++;
      }
    }

    log.logInfo('Admin RFQ re-extract completed', {
      correlationId,
      tenantId,
      rfqId,
      operation: 'admin_rfq_reextract_end',
      itemsProcessed: items.length,
      itemsUpdated: updatedCount
    });

    res.json({
      success: true,
      rfq_id: rfqId,
      items_processed: items.length,
      items_updated: updatedCount,
      matches: materialMatches.map((matchResult, idx) => ({
        item_index: idx,
        matches_count: matchResult?.matches?.length || 0,
        auto_selected: matchResult?.auto_selected || null,
        best_match: matchResult?.auto_selected || matchResult?.matches?.[0] || null
      }))
    });
  } catch (error) {
    log.logError('Admin RFQ re-extract failed', error, {
      correlationId: req.correlationId,
      tenantId: req.tenantId,
      rfqId: req.params.rfqId,
      operation: 'admin_rfq_reextract_error'
    });
    
    if (error.message === 'RFQ not found') {
      return res.status(404).json({
        error: 'RFQ not found',
        rfq_id: req.params.rfqId
      });
    }
    
    res.status(500).json({
      error: 'Failed to re-extract RFQ',
      details: error.message
    });
  }
});

/**
 * POST /api/admin/rfqs/:rfqId/reprice
 * Trigger a fresh pricing run for the RFQ
 */
router.post('/rfqs/:rfqId/reprice', async (req, res) => {
  try {
    const { rfqId } = req.params;
    const tenantId = req.tenantId;
    const correlationId = req.correlationId;

    log.logInfo('Admin RFQ re-price started', {
      correlationId,
      tenantId,
      rfqId,
      operation: 'admin_rfq_reprice_start'
    });

    // Create new pricing run using existing service
    const pricingRun = await pricingService.createPriceRunForRfq(rfqId, tenantId, {
      correlationId
    });

    log.logInfo('Admin RFQ re-price completed', {
      correlationId,
      tenantId,
      rfqId,
      pricingRunId: pricingRun.id,
      operation: 'admin_rfq_reprice_end'
    });

    res.json({
      success: true,
      pricing_run: {
        id: pricingRun.id,
        rfq_id: rfqId,
        status: pricingRun.status,
        total_price: pricingRun.total_price,
        created_at: pricingRun.created_at,
        item_count: pricingRun.items?.length || 0
      }
    });
  } catch (error) {
    log.logError('Admin RFQ re-price failed', error, {
      correlationId: req.correlationId,
      tenantId: req.tenantId,
      rfqId: req.params.rfqId,
      operation: 'admin_rfq_reprice_error'
    });
    
    if (error.message === 'RFQ not found') {
      return res.status(404).json({
        error: 'RFQ not found',
        rfq_id: req.params.rfqId
      });
    }
    
    if (error.message === 'RFQ has no items to price') {
      return res.status(400).json({
        error: 'RFQ has no items to price',
        details: error.message
      });
    }
    
    res.status(500).json({
      error: 'Failed to re-price RFQ',
      details: error.message
    });
  }
});

/**
 * GET /api/admin/pricing-runs/:pricingRunId
 * Get detailed pricing run information
 */
router.get('/pricing-runs/:pricingRunId', async (req, res) => {
  try {
    const { pricingRunId } = req.params;
    const tenantId = req.tenantId;
    const correlationId = req.correlationId;

    log.logInfo('Admin pricing run detail fetch', {
      correlationId,
      tenantId,
      pricingRunId,
      operation: 'admin_pricing_run_detail_fetch'
    });

    // Get pricing run with items
    const pricingRun = await pricingService.getPricingRunById(pricingRunId, tenantId);
    
    // Get approval history
    let approvalHistory = null;
    try {
      approvalHistory = await approvalService.getApprovalHistory(pricingRunId, tenantId);
    } catch (err) {
      // No approval history is okay
    }
    
    // Get linked agreements
    const db = await connectDb();
    const agreementsResult = await db.query(`
      SELECT DISTINCT pa.*
      FROM price_agreements pa
      JOIN pricing_run_items pri ON pa.id = pri.price_agreement_id
      WHERE pri.pricing_run_id = $1 AND pa.tenant_id = $2
    `, [pricingRunId, tenantId]);

    res.json({
      pricing_run: pricingRun,
      approval_history: approvalHistory,
      linked_agreements: agreementsResult.rows
    });
  } catch (error) {
    log.logError('Admin pricing run detail fetch failed', error, {
      correlationId: req.correlationId,
      tenantId: req.tenantId,
      pricingRunId: req.params.pricingRunId,
      operation: 'admin_pricing_run_detail_error'
    });
    
    if (error.message === 'Pricing run not found') {
      return res.status(404).json({
        error: 'Pricing run not found',
        pricing_run_id: req.params.pricingRunId
      });
    }
    
    res.status(500).json({
      error: 'Failed to fetch pricing run details',
      details: error.message
    });
  }
});

/**
 * GET /api/admin/agreements/:agreementId
 * Get detailed price agreement information
 */
router.get('/agreements/:agreementId', async (req, res) => {
  try {
    const { agreementId } = req.params;
    const tenantId = req.tenantId;
    const correlationId = req.correlationId;

    log.logInfo('Admin agreement detail fetch', {
      correlationId,
      tenantId,
      agreementId,
      operation: 'admin_agreement_detail_fetch'
    });

    // Price agreements removed (de-engineered)
    throw new Error('Price agreements have been removed');
    
    // Get related pricing run if available
    const db = await connectDb();
    const pricingRunResult = await db.query(`
      SELECT DISTINCT pr.*
      FROM pricing_runs pr
      JOIN pricing_run_items pri ON pr.id = pri.pricing_run_id
      WHERE pri.price_agreement_id = $1 AND pr.tenant_id = $2
      ORDER BY pr.created_at DESC
      LIMIT 1
    `, [agreementId, tenantId]);
    
    const relatedPricingRun = pricingRunResult.rows.length > 0 ? pricingRunResult.rows[0] : null;
    
    // Get related RFQ if available
    let relatedRfq = null;
    if (relatedPricingRun) {
      try {
        relatedRfq = await rfqService.getRfqById(relatedPricingRun.rfq_id, tenantId);
      } catch (err) {
        // RFQ not found is okay
      }
    }

    res.json({
      agreement,
      related_pricing_run: relatedPricingRun,
      related_rfq: relatedRfq
    });
  } catch (error) {
    log.logError('Admin agreement detail fetch failed', error, {
      correlationId: req.correlationId,
      tenantId: req.tenantId,
      agreementId: req.params.agreementId,
      operation: 'admin_agreement_detail_error'
    });
    
    if (error.message === 'Agreement not found') {
      return res.status(404).json({
        error: 'Agreement not found',
        agreement_id: req.params.agreementId
      });
    }
    
    res.status(500).json({
      error: 'Failed to fetch agreement details',
      details: error.message
    });
  }
});

module.exports = router;

