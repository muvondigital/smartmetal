/**
 * MetaSteel Tenant ID Helper
 * 
 * SINGLE SOURCE OF TRUTH for MetaSteel tenant ID
 * 
 * NEVER hardcode tenant IDs. Always use this helper to resolve it dynamically.
 * 
 * Usage:
 *   const { getMetaSteelTenantId } = require('./shared/metasteelTenant');
 *   const tenantId = await getMetaSteelTenantId(db);
 */

const { connectMigrationDb } = require('../../src/db/supabaseClient');

/**
 * Resolve MetaSteel tenant ID from database
 * @param {Object} db - Database connection (optional, will create if not provided)
 * @returns {Promise<string>} MetaSteel tenant UUID
 */
async function getMetaSteelTenantId(db = null) {
  const shouldClose = !db;
  let connectionToClose = null;
  
  if (!db) {
    db = await connectMigrationDb();
    connectionToClose = db;
  }
  
  try {
    const result = await db.query(
      `SELECT id, code, name, is_demo 
       FROM tenants 
       WHERE code = 'metasteel' 
       ORDER BY created_at ASC 
       LIMIT 1`
    );
    
    if (result.rows.length === 0) {
      throw new Error(
        'MetaSteel tenant not found in database. ' +
        'Please run seedTenantsAndUsers.js first to create the tenant.'
      );
    }
    
    const tenant = result.rows[0];
    
    if (!tenant.is_demo) {
      console.warn(
        `⚠️  Warning: MetaSteel tenant (${tenant.code}) is not marked as demo (is_demo = false)`
      );
    }
    
    return tenant.id;
  } finally {
    if (shouldClose && connectionToClose) {
      await connectionToClose.end();
    }
  }
}

/**
 * Get full MetaSteel tenant object
 * @param {Object} db - Database connection (optional, will create if not provided)
 * @returns {Promise<Object>} MetaSteel tenant object with id, code, name, is_demo
 */
async function getMetaSteelTenant(db = null) {
  const shouldClose = !db;
  let connectionToClose = null;
  
  if (!db) {
    db = await connectMigrationDb();
    connectionToClose = db;
  }
  
  try {
    const result = await db.query(
      `SELECT id, code, name, is_demo, is_active
       FROM tenants 
       WHERE code = 'metasteel' 
       ORDER BY created_at ASC 
       LIMIT 1`
    );
    
    if (result.rows.length === 0) {
      throw new Error(
        'MetaSteel tenant not found in database. ' +
        'Please run seedTenantsAndUsers.js first to create the tenant.'
      );
    }
    
    return result.rows[0];
  } finally {
    if (shouldClose && connectionToClose) {
      await connectionToClose.end();
    }
  }
}

module.exports = {
  getMetaSteelTenantId,
  getMetaSteelTenant,
};

