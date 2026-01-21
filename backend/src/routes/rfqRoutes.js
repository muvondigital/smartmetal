const express = require('express');
const router = express.Router();
const rfqService = require('../services/rfqService');
const pricingService = require('../services/pricingService');
const { tenantMiddleware } = require('../middleware/tenant');
const { optionalAuth } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');

// Apply optional auth middleware (extracts tenant from JWT if available)
// This allows tenant middleware to use JWT tenant info (Strategy 1)
router.use(optionalAuth);

// Apply tenant middleware to all routes
router.use(tenantMiddleware);

/**
 * GET /api/rfqs
 * Get all RFQs
 */
router.get('/', async (req, res) => {
  try {
    // Development logging
    if (process.env.NODE_ENV === 'development') {
      console.log('[RFQ] List handler hit', {
        path: req.path,
        method: req.method,
        tenantId: req.tenantId,
        tenantCode: req.tenantCode,
        userEmail: req.user && req.user.email,
      });
    }
    
    const rfqs = await rfqService.getAllRfqs(req.tenantId);
    res.json(rfqs);
  } catch (error) {
    console.error('[RFQ] Error loading RFQs', {
      error: error.message,
      stack: error.stack,
      tenantId: req.tenantId,
      tenantCode: req.tenantCode,
    });
    res.status(500).json({ 
      error: 'Failed to fetch RFQs', 
      details: error.message 
    });
  }
});

/**
 * POST /api/rfqs
 * Create a new RFQ
 * Accepts either:
 *   - { customer_name: string } - Simple payload from frontend
 *   - { client_id: string, project_id: string, title?: string, description?: string } - Detailed payload
 */
router.post('/', async (req, res) => {
  try {
    const payload = req.body;

    // Validation: must have either customer_name or both client_id and project_id
    if (!payload.customer_name && (!payload.client_id || !payload.project_id)) {
      return res.status(400).json({ 
        error: 'Invalid payload', 
        details: 'Either customer_name or both client_id and project_id must be provided' 
      });
    }

    const rfq = await rfqService.createRfqFromPayload(payload, req.tenantId, {
      correlationId: req.correlationId,
      tenantCode: req.tenantCode,
    });
    res.status(201).json(rfq);
  } catch (error) {
    console.error('Error creating RFQ:', error);
    res.status(500).json({ 
      error: 'Failed to create RFQ', 
      details: error.message 
    });
  }
});

/**
 * GET /api/rfqs/:id/items
 * Get all items for an RFQ
 * IMPORTANT: This route must come before GET /:id to avoid route conflicts
 * 
 * Response includes HS Code fields (Phase 3):
 * - hs_code: HS code string (nullable) - may be null if no mapping exists or user hasn't set it
 * - import_duty_rate: Import duty percentage (nullable, numeric) - e.g., 15 means 15%
 * - import_duty_amount: Calculated import duty amount (nullable, numeric) - in same currency as RFQ prices
 * - hs_match_source: Match source indicator (nullable) - "RULE", "MAPPING", "DIRECT_HS", "MANUAL", or "NONE"
 *   - Can be used for UI badges: AUTO (RULE/MAPPING/DIRECT_HS), MANUAL, or NONE
 * - hs_confidence: Confidence score 0-1 (nullable, numeric) - quality indicator for automatic suggestions
 */
