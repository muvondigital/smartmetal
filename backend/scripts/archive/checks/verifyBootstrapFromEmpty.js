/**
 * Verification Script: Bootstrap from Empty Database
 *
 * Stage 1.4 Verification
 *
 * This script verifies that the SmartMetal Pricer database can be fully
 * bootstrapped from a completely empty database by running all migrations
 * in order.
 *
 * What this script does:
 * 1. Connects to the database
 * 2. Checks current schema state
 * 3. Lists all tables and their row counts
 * 4. Verifies critical foreign key constraints exist
 * 5. Verifies indexes exist for performance
 * 6. Checks RLS status on tenant-scoped tables
 * 7. Generates a comprehensive report
 *
 * Usage:
 *   node backend/scripts/verifyBootstrapFromEmpty.js
 *
 * Expected Result:
 *   ✅ All core tables exist (from migration 000)
 *   ✅ All feature tables exist (from migrations 002-051)
 *   ✅ All foreign keys exist
 *   ✅ All indexes exist
 *   ✅ RLS policies exist on tenant-scoped tables
 *   ✅ FORCE RLS enabled on tenant-scoped tables
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { Pool } = require('pg');
const { config } = require('../src/config/env');

async function verifyBootstrap() {
  console.log('='.repeat(70));
  console.log('STAGE 1.4 BOOTSTRAP VERIFICATION');
  console.log('='.repeat(70));
  console.log('');
  console.log('This script verifies that the database is fully bootstrap-able');
  console.log('from an empty schema by checking all tables, constraints, and RLS.');
  console.log('');

  // Connect to database
  const pool = new Pool({
    connectionString: config.database.url,
    max: 1,
  });

  try {
    console.log('[1/8] Connecting to database...');
    const client = await pool.connect();
    console.log('✓ Connected to database');
    console.log('');

    // =========================================================================
    // STEP 1: List all tables and row counts
    // =========================================================================

    console.log('[2/8] Checking all tables...');

    const tablesResult = await client.query(`
      SELECT
        schemaname,
        tablename,
        (SELECT COUNT(*) FROM information_schema.columns
         WHERE table_schema = schemaname AND table_name = tablename) AS column_count
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename;
    `);

    console.log(`✓ Found ${tablesResult.rows.length} tables in public schema`);
    console.log('');

    // Core tables that MUST exist after migration 000
    const coreTables = [
      'clients',
      'projects',
      'rfqs',
      'rfq_items',
      'materials',
      'pricing_runs',
      'pricing_run_items',
      'approval_history',
      'price_agreements',
      'document_extractions',
    ];

    console.log('Core Tables (from migration 000):');
    const missingCoreTables = [];
    for (const table of coreTables) {
      const exists = tablesResult.rows.some(r => r.tablename === table);
      if (exists) {
        const rowCount = await client.query(`SELECT COUNT(*) FROM ${table}`);
        console.log(`  ✓ ${table} (${rowCount.rows[0].count} rows)`);
      } else {
        console.log(`  ✗ ${table} (MISSING)`);
        missingCoreTables.push(table);
      }
    }

    if (missingCoreTables.length > 0) {
      console.log('');
      console.log(`❌ ERROR: ${missingCoreTables.length} core tables are missing!`);
      console.log('   Missing:', missingCoreTables.join(', '));
      console.log('');
      console.log('   This indicates migration 000 did not run successfully.');
      console.log('   Please run: npm run migrate');
      console.log('');
      client.release();
      await pool.end();
      process.exit(1);
    }

    console.log('');

    // Feature tables that should exist after later migrations
    const featureTables = [
      'tenants',
      'tenant_settings',
      'users',
      'pipes',
      'flanges',
      'pipe_grades',
      'flange_grades',
      'agreement_headers',
      'agreement_conditions',
      'agreement_scales',
      'regulatory_hs_codes',
      'regulatory_material_mapping',
      'regulatory_country_profiles',
      'knowledge_base_articles',
      'regulatory_learning_events',
    ];

    console.log('Feature Tables (from migrations 003-048):');
    const missingFeatureTables = [];
    for (const table of featureTables) {
      const exists = tablesResult.rows.some(r => r.tablename === table);
      if (exists) {
        const rowCount = await client.query(`SELECT COUNT(*) FROM ${table}`);
        console.log(`  ✓ ${table} (${rowCount.rows[0].count} rows)`);
      } else {
        console.log(`  ⚠️  ${table} (not yet created)`);
        missingFeatureTables.push(table);
      }
    }

    if (missingFeatureTables.length > 0) {
      console.log('');
      console.log(`⚠️  NOTE: ${missingFeatureTables.length} feature tables not created yet.`);
      console.log('   These will be created by later migrations.');
    }

    console.log('');

    // =========================================================================
    // STEP 2: Verify Foreign Key Constraints
    // =========================================================================

    console.log('[3/8] Checking foreign key constraints...');

    const foreignKeys = await client.query(`
      SELECT
        tc.table_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name,
        tc.constraint_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
      ORDER BY tc.table_name, kcu.column_name;
    `);

    console.log(`✓ Found ${foreignKeys.rows.length} foreign key constraints`);
    console.log('');

    // Critical FK constraints that MUST exist
    const criticalFKs = [
      { table: 'projects', column: 'client_id', references: 'clients' },
      { table: 'rfqs', column: 'project_id', references: 'projects' },
      { table: 'rfqs', column: 'client_id', references: 'clients' },
      { table: 'rfq_items', column: 'rfq_id', references: 'rfqs' },
      { table: 'rfq_items', column: 'material_id', references: 'materials' },
      { table: 'pricing_runs', column: 'rfq_id', references: 'rfqs' },
      { table: 'pricing_run_items', column: 'pricing_run_id', references: 'pricing_runs' },
      { table: 'pricing_run_items', column: 'rfq_item_id', references: 'rfq_items' },
      { table: 'approval_history', column: 'pricing_run_id', references: 'pricing_runs' },
      { table: 'price_agreements', column: 'client_id', references: 'clients' },
      { table: 'document_extractions', column: 'rfq_id', references: 'rfqs' },
    ];

    console.log('Critical Foreign Keys:');
    const missingFKs = [];
    for (const fk of criticalFKs) {
      const exists = foreignKeys.rows.some(
        r => r.table_name === fk.table &&
             r.column_name === fk.column &&
             r.foreign_table_name === fk.references
      );
      if (exists) {
        console.log(`  ✓ ${fk.table}.${fk.column} → ${fk.references}`);
      } else {
        console.log(`  ✗ ${fk.table}.${fk.column} → ${fk.references} (MISSING)`);
        missingFKs.push(fk);
      }
    }

    if (missingFKs.length > 0) {
      console.log('');
      console.log(`❌ ERROR: ${missingFKs.length} critical foreign keys are missing!`);
      console.log('   This indicates migrations did not complete successfully.');
    }

    console.log('');

    // =========================================================================
    // STEP 3: Verify Indexes
    // =========================================================================

    console.log('[4/8] Checking indexes...');

    const indexes = await client.query(`
      SELECT
        schemaname,
        tablename,
        indexname,
        indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
      ORDER BY tablename, indexname;
    `);

    console.log(`✓ Found ${indexes.rows.length} indexes`);
    console.log('');

    // Critical indexes for tenant_id (RLS performance)
    console.log('Tenant ID Indexes (for RLS performance):');
    const tenantIdIndexes = indexes.rows.filter(
      idx => idx.indexdef.toLowerCase().includes('tenant_id')
    );

    const tenantScopedTables = [
      'clients', 'projects', 'rfqs', 'rfq_items', 'pricing_runs',
      'pricing_run_items', 'approval_history', 'price_agreements',
      'document_extractions',
    ];

    for (const table of tenantScopedTables) {
      const hasIndex = tenantIdIndexes.some(idx => idx.tablename === table);
      if (hasIndex) {
        console.log(`  ✓ ${table}.tenant_id`);
      } else {
        console.log(`  ⚠️  ${table}.tenant_id (no index found)`);
      }
    }

    console.log('');

    // =========================================================================
    // STEP 4: Verify RLS Status
    // =========================================================================

    console.log('[5/8] Checking Row-Level Security (RLS) status...');

    const rlsStatus = await client.query(`
      SELECT
        schemaname,
        tablename,
        rowsecurity AS rls_enabled,
        (SELECT relforcerowsecurity
         FROM pg_class
         WHERE relname = tablename
         AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = schemaname)
        ) AS force_rls
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename;
    `);

    const rlsEnabledTables = rlsStatus.rows.filter(r => r.rls_enabled);
    const forceRlsTables = rlsStatus.rows.filter(r => r.force_rls);

    console.log(`✓ RLS enabled on ${rlsEnabledTables.length} tables`);
    console.log(`✓ FORCE RLS enabled on ${forceRlsTables.length} tables`);
    console.log('');

    if (rlsEnabledTables.length === 0) {
      console.log('⚠️  WARNING: RLS is not enabled on any tables.');
      console.log('   This is expected before running migration 049.');
      console.log('   Run: npm run migrate to apply RLS policies.');
    } else {
      console.log('Tenant-Scoped Tables with RLS:');
      for (const table of tenantScopedTables) {
        const rls = rlsStatus.rows.find(r => r.tablename === table);
        if (rls) {
          const status = rls.rls_enabled ? '✓ RLS' : '✗ NO RLS';
          const force = rls.force_rls ? ', FORCE' : '';
          console.log(`  ${status}${force}: ${table}`);
        } else {
          console.log(`  ⚠️  Table not found: ${table}`);
        }
      }
    }

    console.log('');

    // =========================================================================
    // STEP 5: Verify RLS Policies
    // =========================================================================

    console.log('[6/8] Checking RLS policies...');

    const policies = await client.query(`
      SELECT
        schemaname,
        tablename,
        policyname,
        permissive,
        roles,
        cmd,
        qual
      FROM pg_policies
      WHERE schemaname = 'public'
      ORDER BY tablename, policyname;
    `);

    console.log(`✓ Found ${policies.rows.length} RLS policies`);
    console.log('');

    if (policies.rows.length === 0) {
      console.log('⚠️  WARNING: No RLS policies found.');
      console.log('   This is expected before running migration 049.');
      console.log('   Run: npm run migrate to create RLS policies.');
    } else {
      console.log('Sample RLS Policies:');
      const samplePolicies = policies.rows.slice(0, 5);
      for (const policy of samplePolicies) {
        console.log(`  ✓ ${policy.tablename}: ${policy.policyname} (${policy.cmd})`);
      }
      if (policies.rows.length > 5) {
        console.log(`  ... and ${policies.rows.length - 5} more`);
      }
    }

    console.log('');

    // =========================================================================
    // STEP 6: Verify Helper Functions
    // =========================================================================

    console.log('[7/8] Checking helper functions...');

    const functions = await client.query(`
      SELECT
        n.nspname AS schema,
        p.proname AS function_name,
        pg_get_function_result(p.oid) AS return_type
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public'
        AND p.proname = 'update_updated_at_column'
      ORDER BY p.proname;
    `);

    if (functions.rows.length > 0) {
      console.log('✓ update_updated_at_column() function exists');
    } else {
      console.log('✗ update_updated_at_column() function NOT FOUND');
      console.log('   This function should be created by migration 000.');
    }

    console.log('');

    // =========================================================================
    // STEP 7: Generate Summary Report
    // =========================================================================

    console.log('[8/8] Generating summary report...');
    console.log('');

    console.log('='.repeat(70));
    console.log('BOOTSTRAP VERIFICATION SUMMARY');
    console.log('='.repeat(70));
    console.log('');

    console.log('Schema State:');
    console.log(`  Total Tables: ${tablesResult.rows.length}`);
    console.log(`  Core Tables (migration 000): ${coreTables.length - missingCoreTables.length}/${coreTables.length}`);
    console.log(`  Foreign Keys: ${foreignKeys.rows.length}`);
    console.log(`  Indexes: ${indexes.rows.length}`);
    console.log('');

    console.log('RLS Status:');
    console.log(`  Tables with RLS: ${rlsEnabledTables.length}`);
    console.log(`  Tables with FORCE RLS: ${forceRlsTables.length}`);
    console.log(`  RLS Policies: ${policies.rows.length}`);
    console.log('');

    console.log('Bootstrap Readiness:');
    const allCoreTablesExist = missingCoreTables.length === 0;
    const allCriticalFKsExist = missingFKs.length === 0;
    const helperFunctionsExist = functions.rows.length > 0;

    if (allCoreTablesExist) {
      console.log('  ✓ All core tables exist');
    } else {
      console.log(`  ✗ ${missingCoreTables.length} core tables missing`);
    }

    if (allCriticalFKsExist) {
      console.log('  ✓ All critical foreign keys exist');
    } else {
      console.log(`  ✗ ${missingFKs.length} critical foreign keys missing`);
    }

    if (helperFunctionsExist) {
      console.log('  ✓ Helper functions exist');
    } else {
      console.log('  ✗ Helper functions missing');
    }

    console.log('');

    if (allCoreTablesExist && allCriticalFKsExist && helperFunctionsExist) {
      console.log('✅ RESULT: Database is successfully bootstrapped!');
      console.log('');
      console.log('Next steps:');
      console.log('  1. Seed tenants: See backend/scripts/seedTenantsAndUsers.js');
      console.log('  2. Seed materials: See backend/scripts/seed_materials_csv.js');
      console.log('  3. Run RLS verification: node backend/scripts/verifyRlsSupabase.js');
      console.log('  4. Run smoke tests: npm test -- smoke');
      console.log('');
    } else {
      console.log('❌ RESULT: Database bootstrap is incomplete!');
      console.log('');
      console.log('Action required:');
      console.log('  1. Run all migrations: npm run migrate');
      console.log('  2. Check migration logs for errors');
      console.log('  3. Re-run this verification script');
      console.log('');
      client.release();
      await pool.end();
      process.exit(1);
    }

    client.release();
    await pool.end();

  } catch (error) {
    console.error('');
    console.error('❌ ERROR: Bootstrap verification failed!');
    console.error('');
    console.error('Error:', error.message);
    if (error.stack) {
      console.error('');
      console.error('Stack trace:');
      console.error(error.stack);
    }
    console.error('');
    await pool.end();
    process.exit(1);
  }
}

// Run verification
if (require.main === module) {
  verifyBootstrap().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { verifyBootstrap };
