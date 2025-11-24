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
const { authenticate, authorize, ROLES } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { validations, handleValidationErrors, body, query, param } = require('../middleware/validation');

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

    const result = await submitForApproval(req.params.pricingRunId, submitter);
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
      notes: req.body.notes,
    };

    const result = await approvePricingRun(req.params.pricingRunId, approver);
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

    const result = await rejectPricingRun(req.params.pricingRunId, rejector);
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
    const options = {
      sort: req.query.sort || 'oldest',
      limit: req.query.limit ? parseInt(req.query.limit) : 50,
    };

    const result = await getPendingApprovals(options);
    res.json({
      success: true,
      data: result,
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
    param('pricingRunId').isUUID().withMessage('pricingRunId must be a valid UUID'),
  ],
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const result = await getApprovalHistory(req.params.pricingRunId);
    res.json({
      success: true,
      data: result,
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
      sort: req.query.sort || 'oldest',
      limit: req.query.limit ? parseInt(req.query.limit) : 50,
    };

    const result = await getMyApprovalQueue(approverEmail, options);
    res.json({
      success: true,
      data: result,
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

    const result = await markQuoteAsSent(req.params.pricingRunId, sender);
    res.json({
      success: true,
      data: result,
    });
  })
);

module.exports = router;