router.get('/:id/items', async (req, res) => {
  try {
    console.log('[RFQ ITEMS] tenant/resolution', {
      tenantId: req.tenantId,
      tenantCode: req.tenantCode,
      rfqId: req.params.id,
      headers: {
        'x-tenant-code': req.headers['x-tenant-code'],
        authorization: req.headers['authorization'] ? 'present' : 'missing',
      },
    });
    // Validate tenantId is present
    if (!req.tenantId || req.tenantId === '') {
      console.error('[RFQ Items] ERROR: req.tenantId is missing or empty', {
        path: req.path,
        method: req.method,
        tenantId: req.tenantId,
        tenantCode: req.tenantCode,
        userEmail: req.user && req.user.email,
        headers: {
          'x-tenant-code': req.headers['x-tenant-code'],
          authorization: req.headers.authorization ? 'present' : 'missing',
        },
      });
      return res.status(500).json({
        error: 'Tenant context is missing',
        details: 'req.tenantId is empty. Please ensure you are authenticated and tenant middleware is working correctly.',
      });
    }
    
    // Validate rfqId parameter before calling service
    const rfqId = req.params.id;
    if (!rfqId || rfqId === '' || typeof rfqId !== 'string' || rfqId.trim() === '') {
      return res.status(400).json({
        error: 'Invalid RFQ ID',
        details: 'RFQ ID is required and must be a valid UUID string',
      });
    }
    
    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const trimmedRfqId = rfqId.trim();
    if (!uuidRegex.test(trimmedRfqId)) {
      return res.status(400).json({
        error: 'Invalid RFQ ID format',
        details: `RFQ ID "${rfqId}" is not a valid UUID format`,
      });
    }
    
    // Double-check tenantId is valid before calling service
    if (!req.tenantId || req.tenantId === '' || typeof req.tenantId !== 'string' || req.tenantId.trim() === '') {
      console.error('[RFQ Items] ERROR: req.tenantId is invalid after validation', {
        tenantId: req.tenantId,
        tenantCode: req.tenantCode,
      });
      return res.status(500).json({
        error: 'Tenant context is invalid',
        details: 'req.tenantId is empty or invalid. Please ensure you are authenticated and tenant middleware is working correctly.',
      });
    }
    
    const items = await rfqService.getRfqItems(trimmedRfqId, req.tenantId.trim());
    res.json(items);
  } catch (error) {
    console.error('Error fetching RFQ items:', error);
    
    // Handle specific error types from service layer
    if (error.message === 'TENANT_ID_MISSING_IN_GET_RFQ_ITEMS') {
      console.error('[RFQ Items] Service layer detected missing tenant ID', {
        tenantId: req.tenantId,
      });
      return res.status(500).json({
        error: 'Tenant context is missing',
        details: 'req.tenantId was empty when calling getRfqItems',
      });
    }
    
    if (error.message === 'RFQ_ID_INVALID_IN_GET_RFQ_ITEMS') {
      return res.status(400).json({
        error: 'Invalid RFQ ID',
        details: 'RFQ ID is required and must be a valid UUID string',
      });
    }
    
    res.status(500).json({
      error: 'Failed to fetch RFQ items',
      details: error.message,
    });
  }
});

/**
 * GET /api/rfqs/:id/items-with-pricing
 * Get all items for an RFQ with pricing information from the latest pricing run
 * Returns enriched line items showing:
 * - Base material information
 * - Latest pricing (if available)
 * - Pricing method (agreement vs rule-based)
 * - Price agreement details (if applicable)
 */
