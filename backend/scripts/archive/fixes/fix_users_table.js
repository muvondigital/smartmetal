/**
 * Fix users table to add tenant_id column if missing
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { connectDb } = require('../src/db/supabaseClient');

async function fixUsersTable() {
  const db = await connectDb();
  
  try {
    // Get all existing columns
    const columnsResult = await db.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users'
      ORDER BY ordinal_position;
    `);
    
    const existingColumns = columnsResult.rows.map(r => r.column_name);
    console.log('Existing columns:', existingColumns.join(', '));
    
    // Get NSC tenant ID
    const nscResult = await db.query(`
      SELECT id FROM tenants WHERE code = 'nsc' LIMIT 1;
    `);
    
    if (nscResult.rows.length === 0) {
      throw new Error('NSC tenant not found. Please run migrations first.');
    }
    
    const nscTenantId = nscResult.rows[0].id;
    
    // Add password_hash if missing
    if (!existingColumns.includes('password_hash')) {
      console.log('Adding password_hash column...');
      await db.query(`
        ALTER TABLE users
        ADD COLUMN password_hash TEXT;
      `);
      // Set a temporary password for existing users (they'll need to reset)
      await db.query(`
        UPDATE users
        SET password_hash = '$2b$10$placeholder.hash.that.needs.to.be.reset'
        WHERE password_hash IS NULL;
      `);
      await db.query(`
        ALTER TABLE users
        ALTER COLUMN password_hash SET NOT NULL;
      `);
      console.log('✓ Added password_hash column');
    }
    
    // Add tenant_id if missing
    if (!existingColumns.includes('tenant_id')) {
      console.log('Adding tenant_id column...');
      await db.query(`
        ALTER TABLE users
        ADD COLUMN tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
      `);
      
      await db.query(`
        UPDATE users
        SET tenant_id = $1
        WHERE tenant_id IS NULL;
      `, [nscTenantId]);
      
      await db.query(`
        ALTER TABLE users
        ALTER COLUMN tenant_id SET NOT NULL;
      `);
      console.log('✓ Added tenant_id column');
    }
    
    // Add is_active if missing
    if (!existingColumns.includes('is_active')) {
      console.log('Adding is_active column...');
      await db.query(`
        ALTER TABLE users
        ADD COLUMN is_active BOOLEAN DEFAULT true;
      `);
      console.log('✓ Added is_active column');
    }
    
    // Add last_login_at if missing
    if (!existingColumns.includes('last_login_at')) {
      console.log('Adding last_login_at column...');
      await db.query(`
        ALTER TABLE users
        ADD COLUMN last_login_at TIMESTAMP WITH TIME ZONE;
      `);
      console.log('✓ Added last_login_at column');
    }
    
    // Update role constraint if needed (migration 031 uses different roles)
    try {
      await db.query(`
        ALTER TABLE users
        DROP CONSTRAINT IF EXISTS check_role;
      `);
      await db.query(`
        ALTER TABLE users
        ADD CONSTRAINT check_role CHECK (role IN ('admin', 'manager', 'user', 'viewer'));
      `);
      console.log('✓ Updated role constraint');
    } catch (e) {
      // Constraint might not exist or already correct
      console.log('  (Role constraint already correct)');
    }
    
    // Add unique constraint on (tenant_id, email)
    await db.query(`
      ALTER TABLE users
      DROP CONSTRAINT IF EXISTS users_email_key;
    `);
    
    try {
      await db.query(`
        ALTER TABLE users
        ADD CONSTRAINT users_tenant_email_unique UNIQUE(tenant_id, email);
      `);
      console.log('✓ Added unique constraint on (tenant_id, email)');
    } catch (e) {
      if (e.message.includes('already exists')) {
        console.log('  (Unique constraint already exists)');
      } else {
        throw e;
      }
    }
    
    // Create indexes
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON users(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_users_tenant_email ON users(tenant_id, email);
      CREATE INDEX IF NOT EXISTS idx_users_active ON users(tenant_id, is_active) WHERE is_active = true;
    `);
    console.log('✓ Created indexes');
    
    console.log('\n✅ Successfully fixed users table');
    console.log(`✓ Assigned all existing users to NSC tenant (${nscTenantId})`);
    
  } catch (error) {
    console.error('❌ Error fixing users table:', error);
    throw error;
  } finally {
    await db.end();
  }
}

if (require.main === module) {
  fixUsersTable()
    .then(() => {
      console.log('✅ Script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Script failed:', error);
      process.exit(1);
    });
}

module.exports = { fixUsersTable };

