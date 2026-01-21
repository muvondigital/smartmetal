const rateLimit = require('express-rate-limit');
const { log } = require('../utils/logger');

/**
 * Rate Limiter Configuration
 *
 * NOTE: This feature is IMPLEMENTED and ACTIVE in the platform.
 * Older architecture reports may incorrectly state it is missing.
 *
 * Purpose: Prevent abuse and budget overrun on AI endpoints
 *
 * Budget Protection:
 * - Azure OpenAI GPT-4o: ~$0.03 per request (with enrichment)
 * - Azure Document Intelligence: ~$0.10 per page
 * - Without rate limiting, 10,000 requests = $300-$1000+ overrun
 *
 * Rate Limits:
 * - AI endpoints: 10 requests per 15 minutes per IP
 * - Standard endpoints: 100 requests per 15 minutes per IP
 */

/**
 * Aggressive rate limiter for AI endpoints
 * Prevents budget overrun from abuse
 */
const aiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 requests per windowMs
  message: {
    error: 'Too many AI requests',
    details: 'You have exceeded the rate limit for AI endpoints. Please try again in 15 minutes.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  handler: (req, res) => {
    const logData = {
      ip: req.ip,
      path: req.path,
      method: req.method,
      correlationId: req.correlationId,
      tenantId: req.tenantId,
    };
    
    console.warn('[RATE LIMIT HIT - AI]', req.method, req.originalUrl, 'tenant:', req.tenantId || 'none', 'ip:', req.ip);
    log.logWarn('AI rate limit exceeded', logData);

    res.status(429).json({
      error: 'Too many AI requests',
      details: 'You have exceeded the rate limit for AI endpoints. Please try again in 15 minutes.',
      retryAfter: '15 minutes',
      limit: 10,
      windowMs: 15 * 60 * 1000
    });
  },
  // Skip rate limiting for certain scenarios (e.g., internal requests)
  skip: (req) => {
    // Skip in development mode to avoid throttling during testing
    if (process.env.NODE_ENV === 'development') {
      return true;
    }

    // Skip if request has an admin bypass header (configure in production with secret token)
    const bypassToken = req.headers['x-rate-limit-bypass'];
    if (bypassToken && bypassToken === process.env.RATE_LIMIT_BYPASS_TOKEN) {
      log.logInfo('Rate limit bypassed with valid token', {
        ip: req.ip,
        path: req.path,
      });
      return true;
    }
    return false;
  }
});

/**
 * Standard rate limiter for regular API endpoints
 */
const standardRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.STANDARD_RATE_LIMIT_MAX
    ? Number(process.env.STANDARD_RATE_LIMIT_MAX)
    : process.env.NODE_ENV === 'development'
    ? 1000 // loosen limits locally to avoid blocking dev traffic
    : 100, // Limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests',
    details: 'You have exceeded the rate limit. Please try again in 15 minutes.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // In development, skip rate limiting to prevent local throttling
    if (process.env.NODE_ENV === 'development') {
      return true;
    }
    // Admin bypass token, same pattern as AI limiter
    const bypassToken = req.headers['x-rate-limit-bypass'];
    if (bypassToken && bypassToken === process.env.RATE_LIMIT_BYPASS_TOKEN) {
      log.logInfo('Rate limit bypassed with valid token', {
        ip: req.ip,
        path: req.path,
      });
      return true;
    }
    return false;
  },
  handler: (req, res) => {
    const logData = {
      ip: req.ip,
      path: req.path,
      method: req.method,
      correlationId: req.correlationId,
      tenantId: req.tenantId,
    };
    
    console.warn('[RATE LIMIT HIT - STANDARD]', req.method, req.originalUrl, 'tenant:', req.tenantId || 'none', 'ip:', req.ip);
    log.logWarn('Standard rate limit exceeded', logData);

    res.status(429).json({
      error: 'Too many requests',
      details: 'You have exceeded the rate limit. Please try again in 15 minutes.',
      retryAfter: '15 minutes',
      limit: 100,
      windowMs: 15 * 60 * 1000
    });
  }
});

/**
 * Strict rate limiter for authentication endpoints
 * Prevents brute-force attacks
 */
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 login attempts per windowMs
  message: {
    error: 'Too many authentication attempts',
    details: 'You have exceeded the rate limit for authentication. Please try again in 15 minutes.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Don't count successful auth attempts
  handler: (req, res) => {
    const logData = {
      ip: req.ip,
      path: req.path,
      method: req.method,
      correlationId: req.correlationId,
      tenantId: req.tenantId,
    };
    
    console.warn('[RATE LIMIT HIT - AUTH]', req.method, req.originalUrl, 'tenant:', req.tenantId || 'none', 'ip:', req.ip);
    log.logWarn('Auth rate limit exceeded', logData);

    res.status(429).json({
      error: 'Too many authentication attempts',
      details: 'You have exceeded the rate limit for authentication. Please try again in 15 minutes.',
      retryAfter: '15 minutes',
      limit: 5,
      windowMs: 15 * 60 * 1000
    });
  }
});

module.exports = {
  aiRateLimiter,
  standardRateLimiter,
  authRateLimiter
};
