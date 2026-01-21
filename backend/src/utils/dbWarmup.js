/**
 * Database Connection Pool Warmup Utility
 *
 * Warms up the database connection pool on server startup to prevent
 * cold-start issues where the first few requests fail due to connection
 * pool initialization delays.
 */

const { getPool } = require('../db/supabaseClient');
const { log } = require('./logger');

/**
 * Warm up the database connection pool by establishing connections
 * and executing test queries to ensure the pool is ready.
 *
 * @param {Object} options - Warmup options
 * @param {number} options.minConnections - Minimum number of connections to establish (default: 2)
 * @param {number} options.maxRetries - Maximum number of retry attempts (default: 5)
 * @param {number} options.retryDelay - Delay between retries in ms (default: 1000)
 * @param {number} options.timeout - Timeout for each connection attempt in ms (default: 5000)
 * @returns {Promise<Object>} Warmup result with success status and metrics
 */
async function warmupConnectionPool(options = {}) {
  const {
    minConnections = 2,
    maxRetries = 5,
    retryDelay = 1000,
    timeout = 5000,
  } = options;

  log.info('Starting database connection pool warmup...', {
    minConnections,
    maxRetries,
    timeout,
  });

  const pool = getPool();
  const clients = [];
  let successCount = 0;
  let failureCount = 0;
  const startTime = Date.now();

  try {
    // Establish minimum number of connections
    for (let i = 0; i < minConnections; i++) {
      let connected = false;
      let lastError = null;

      for (let retry = 0; retry < maxRetries; retry++) {
        try {
          // Create a timeout promise
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`Connection ${i + 1} timed out after ${timeout}ms`)), timeout)
          );

          // Try to connect with timeout
          const client = await Promise.race([
            pool.connect(),
            timeoutPromise,
          ]);

          clients.push(client);

          // Execute a test query to ensure connection is working
          const testQueryPromise = client.query('SELECT 1 as test, current_user, version()');
          const timeoutTestPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`Test query ${i + 1} timed out after ${timeout}ms`)), timeout)
          );

          const result = await Promise.race([testQueryPromise, timeoutTestPromise]);

          log.info(`Connection ${i + 1}/${minConnections} established and tested successfully`, {
            user: result.rows[0]?.current_user,
            attempt: retry + 1,
          });

          successCount++;
          connected = true;
          break;
        } catch (error) {
          lastError = error;
          failureCount++;

          log.warn(`Connection ${i + 1} attempt ${retry + 1}/${maxRetries} failed`, {
            error: error.message,
            willRetry: retry < maxRetries - 1,
          });

          if (retry < maxRetries - 1) {
            // Wait before retrying
            await new Promise(resolve => setTimeout(resolve, retryDelay));
          }
        }
      }

      if (!connected) {
        throw new Error(
          `Failed to establish connection ${i + 1} after ${maxRetries} attempts. Last error: ${lastError?.message}`
        );
      }
    }

    // Release all connections back to the pool
    for (const client of clients) {
      try {
        client.release();
      } catch (error) {
        log.warn('Failed to release warmup connection', { error: error.message });
      }
    }

    const duration = Date.now() - startTime;
    log.info('Database connection pool warmup completed successfully', {
      successCount,
      failureCount,
      duration: `${duration}ms`,
      averageTime: `${Math.round(duration / minConnections)}ms`,
    });

    return {
      success: true,
      connectionsEstablished: successCount,
      totalAttempts: successCount + failureCount,
      duration,
    };
  } catch (error) {
    // Release any established connections
    for (const client of clients) {
      try {
        client.release();
      } catch (releaseError) {
        // Ignore release errors during cleanup
      }
    }

    const duration = Date.now() - startTime;
    log.error('Database connection pool warmup failed', error, {
      successCount,
      failureCount,
      duration: `${duration}ms`,
    });

    return {
      success: false,
      connectionsEstablished: successCount,
      totalAttempts: successCount + failureCount,
      duration,
      error: error.message,
    };
  }
}

