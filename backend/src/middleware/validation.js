/**
 * Request Validation and Input Sanitization Middleware
 * Uses express-validator for validation and basic sanitization
 */

const { body, query, param, validationResult } = require('express-validator');
const { ValidationError } = require('./errorHandler');

// Shared enums for Price Agreement V2 validation
const AGREEMENT_TYPES_V2 = ['STANDARD', 'CUSTOMER_SPECIFIC', 'MATERIAL_GROUP', 'PROMOTIONAL'];
const AGREEMENT_STATUSES_V2 = ['draft', 'pending_approval', 'approved', 'released', 'expired'];
const CONDITION_TYPES_V2 = ['BASE_PRICE', 'DISCOUNT', 'SURCHARGE', 'FREIGHT', 'TAX', 'LME_ADJUSTMENT'];
const RATE_TYPES_V2 = ['AMOUNT', 'PERCENTAGE'];
const CONDITION_STATUSES_V2 = ['active', 'blocked'];

/**
 * Handle validation errors
 */
function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map(err => ({
      field: err.path || err.param,
      message: err.msg,
      value: err.value,
    }));

    return next(new ValidationError('Validation failed', errorMessages));
  }

  next();
}

/**
 * Basic input sanitization
 * Removes potential XSS vectors and trims whitespace
 */
function sanitizeInput(value) {
  if (typeof value === 'string') {
    // Trim whitespace
    value = value.trim();
    
    // Remove null bytes
    value = value.replace(/\0/g, '');
    
    // Basic XSS prevention - remove script tags and dangerous attributes
    value = value.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    value = value.replace(/javascript:/gi, '');
    value = value.replace(/on\w+\s*=/gi, '');
  }
  
  return value;
}

/**
 * Recursively sanitize object
 */
function sanitizeObject(obj) {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    return sanitizeInput(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }

  if (typeof obj === 'object') {
    const sanitized = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        sanitized[key] = sanitizeObject(obj[key]);
      }
    }
    return sanitized;
  }

  return obj;
}

/**
 * Sanitize request body, query, and params
 */
function sanitizeRequest(req, res, next) {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body);
  }
  if (req.query && typeof req.query === 'object') {
    req.query = sanitizeObject(req.query);
  }
  if (req.params && typeof req.params === 'object') {
    req.params = sanitizeObject(req.params);
  }
  next();
}

/**
 * Common validation rules
 */