router.get('/:id/items-with-pricing', async (req, res) => {
  try {
    // Validate rfqId parameter before calling service
    const rfqId = req.params.id;
    if (!rfqId || rfqId === '' || typeof rfqId !== 'string' || rfqId.trim() === '') {
      console.warn(`[RFQ Items With Pricing] Invalid rfqId parameter: ${JSON.stringify(rfqId)}`);
      return res.json([]);
    }

    // Validate tenantId before calling service
    if (!req.tenantId || req.tenantId === '' || typeof req.tenantId !== 'string' || req.tenantId.trim() === '') {
      console.warn(`[RFQ Items With Pricing] Invalid tenantId: ${JSON.stringify(req.tenantId)}`);
      return res.json([]);
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const trimmedRfqId = rfqId.trim();
    if (!uuidRegex.test(trimmedRfqId)) {
      console.warn(`[RFQ Items With Pricing] Invalid rfqId format: "${rfqId}"`);
      return res.json([]);
    }

    const itemsWithPricing = await rfqService.getRfqItemsWithPricing(trimmedRfqId, req.tenantId.trim());
    res.json(itemsWithPricing);
  } catch (error) {
    console.warn('Error fetching RFQ items with pricing (returning empty array):', error.message);
    // Return empty array instead of error to allow page to continue loading
    // This is non-critical data that shouldn't block the RFQ detail page
    res.json([]);
  }
});

/**
 * POST /api/rfqs/:id/items
 * Add an item to an RFQ
 * IMPORTANT: This route must come before POST /:id to avoid route conflicts
 * 
 * Request body may include (all optional):
 * - hs_code: Manual HS code override (string)
 * - import_duty_rate: Manual import duty rate override (number, percentage)
 * 
 * If hs_code is not provided, the system will attempt automatic mapping based on description.
 * Response includes all HS Code fields as documented in GET /:id/items.
 */
router.post('/:id/items', async (req, res) => {
  try {
    const payload = req.body;

    // Validation
    if (!payload.description || payload.quantity === undefined || !payload.unit) {
      return res.status(400).json({
        error: 'Invalid payload',
        details: 'description, quantity, and unit are required',
      });
    }

    const item = await rfqService.addRfqItem(req.params.id, payload, req.tenantId);
    res.status(201).json(item);
  } catch (error) {
    console.error('Error adding RFQ item:', error);
    
    // Handle foreign key violation - RFQ not found for tenant
    if (error.message === 'RFQ_NOT_FOUND_FOR_TENANT') {
      return res.status(404).json({
        error: 'RFQ not found',
        rfq_id: req.params.id,
      });
    }
    
    // Legacy error message support
    if (error.message === 'RFQ not found') {
      return res.status(404).json({
        error: 'RFQ not found',
        rfq_id: req.params.id,
      });
    }
    
    res.status(500).json({
      error: 'Failed to add RFQ item',
      details: error.message,
    });
  }
});

/**
 * POST /api/rfqs/:id/price-run
 * Create a pricing run for an RFQ
 * IMPORTANT: This route must come before POST /:id to avoid route conflicts
 */
router.post('/:id/price-run', async (req, res) => {
  try {
    const pricingRun = await pricingService.createPriceRunForRfq(req.params.id, req.tenantId);
    res.status(201).json(pricingRun);
  } catch (error) {
    console.error('Error creating pricing run:', error);
    if (error.message === 'RFQ not found') {
      return res.status(404).json({
        error: 'RFQ not found',
        rfq_id: req.params.id,
      });
    }
    if (error.message === 'RFQ has no items to price') {
      return res.status(400).json({
        error: 'RFQ has no items to price',
        details: error.message,
      });
    }
    res.status(500).json({
      error: 'Failed to create pricing run',
      details: error.message,
    });
  }
});

/**
 * GET /api/rfqs/:id
 * Get a single RFQ by ID
 * IMPORTANT: This route must come AFTER more specific routes like /:id/items
 */
router.get('/:id', async (req, res) => {
  try {
    const rfq = await rfqService.getRfqById(req.params.id, req.tenantId);
    res.json(rfq);
  } catch (error) {
    console.error('Error fetching RFQ:', error);
    if (error.message === 'RFQ not found') {
      res.status(404).json({ 
        error: 'RFQ not found', 
        details: error.message 
      });
    } else {
      res.status(500).json({ 
        error: 'Failed to fetch RFQ', 
        details: error.message 
      });
    }
  }
});

/**
 * PUT /api/rfqs/:id
 * Update an RFQ by ID
 * Allows updating title, description, and status
 * IMPORTANT: This route must come AFTER more specific routes like /:id/items
 */
router.put('/:id', async (req, res) => {
  try {
    const { title, description, status } = req.body;
    const updates = {};

    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (status !== undefined) updates.status = status;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        error: 'Invalid payload',
        details: 'At least one field (title, description, or status) must be provided',
      });
    }

    const rfq = await rfqService.updateRfq(req.params.id, updates, req.tenantId);
    res.json(rfq);
  } catch (error) {
    console.error('Error updating RFQ:', error);
    if (error instanceof AppError && error.code === 'WORKFLOW_CONTRACT_VIOLATION') {
      return res.status(error.statusCode || 400).json({
        error: {
          code: error.code,
          message: error.message,
          details: {
            rfq_id: req.params.id,
            ...(error.details || {}),
          },
        },
      });
    }
    if (error.message === 'RFQ not found') {
      return res.status(404).json({
        error: 'RFQ not found',
        id: req.params.id,
      });
    }
    if (error.message === 'No valid fields to update') {
      return res.status(400).json({
        error: 'Invalid update',
        details: error.message,
      });
    }
    res.status(500).json({
      error: 'Failed to update RFQ',
      details: error.message,
    });
  }
});

