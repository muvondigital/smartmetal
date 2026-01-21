/**
 * RLS Verification Script for Supabase
 * 
 * This script verifies that Row-Level Security (RLS) is properly enforced
 * when using the smartmetal_app database role.
 * 
 * Usage:
 *   node backend/scripts/verifyRlsSupabase.js
 * 
 * Prerequisites:
 *   - DATABASE_URL must be set to use smartmetal_app role
 *   - Migration 051 must have been run (FORCE RLS enabled)
 *   - At least two tenants with data must exist in the database
 * 
 * This script is for manual verification after env and roles are configured.
 * It does not assert pass/fail - Maira will interpret the counts.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { Pool } = require('pg');
const { config } = require('../src/config/env');

async function verifyRls() {
  console.log('='.repeat(60));
  console.log('RLS Verification Script (Supabase)');
  console.log('='.repeat(60));
  console.log('');

  // Check DATABASE_URL is set
  const dbUrl = config.database.url;
  if (!dbUrl) {
    console.error('❌ ERROR: DATABASE_URL is not set!');
    console.error('   Please set DATABASE_URL in your .env file.');
    process.exit(1);
  }

  // Mask password for display
  const maskedUrl = dbUrl.replace(/:[^:@]+@/, ':***@');
  console.log(`🔌 Using DATABASE_URL: ${maskedUrl}`);
  
  // Extract username
  const urlMatch = dbUrl.match(/postgresql:\/\/([^:]+):/);
  const dbUser = urlMatch ? urlMatch[1] : 'unknown';
  console.log(`👤 Database user: ${dbUser}`);
  console.log('');

  // Warn if using postgres superuser
  if (dbUser === 'postgres') {
    console.warn('⚠️  WARNING: Using "postgres" superuser role.');
    console.warn('⚠️  RLS will be BYPASSED. This script will not verify RLS enforcement.');
    console.warn('⚠️  For proper RLS verification, DATABASE_URL must use smartmetal_app role.');
    console.warn('');
  }

  const pool = new Pool({
    connectionString: dbUrl,
    max: 1,
  });

  try {
    // Test connection
    console.log('Connecting to database...');
    const client = await pool.connect();
    console.log('✅ Connected');
    console.log('');

    // Get current user and BYPASSRLS status
    const userCheck = await client.query(`
      SELECT 
        current_user,
        (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS bypasses_rls
    `);
    console.log('📊 Current Database User:');
    console.log(`   User: ${userCheck.rows[0].current_user}`);
    console.log(`   BYPASSRLS: ${userCheck.rows[0].bypasses_rls ? 'true (RLS bypassed)' : 'false (RLS enforced)'}`);
    console.log('');

    // Get list of tenants
    console.log('📋 Fetching tenant list...');
    const tenantsResult = await client.query(`
      SELECT id, code, name 
      FROM tenants 
      ORDER BY code 
      LIMIT 10
    `);

    if (tenantsResult.rows.length === 0) {
      console.log('⚠️  No tenants found in database.');
      console.log('   This script requires at least 2 tenants with data for proper verification.');
      await client.release();
      await pool.end();
      process.exit(0);
    }

    console.log(`   Found ${tenantsResult.rows.length} tenant(s):`);
    tenantsResult.rows.forEach((tenant, idx) => {
      console.log(`   ${idx + 1}. ${tenant.code} (${tenant.name}) - ${tenant.id}`);
    });
    console.log('');

    if (tenantsResult.rows.length < 2) {
      console.log('⚠️  Only 1 tenant found. RLS isolation test requires at least 2 tenants.');
      console.log('   Proceeding with single-tenant verification...');
      console.log('');
    }

    // Test 1: No tenant context (should return 0 rows)
    console.log('='.repeat(60));
    console.log('TEST 1: No Tenant Context (RLS should block access)');
    console.log('='.repeat(60));
    console.log('');

    await client.query('RESET app.tenant_id');
    const noTenantResult = await client.query('SELECT COUNT(*) as count FROM rfqs');
    const noTenantCount = parseInt(noTenantResult.rows[0].count, 10);
    
    console.log(`No-tenant rfqs count (should be 0): ${noTenantCount}`);
    if (noTenantCount === 0) {
      console.log('✅ RLS is blocking access without tenant context (correct behavior)');
    } else {
      console.log(`⚠️  Expected 0 rows, got ${noTenantCount}. RLS may not be enforced.`);
    }
    console.log('');

    // Test 2: Tenant A context
    const tenantA = tenantsResult.rows[0];
    console.log('='.repeat(60));
    console.log(`TEST 2: Tenant A Context (${tenantA.code})`);
    console.log('='.repeat(60));
    console.log('');

    await client.query('SET app.tenant_id = $1', [tenantA.id]);
    const tenantAResult = await client.query('SELECT COUNT(*) as count FROM rfqs');
    const tenantACount = parseInt(tenantAResult.rows[0].count, 10);
    
    console.log(`Tenant A (${tenantA.code}) rfqs count: ${tenantACount}`);
    console.log('');

    // Test 3: Tenant B context (if available)
    if (tenantsResult.rows.length >= 2) {
      const tenantB = tenantsResult.rows[1];
      console.log('='.repeat(60));
      console.log(`TEST 3: Tenant B Context (${tenantB.code})`);
      console.log('='.repeat(60));
      console.log('');

      await client.query('SET app.tenant_id = $1', [tenantB.id]);
      const tenantBResult = await client.query('SELECT COUNT(*) as count FROM rfqs');
      const tenantBCount = parseInt(tenantBResult.rows[0].count, 10);
      
      console.log(`Tenant B (${tenantB.code}) rfqs count: ${tenantBCount}`);
      console.log('');

      // Verify isolation
      if (tenantACount > 0 && tenantBCount > 0 && tenantACount !== tenantBCount) {
        console.log('✅ Tenant isolation verified: Different tenants see different row counts');
      } else if (tenantACount === tenantBCount && tenantACount > 0) {
        console.log('⚠️  Both tenants see the same row count. This may indicate:');
        console.log('   - Both tenants have the same amount of data (coincidence)');
        console.log('   - RLS is not properly enforced (investigate)');
      }
    }

    // Test 4: Check FORCE RLS status
    console.log('='.repeat(60));
    console.log('TEST 4: FORCE RLS Status Check');
    console.log('='.repeat(60));
    console.log('');

    const forceRlsCheck = await client.query(`
      SELECT
        tablename,
        (SELECT relforcerowsecurity FROM pg_class WHERE relname = tablename) AS force_rls
      FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename IN ('rfqs', 'clients', 'projects', 'pricing_runs')
        AND (SELECT relrowsecurity FROM pg_class WHERE relname = tablename) = true
      ORDER BY tablename
    `);

    console.log('FORCE RLS status on key tenant tables:');
    forceRlsCheck.rows.forEach(row => {
      const status = row.force_rls ? '✅ Enabled' : '❌ Disabled';
      console.log(`   ${row.tablename}: ${status}`);
    });
    console.log('');

    // Summary
    console.log('='.repeat(60));
    console.log('VERIFICATION SUMMARY');
    console.log('='.repeat(60));
    console.log('');
    console.log(`Database User: ${userCheck.rows[0].current_user}`);
    console.log(`BYPASSRLS: ${userCheck.rows[0].bypasses_rls ? 'true (RLS bypassed)' : 'false (RLS enforced)'}`);
    console.log(`No-tenant rfqs count: ${noTenantCount} (should be 0)`);
    console.log(`Tenant A (${tenantA.code}) rfqs count: ${tenantACount}`);
    if (tenantsResult.rows.length >= 2) {
      const tenantB = tenantsResult.rows[1];
      await client.query('SET app.tenant_id = $1', [tenantB.id]);
      const tenantBResult = await client.query('SELECT COUNT(*) as count FROM rfqs');
      const tenantBCount = parseInt(tenantBResult.rows[0].count, 10);
      console.log(`Tenant B (${tenantB.code}) rfqs count: ${tenantBCount}`);
    }
    console.log('');

    if (userCheck.rows[0].bypasses_rls) {
      console.log('⚠️  WARNING: Using superuser role. RLS is bypassed.');
      console.log('   For proper RLS enforcement, use smartmetal_app role in DATABASE_URL.');
    } else if (noTenantCount === 0) {
      console.log('✅ RLS appears to be enforced:');
      console.log('   - No rows returned without tenant context');
      console.log('   - Tenant context required for data access');
    } else {
      console.log('⚠️  RLS may not be fully enforced:');
      console.log('   - Rows returned without tenant context');
      console.log('   - Investigate RLS policies and role configuration');
    }
    console.log('');

    await client.release();
    await pool.end();

    console.log('✅ Verification script completed successfully');
    console.log('');
    console.log('Note: This script does not assert pass/fail.');
    console.log('      Interpret the counts above to verify RLS enforcement.');
    console.log('');

    process.exit(0);

  } catch (error) {
    console.error('❌ Error during verification:');
    console.error(error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run verification
verifyRls().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

