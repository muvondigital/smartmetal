/**
 * Correlation ID Middleware
 * 
 * Generates or reads correlation IDs for request tracing across services and background jobs.
 * 
 * Strategy:
 * 1. Read X-Request-Id header if provided
 * 2. If missing, generate a UUID v4
 * 3. Attach correlationId to req and res objects
 * 
 * Developed by Muvon Digital (Muvon Energy)
 */

const crypto = require('crypto');

/**
 * Correlation ID middleware
 * Must run BEFORE tenantMiddleware and all routes
 */
function correlationIdMiddleware(req, res, next) {
  // Read X-Request-Id header if provided
  const requestId = req.headers['x-request-id'] || req.headers['X-Request-Id'];
  
  // Generate UUID v4 if not provided (using Node.js built-in crypto)
  const correlationId = requestId || crypto.randomUUID();
  
  // Attach to request object
  req.correlationId = correlationId;
  
  // Attach to response object (for logging)
  res.correlationId = correlationId;
  
  // Set response header so clients can track their requests
  res.setHeader('X-Request-Id', correlationId);
  
  // Add to log context if it exists
  if (req.logContext) {
    req.logContext.correlationId = correlationId;
  } else {
    req.logContext = { correlationId };
  }
  
  next();
}

module.exports = {
  correlationIdMiddleware,
};

