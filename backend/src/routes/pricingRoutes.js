const express = require('express');
const router = express.Router();
const pricingService = require('../services/pricingService');
const { optionalAuth } = require('../middleware/auth');
const { tenantMiddleware } = require('../middleware/tenant');
const { AppError } = require('../middleware/errorHandler');
const { isValidUuid, requireUuid } = require('../utils/uuidValidator');

// Apply optional auth first so tenant middleware can resolve JWT tenant
router.use(optionalAuth);
router.use(tenantMiddleware);

/**
 * UUID validation middleware for rfqId parameter
 * Validates that rfqId in route params is a valid UUID before proceeding
 */
function validateRfqIdParam(req, res, next) {
  const rfqId = req.params.rfqId;
  
  if (!rfqId || typeof rfqId !== 'string' || rfqId.trim() === '') {
    return res.status(400).json({
      error: 'INVALID_RFQ_ID',
      details: 'RFQ ID is required and cannot be empty',
    });
  }
  
  if (!isValidUuid(rfqId)) {
    return res.status(400).json({
      error: 'INVALID_RFQ_ID',
      details: `RFQ ID "${rfqId}" is not a valid UUID format`,
    });
  }
  
  next();
}

/**
 * GET /api/pricing-runs/rfq/:rfqId
 * Get all pricing runs for an RFQ
 */
router.get('/rfq/:rfqId', validateRfqIdParam, async (req, res) => {
  try {
    console.log('[PRICING RUNS LIST] tenant/resolution', {
      tenantId: req.tenantId,
      tenantCode: req.tenantCode,
      rfqId: req.params.rfqId,
    });
    
    // Validate tenantId
    if (!isValidUuid(req.tenantId)) {
      return res.status(400).json({
        error: 'INVALID_TENANT_ID',
        details: 'Tenant ID is required and must be a valid UUID',
      });
    }
    
    const trimmedRfqId = req.params.rfqId.trim();
    const tenantId = req.tenantId.trim();
    
    const pricingRuns = await pricingService.getPricingRunsByRfqId(trimmedRfqId, tenantId);
    res.json(pricingRuns);
  } catch (error) {
    console.error('Error fetching pricing runs:', error);
    res.status(500).json({
      error: 'Failed to fetch pricing runs',
      details: error.message,
    });
  }
});

/**
 * GET /api/pricing-runs/:id
 * Get a pricing run by ID with its items
 */
router.get('/:id', async (req, res) => {
  try {
    const pricingRun = await pricingService.getPricingRunById(req.params.id, req.tenantId);
    res.json(pricingRun);
  } catch (error) {
    console.error('Error fetching pricing run:', error);
    if (error.message === 'Pricing run not found') {
      return res.status(404).json({
        error: 'Pricing run not found',
        id: req.params.id,
      });
    }
    res.status(500).json({
      error: 'Failed to fetch pricing run',
      details: error.message,
    });
  }
});

/**
 * POST /api/pricing-runs/:id/lock
 * Lock a pricing run before approval submission
 */
router.post('/:id/lock', async (req, res) => {
  try {
    const lockedBy = req.user?.email || req.user?.name || req.body?.locked_by || null;
    const pricingRun = await pricingService.lockPricingRun(req.params.id, req.tenantId, lockedBy);
    res.json(pricingRun);
  } catch (error) {
    console.error('Error locking pricing run:', error);
    if (error.message === 'Pricing run not found') {
      return res.status(404).json({
        error: 'Pricing run not found',
        id: req.params.id,
      });
    }
    res.status(500).json({
      error: 'Failed to lock pricing run',
      details: error.message,
    });
  }
});

/**
 * POST /api/pricing-runs/rfq/:rfqId
 * Create a new pricing run for an RFQ
 * Body (optional): { superseded_reason?: string, has_reprice_permission?: boolean }
 */
