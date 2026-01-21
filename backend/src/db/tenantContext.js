/**
 * Tenant Context Helper
 *
 * Provides utilities for executing database queries within a tenant context.
 * Sets app.tenant_id PostgreSQL GUC (Grand Unified Configuration) variable
 * so that Row-Level Security (RLS) policies can enforce tenant isolation.
 *
 * Usage:
 *   const { withTenantContext } = require('./db/tenantContext');
 *   const result = await withTenantContext(tenantId, async (client) => {
 *     return await client.query('SELECT * FROM rfqs');
 *   });
 */

const { getPool } = require('./supabaseClient');

/**
 * Execute a callback function within a tenant context.
 * Sets app.tenant_id in the database session so RLS policies can filter rows.
 *
 * @param {string} tenantId - Tenant UUID
 * @param {Function} callback - Async function that receives a client and executes queries
 * @returns {Promise<any>} Result of the callback
 */
async function withTenantContext(tenantId, callback) {
  if (!tenantId) {
    throw new Error('tenantId is required for withTenantContext');
  }

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(tenantId)) {
    throw new Error(`Invalid tenantId format: ${tenantId}. Must be a valid UUID.`);
  }

  const client = await getPool().connect();
  
  try {
    // Start a transaction so SET LOCAL works correctly
    await client.query('BEGIN');
    
    // Set tenant context for this connection
    // Using SET LOCAL ensures it only applies to the current transaction
    // Note: SET LOCAL doesn't support parameterized queries, so we use string interpolation
    // with UUID validation (already done above) for safety
    await client.query(`SET LOCAL app.tenant_id = '${tenantId}'`);
    
    // Execute the callback with the client
    const result = await callback(client);
    
    // Commit the transaction
    await client.query('COMMIT');
    
    return result;
  } catch (error) {
    // Rollback transaction on error
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      // Ignore rollback errors, but log them
      console.error('Failed to rollback tenant context transaction:', rollbackError.message);
    }
    
    // Log error with context for debugging
    console.error('Error in tenant context:', {
      tenantId,
      error: error.message,
      stack: error.stack
    });
    throw error;
  } finally {
    // Always release the client back to the pool
    client.release();
  }
}

/**
 * Execute queries within a transaction with tenant context.
 * Combines transaction semantics with tenant context setting.
 *
 * @param {string} tenantId - Tenant UUID
 * @param {Function} callback - Async function that receives a client and executes queries
 * @returns {Promise<any>} Result of the callback
 */
async function withTenantTransaction(tenantId, callback) {
  if (!tenantId) {
    throw new Error('tenantId is required for withTenantTransaction');
  }

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(tenantId)) {
    throw new Error(`Invalid tenantId format: ${tenantId}. Must be a valid UUID.`);
  }

  const client = await getPool().connect();
  
  try {
    await client.query('BEGIN');
    
    // Set tenant context within the transaction
    // Note: SET LOCAL doesn't support parameterized queries, so we use string interpolation
    // with UUID validation (already done above) for safety
    await client.query(`SET LOCAL app.tenant_id = '${tenantId}'`);
    
    // Execute the callback
    const result = await callback(client);
    
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('Failed to rollback tenant transaction:', rollbackError.message);
      // Rethrow the original error, not the rollback error
    }
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Create a query helper that automatically sets tenant context.
 * Returns a function that can be used like db.query() but with tenant context.
 *
 * @param {string} tenantId - Tenant UUID
 * @returns {Function} Query function that sets tenant context
 */
function createTenantQuery(tenantId) {
  if (!tenantId) {
    throw new Error('tenantId is required for createTenantQuery');
  }

  return async (text, params) => {
    return await withTenantContext(tenantId, async (client) => {
      return await client.query(text, params);
    });
  };
}

module.exports = {
  withTenantContext,
  withTenantTransaction,
  createTenantQuery,
};

