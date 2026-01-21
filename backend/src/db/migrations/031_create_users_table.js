/**
 * Migration 031: Create Users Table
 * 
 * Purpose: Creates users table for authentication and authorization
 * Part of: Shared login portal (Mode A) - Multi-tenant authentication
 * 
 * Design:
 * - Users belong to tenants (tenant_id foreign key)
 * - Email must be unique per tenant (not globally unique)
 * - Password stored as bcrypt hash
 * - Role-based access control (admin, manager, user, viewer)
 * - Soft delete support (is_active flag)
 * 
 * Multi-Tenant Note:
 * - Users are tenant-scoped: same email can exist in different tenants
 * - Login endpoint will resolve tenant from user record
 * - JWT token includes tenant_id for subsequent requests
 */

async function up(db) {
  if (!db) {
    throw new Error('Migration 031 requires db parameter. Use runAllMigrations.js to run migrations.');
  }
  
  console.log('Running migration 031: Create users table...');
  
  try {
    // 1. Create users table
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'manager', 'user', 'viewer')),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        is_active BOOLEAN DEFAULT true,
        last_login_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        
        -- Email must be unique per tenant (not globally)
        UNIQUE(tenant_id, email)
      );
    `);
    console.log('✓ Created users table');
    
    // 2. Create indexes for performance
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON users(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_users_tenant_email ON users(tenant_id, email);
      CREATE INDEX IF NOT EXISTS idx_users_active ON users(tenant_id, is_active) WHERE is_active = true;
    `);
    console.log('✓ Created indexes for users table');
    
    // 3. Add updated_at trigger
    await db.query(`
      DROP TRIGGER IF EXISTS update_users_updated_at ON users;
      CREATE TRIGGER update_users_updated_at
        BEFORE UPDATE ON users
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `);
    console.log('✓ Added updated_at trigger');
    
    // 4. Add comments
    await db.query(`
      COMMENT ON TABLE users IS 'User accounts for authentication. Users are tenant-scoped.';
      COMMENT ON COLUMN users.tenant_id IS 'Tenant this user belongs to. Users can only access their tenant data.';
      COMMENT ON COLUMN users.password_hash IS 'Bcrypt hash of user password. Never store plaintext passwords.';
      COMMENT ON COLUMN users.role IS 'User role: admin, manager, user, viewer. Controls access permissions.';
    `);
    
    console.log('✅ Migration 031 completed: Users table created');
    
  } catch (error) {
    console.error('❌ Migration 031 failed:', error);
    throw error;
  }
}

async function down(db) {
  if (!db) {
    throw new Error('Migration 031 requires db parameter. Use runAllMigrations.js to run migrations.');
  }
  
  console.log('Rolling back migration 031: Drop users table...');
  
  try {
    await db.query(`DROP TABLE IF EXISTS users CASCADE;`);
    console.log('✅ Rollback completed: Users table dropped');
    
  } catch (error) {
    console.error('❌ Rollback failed:', error);
    throw error;
  }
}

module.exports = {
  up,
  down,
};


