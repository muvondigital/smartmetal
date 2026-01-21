/**
 * Unified Migration Runner
 *
 * Runs all migrations in order from 001 to 050.
 * Handles different migration patterns:
 * - Migrations with up(db) / down(db) signature
 * - Migrations with up() that call connectDb() internally
 * - Special cases (e.g., 002_add_sku_columns)
 */

// Load .env from backend directory (not root)
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { Pool } = require('pg');
const { config } = require('../config/env');
const fs = require('fs');
const path = require('path');

const migrationsDir = path.join(__dirname, 'migrations');

// Migration files in order (excluding duplicates)
const migrationOrder = [
  '000_bootstrap_core_schema', // Stage 1.4: Bootstrap from empty DB
  '001_fix_critical_gaps',
  '002_add_sku_columns',
  '003_create_pipes_table',
  '004_add_ai_approval_columns',
  '004_add_pipes_unique_constraint', // Note: duplicate number, runs after 004_add_ai_approval_columns
  '005_create_document_extractions_table',
  '006_create_ai_predictions_table',
  '007_add_pipes_dimensions_columns',
  '008_create_pipe_grades_table',
  '009_add_pipe_references_to_materials',
  '010_create_flanges_table',
  '011_create_flange_grades_table',
  '012_add_flange_references_to_materials',
  '013_add_material_attributes',
  '014_add_size_to_rfq_items',
  '015_create_tax_system',
  '016_create_material_price_history',
  '017_create_mto_extractions_table',
  '018_add_project_type_support',
  '019_add_multi_level_approval',
  '020_create_lme_system',
  '021_add_dual_origin_pricing',
  '022_create_stage8_regulatory_tables',
  '023_create_tenant_tables',
  '024_add_tenant_id_to_domain_tables',
  '026_fix_cascade_deletes',
  '027_create_approval_events_table',
  '028_create_ai_cost_tracking_table',
  '029_create_tariff_keyword_groups',
  '030_add_price_agreement_document_versioning',
  '031_create_users_table',
  '032_create_agreement_v2_tables',
  '033_create_tenant_onboarding_status',
  '033_add_rfq_naming_fields',
  '034_create_assistant_documents_table',
  '040_regulatory_hs_codes',
  '041_regulatory_material_mapping',
  '042_add_hs_fields_to_rfq_items',
  '043_add_origin_and_agreement_fields_to_rfq_items',
  '044_create_regulatory_learning_tables',
  '045_add_logistics_cost_columns',
  '046_create_regulatory_country_profiles',
  '047_extend_tenants_with_country_config',
  '048_create_knowledge_base_articles',
  '049_enable_rls_and_policies',
  '050_backfill_ai_api_usage_tenant_id_and_rls',
  '051_force_rls_on_tenant_tables',
  '052_normalize_fk_cascade_behavior',
  '053_rls_tightening_and_policy_normalization',
  '054_system_views_core_workflows',
  '055_materialized_views_analytics',
  '056_grant_table_ownership_to_app_user',
  '057_allow_auth_without_tenant_context',
  '058_materials_tenantization_option_c_plus',
  '059_add_outcome_fields_to_pricing_runs',
  '060_add_is_demo_to_tenants',
  '061_add_logistics_cost_to_pricing_run_items',
  '062_add_total_final_import_duty_to_pricing_runs',
  '063_enable_rls_on_critical_tables',
  '064_add_pricing_run_versioning',
  '065_create_quote_candidates_table',
  '066_enable_rls_on_rfq_and_price_agreements',
  '067_create_supplier_performance_tables',
  '068_add_document_type_to_rfqs',
  '069_add_material_treatment_doctrine_v1',
  '070_add_blob_storage_to_document_extractions',
  '071_fix_approval_history_columns',
];

/**
 * Run a single migration
 */
