/**
 * Supabase Permission Verification Script
 * 
 * This script verifies that the smartmetal_app role has all required privileges
 * on key tables in the database.
 * 
 * Usage:
 *   node backend/scripts/verifySupabasePermissions.js
 * 
 * Prerequisites:
 *   - DATABASE_URL must be set to use smartmetal_app role
 *   - Tables should exist (run migrations first)
 * 
 * This script checks:
 *   1. Current user is smartmetal_app
 *   2. Can SELECT from key tables
 *   3. Has required privileges (SELECT, INSERT, UPDATE, DELETE, REFERENCES) on key tables
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { Pool } = require('pg');
const { config } = require('../src/config/env');

// Key tables to check (only if they exist)
const KEY_TABLES = [
  'materials',
  'pipe_grades',
  'rfqs',
  'clients',
  'projects',
  'tenants',
];

async function verifyPermissions() {
  console.log('='.repeat(70));
  console.log('SUPABASE PERMISSION VERIFICATION');
  console.log('='.repeat(70));
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
  console.log('');

  const pool = new Pool({
    connectionString: dbUrl,
    max: 1,
  });

  let allChecksPassed = true;

  try {
    // Test connection
    console.log('[1/4] Connecting to database...');
    const client = await pool.connect();
    console.log('✅ Connected');
    console.log('');

    // Check current user
    console.log('[2/4] Checking current user...');
    const userResult = await client.query('SELECT current_user');
    const currentUser = userResult.rows[0].current_user;
    
    if (currentUser === 'smartmetal_app') {
      console.log(`✓ Current user: ${currentUser} (OK)`);
    } else {
      console.log(`✗ Current user: ${currentUser} (FAIL - expected smartmetal_app)`);
      allChecksPassed = false;
    }
    console.log('');

    // Check table access and privileges
    console.log('[3/4] Checking table access and privileges...');
    const tableChecks = [];

    for (const tableName of KEY_TABLES) {
      try {
        // Check if table exists
        const tableExistsResult = await client.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = $1
          )
        `, [tableName]);

        if (!tableExistsResult.rows[0].exists) {
          console.log(`  ⚠ ${tableName}: table does not exist (skipping)`);
          continue;
        }

        // Try to SELECT from table
        try {
          await client.query(`SELECT 1 FROM ${tableName} LIMIT 1`);
          tableChecks.push({ table: tableName, canSelect: true });
        } catch (selectError) {
          console.log(`  ✗ ${tableName}: cannot SELECT (${selectError.message})`);
          tableChecks.push({ table: tableName, canSelect: false, error: selectError.message });
          allChecksPassed = false;
          continue;
        }

        // Check privileges using information_schema
        const privilegesResult = await client.query(`
          SELECT 
            privilege_type
          FROM information_schema.role_table_grants
          WHERE grantee = $1
            AND table_schema = 'public'
            AND table_name = $2
        `, [currentUser, tableName]);

        const privileges = privilegesResult.rows.map(r => r.privilege_type);
        const requiredPrivileges = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'REFERENCES'];
        const missingPrivileges = requiredPrivileges.filter(p => !privileges.includes(p));

        if (missingPrivileges.length === 0) {
          console.log(`  ✓ ${tableName}: privileges = ${privileges.join(', ')} (OK)`);
          tableChecks.push({ 
            table: tableName, 
            canSelect: true, 
            privileges: privileges,
            status: 'OK' 
          });
        } else {
          console.log(`  ✗ ${tableName}: missing privileges = ${missingPrivileges.join(', ')} (FAIL)`);
          tableChecks.push({ 
            table: tableName, 
            canSelect: true, 
            privileges: privileges,
            missingPrivileges: missingPrivileges,
            status: 'FAIL' 
          });
          allChecksPassed = false;
        }
      } catch (error) {
        console.log(`  ✗ ${tableName}: error checking privileges (${error.message})`);
        tableChecks.push({ table: tableName, error: error.message, status: 'ERROR' });
        allChecksPassed = false;
      }
    }

    console.log('');

    // Summary
    console.log('[4/4] Summary:');
    console.log('');
    
    if (allChecksPassed) {
      console.log('✅ RESULT: All permission checks passed!');
      console.log('');
      console.log('The smartmetal_app role has all required privileges.');
      console.log('Runtime operations should work correctly.');
    } else {
      console.log('❌ RESULT: Some permission checks failed!');
      console.log('');
      console.log('The smartmetal_app role is missing required privileges.');
      console.log('Please run docs/SUPABASE_PERMISSION_NORMALIZATION.sql as postgres role.');
      console.log('');
      console.log('To fix:');
      console.log('  1. Open Supabase SQL Editor');
      console.log('  2. Connect as postgres/service role');
      console.log('  3. Run: docs/SUPABASE_PERMISSION_NORMALIZATION.sql');
      console.log('  4. Re-run this verification script');
    }

    client.release();
    await pool.end();

    // Exit with appropriate code
    if (allChecksPassed) {
      process.exit(0);
    } else {
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    await pool.end();
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  verifyPermissions().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { verifyPermissions };

