/**
 * Request Validation and Input Sanitization Middleware
 * Uses express-validator for validation and basic sanitization
 */

const { body, query, param, validationResult } = require('express-validator');
const { ValidationError } = require('./errorHandler');

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

