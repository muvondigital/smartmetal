const { Pool } = require('pg');
const { config } = require('../config/env');

let pool = null;
let migrationPool = null;

/**
 * Initialize database connection pool
 * @returns {Pool} PostgreSQL connection pool
 */
function getPool() {
  if (!pool) {
    // Runtime pool MUST use DATABASE_URL (never MIGRATION_DATABASE_URL)
    // This ensures RLS is enforced for application queries
    const runtimeUrl = config.database.url;
    
    if (!runtimeUrl) {
      throw new Error(
        'DATABASE_URL is required for runtime database connection. ' +
        'Please set DATABASE_URL in your .env file. ' +
        'MIGRATION_DATABASE_URL is only for migrations, not runtime.'
      );
    }
    
    // Log connection string being used (mask password for security)
    const maskedUrl = runtimeUrl.replace(/:[^:@]+@/, ':***@');
    console.log(`🔌 [DB] Runtime pool initializing`);
    console.log(`🔌 [DB] Runtime using DATABASE_URL: ${maskedUrl}`);
    
    // Extract username from connection string for verification
    let dbUser = 'unknown';
    try {
      const parsedUrl = new URL(runtimeUrl);
      dbUser = parsedUrl.username || 'unknown';
    } catch (parseError) {
      const urlMatch = runtimeUrl.match(/postgres(?:ql)?:\/\/([^:]+):/i);
      dbUser = urlMatch ? urlMatch[1] : 'unknown';
    }
    
    // Hard-fail if using postgres superuser (RLS will be bypassed)
    if (dbUser === 'postgres') {
      const fatalMessage =
        '[DB] FATAL: DATABASE_URL is configured with the "postgres" superuser. ' +
        'RLS will be bypassed and tenant isolation is unsafe. ' +
        'Configure DATABASE_URL to use the non-superuser application role (e.g., smartmetal_app).';
      console.error(fatalMessage);
      throw new Error(fatalMessage);
    } else {
      console.log(`🔌 [DB] Runtime user: ${dbUser} (RLS enforced)`);
      console.log(`[DB] Runtime using DATABASE_URL; expected current_user = ${dbUser}`);
    }
    
    pool = new Pool({
      connectionString: runtimeUrl,
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
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('Failed to rollback transaction:', rollbackError.message);
      // Rethrow the original error, not the rollback error
    }
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get a migration/admin database connection pool that bypasses RLS
 * ONLY use this for migrations and seed scripts, NEVER in runtime application code
 * @returns {Pool} PostgreSQL connection pool using superuser role
 */
function getMigrationPool() {
  if (!migrationPool) {
    const migrationUrl = config.database.migrationUrl || config.database.url;

    if (!migrationUrl) {
      throw new Error(
        'MIGRATION_DATABASE_URL is required for migration/seed operations. ' +
        'Please set MIGRATION_DATABASE_URL in your .env file.'
      );
    }

    // Log connection string being used (mask password for security)
    const maskedUrl = migrationUrl.replace(/:[^:@]+@/, ':***@');
    console.log(`🔌 [DB] Migration pool initializing`);
    console.log(`🔌 [DB] Migration using: ${maskedUrl}`);

    // Extract username from connection string for verification
    const urlMatch = migrationUrl.match(/postgresql:\/\/([^:]+):/);
    const dbUser = urlMatch ? urlMatch[1] : 'unknown';

    console.log(`🔌 [DB] Migration user: ${dbUser} (RLS bypassed)`);
    console.warn('⚠️  [DB] WARNING: Using migration pool - RLS is BYPASSED');
    console.warn('⚠️  [DB] Only use for migrations and seed scripts, never in runtime code');

    migrationPool = new Pool({
      connectionString: migrationUrl,
      max: config.database.pool.max,
      min: config.database.pool.min,
      idleTimeoutMillis: config.database.pool.idleTimeout,
      connectionTimeoutMillis: config.database.pool.connectionTimeout,
    });

    // Handle pool errors
    migrationPool.on('error', (err) => {
      console.error('Unexpected error on idle migration database client', err);
    });
  }
  return migrationPool;
}

/**
 * Get a migration database client (for seed scripts and migrations)
 * @returns {Promise<Pool>} Database pool using superuser role
 */
async function getMigrationDb() {
  return getMigrationPool();
}

/**
 * Connect to database using migration credentials (bypasses RLS)
 * ONLY use this for migrations and seed scripts
 * @returns {Promise<Pool>} Database pool
 */
async function connectMigrationDb() {
  return getMigrationPool();
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
  if (migrationPool) {
    await migrationPool.end();
    migrationPool = null;
  }
}

// Legacy compatibility - maintain existing function signatures
// Note: This function performs a connectivity check which can be expensive.
// Consider using getPool() or query() directly for better performance.
async function connectDb() {
  const pool = getPool();

  // Skip connectivity check by default to prevent startup hangs
  // Only perform check if explicitly enabled via DB_ENABLE_CONNECTIVITY_CHECK env var
  // This prevents blocking during startup when database might be slow or temporarily unavailable
  if (process.env.DB_ENABLE_CONNECTIVITY_CHECK === 'true') {
    try {
      // Use a timeout to prevent hanging
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Database connectivity check timed out after 5 seconds')), 5000)
      );
      await Promise.race([pool.query('SELECT 1'), timeoutPromise]);
    } catch (error) {
      console.error('Database connectivity check failed:', error.message);
      // In development, warn but don't throw - allow server to start
      if (process.env.NODE_ENV === 'production') {
        throw error;
      }
      console.warn('⚠️  Database connectivity check failed, but continuing startup...');
      console.warn('   Server will start, but database operations may fail until connection is established.');
    }
  }

  return pool;
}

module.exports = {
  getPool,
  getDb,
  query,
  transaction,
  closePool,
  connectDb, // Legacy compatibility
  getMigrationPool,
  getMigrationDb,
  connectMigrationDb, // For seed scripts and migrations
};

