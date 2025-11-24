const express = require('express');
const router = express.Router();
const {
  createPriceAgreement,
  getPriceAgreements,
  getPriceAgreementById,
  updatePriceAgreement,
  deletePriceAgreement,
  checkAgreementForItem,
  getAgreementsByClient,
} = require('../services/priceAgreementsService');
const { authenticate, authorize, ROLES } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { validations, handleValidationErrors, body, query, param } = require('../middleware/validation');
const { ValidationError } = require('../middleware/errorHandler');

/**
 * @route   POST /api/price-agreements
 * @desc    Create a new price agreement
 * @access  Private - Manager/Admin only
 */
router.post(
  '/',
  authenticate,
  authorize(ROLES.MANAGER, ROLES.ADMIN),
  validations.priceAgreement,
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const agreement = await createPriceAgreement(req.body);
    res.status(201).json({
      success: true,
      data: agreement,
    });
  })
);

/**
 * @route   GET /api/price-agreements
 * @desc    Get all price agreements with optional filtering
 * @access  Private - Authenticated users
 * @query   client_id, status, material_id, category, page, limit
 */
router.get(
  '/',
  authenticate,
  validations.pagination,
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const filters = {
      client_id: req.query.client_id,
      status: req.query.status,
      material_id: req.query.material_id,
      category: req.query.category,
      page: req.query.page ? parseInt(req.query.page) : 1,
      limit: req.query.limit ? parseInt(req.query.limit) : 20,
    };

    const result = await getPriceAgreements(filters);
    res.json({
      success: true,
      data: result,
    });
  })
);

/**
 * @route   GET /api/price-agreements/:id
 * @desc    Get a single price agreement by ID
 * @access  Private - Authenticated users
 */
router.get(
  '/:id',
  authenticate,
  validations.uuid,
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const agreement = await getPriceAgreementById(req.params.id);
    res.json({
      success: true,
      data: agreement,
    });
  })
);

/**
 * @route   PUT /api/price-agreements/:id
 * @desc    Update a price agreement
 * @access  Private - Manager/Admin only
 */
router.put(
  '/:id',
  authenticate,
  authorize(ROLES.MANAGER, ROLES.ADMIN),
  validations.uuid,
  [
    body('base_price').optional().isFloat({ min: 0 }).withMessage('base_price must be a positive number'),
    body('valid_from').optional().isISO8601().withMessage('valid_from must be a valid ISO 8601 date'),
    body('valid_until').optional().isISO8601().withMessage('valid_until must be a valid ISO 8601 date'),
    body('status').optional().isIn(['active', 'expired', 'cancelled']).withMessage('Invalid status'),
  ],
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const agreement = await updatePriceAgreement(req.params.id, req.body);
    res.json({
      success: true,
      data: agreement,
    });
  })
);

/**
 * @route   DELETE /api/price-agreements/:id
 * @desc    Delete (cancel) a price agreement
 * @access  Private - Manager/Admin only
 */
router.delete(
  '/:id',
  authenticate,
  authorize(ROLES.MANAGER, ROLES.ADMIN),
  validations.uuid,
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const result = await deletePriceAgreement(req.params.id);
    res.json({
      success: true,
      data: result,
    });
  })
);

/**
 * @route   POST /api/price-agreements/check
 * @desc    Check if an agreement exists for a specific item
 * @access  Private - Authenticated users
 * @body    client_id, material_id/category, quantity, date
 */
router.post(
  '/check',
  authenticate,
  [
    body('client_id').isUUID().withMessage('client_id must be a valid UUID'),
    body('material_id').optional().isUUID().withMessage('material_id must be a valid UUID'),
    body('category').optional().isString().trim().notEmpty().withMessage('category must be a non-empty string'),
    body('quantity').optional().isFloat({ min: 0 }).withMessage('quantity must be a positive number'),
    body('date').optional().isISO8601().withMessage('date must be a valid ISO 8601 date'),
  ],
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const { client_id, material_id, category, quantity, date } = req.body;

    if (!material_id && !category) {
      throw new ValidationError('Either material_id or category is required');
    }

    const result = await checkAgreementForItem({
      clientId: client_id,
      materialId: material_id,
      category,
      quantity,
      date,
    });

    res.json({
      success: true,
      data: result,
    });
  })
);

/**
 * @route   GET /api/price-agreements/client/:clientId
 * @desc    Get all agreements for a specific client
 * @access  Private - Authenticated users
 * @query   status, active_only
 */
router.get(
  '/client/:clientId',
  authenticate,
  [
    param('clientId').isUUID().withMessage('clientId must be a valid UUID'),
    query('status').optional().isIn(['active', 'expired', 'cancelled']).withMessage('Invalid status'),
    query('active_only').optional().isBoolean().withMessage('active_only must be a boolean'),
  ],
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const options = {
      status: req.query.status,
    };

    if (req.query.active_only === 'true') {
      options.status = 'active';
    }

    const result = await getAgreementsByClient(req.params.clientId, options);
    res.json({
      success: true,
      data: result,
    });
  })
);

module.exports = router;
