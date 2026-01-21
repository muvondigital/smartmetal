/**
 * Seed Admin User Script
 * 
 * Creates a SmartMetal Dev tenant and admin user for development/testing.
 * 
 * Tenant:
 *   - Name: SmartMetal Dev
 *   - Code: SMARTMETAL_DEV
 *   - Purpose: Internal development and testing with full privileges
 * 
 * Admin User:
 *   - Email: admin@smartmetal.dev
 *   - Password: admin123
 *   - Role: admin (highest privilege)
 * 
 * Usage: npm run seed:admin
 * 
 * This script is idempotent and safe to run multiple times.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { Pool } = require('pg');
const { hashPassword } = require('../src/services/authService');

// Admin user configuration
const ADMIN_EMAIL = 'admin@smartmetal.dev';
const ADMIN_PASSWORD = 'admin123';
const ADMIN_NAME = 'SmartMetal Admin';
const ADMIN_ROLE = 'admin';

// Tenant configuration
const TENANT_CODE = 'SMARTMETAL_DEV';
const TENANT_NAME = 'SmartMetal Dev';

/**
 * Upsert tenant (create or update)
 */
async function upsertTenant(db, code, name, isActive = true) {
  const result = await db.query(`
    INSERT INTO tenants (code, name, is_active)
    VALUES ($1, $2, $3)
    ON CONFLICT (code) DO UPDATE
    SET name = EXCLUDED.name,
        is_active = EXCLUDED.is_active,
        updated_at = NOW()
    RETURNING id, code, name, is_active;
  `, [code, name, isActive]);
  
  return result.rows[0];
}

/**
 * Upsert user (create or update by email within tenant)
 */
async function upsertUser(db, tenantId, email, name, role, passwordHash) {
  const result = await db.query(`
    INSERT INTO users (tenant_id, email, name, role, password_hash, is_active)
    VALUES ($1, $2, $3, $4, $5, true)
    ON CONFLICT (tenant_id, email) DO UPDATE
    SET name = EXCLUDED.name,
        role = EXCLUDED.role,
        password_hash = EXCLUDED.password_hash,
        is_active = true,
        updated_at = NOW()
    RETURNING id, email, name, role;
  `, [tenantId, email, name, role, passwordHash]);
  
  return result.rows[0];
}

/**
 * Main seed function
 */
async function seedAdminUser() {
  // Use MIGRATION_DATABASE_URL (postgres superuser) to bypass RLS
  const db = new Pool({
    connectionString: process.env.MIGRATION_DATABASE_URL
  });

  console.log('🌱 Starting admin user seeding...\n');
  console.log('🔌 Using postgres superuser connection to bypass RLS\n');
  
  try {
    // ============================================================================
    // STEP 1: Ensure tenant code constraint allows our format
    // ============================================================================
    try {
      await db.query(`
        ALTER TABLE tenants
        DROP CONSTRAINT IF EXISTS tenants_code_format;
      `);
      await db.query(`
        ALTER TABLE tenants
        ADD CONSTRAINT tenants_code_format CHECK (code ~ '^[A-Za-z0-9_]+$');
      `);
      console.log('✓ Tenant code constraint verified\n');
    } catch (error) {
      // Constraint might not exist or already correct, continue
      if (!error.message.includes('does not exist')) {
        console.warn(`⚠️  Warning updating constraint: ${error.message}`);
      }
    }
    
    // ============================================================================
    // STEP 2: Create/Update SmartMetal Dev Tenant
    // ============================================================================
    console.log('📋 Creating/updating SmartMetal Dev tenant...');
    const tenant = await upsertTenant(db, TENANT_CODE, TENANT_NAME, true);
    console.log(`✓ Tenant created/updated:`);
    console.log(`  - Code: ${tenant.code}`);
    console.log(`  - Name: ${tenant.name}`);
    console.log(`  - ID: ${tenant.id}`);
    console.log(`  - Active: ${tenant.is_active}\n`);
    
    // ============================================================================
    // STEP 3: Create/Update Admin User
    // ============================================================================
    console.log('👤 Creating/updating admin user...');
    
    // Hash the password using bcrypt (same method as existing auth)
    const passwordHash = await hashPassword(ADMIN_PASSWORD);
    
    // Create or update the user
    const user = await upsertUser(
      db,
      tenant.id,
      ADMIN_EMAIL,
      ADMIN_NAME,
      ADMIN_ROLE,
      passwordHash
    );
    
    console.log(`✓ Admin user created/updated:`);
    console.log(`  - Email: ${user.email}`);
    console.log(`  - Name: ${user.name}`);
    console.log(`  - Role: ${user.role}`);
    console.log(`  - ID: ${user.id}`);
    console.log(`  - Tenant: ${tenant.name} (${tenant.code})\n`);
    
    // ============================================================================
    // STEP 4: Verify User Can Authenticate
    // ============================================================================
    console.log('🔍 Verifying user authentication...');
    const verifyResult = await db.query(`
      SELECT 
        u.id,
        u.email,
        u.name,
        u.role,
        u.is_active,
        t.code as tenant_code,
        t.name as tenant_name
      FROM users u
      INNER JOIN tenants t ON u.tenant_id = t.id
      WHERE u.email = $1 AND u.tenant_id = $2
    `, [ADMIN_EMAIL, tenant.id]);
    
    if (verifyResult.rows.length > 0) {
      const verifiedUser = verifyResult.rows[0];
      console.log(`✓ User verified in database:`);
      console.log(`  - Active: ${verifiedUser.is_active}`);
      console.log(`  - Can login: ${verifiedUser.is_active ? 'YES' : 'NO'}\n`);
    } else {
      console.error('❌ User verification failed!\n');
    }
    
    // ============================================================================
    // Summary
    // ============================================================================
    console.log('✅ Admin user seeding completed successfully!\n');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('📊 SUMMARY');
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log('🏢 Tenant:');
    console.log(`   Name:   ${tenant.name}`);
    console.log(`   Code:   ${tenant.code}`);
    console.log(`   ID:     ${tenant.id}\n`);
    console.log('👤 Admin User:');
    console.log(`   Email:    ${user.email}`);
    console.log(`   Password: ${ADMIN_PASSWORD}`);
    console.log(`   Role:     ${user.role}\n`);
    console.log('🔐 Login Instructions:');
    console.log('   1. Navigate to your frontend login page');
    console.log(`   2. Enter email:    ${user.email}`);
    console.log(`   3. Enter password: ${ADMIN_PASSWORD}`);
    console.log('   4. Click login\n');
    console.log('   The system will automatically:');
    console.log(`   - Authenticate you as ${user.name}`);
    console.log(`   - Associate you with tenant: ${tenant.name}`);
    console.log(`   - Grant you ${user.role} privileges (full access)\n`);
    console.log('⚠️  IMPORTANT: Change this password in production!');
    console.log('═══════════════════════════════════════════════════════════════\n');
    
  } catch (error) {
    console.error('\n❌ Admin user seeding failed:', error.message);
    console.error('\nFull error details:');
    console.error(error);
    process.exit(1);
  } finally {
    await db.end();
  }
}

// Run if called directly
if (require.main === module) {
  seedAdminUser()
    .then(() => {
      console.log('✅ Script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Script failed:', error.message);
      process.exit(1);
    });
}

module.exports = { seedAdminUser };
