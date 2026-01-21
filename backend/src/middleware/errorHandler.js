/**
 * Centralized Error Handling Middleware
 * Provides structured error responses and logging
 * 
 * Standard Error Response Format:
 * {
 *   "error": {
 *     "code": "ERROR_CODE",
 *     "message": "Human-readable message",
 *     "details": {} // Optional, only in development
 *   }
 * }
 */

const { config } = require('../config/env');
const { log } = require('../utils/logger');

/**
 * Custom error classes
 */
class AppError extends Error {
  constructor(message, statusCode = 500, code = null, details = null) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message, details = null) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

class AuthenticationError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'AUTHENTICATION_ERROR');
  }
}

class AuthorizationError extends AppError {
  constructor(message = 'Insufficient permissions') {
    super(message, 403, 'AUTHORIZATION_ERROR');
  }
}

class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

class DatabaseError extends AppError {
  constructor(message, details = null) {
    super(message, 500, 'DATABASE_ERROR', details);
  }
}

/**
 * Log error using structured logger
 */
function logError(error, req = null) {
  const context = {
    errorCode: error.code || 'UNKNOWN_ERROR',
    statusCode: error.statusCode,
    name: error.name,
  };

  if (req) {
    context.request = {
      method: req.method,
      path: req.path,
      query: req.query,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    };
    
    // Only log body in development
    if (config.server.nodeEnv === 'development') {
      context.request.body = req.body;
    }
  }

  if (error.details) {
    context.details = error.details;
  }

  // Use appropriate log level based on status code
  if (error.statusCode >= 500) {
    log.error(`Error: ${error.message}`, error, context);
  } else if (error.statusCode >= 400) {
    log.warn(`Client error: ${error.message}`, context);
  } else {
    log.info(`Error handled: ${error.message}`, context);
  }
  
  // Development-specific logging for RFQ and Price Agreements routes
  if (config.server.nodeEnv === 'development' && req && req.path) {
    if (req.path.includes('/rfqs')) {
      console.error('[RFQ] Error loading RFQs', {
        path: req.path,
        method: req.method,
        statusCode: error.statusCode,
        error: error.message,
        stack: error.stack,
      });
    }
    if (req.path.includes('/price-agreements')) {
      console.error('[AGREEMENTS] Error loading price agreements', {
        path: req.path,
        method: req.method,
        statusCode: error.statusCode,
        error: error.message,
        stack: error.stack,
      });
    }
  }
}

/**
 * Handle database errors and convert to appropriate AppErrors
 */
function handleDatabaseError(error) {
  // PostgreSQL error codes
  if (error.code === '23505') { // Unique violation
    return new ValidationError('Duplicate entry', { field: error.constraint });
  }
  if (error.code === '23503') { // Foreign key violation
    return new ValidationError('Referenced resource does not exist');
  }
  if (error.code === '23502') { // Not null violation
    // Extract column name from error message if available
    // PostgreSQL error format: "null value in column "column_name" violates not-null constraint"
    const columnMatch = error.message.match(/column "([^"]+)"/i);
    const columnName = columnMatch ? columnMatch[1] : 'unknown';
    return new ValidationError(`Required field is missing: ${columnName}`, { 
      field: columnName,
      originalError: error.message 
    });
  }
  if (error.code === '42P01') { // Undefined table
    return new DatabaseError('Database table not found', { table: error.table });
  }
  
  // Generic database error
  return new DatabaseError('Database operation failed', {
    code: error.code,
    message: error.message,
  });
}

/**
 * Express error handling middleware
 */
function errorHandler(err, req, res, next) {
  // If response already sent, delegate to default handler
  if (res.headersSent) {
    return next(err);
  }

  let error = err;

  // Convert known error types
  if (error.code && error.code.startsWith('23') || error.code === '42P01') {
    error = handleDatabaseError(error);
  } else if (!(error instanceof AppError)) {
    // Wrap unknown errors - ensure message is always a string
    let errorMessage = 'Internal server error';
    if (error.message) {
      if (typeof error.message === 'string') {
        errorMessage = error.message;
      } else {
        // If message is an object, try to stringify it safely
        try {
          errorMessage = JSON.stringify(error.message);
        } catch {
          errorMessage = 'Internal server error';
        }
      }
    }
    
    error = new AppError(
      errorMessage,
      error.statusCode || 500,
      'INTERNAL_ERROR',
      config.server.nodeEnv === 'development' ? error.stack : null
    );
  }

  // Log the error
  logError(error, req);

  // Send standardized error response - ensure message is always a string
  let errorMessage = error.message || 'Internal server error';
  if (typeof errorMessage !== 'string') {
    try {
      errorMessage = JSON.stringify(errorMessage);
    } catch {
      errorMessage = 'Internal server error';
    }
  }

  // Standard error response format
  const response = {
    error: {
      code: error.code || 'INTERNAL_ERROR',
      message: errorMessage,
    },
  };

  // Always include details for workflow violations (user-facing errors)
  if (error.code === 'WORKFLOW_CONTRACT_VIOLATION' && error.details) {
    response.error.details = error.details;
  }
  // Include details and stack only in development for other errors
  else if (config.server.nodeEnv === 'development') {
    if (error.details) {
      response.error.details = error.details;
    }
    if (error.stack) {
      response.error.stack = error.stack;
    }
  }

  res.status(error.statusCode || 500).json(response);
}

/**
 * Async error wrapper - wraps async route handlers to catch errors
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * 404 handler
 */
function notFoundHandler(req, res, next) {
  const error = new NotFoundError(`Route ${req.method} ${req.path}`);
  next(error);
}

module.exports = {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  DatabaseError,
  errorHandler,
  asyncHandler,
  notFoundHandler,
  logError,
  handleDatabaseError,
};

