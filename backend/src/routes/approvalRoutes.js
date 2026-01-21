const express = require('express');
const router = express.Router();
const {
  submitForApproval,
  approvePricingRun,
  rejectPricingRun,
  markQuoteAsSent,
  getPendingApprovals,
  getApprovalHistory,
  getMyApprovalQueue,
} = require('../services/approvalService');
const { authenticate, authorize, optionalAuth, ROLES } = require('../middleware/auth');
const { asyncHandler, ValidationError } = require('../middleware/errorHandler');
const { validations, handleValidationErrors, body, query, param } = require('../middleware/validation');
const { tenantMiddleware } = require('../middleware/tenant');
const { log } = require('../utils/logger');

// Apply optional auth first so tenant resolution can use JWT tenant
router.use(optionalAuth);
router.use(tenantMiddleware);
router.use((req, _res, next) => {
  log.info('approval route hit', { tenantId: req.tenantId, path: req.originalUrl });
  next();
});

/**
 * @route   POST /api/approvals/submit/:pricingRunId
 * @desc    Submit a pricing run for approval
 * @access  Private - Authenticated users
 */
router.post(
  '/submit/:pricingRunId',
  authenticate,
  [
    param('pricingRunId').isUUID().withMessage('pricingRunId must be a valid UUID'),
    ...validations.submitApproval,
  ],
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    // Use authenticated user info if available, otherwise use body
    const submitter = {
      name: req.user?.name || req.body.submitted_by,
      email: req.user?.email || req.body.submitted_by_email,
      id: req.user?.id || req.body.submitted_by_id,
      notes: req.body.notes,
    };

    // Ensure name is provided (required for approval_history.actor_name NOT NULL constraint)
    if (!submitter.name || submitter.name.trim() === '') {
      // Fallback to email if name is missing
      if (submitter.email) {
        submitter.name = submitter.email.split('@')[0]; // Use email username as fallback
      } else {
        throw new ValidationError('submitted_by or user name is required');
      }
    }

    const result = await submitForApproval(req.params.pricingRunId, submitter, req.tenantId, {
      correlationId: req.correlationId,
    }, req.tenant);
    res.json({
      success: true,
      data: result,
    });
  })
);

/**
 * @route   POST /api/approvals/approve/:pricingRunId
 * @desc    Approve a pricing run
 * @access  Private - Manager/Admin only
 */
router.post(
  '/approve/:pricingRunId',
  authenticate,
  authorize(ROLES.MANAGER, ROLES.ADMIN),
  [
    param('pricingRunId').isUUID().withMessage('pricingRunId must be a valid UUID'),
    ...validations.approvalAction,
  ],
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    // Use authenticated user info
    const approver = {
      name: req.user?.name || req.body.approver_name || req.body.approver_id,
      email: req.user?.email || req.body.approver_email,
      id: req.user?.id || req.body.approver_id,
      role: req.user?.role, // CRITICAL: Pass role for manager/admin bypass
      notes: req.body.notes,
    };

    const result = await approvePricingRun(req.params.pricingRunId, approver, req.tenantId, req.tenant);
    res.json({
      success: true,
      data: result,
    });
  })
);

/**
 * @route   POST /api/approvals/reject/:pricingRunId
 * @desc    Reject a pricing run with a reason
 * @access  Private - Manager/Admin only
 */
router.post(
  '/reject/:pricingRunId',
  authenticate,
  authorize(ROLES.MANAGER, ROLES.ADMIN),
  [
    param('pricingRunId').isUUID().withMessage('pricingRunId must be a valid UUID'),
    body('rejection_reason').isString().trim().notEmpty().withMessage('rejection_reason is required'),
    ...validations.approvalAction,
  ],
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    // Use authenticated user info
    const rejector = {
      name: req.user?.name || req.body.approver_name || req.body.approver_id,
      email: req.user?.email || req.body.approver_email,
      id: req.user?.id || req.body.approver_id,
      rejection_reason: req.body.rejection_reason,
    };

    const result = await rejectPricingRun(req.params.pricingRunId, rejector, req.tenantId, req.tenant);
    res.json({
      success: true,
      data: result,
    });
  })
);

/**
 * @route   GET /api/approvals/pending
 * @desc    Get all pending approvals
 * @access  Private - Manager/Admin only
 * @query   sort (oldest/newest), limit
 */
