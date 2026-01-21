/**
 * Seed Tenants and Users Script
 * 
 * Idempotent script to seed:
 * - NSC tenant (primary tenant) with real NSC users
 * - MetaSteel Trading tenant (demo tenant) with demo users
 * - Tenant settings for both tenants
 * - Backfill any NULL tenant_id rows to NSC
 * 
 * Usage: node scripts/seedTenantsAndUsers.js
 * 
 * This script is safe to run multiple times (idempotent).
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { Pool } = require('pg');
const { hashPassword } = require('../src/services/authService');
// Removed complex config imports for de-engineering (Phase 3)
// const operatorRules = require('../src/config/operatorRules');
// const notificationRules = require('../src/config/notificationRules');
// const intelligenceConfig = require('../src/config/intelligenceConfig');

// Development-only default password for seeded users
const DEFAULT_PASSWORD = 'Password123!';
// Demo Manager credentials (local dev only):
// - Email: manager@metasteel.com
// - Password: Password123!

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
 * Upsert tenant setting (create or update)
 */
async function upsertTenantSetting(db, tenantId, key, value) {
  await db.query(`
    INSERT INTO tenant_settings (tenant_id, key, value)
    VALUES ($1, $2, $3::jsonb)
    ON CONFLICT (tenant_id, key) DO UPDATE
    SET value = EXCLUDED.value,
        updated_at = NOW();
  `, [tenantId, key, JSON.stringify(value)]);
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
 * Backfill NULL tenant_id rows to NSC tenant
 */
async function backfillToNsc(db, nscTenantId) {
  const tablesToBackfill = [
    'clients',
    'projects',
    'rfqs',
    'rfq_items',
    'pricing_runs',
    'pricing_run_items',
    'price_agreements',
    'approval_history',
    'document_extractions',
    'mto_extractions',
    'ai_predictions',
    'client_pricing_rules'
  ];

  console.log('\n📦 Backfilling legacy data to NSC tenant...');
  
  for (const tableName of tablesToBackfill) {
    try {
      // Check if table exists and has tenant_id column
      const tableCheck = await db.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = $1 AND column_name = 'tenant_id';
      `, [tableName]);
      
      if (tableCheck.rows.length === 0) {
        console.log(`  ⏭️  Skipping ${tableName} (no tenant_id column)`);
        continue;
      }
      
      // Update NULL tenant_id rows
      const result = await db.query(`
        UPDATE ${tableName}
        SET tenant_id = $1
        WHERE tenant_id IS NULL;
      `, [nscTenantId]);
      
      if (result.rowCount > 0) {
        console.log(`  ✓ Backfilled ${result.rowCount} rows in ${tableName}`);
      } else {
        console.log(`  ✓ ${tableName} already has tenant_id set`);
      }
    } catch (error) {
      // Table might not exist, skip it
      if (error.code === '42P01') {
        console.log(`  ⏭️  Skipping ${tableName} (table does not exist)`);
      } else {
        console.warn(`  ⚠️  Warning updating ${tableName}: ${error.message}`);
      }
    }
  }
}

/**
 * Main seed function
 */
async function seedTenantsAndUsers() {
  // Use MIGRATION_DATABASE_URL (postgres superuser) to bypass RLS
  const db = new Pool({
    connectionString: process.env.MIGRATION_DATABASE_URL
  });

  console.log('🌱 Starting tenant and user seeding...\n');
  console.log('🔌 Using postgres superuser connection to bypass RLS\n');
  
  try {
    // Update tenant code constraint to allow lowercase (if it exists)
    // The original constraint only allowed uppercase, but we want lowercase codes
    try {
      await db.query(`
        ALTER TABLE tenants
        DROP CONSTRAINT IF EXISTS tenants_code_format;
      `);
      await db.query(`
        ALTER TABLE tenants
        ADD CONSTRAINT tenants_code_format CHECK (code ~ '^[A-Za-z0-9_]+$');
      `);
      console.log('  ✓ Updated tenant code constraint to allow lowercase\n');
    } catch (error) {
      // Constraint might not exist or already updated, continue
      if (!error.message.includes('does not exist')) {
        console.warn(`  ⚠️  Warning updating constraint: ${error.message}`);
      }
    }
    // ============================================================================
    // PART A: Upsert NSC Tenant
    // ============================================================================
    console.log('📋 Part A: Upserting NSC tenant...');
    
    // Check if NSC tenant exists with uppercase code (from migration 023)
    const existingNsc = await db.query(`
      SELECT id, code FROM tenants WHERE code = 'nsc' LIMIT 1;
    `);
    
    if (existingNsc.rows.length > 0 && existingNsc.rows[0].code !== 'nsc') {
      // Update existing NSC tenant to lowercase code
      console.log('  ↻ Updating existing NSC tenant code to lowercase...');
      await db.query(`
        UPDATE tenants
        SET code = 'nsc', updated_at = NOW()
        WHERE id = $1;
      `, [existingNsc.rows[0].id]);
    }
    
    // Use lowercase 'nsc' to match user requirements (middleware handles case-insensitive)
    const nscTenant = await upsertTenant(db, 'nsc', 'NSC Sinergi Sdn Bhd', true);
    console.log(`  ✓ NSC tenant: ${nscTenant.code} (id: ${nscTenant.id})\n`);
    
    // Create simplified tenant_settings for NSC (De-Engineering Phase 3)
    console.log('📋 Creating simplified NSC tenant settings...');
    await upsertTenantSetting(db, nscTenant.id, 'default_margin', 0.20); // 20% margin
    await upsertTenantSetting(db, nscTenant.id, 'approver_email', 'Sales07@nscsinergi.com.my');
    await upsertTenantSetting(db, nscTenant.id, 'approver_name', 'Abdillah Abd Malek');
    await upsertTenantSetting(db, nscTenant.id, 'approver_position', 'General Manager');
    console.log('  ✓ Simplified NSC tenant settings created (default_margin, approver_email)\n');
    
    // ============================================================================
    // PART B: Upsert NSC Users
    // ============================================================================
    console.log('👥 Part B: Upserting NSC users...');
    const defaultPasswordHash = await hashPassword(DEFAULT_PASSWORD);
    
    // Sales users (role: 'sales_rep')
    const nscSalesUsers = [
      { email: 'Sales01@nscsinergi.com.my', name: 'Sales01 NSC', role: 'sales_rep' },
      { email: 'Sales02@nscsinergi.com.my', name: 'Sales02 NSC', role: 'sales_rep' },
      { email: 'Sales04@nscsinergi.com.my', name: 'Sales04 NSC', role: 'sales_rep' }
    ];

    // Procurement/Logistics (role: 'procurement')
    const nscProcurementUsers = [
      { email: 'Sales03@nscsinergi.com.my', name: 'Sales03 NSC', role: 'procurement' }
    ];
    
    // Manager/Approver (role: 'manager')
    const nscManagerUsers = [
      { email: 'Sales07@nscsinergi.com.my', name: 'Sales07 NSC', role: 'manager' }
    ];
    
    const allNscUsers = [...nscSalesUsers, ...nscProcurementUsers, ...nscManagerUsers];
    
    for (const userData of allNscUsers) {
      const user = await upsertUser(
        db,
        nscTenant.id,
        userData.email,
        userData.name,
        userData.role,
        defaultPasswordHash
      );
      console.log(`  ✓ ${user.email} (${user.role})`);
    }
    console.log(`  ✓ Created/updated ${allNscUsers.length} NSC users\n`);
    
    // ============================================================================
    // PART C: Upsert MetaSteel Trading Tenant (Demo)
    // ============================================================================
    console.log('📋 Part C: Upserting MetaSteel Trading tenant...');
    // Use lowercase 'metasteel' to match user requirements (middleware handles case-insensitive)
    const metaSteelTenant = await upsertTenant(db, 'metasteel', 'MetaSteel Trading Sdn Bhd', true);
    console.log(`  ✓ MetaSteel tenant: ${metaSteelTenant.code} (id: ${metaSteelTenant.id})\n`);
    
    // Create simplified tenant_settings for MetaSteel (De-Engineering Phase 3)
    console.log('📋 Creating simplified MetaSteel tenant settings...');
    await upsertTenantSetting(db, metaSteelTenant.id, 'default_margin', 0.20); // 20% margin
    await upsertTenantSetting(db, metaSteelTenant.id, 'approver_email', 'manager@metasteel.com');
    await upsertTenantSetting(db, metaSteelTenant.id, 'approver_name', 'MetaSteel Manager');
    await upsertTenantSetting(db, metaSteelTenant.id, 'approver_position', 'Manager');
    await upsertTenantSetting(db, metaSteelTenant.id, 'demo', true); // Mark as demo tenant
    console.log('  ✓ Simplified MetaSteel tenant settings created (demo tenant)\n');
    
    // ============================================================================
    // PART D: Seed MetaSteel Demo Users
    // ============================================================================
    console.log('👥 Part D: Upserting MetaSteel demo users...');
    
    const metaSteelUsers = [
      { email: 'sales@metasteel.com', name: 'MetaSteel Sales', role: 'sales_rep' },
      { email: 'procurement@metasteel.com', name: 'MetaSteel Procurement', role: 'procurement' },
      { email: 'manager@metasteel.com', name: 'MetaSteel Manager', role: 'manager' },
      { email: 'admin@metasteel.com', name: 'MetaSteel Admin', role: 'admin' }
    ];
    
    for (const userData of metaSteelUsers) {
      const user = await upsertUser(
        db,
        metaSteelTenant.id,
        userData.email,
        userData.name,
        userData.role,
        defaultPasswordHash
      );
      console.log(`  ✓ ${user.email} (${user.role})`);
    }
    console.log(`  ✓ Created/updated ${metaSteelUsers.length} MetaSteel users\n`);
    
    // ============================================================================
    // PART E: Backfill Existing Data to NSC
    // ============================================================================
    await backfillToNsc(db, nscTenant.id);
    
    // ============================================================================
    // Summary
    // ============================================================================
    console.log('\n✅ Seeding completed successfully!\n');
    console.log('📊 Summary:');
    console.log(`  • NSC tenant: ${nscTenant.code} (${nscTenant.name})`);
    console.log(`  • NSC users: ${allNscUsers.length} users`);
    console.log(`  • MetaSteel tenant: ${metaSteelTenant.code} (${metaSteelTenant.name})`);
    console.log(`  • MetaSteel users: ${metaSteelUsers.length} users`);
    console.log(`\n🔑 Default password for all seeded users: ${DEFAULT_PASSWORD}`);
    console.log('   ⚠️  IMPORTANT: Change passwords in production!\n');
    
  } catch (error) {
    console.error('\n❌ Seeding failed:', error);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await db.end();
  }
}

// Run if called directly
if (require.main === module) {
  seedTenantsAndUsers()
    .then(() => {
      console.log('✅ Script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Script failed:', error);
      process.exit(1);
    });
}

module.exports = { seedTenantsAndUsers };