/**
 * PUT /api/rfqs/:id/items/:itemId
 * Update an RFQ item by ID
 * Allows updating description, quantity, unit, material_code, and HS code fields
 * IMPORTANT: This route must come BEFORE DELETE /:id to avoid route conflicts
 */
router.put('/:id/items/:itemId', async (req, res) => {
  try {
    const { itemId } = req.params;
    const rfqId = req.params.id;
    const updates = req.body;

    // Validate that at least one field is provided
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
      'origin_country',
      'needs_review',
      'quantity_source',
      'confidence',
      'supplier_options',
      'supplier_selected_option',
      'supplier_selected_at',
    ];

    const hasValidField = Object.keys(updates).some(key => allowedFields.includes(key));
    if (!hasValidField) {
      return res.status(400).json({
        error: 'Invalid payload',
        details: 'At least one valid field must be provided',
        allowedFields,
      });
    }

    // Gate 3: Check if RFQ has a locked pricing run
    await pricingService.assertRfqNotLocked(rfqId, req.tenantId);

    const item = await rfqService.updateRfqItem(itemId, updates, req.tenantId);
    res.json(item);
  } catch (error) {
    console.error('Error updating RFQ item:', error);
    if (error.code === 'PRICING_RUN_LOCKED') {
      return res.status(409).json({
        error: 'RFQ is locked',
        code: 'PRICING_RUN_LOCKED',
        message: error.message,
        details: error.details,
      });
    }
    if (error.message === 'RFQ item not found') {
      return res.status(404).json({
        error: 'RFQ item not found',
        item_id: req.params.itemId,
      });
    }
    if (error.message === 'No valid fields to update') {
      return res.status(400).json({
        error: 'Invalid update',
        details: error.message,
      });
    }
    res.status(500).json({
      error: 'Failed to update RFQ item',
      details: error.message,
    });
  }
});

/**
 * PUT /api/rfqs/:id/items/:itemId/supplier-selection
 * Save supplier selection for an RFQ item
 */
router.put('/:id/items/:itemId/supplier-selection', async (req, res) => {
  try {
    const { itemId } = req.params;
    const rfqId = req.params.id;
    const { selected_option, supplier_options, selected_at } = req.body || {};

    if (!selected_option || !['A', 'B', 'C'].includes(selected_option)) {
      return res.status(400).json({
        error: 'Invalid supplier option',
        details: 'selected_option must be one of: A, B, C',
      });
    }

    // Gate 3: Check if RFQ has a locked pricing run
    await pricingService.assertRfqNotLocked(rfqId, req.tenantId);

    const item = await rfqService.updateRfqItemSupplierSelection(
      rfqId,
      itemId,
      { selected_option, supplier_options, selected_at },
      req.tenantId
    );

    res.json(item);
  } catch (error) {
    console.error('Error updating supplier selection:', error);
    if (error.code === 'PRICING_RUN_LOCKED') {
      return res.status(409).json({
        error: 'RFQ is locked',
        code: 'PRICING_RUN_LOCKED',
        message: error.message,
        details: error.details,
      });
    }
    if (error.message === 'RFQ_ITEMS_NEED_REVIEW') {
      return res.status(409).json({
        error: 'Items require review',
        details: 'Resolve needs_review flags before selecting suppliers',
      });
    }
    if (error.message === 'INVALID_SUPPLIER_OPTION') {
      return res.status(400).json({
        error: 'Invalid supplier option',
        details: 'selected_option must be one of: A, B, C',
      });
    }
    if (error.message === 'RFQ_ITEM_NOT_FOUND') {
      return res.status(404).json({
        error: 'RFQ item not found',
        item_id: itemId,
      });
    }
    res.status(500).json({
      error: 'Failed to update supplier selection',
      details: error.message,
    });
  }
});