router.get(
  '/pending',
  authenticate,
  authorize(ROLES.MANAGER, ROLES.ADMIN),
  [
    query('sort').optional().isIn(['oldest', 'newest']).withMessage('sort must be "oldest" or "newest"'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit must be between 1 and 100'),
  ],
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    // CRITICAL FIX: Validate tenantId before passing to service
    if (!req.tenantId || typeof req.tenantId !== 'string' || req.tenantId.trim() === '' || req.tenantId === '""') {
      console.error('[APPROVALS] ERROR: req.tenantId is missing or invalid in /pending!', {
        tenantId: req.tenantId,
        type: typeof req.tenantId,
        isEmpty: req.tenantId === '',
        isQuotedEmpty: req.tenantId === '""'
      });
      return res.status(400).json({
        success: false,
        error: 'tenantId is required and must be a valid UUID string'
      });
    }

    // Additional UUID format validation
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const validatedTenantId = req.tenantId.trim();
    if (!uuidRegex.test(validatedTenantId)) {
      console.error('[APPROVALS] ERROR: req.tenantId is not a valid UUID!', { 
        tenantId: req.tenantId,
        trimmed: validatedTenantId
      });
      return res.status(400).json({
        success: false,
        error: 'Invalid tenant ID format'
      });
    }

    const options = {
      tenantId: validatedTenantId,
      sort: req.query.sort || 'oldest',
      limit: req.query.limit ? parseInt(req.query.limit) : 50,
    };

    const result = await getPendingApprovals(options);
    res.json({
      success: true,
      data: result,
      pending_approvals: result, // For frontend compatibility
    });
  })
);

/**
 * @route   GET /api/approvals/history/:pricingRunId
 * @desc    Get approval history for a pricing run
 * @access  Private - Authenticated users
 */
router.get(
  '/history/:pricingRunId',
  authenticate,
  [
    param('pricingRunId')
      .notEmpty()
      .withMessage('pricingRunId cannot be empty')
      .isUUID()
      .withMessage('pricingRunId must be a valid UUID'),
  ],
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const { pricingRunId } = req.params;
    const { tenantId } = req;

    // Additional validation: explicit check for empty string
    if (!pricingRunId || pricingRunId.trim() === '') {
      throw new ValidationError('pricingRunId is required and cannot be empty');
    }

    // Validate tenantId is required
    if (!tenantId) {
      throw new ValidationError('Tenant ID is required. tenantId must be provided via tenant middleware.');
    }

    const result = await getApprovalHistory(pricingRunId, tenantId);
    res.json({
      success: true,
      data: result,
      history: result, // For frontend compatibility
    });
  })
);

/**
 * @route   GET /api/approvals/my-queue
 * @desc    Get approval queue for authenticated user
 * @access  Private - Authenticated users
 * @query   sort (oldest/newest), limit
 */
router.get(
  '/my-queue',
  authenticate,
  [
    query('sort').optional().isIn(['oldest', 'newest']).withMessage('sort must be "oldest" or "newest"'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit must be between 1 and 100'),
  ],
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    // Use authenticated user's email, or fallback to query param for backward compatibility
    const approverEmail = req.user?.email || req.query.approver_email;

    if (!approverEmail) {
      throw new ValidationError('approver_email is required');
    }

    const options = {
      tenantId: req.tenantId,
      sort: req.query.sort || 'oldest',
      limit: req.query.limit ? parseInt(req.query.limit) : 50,
    };

    const result = await getMyApprovalQueue(approverEmail, options);
    res.json({
      success: true,
      data: result,
      pending_approvals: result, // For frontend compatibility
    });
  })
);

/**
 * @route   POST /api/approvals/send/:pricingRunId
 * @desc    Mark a pricing run as sent to client
 * @access  Private - Authenticated users
 */
router.post(
  '/send/:pricingRunId',
  authenticate,
  [
    param('pricingRunId').isUUID().withMessage('pricingRunId must be a valid UUID'),
    body('notes').optional().isString().trim().withMessage('notes must be a string'),
  ],
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    // Use authenticated user info
    const sender = {
      name: req.user?.name || req.body.sent_by || req.body.sender_name,
      email: req.user?.email || req.body.sender_email,
      id: req.user?.id || req.body.sender_id,
      notes: req.body.notes,
    };

    const result = await markQuoteAsSent(req.params.pricingRunId, sender, req.tenantId, req.tenant);
    res.json({
      success: true,
      data: result,
    });
  })
);

/**
 * @route   POST /api/approvals/enforce-sla
 * @desc    Enforce SLA deadlines for pending approvals (should be called periodically)
 * @access  Private - Admin only
 */
router.post(
  '/enforce-sla',
  authenticate,
  authorize(ROLES.ADMIN),
  asyncHandler(async (req, res) => {
    const { enforceSLA } = require('../services/approvalService');
    const result = await enforceSLA(req.tenantId);
    res.json({
      success: true,
      data: result,
    });
  })
);

module.exports = router;
