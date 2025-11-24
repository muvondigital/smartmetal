const { Pool } = require('pg');
const { config } = require('../config/env');

let pool = null;

/**
 * Initialize database connection pool
 * @returns {Pool} PostgreSQL connection pool
 */
function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: config.database.url,
      max: config.database.pool.max,
      min: config.database.pool.min,
      idleTimeoutMillis: config.database.pool.idleTimeout,
      connectionTimeoutMillis: config.database.pool.connectionTimeout,
    });

    // Handle pool errors
    pool.on('error', (err) => {
      console.error('Unexpected error on idle database client', err);
    });
  }
  return pool;
}

/**
 * Get a database client from the pool
 * @returns {Promise<Pool>} Database pool
 */
async function getDb() {
  return getPool();
}

/**
 * Execute a query with proper error handling
 * @param {string} text - SQL query text
 * @param {Array} params - Query parameters
 * @returns {Promise<Object>} Query result
 */
async function query(text, params) {
  const start = Date.now();
  try {
    const result = await getPool().query(text, params);
    const duration = Date.now() - start;
    if (process.env.NODE_ENV === 'development') {
      console.log('Executed query', { text: text.substring(0, 100), duration, rows: result.rowCount });
    }
    return result;
  } catch (error) {
    const duration = Date.now() - start;
    console.error('Database query error', { text: text.substring(0, 100), duration, error: error.message });
    throw error;
  }
}

/**
 * Execute queries within a transaction
 * @param {Function} callback - Async function that receives a client and executes queries
 * @returns {Promise<any>} Result of the callback
 */
async function transaction(callback) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Close the database pool (for graceful shutdown)
 * @returns {Promise<void>}
 */
async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

// Legacy compatibility - maintain existing function signatures
async function connectDb() {
  return getDb();
}

module.exports = {
  getPool,
  getDb,
  query,
  transaction,
  closePool,
  connectDb, // Legacy compatibility
};