/**
 * PUT /api/rfqs/:id/items/bulk-supplier-selection
 * Bulk update supplier selection for all RFQ items
 * IMPORTANT: This route must come BEFORE DELETE /:id to avoid route conflicts
 */
router.put('/:id/items/bulk-supplier-selection', async (req, res) => {
  try {
    const rfqId = req.params.id;
    const { supplier_id } = req.body || {};

    if (!supplier_id) {
      return res.status(400).json({
        error: 'Missing supplier_id',
        details: 'supplier_id is required for bulk supplier selection',
      });
    }

    // Gate 3: Check if RFQ has a locked pricing run
    await pricingService.assertRfqNotLocked(rfqId, req.tenantId);

    // Bulk update all items for this RFQ
    const result = await rfqService.bulkUpdateSupplierSelection(
      rfqId,
      supplier_id,
      req.tenantId
    );

    res.json({
      success: true,
      updated_count: result.count,
      supplier_id,
    });
  } catch (error) {
    console.error('Error bulk updating supplier selection:', error);
    if (error.code === 'PRICING_RUN_LOCKED') {
      return res.status(409).json({
        error: 'RFQ is locked',
        code: 'PRICING_RUN_LOCKED',
        message: error.message,
        details: error.details,
      });
    }
    res.status(500).json({
      error: 'Failed to bulk update supplier selection',
      details: error.message,
    });
  }
});

/**
 * DELETE /api/rfqs/:id/items/:itemId
 * Delete an RFQ item by ID
 * Tenant-safe deletion - verifies item belongs to tenant
 * IMPORTANT: This route must come BEFORE DELETE /:id to avoid route conflicts
 */
router.delete('/:id/items/:itemId', async (req, res) => {
  try {
    const { itemId } = req.params;

    // Validate itemId format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(itemId)) {
      return res.status(400).json({
        error: 'Invalid item ID format',
        details: `Item ID "${itemId}" is not a valid UUID format`,
      });
    }

    // Log delete request for debugging
    console.log('[RFQ ITEMS] Delete request', {
      rfqId: req.params.id,
      itemId,
      tenantId: req.tenantId,
      tenantCode: req.tenantCode,
      userEmail: req.user && req.user.email,
    });

    const deleted = await rfqService.deleteRfqItem(itemId, req.tenantId);
    
    if (!deleted) {
      return res.status(404).json({
        error: 'RFQ item not found',
        item_id: itemId,
      });
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error deleting RFQ item:', error);
    res.status(500).json({
      error: 'Failed to delete RFQ item',
      details: error.message,
    });
  }
});

/**
 * DELETE /api/rfqs/:id
 * Delete an RFQ by ID
 * Allows deletion of RFQs unless they have linked price agreements
 * IMPORTANT: This route must come AFTER more specific routes like /:id/items
 */
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await rfqService.deleteRfq(req.params.id, req.tenantId);
    if (!deleted) {
      return res.status(404).json({
        error: 'RFQ not found',
        id: req.params.id,
      });
    }
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting RFQ:', error);
    if (error.message.includes('Cannot delete RFQ')) {
      return res.status(400).json({
        error: 'Cannot delete RFQ',
        details: error.message,
      });
    }
    res.status(500).json({
      error: 'Failed to delete RFQ',
      details: error.message,
    });
  }
});

module.exports = router;