router.post('/rfq/:rfqId', validateRfqIdParam, async (req, res) => {
  try {
    // CRITICAL FIX: Validate and normalize UUIDs to prevent PostgreSQL 22P02 errors
    let validatedRfqId, validatedTenantId;
    try {
      validatedRfqId = requireUuid(req.params.rfqId, 'rfqId');
      validatedTenantId = requireUuid(req.tenantId, 'tenantId');
    } catch (error) {
      return res.status(400).json({
        error: 'INVALID_UUID',
        details: error.message,
      });
    }

    const trimmedRfqId = validatedRfqId;
    const trimmedTenantId = validatedTenantId;

    const context = {
      correlationId: req.correlationId,
      superseded_reason: req.body?.superseded_reason || null,
      has_reprice_permission: req.body?.has_reprice_permission === true, // Explicit opt-in
    };
    
    // createPriceRunForRfq now returns a clean object fetched via getPricingRunById
    // This ensures no circular references or non-serializable properties
    const pricingRun = await pricingService.createPriceRunForRfq(trimmedRfqId, trimmedTenantId, context);
    
    // Double-check serialization safety before sending
    const { sanitizeForSerialization } = require('../utils/objectSerializer');
    const cleanResponse = sanitizeForSerialization(pricingRun);
    
    res.status(201).json(cleanResponse);
  } catch (error) {
    console.error('Error creating pricing run:', error);
    
    // Safely extract error message to avoid circular reference issues
    // Use try-catch to handle any serialization errors
    let errorMessage = 'Unknown error occurred';
    let errorCode = null;
    let errorDetails = null;
    let statusCode = 500;
    
    try {
      errorMessage = error?.message || 'Unknown error occurred';
      errorCode = error?.code || null;
      statusCode = error?.statusCode || 500;
      
      // Safely extract error details - avoid circular references
      if (error?.details) {
        if (typeof error.details === 'object' && !Array.isArray(error.details)) {
          // Use sanitizeForSerialization to clean error details
          const { sanitizeForSerialization } = require('../utils/objectSerializer');
          errorDetails = sanitizeForSerialization(error.details);
        } else {
          errorDetails = error.details;
        }
      }
    } catch (extractError) {
      console.error('Error extracting error details:', extractError);
      // Fall back to safe defaults
      errorMessage = String(error?.message || 'Unknown error occurred');
    }
    
    // Handle preflight validation errors
    if (errorCode === 'PRICING_PREFLIGHT_FAILED') {
      return res.status(statusCode || 409).json({
        error: {
          code: errorCode,
          message: errorMessage,
          details: {
            rfq_id: req.params.rfqId,
            missing: (errorDetails?.missing || []).map(m => String(m)),
            validationErrors: (errorDetails?.validationErrors || []).map(e => String(e)),
          },
        },
      });
    }
    
    if (errorCode === 'WORKFLOW_CONTRACT_VIOLATION' || (error instanceof AppError && errorCode === 'WORKFLOW_CONTRACT_VIOLATION')) {
      const { sanitizeForSerialization } = require('../utils/objectSerializer');
      return res.status(statusCode || 400).json({
        error: {
          code: errorCode,
          message: errorMessage,
          details: {
            rfq_id: req.params.rfqId,
            ...(errorDetails ? sanitizeForSerialization(errorDetails) : {}),
          },
        },
      });
    }
    if (errorMessage === 'RFQ not found') {
      return res.status(404).json({
        error: 'RFQ not found',
        rfq_id: req.params.rfqId,
      });
    }
    if (errorMessage === 'RFQ has no items to price') {
      return res.status(400).json({
        error: 'RFQ has no items to price',
        details: errorMessage,
      });
    }
    if (errorMessage.includes('Cannot create new pricing run: Current approved quote exists')) {
      return res.status(400).json({
        error: 'Cannot create new pricing run',
        details: errorMessage,
      });
    }
    
    // Final fallback - ensure we can always send a response
    try {
      res.status(500).json({
        error: 'Failed to create pricing run',
        details: errorMessage,
      });
    } catch (jsonError) {
      // Last resort - send plain text if JSON serialization fails
      console.error('CRITICAL: Failed to send JSON error response:', jsonError);
      res.status(500).send(`Failed to create pricing run: ${errorMessage}`);
    }
  }
});

/**
 * PATCH /api/pricing-runs/:id/outcome
 * Update pricing run outcome (won/lost/pending/cancelled)
 * Body: { 
 *   outcome: 'won' | 'lost' | 'pending' | 'cancelled',
 *   outcomeDate?: string (ISO date string),
 *   outcomeReason?: string
 * }
 */