/**
 * Execute a database operation with automatic retry logic.
 * Useful for operations that might fail due to connection issues on startup.
 *
 * @param {Function} operation - Async function that performs the database operation
 * @param {Object} options - Retry options
 * @param {number} options.maxRetries - Maximum number of retry attempts (default: 3)
 * @param {number} options.retryDelay - Delay between retries in ms (default: 1000)
 * @param {number} options.backoffMultiplier - Multiplier for exponential backoff (default: 1.5)
 * @param {string} options.operationName - Name of the operation for logging (default: 'Database operation')
 * @returns {Promise<any>} Result of the operation
 */
async function retryDbOperation(operation, options = {}) {
  const {
    maxRetries = 3,
    retryDelay = 1000,
    backoffMultiplier = 1.5,
    operationName = 'Database operation',
  } = options;

  let lastError = null;
  let currentDelay = retryDelay;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await operation();

      if (attempt > 0) {
        log.info(`${operationName} succeeded after ${attempt} retries`);
      }

      return result;
    } catch (error) {
      lastError = error;

      // Check if error is retryable
      const isRetryable = isRetryableError(error);

      if (!isRetryable || attempt === maxRetries) {
        log.error(`${operationName} failed`, error, {
          attempt: attempt + 1,
          maxRetries: maxRetries + 1,
          retryable: isRetryable,
        });
        throw error;
      }

      log.warn(`${operationName} failed, retrying...`, {
        error: error.message,
        attempt: attempt + 1,
        maxRetries: maxRetries + 1,
        nextRetryIn: `${currentDelay}ms`,
      });

      // Wait before retrying with exponential backoff
      await new Promise(resolve => setTimeout(resolve, currentDelay));
      currentDelay = Math.round(currentDelay * backoffMultiplier);
    }
  }

  // Should never reach here, but just in case
  throw lastError;
}

/**
 * Check if an error is retryable (connection-related)
 *
 * @param {Error} error - The error to check
 * @returns {boolean} True if the error is retryable
 */
function isRetryableError(error) {
  if (!error) return false;

  const errorMessage = error.message?.toLowerCase() || '';
  const errorCode = error.code?.toLowerCase() || '';

  // Connection-related errors that should be retried
  const retryablePatterns = [
    'connection',
    'timeout',
    'econnrefused',
    'enotfound',
    'etimedout',
    'pool',
    'client',
    'network',
    'econnreset',
    'epipe',
    // PostgreSQL-specific connection errors
    '08000', // connection_exception
    '08003', // connection_does_not_exist
    '08006', // connection_failure
    '08001', // sqlclient_unable_to_establish_sqlconnection
    '08004', // sqlserver_rejected_establishment_of_sqlconnection
    // Transient errors
    '40001', // serialization_failure
    '40P01', // deadlock_detected
    '55P03', // lock_not_available
    // Invalid UUID errors (warmup issue)
    '22p02', // invalid_text_representation (includes UUID errors)
  ];

  return retryablePatterns.some(pattern =>
    errorMessage.includes(pattern) || errorCode.includes(pattern)
  );
}

/**
 * Create a middleware that checks database connectivity before processing requests.
 * This ensures that requests are only processed when the database is ready.
 *
 * @param {Object} options - Middleware options
 * @param {number} options.timeout - Timeout for connectivity check in ms (default: 3000)
 * @returns {Function} Express middleware function
 */
function createDbReadinessMiddleware(options = {}) {
  const { timeout = 3000 } = options;
  let isReady = false;
  let lastCheckTime = 0;
  const checkInterval = 5000; // Only check every 5 seconds to avoid overhead

  return async (req, res, next) => {
    const now = Date.now();

    // Skip check if recently verified
    if (isReady && (now - lastCheckTime) < checkInterval) {
      return next();
    }

    try {
      const pool = getPool();

      // Quick connectivity check with timeout
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Database readiness check timed out')), timeout)
      );

      await Promise.race([
        pool.query('SELECT 1'),
        timeoutPromise,
      ]);

      isReady = true;
      lastCheckTime = now;
      next();
    } catch (error) {
      log.error('Database not ready', error);
      res.status(503).json({
        error: 'Service temporarily unavailable',
        message: 'Database is not ready. Please try again in a moment.',
        retryAfter: 5,
      });
    }
  };
}

module.exports = {
  warmupConnectionPool,
  retryDbOperation,
  isRetryableError,
  createDbReadinessMiddleware,
};