async function runMigration(migrationName, db) {
  console.log('');
  console.log('='.repeat(60));
  console.log(`Running: ${migrationName}`);
  console.log('='.repeat(60));

  try {
    const migrationPath = path.join(migrationsDir, `${migrationName}.js`);
    
    if (!fs.existsSync(migrationPath)) {
      console.log(`⚠️  Migration file not found: ${migrationPath}`);
      console.log('   Skipping...');
      return { success: true, skipped: true };
    }

    const migration = require(migrationPath);

    // Handle different migration patterns
    if (migration.up) {
      // Pattern 1: up(db) - takes db parameter
      if (migration.up.length > 0) {
        // Function expects db parameter
        await migration.up(db);
      } else {
        // Pattern 2: up() - calls connectDb internally
        await migration.up();
      }
    } else if (migration.addSkuColumns) {
      // Special case: 002_add_sku_columns
      console.log('   Running addSkuColumns()...');
      await migration.addSkuColumns(db);
    } else {
      console.log(`⚠️  Migration ${migrationName} doesn't have an 'up' function`);
      console.log('   Available exports:', Object.keys(migration));
      return { success: false, error: 'No up function found' };
    }

    console.log(`✅ ${migrationName} completed successfully`);
    return { success: true };

  } catch (error) {
    console.error(`❌ ${migrationName} failed:`, error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    return { success: false, error: error.message };
  }
}

/**
 * Main migration runner
 */
async function runAllMigrations() {
  console.log('='.repeat(60));
  console.log('SMARTMETAL CPQ - DATABASE MIGRATION RUNNER');
  console.log('='.repeat(60));
  console.log('');
  console.log(`Total migrations to run: ${migrationOrder.length}`);
  console.log('');

  // Extract connection string ONLY from MIGRATION_DATABASE_URL
  // NEVER fallback to DATABASE_URL - migrations must use admin role
  const migrationUrl = process.env.MIGRATION_DATABASE_URL;

  if (!migrationUrl) {
    console.error('❌ ERROR: MIGRATION_DATABASE_URL is required for migrations!');
    console.error('');
    console.error('Migrations MUST use an admin/superuser role (e.g., postgres).');
    console.error('DATABASE_URL is for runtime only and must use smartmetal_app role.');
    console.error('');
    console.error('Please set MIGRATION_DATABASE_URL in your .env file:');
    console.error('  MIGRATION_DATABASE_URL=postgresql://postgres:password@host:port/database');
    console.error('');
    console.error('See docs/DB_APP_USER_AND_RLS_ENFORCEMENT.md for details on database role setup.');
    console.error('');
    process.exit(1);
  }

  // Mask password in connection string for display
  const maskedUrl = migrationUrl.replace(/:[^:@]+@/, ':***@');
  console.log(`[MIGRATION] Using: MIGRATION_DATABASE_URL`);
  console.log(`🔌 [MIGRATION] Database: ${maskedUrl}`);
  console.log('');

  // Connect to database using migration URL
  // This uses the admin/superuser role for schema changes
  let pool;
  let db;
  try {
    console.log('Connecting to database...');
    pool = new Pool({
      connectionString: migrationUrl,
      max: 1, // Single connection for migrations
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });

    // Test connection and get current user
    const testClient = await pool.connect();
    await testClient.query('SELECT 1');
    
    // Log current user for verification
    const userResult = await testClient.query('SELECT current_user');
    const currentUser = userResult.rows[0].current_user;
    console.log(`[MIGRATION] current_user: ${currentUser}`);
    
    testClient.release();

    db = pool;
    console.log('✅ Database connection established');
    console.log('');
  } catch (error) {
    console.error('❌ Failed to connect to database:', error.message);
    console.error('');
    console.error('Please check:');
    console.error('  1. MIGRATION_DATABASE_URL (or DATABASE_URL) is correct');
    console.error('  2. Database server is running');
    console.error('  3. Network connectivity');
    console.error('  4. Database credentials are valid');
    process.exit(1);
  }

  // Run migrations in order
  const results = [];
  let hasFailures = false;

  for (const migrationName of migrationOrder) {
    const result = await runMigration(migrationName, db);
    results.push({ migration: migrationName, ...result });
    
    if (!result.success && !result.skipped) {
      hasFailures = true;
      console.log('');
      console.log('⚠️  Migration failed. Stopping execution.');
      console.log('   Fix the error above and re-run this script.');
      console.log('   Already-applied migrations are safe to re-run (they use IF NOT EXISTS).');
      break;
    }
  }

  // Summary
  console.log('');
  console.log('='.repeat(60));
  console.log('MIGRATION SUMMARY');
  console.log('='.repeat(60));
  
  const successful = results.filter(r => r.success && !r.skipped).length;
  const skipped = results.filter(r => r.skipped).length;
  const failed = results.filter(r => !r.success && !r.skipped).length;

  console.log(`✅ Successful: ${successful}`);
  if (skipped > 0) {
    console.log(`⚠️  Skipped: ${skipped}`);
  }
  if (failed > 0) {
    console.log(`❌ Failed: ${failed}`);
  }
  console.log('');

  // Close database connection pool
  try {
    await pool.end();
  } catch (error) {
    console.error('Warning: Failed to close database pool:', error.message);
  }

  if (hasFailures) {
    console.log('❌ Migration process completed with errors.');
    console.log('   Fix the errors above before proceeding.');
    process.exit(1);
  } else {
    console.log('✅ All migrations completed successfully!');
    console.log('');
    console.log('Next steps:');
    console.log('  1. Run seed scripts if needed (seed:pipes, seed:fittings, etc.)');
    console.log('  2. Start the backend server: npm run dev');
    process.exit(0);
  }
}

// Run if called directly
if (require.main === module) {
  runAllMigrations().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { runAllMigrations, runMigration };

