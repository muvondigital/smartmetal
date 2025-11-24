const express = require('express');
const router = express.Router();
const rfqService = require('../services/rfqService');
const pricingService = require('../services/pricingService');

/**
 * GET /api/rfqs
 * Get all RFQs
 */
router.get('/', async (req, res) => {
  try {
    const rfqs = await rfqService.getAllRfqs();
    res.json(rfqs);
  } catch (error) {
    console.error('Error fetching RFQs:', error);
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

    const rfq = await rfqService.createRfqFromPayload(payload);
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
 */
router.get('/:id/items', async (req, res) => {
  try {
    const items = await rfqService.getRfqItems(req.params.id);
    res.json(items);
  } catch (error) {
    console.error('Error fetching RFQ items:', error);
    res.status(500).json({
      error: 'Failed to fetch RFQ items',
      details: error.message,
    });
  }
});

/**
 * POST /api/rfqs/:id/items
 * Add an item to an RFQ
 * IMPORTANT: This route must come before POST /:id to avoid route conflicts
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

    const item = await rfqService.addRfqItem(req.params.id, payload);
    res.status(201).json(item);
  } catch (error) {
    console.error('Error adding RFQ item:', error);
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
    const pricingRun = await pricingService.createPriceRunForRfq(req.params.id);
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
    const rfq = await rfqService.getRfqById(req.params.id);
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

module.exports = router;

