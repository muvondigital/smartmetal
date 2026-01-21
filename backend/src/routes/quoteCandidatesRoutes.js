/**
 * Quote Candidates Routes
 * 
 * API routes for managing quote candidates (approved pricing runs)
 * that can be converted to Price Agreements.
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { tenantMiddleware } = require('../middleware/tenant');
const { asyncHandler } = require('../middleware/errorHandler');
const { param, body, query, validationResult } = require('express-validator');
const quoteCandidatesService = require('../services/quoteCandidatesService');

// Apply authentication and tenant middleware to all routes
router.use(authenticate);
router.use(tenantMiddleware);

/**
 * GET /api/quote-candidates
 * Get quote candidates for the current tenant
 * Query params: status (optional) - filter by status (pending, converted, dismissed)
 */
router.get(
  '/',
  [
    query('status').optional().isIn(['pending', 'converted', 'dismissed']).withMessage('Invalid status'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    if (!req.tenantId) {
      return res.status(400).json({
        error: 'Tenant ID is required',
        details: 'tenantId must be provided via tenant middleware',
      });
    }

    const options = {};
    if (req.query.status) {
      options.status = req.query.status;
    }

    const candidates = await quoteCandidatesService.getQuoteCandidates(req.tenantId, options);

    res.json({
      success: true,
      data: candidates,
    });
  })
);

/**
 * GET /api/quote-candidates/:id
 * Get a specific quote candidate by ID
 */
router.get(
  '/:id',
  [
    param('id').isUUID().withMessage('candidateId must be a valid UUID'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    if (!req.tenantId) {
      return res.status(400).json({
        error: 'Tenant ID is required',
        details: 'tenantId must be provided via tenant middleware',
      });
    }

    const candidate = await quoteCandidatesService.getQuoteCandidateById(req.params.id, req.tenantId);

    res.json({
      success: true,
      data: candidate,
    });
  })
);

/**
 * PATCH /api/quote-candidates/:id
 * Update quote candidate status
 * Body: { status: 'pending' | 'converted' | 'dismissed', converted_price_agreement_id?: string }
 */
router.patch(
  '/:id',
  [
    param('id').isUUID().withMessage('candidateId must be a valid UUID'),
    body('status').isIn(['pending', 'converted', 'dismissed']).withMessage('status must be pending, converted, or dismissed'),
    body('converted_price_agreement_id').optional().isUUID().withMessage('converted_price_agreement_id must be a valid UUID'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    if (!req.tenantId) {
      return res.status(400).json({
        error: 'Tenant ID is required',
        details: 'tenantId must be provided via tenant middleware',
      });
    }

    const updates = {
      status: req.body.status,
    };

    if (req.body.converted_price_agreement_id) {
      updates.converted_price_agreement_id = req.body.converted_price_agreement_id;
    }

    const updatedCandidate = await quoteCandidatesService.updateQuoteCandidateStatus(
      req.params.id,
      req.tenantId,
      updates
    );

    res.json({
      success: true,
      data: updatedCandidate,
    });
  })
);

module.exports = router;

