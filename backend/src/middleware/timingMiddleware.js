// SmartMetal CPQ - A product from Muvon Digital, an innovation arm of Muvon Energy
// Developed by Muvon Digital, the innovation arm of Muvon Energy.
// Copyright (c) 2025 Muvon Energy. All rights reserved.
// Proprietary & Confidential — Not for distribution.

const { log } = require('../utils/logger');

/**
 * Timing middleware for API requests
 * Logs response time for all routes
 * Can be toggled via ENABLE_TIMING_LOGS environment variable
 *
 * Usage:
 * 1. Add to .env: ENABLE_TIMING_LOGS=true
 * 2. Mount in index.js after other middleware: app.use(timingMiddleware);
 *
 * Logs include:
 * - correlationId, tenantId (from existing middleware)
 * - HTTP method, path, status code
 * - Response time in milliseconds (wall clock and high-resolution)
 *
 * Only logs requests that are:
 * - Slow (>500ms), OR
 * - Errors (status >= 400)
 *
 * For normal fast requests, use standard request logging middleware already present.
 */
function timingMiddleware(req, res, next) {
  const enabled = process.env.ENABLE_TIMING_LOGS === 'true';

  if (!enabled) {
    return next();
  }

  const startTime = Date.now();
  const startHrTime = process.hrtime();

  // Hook into response finish event
  res.on('finish', () => {
    const elapsedMs = Date.now() - startTime;
    const elapsedHr = process.hrtime(startHrTime);
    const elapsedHrMs = elapsedHr[0] * 1000 + elapsedHr[1] / 1e6;

    const timingContext = {
      correlationId: req.correlationId,
      tenantId: req.tenantId,
      tenantCode: req.tenantCode,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      responseTimeMs: Math.round(elapsedMs),
      responseTimeHrMs: parseFloat(elapsedHrMs.toFixed(2)),
      type: 'timing',
    };

    // Only log slow requests (>500ms) or errors
    if (elapsedMs > 500) {
      log.logWarn('⏱️  Slow request detected', timingContext);
    } else if (res.statusCode >= 400) {
      log.logWarn('⚠️  Error request', timingContext);
    } else {
      // Normal fast requests - log at debug level
      log.debug('Request completed', timingContext);
    }
  });

  next();
}

module.exports = { timingMiddleware };