const validations = {
  uuid: param('id').isUUID().withMessage('Invalid UUID format'),
  
  uuidOptional: param('id').optional().isUUID().withMessage('Invalid UUID format'),
  
  pagination: [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  ],

  dateRange: [
    query('start_date').optional().isISO8601().withMessage('Invalid start_date format (ISO 8601 required)'),
    query('end_date').optional().isISO8601().withMessage('Invalid end_date format (ISO 8601 required)'),
  ],

  agreementV2Create: [
    body('agreement_code').isString().trim().notEmpty().withMessage('agreement_code is required'),
    body('agreement_type').isIn(AGREEMENT_TYPES_V2).withMessage('Invalid agreement_type'),
    body('currency').isString().isLength({ min: 3, max: 3 }).withMessage('currency must be a 3-letter code'),
    body('valid_from').isISO8601().withMessage('valid_from must be a valid ISO 8601 date'),
    body('valid_to').isISO8601().withMessage('valid_to must be a valid ISO 8601 date'),
    body('status').optional().isIn(AGREEMENT_STATUSES_V2).withMessage('Invalid status'),
    body('customer_id').optional().isUUID().withMessage('customer_id must be a valid UUID'),
    body('owner_user_id').optional().isUUID().withMessage('owner_user_id must be a valid UUID'),
  ],

  agreementV2Patch: [
    body('agreement_code').optional().isString().trim().notEmpty().withMessage('agreement_code must be a non-empty string'),
    body('agreement_type').optional().isIn(AGREEMENT_TYPES_V2).withMessage('Invalid agreement_type'),
    body('currency').optional().isString().isLength({ min: 3, max: 3 }).withMessage('currency must be a 3-letter code'),
    body('valid_from').optional().isISO8601().withMessage('valid_from must be a valid ISO 8601 date'),
    body('valid_to').optional().isISO8601().withMessage('valid_to must be a valid ISO 8601 date'),
    body('status').optional().isIn(AGREEMENT_STATUSES_V2).withMessage('Invalid status'),
    body('customer_id').optional().isUUID().withMessage('customer_id must be a valid UUID'),
    body('owner_user_id').optional().isUUID().withMessage('owner_user_id must be a valid UUID'),
  ],

  agreementV2ConditionCreate: [
    body('condition_type').isIn(CONDITION_TYPES_V2).withMessage('Invalid condition_type'),
    body('rate_type').isIn(RATE_TYPES_V2).withMessage('Invalid rate_type'),
    body('rate_value').isFloat().withMessage('rate_value must be numeric'),
    body('has_scale').optional().isBoolean().withMessage('has_scale must be boolean'),
    body('condition_priority').optional().isInt().withMessage('condition_priority must be an integer'),
    body('valid_from').optional().isISO8601().withMessage('valid_from must be a valid ISO 8601 date'),
    body('valid_to').optional().isISO8601().withMessage('valid_to must be a valid ISO 8601 date'),
    body('status').optional().isIn(CONDITION_STATUSES_V2).withMessage('Invalid status'),
    body('key_customer_id').optional().isUUID().withMessage('key_customer_id must be a valid UUID'),
    body('key_material_id').optional().isUUID().withMessage('key_material_id must be a valid UUID'),
    body('key_material_group').optional().isString().trim(),
    body('key_region').optional().isString().trim(),
    body('key_incoterm').optional().isString().trim(),
  ],

  agreementV2ConditionPatch: [
    body('condition_type').optional().isIn(CONDITION_TYPES_V2).withMessage('Invalid condition_type'),
    body('rate_type').optional().isIn(RATE_TYPES_V2).withMessage('Invalid rate_type'),
    body('rate_value').optional().isFloat().withMessage('rate_value must be numeric'),
    body('has_scale').optional().isBoolean().withMessage('has_scale must be boolean'),
    body('condition_priority').optional().isInt().withMessage('condition_priority must be an integer'),
    body('valid_from').optional().isISO8601().withMessage('valid_from must be a valid ISO 8601 date'),
    body('valid_to').optional().isISO8601().withMessage('valid_to must be a valid ISO 8601 date'),
    body('status').optional().isIn(CONDITION_STATUSES_V2).withMessage('Invalid status'),
    body('key_customer_id').optional().isUUID().withMessage('key_customer_id must be a valid UUID'),
    body('key_material_id').optional().isUUID().withMessage('key_material_id must be a valid UUID'),
    body('key_material_group').optional().isString().trim(),
    body('key_region').optional().isString().trim(),
    body('key_incoterm').optional().isString().trim(),
  ],

  agreementV2ScaleCreate: [
    body('scale_from').isFloat().withMessage('scale_from must be numeric'),
    body('scale_to').optional().isFloat().withMessage('scale_to must be numeric'),
    body('scale_rate_type').isIn(RATE_TYPES_V2).withMessage('Invalid scale_rate_type'),
    body('scale_rate_value').isFloat().withMessage('scale_rate_value must be numeric'),
  ],

  agreementV2ScalePatch: [
    body('scale_from').optional().isFloat().withMessage('scale_from must be numeric'),
    body('scale_to').optional().isFloat().withMessage('scale_to must be numeric'),
    body('scale_rate_type').optional().isIn(RATE_TYPES_V2).withMessage('Invalid scale_rate_type'),
    body('scale_rate_value').optional().isFloat().withMessage('scale_rate_value must be numeric'),
  ],

  priceAgreement: [
    body('client_id').isUUID().withMessage('client_id must be a valid UUID'),
    body('base_price').isFloat({ min: 0 }).withMessage('base_price must be a positive number'),
    body('valid_from').isISO8601().withMessage('valid_from must be a valid ISO 8601 date'),
    body('valid_until').isISO8601().withMessage('valid_until must be a valid ISO 8601 date'),
    body('material_id').optional().isUUID().withMessage('material_id must be a valid UUID'),
    body('category').optional().isString().trim().notEmpty().withMessage('category must be a non-empty string'),
    body('currency').optional().isString().isLength({ min: 3, max: 3 }).withMessage('currency must be a 3-letter code'),
    body('volume_tiers').optional().isArray().withMessage('volume_tiers must be an array'),
  ],

  approvalAction: [
    body('approver_name').optional().isString().trim().notEmpty().withMessage('approver_name must be a non-empty string'),
    body('approver_id').optional().isUUID().withMessage('approver_id must be a valid UUID'),
    body('approver_email').optional().isEmail().withMessage('approver_email must be a valid email'),
    body('notes').optional().isString().trim().withMessage('notes must be a string'),
    body('rejection_reason').optional().isString().trim().notEmpty().withMessage('rejection_reason must be a non-empty string'),
  ],

  submitApproval: [
    body('submitted_by').optional().isString().trim().notEmpty().withMessage('submitted_by must be a non-empty string'),
    body('submitted_by_id').optional().isUUID().withMessage('submitted_by_id must be a valid UUID'),
    body('submitted_by_email').optional().isEmail().withMessage('submitted_by_email must be a valid email'),
    body('notes').optional().isString().trim().withMessage('notes must be a string'),
  ],
};

/**
 * Middleware to validate MongoDB ObjectId (if needed in future)
 * For now, we use UUIDs, so this is a placeholder
 */

module.exports = {
  handleValidationErrors,
  sanitizeRequest,
  sanitizeInput,
  sanitizeObject,
  validations,
  body,
  query,
  param,
};

