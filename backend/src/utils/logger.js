/**
 * Structured Logging Utility
 *
 * Provides centralized logging using pino for production-ready structured logging.
 * Supports different log levels and environment-aware formatting.
 * Integrated with Sentry for error tracking.
 *
 * Developed by Muvon Digital (Muvon Energy)
 */

const pino = require('pino');
const { config } = require('../config/env');

// Lazy-load Sentry to avoid circular dependencies
let sentryModule = null;
function getSentry() {
  if (!sentryModule) {
    try {
      sentryModule = require('../config/sentry');
    } catch (e) {
      // Sentry not available yet (during initialization)
      sentryModule = null;
    }
  }
  return sentryModule;
}

// Create logger instance with environment-aware configuration
const logger = pino({
  level: process.env.LOG_LEVEL || (config.server.nodeEnv === 'production' ? 'info' : 'debug'),
  transport: config.server.nodeEnv === 'development'
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      }
    : undefined, // Use JSON in production
  base: {
    env: config.server.nodeEnv,
    service: 'smartmetal-api',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

/**
 * Convenience methods that match common logging patterns
 */
const log = {
  /**
   * Log info message
   */
  info: (message, context = {}) => {
    logger.info(context, message);
  },

  /**
   * Log warning message
   */
  warn: (message, context = {}) => {
    logger.warn(context, message);
  },

  /**
   * Log error message
   */
  error: (message, error = null, context = {}) => {
    const errorContext = {
      ...context,
    };

    if (error) {
      errorContext.error = {
        name: error.name,
        message: error.message,
        stack: config.server.nodeEnv === 'development' ? error.stack : undefined,
        code: error.code,
        statusCode: error.statusCode,
      };

      // Send to Sentry if it's a 500+ error or critical error
      const sentry = getSentry();
      if (sentry && (error.statusCode >= 500 || error.statusCode === undefined)) {
        sentry.captureError(error, { tags: context, extra: { message } });
      }
    }

    logger.error(errorContext, message);
  },

  /**
   * Log debug message (only in development)
   */
  debug: (message, context = {}) => {
    logger.debug(context, message);
  },

  /**
   * Log request (for middleware)
   * MODIFIED: Only log errors (4xx/5xx) or slow requests (>1s) to reduce log noise
   */
  request: (req, res, responseTime, context = {}) => {
    // Only log errors or slow requests to save tokens when debugging
    if (res.statusCode >= 400 || responseTime > 1000) {
      logger.info(
        {
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          responseTime: `${responseTime}ms`,
          ip: req.ip,
          userAgent: req.get('user-agent'),
          ...context,
        },
        'HTTP request'
      );
    }
  },

  /**
   * Log database operation
   */
  db: (operation, context = {}) => {
    logger.info({ ...context, type: 'database' }, `DB: ${operation}`);
  },

  /**
   * Structured logging functions for observability
   * These functions ensure correlationId and tenantId are always included when available
   */

  /**
   * Log info message with structured context
   * @param {string} message - Log message
   * @param {Object} context - Context object (correlationId, tenantId, rfqId, pricingRunId, agreementId, jobName, etc.)
   */
  logInfo: (message, context = {}) => {
    logger.info(context, message);
  },

  /**
   * Log warning message with structured context
   * @param {string} message - Log message
   * @param {Object} context - Context object (correlationId, tenantId, rfqId, pricingRunId, agreementId, jobName, etc.)
   */
  logWarn: (message, context = {}) => {
    logger.warn(context, message);
  },

  /**
   * Log error message with structured context
   * @param {string} message - Log message
   * @param {Error|null} error - Error object (optional)
   * @param {Object} context - Context object (correlationId, tenantId, rfqId, pricingRunId, agreementId, jobName, etc.)
   */
  logError: (message, error = null, context = {}) => {
    const errorContext = {
      ...context,
    };

    if (error) {
      errorContext.error = {
        name: error.name,
        message: error.message,
        stack: config.server.nodeEnv === 'development' ? error.stack : undefined,
        code: error.code,
        statusCode: error.statusCode,
      };

      // Send to Sentry if it's a 500+ error or critical error
      const sentry = getSentry();
      if (sentry && (error.statusCode >= 500 || error.statusCode === undefined)) {
        sentry.captureError(error, { tags: context, extra: { message } });
      }
    }

    logger.error(errorContext, message);
  },
};

module.exports = {
  logger,
  log,
  // Export convenience functions directly for easier destructuring
  logInfo: log.logInfo,
  logError: log.logError,
  logWarn: log.logWarn,
};

