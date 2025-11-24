/**
 * Centralized Error Handling Middleware
 * Provides structured error responses and logging
 */

const { config } = require('../config/env');

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
 * Structured logger
 */
function logError(error, req = null) {
  const logData = {
    timestamp: new Date().toISOString(),
    error: {
      name: error.name,
      message: error.message,
      code: error.code || 'UNKNOWN_ERROR',
      stack: config.server.nodeEnv === 'development' ? error.stack : undefined,
    },
  };

  if (req) {
    logData.request = {
      method: req.method,
      path: req.path,
      query: req.query,
      body: config.server.nodeEnv === 'development' ? req.body : '[REDACTED]',
      ip: req.ip,
      userAgent: req.get('user-agent'),
    };
  }

  if (error.details) {
    logData.error.details = error.details;
  }

  if (error.statusCode >= 500) {
    console.error('ERROR:', JSON.stringify(logData, null, 2));
  } else if (error.statusCode >= 400) {
    console.warn('WARNING:', JSON.stringify(logData, null, 2));
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
    return new ValidationError('Required field is missing');
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
    // Wrap unknown errors
    error = new AppError(
      error.message || 'Internal server error',
      error.statusCode || 500,
      'INTERNAL_ERROR',
      config.server.nodeEnv === 'development' ? error.stack : null
    );
  }

  // Log the error
  logError(error, req);

  // Send error response
  const response = {
    success: false,
    error: {
      message: error.message,
      code: error.code || 'ERROR',
    },
  };

  // Include details in development
  if (config.server.nodeEnv === 'development' && error.details) {
    response.error.details = error.details;
  }

  // Include stack trace in development
  if (config.server.nodeEnv === 'development' && error.stack) {
    response.error.stack = error.stack;
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