router.patch('/:id/outcome', async (req, res) => {
  try {
    const { outcome, outcomeDate, outcomeReason } = req.body;

    if (!outcome) {
      return res.status(400).json({
        error: 'outcome is required',
        details: 'outcome must be one of: "won", "lost", "pending", "cancelled"',
      });
    }

    // Validate outcome value
    if (!['won', 'lost', 'pending', 'cancelled'].includes(outcome)) {
      return res.status(400).json({
        error: 'Invalid outcome',
        details: 'outcome must be one of: "won", "lost", "pending", "cancelled"',
      });
    }

    const pricingRun = await pricingService.updatePricingRunOutcome(
      req.params.id,
      outcome,
      req.tenantId,
      outcomeDate,
      outcomeReason
    );

    res.json(pricingRun);
  } catch (error) {
    console.error('Error updating pricing run outcome:', error);
    if (error.message === 'Pricing run not found') {
      return res.status(404).json({
        error: 'Pricing run not found',
        id: req.params.id,
      });
    }
    if (error.message.includes('Outcome must be')) {
      return res.status(400).json({
        error: 'Invalid outcome',
        details: error.message,
      });
    }
    res.status(500).json({
      error: 'Failed to update pricing run outcome',
      details: error.message,
    });
  }
});

/**
 * POST /api/pricing-runs/:id/revisions
 * Create a revision of a pricing run
 * Body: { reason: string, created_by?: string }
 */
router.post('/:id/revisions', async (req, res) => {
  try {
    const { reason, created_by } = req.body;

    if (!reason) {
      return res.status(400).json({
        error: 'reason is required',
        details: 'Please provide a reason for creating this revision',
      });
    }

    const newPricingRun = await pricingService.createPricingRunRevision(
      req.params.id,
      reason,
      req.tenantId,
      created_by
    );

    res.status(201).json({
      success: true,
      message: 'Pricing run revision created',
      pricing_run: newPricingRun,
    });
  } catch (error) {
    console.error('Error creating pricing run revision:', error);
    if (error.message === 'Original pricing run not found') {
      return res.status(404).json({
        error: 'Pricing run not found',
        id: req.params.id,
      });
    }
    res.status(500).json({
      error: 'Failed to create pricing run revision',
      details: error.message,
    });
  }
});

/**
 * GET /api/pricing-runs/:id/versions
 * Get all versions (revisions) of a pricing run
 */
router.get('/:id/versions', async (req, res) => {
  try {
    const versions = await pricingService.getPricingRunVersions(req.params.id, req.tenantId);

    res.json({
      success: true,
      count: versions.length,
      versions,
    });
  } catch (error) {
    console.error('Error fetching pricing run versions:', error);
    if (error.message === 'Pricing run not found') {
      return res.status(404).json({
        error: 'Pricing run not found',
        id: req.params.id,
      });
    }
    res.status(500).json({
      error: 'Failed to fetch pricing run versions',
      details: error.message,
    });
  }
});

/**
 * GET /api/pricing-runs/:id/version-snapshots
 * Get all version snapshots for a pricing run
 */
router.get('/:id/version-snapshots', async (req, res) => {
  try {
    const snapshots = await pricingService.getVersionSnapshots(req.params.id, req.tenantId);

    res.json({
      success: true,
      count: snapshots.length,
      snapshots,
    });
  } catch (error) {
    console.error('Error fetching version snapshots:', error);
    res.status(500).json({
      error: 'Failed to fetch version snapshots',
      details: error.message,
    });
  }
});

/**
 * GET /api/pricing-runs/:id/compare-versions
 * Compare two versions of a pricing run
 * Query params: version1 (required), version2 (optional, defaults to current)
 */
router.get('/:id/compare-versions', async (req, res) => {
  try {
    const { version1, version2 } = req.query;

    if (!version1) {
      return res.status(400).json({
        error: 'version1 is required',
        details: 'Please provide version1 as a query parameter',
      });
    }

    const version1Num = parseInt(version1);
    const version2Num = version2 ? parseInt(version2) : null;

    if (isNaN(version1Num) || (version2 !== null && version2 !== undefined && isNaN(version2Num))) {
      return res.status(400).json({
        error: 'Invalid version number',
        details: 'Version numbers must be integers',
      });
    }

    const comparison = await pricingService.compareVersions(
      req.params.id,
      version1Num,
      req.tenantId,
      version2Num
    );

    res.json({
      success: true,
      comparison,
    });
  } catch (error) {
    console.error('Error comparing versions:', error);
    if (error.message.includes('not found')) {
      return res.status(404).json({
        error: 'Version not found',
        details: error.message,
      });
    }
    res.status(500).json({
      error: 'Failed to compare versions',
      details: error.message,
    });
  }
});

module.exports = router;
