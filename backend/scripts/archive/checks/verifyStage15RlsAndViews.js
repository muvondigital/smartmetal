/**
 * Verification Script: Stage 1.5 RLS and Views
 *
 * Stage 1.5 Verification
 *
 * This script verifies that:
 * 1. All tenant-scoped tables have RLS enabled and forced
 * 2. All tenant-scoped tables have tenant_id-based policies
 * 3. All system views exist (v_rfq_with_items, v_pricing_runs_with_totals, etc.)
 * 4. All materialized views exist (mv_analytics_rfq_daily, mv_analytics_pricing_margins)
 *
 * Usage:
 *   node backend/scripts/verifyStage15RlsAndViews.js
 *
 * Prerequisites:
 *   - MIGRATION_DATABASE_URL must be set (uses admin role)
 *   - Migrations 053, 054, 055 must have been run
 *
 * Expected Result:
 *   ✅ RLS enabled and forced on all tenant-scoped tables
 *   ✅ Tenant isolation policies exist on all tenant-scoped tables
 *   ✅ All 6 system views exist
 *   ✅ All 2 materialized views exist
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { Pool } = require('pg');

async function verifyStage15() {
  console.log('='.repeat(70));
  console.log('STAGE 1.5 RLS AND VIEWS VERIFICATION');
  console.log('='.repeat(70));
  console.log('');
  console.log('This script verifies RLS tightening and system views from Stage 1.5.');
  console.log('');

  // Use MIGRATION_DATABASE_URL (admin role)
  const migrationUrl = process.env.MIGRATION_DATABASE_URL;

  if (!migrationUrl) {
    console.error('❌ ERROR: MIGRATION_DATABASE_URL is required!');
    console.error('   Please set MIGRATION_DATABASE_URL in your .env file.');
    process.exit(1);
  }

  // Mask password for display
  const maskedUrl = migrationUrl.replace(/:[^:@]+@/, ':***@');
  console.log(`🔌 Using MIGRATION_DATABASE_URL: ${maskedUrl}`);
  console.log('');

  const pool = new Pool({
    connectionString: migrationUrl,
    max: 1,
  });

  try {
    console.log('[1/4] Connecting to database...');
    const client = await pool.connect();
    console.log('✓ Connected to database');
    console.log('');

    // =========================================================================
    // STEP 1: Verify RLS on tenant-scoped tables
    // =========================================================================

    console.log('[2/4] Verifying RLS on tenant-scoped tables...');
    console.log('');

    const tenantScopedTables = [
      // Core Business
      'clients',
      'projects',
      'rfqs',
      'rfq_items',
      'pricing_runs',
      'pricing_run_items',
      // Approvals
      'approval_history',
      'approval_events',
      // Agreements
      'price_agreements',
      'agreement_headers',
      'agreement_conditions',
      'agreement_scales',
      // Extractions
      'document_extractions',
      'mto_extractions',
      // AI/ML
      'ai_predictions',
      'ai_api_usage',
      'assistant_documents',
      // Configuration
      'client_pricing_rules',
      'users',
      'tenant_onboarding_status',
      // Regulatory
      'regulatory_keyword_mappings_tenant',
      // Global+Tenant
      'knowledge_base_articles',
      'regulatory_learning_events',
    ];

    let rlsEnabledCount = 0;
    let rlsForcedCount = 0;
    let policiesCount = 0;
    let missingTables = [];

    for (const tableName of tenantScopedTables) {
      // Check if table exists
      const tableCheck = await client.query(`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public'
            AND table_name = $1
        );
      `, [tableName]);

      if (!tableCheck.rows[0].exists) {
        missingTables.push(tableName);
        continue;
      }

      // Check RLS status
      const rlsCheck = await client.query(`
        SELECT
          relrowsecurity AS rls_enabled,
          relforcerowsecurity AS force_rls_enabled
        FROM pg_class
        WHERE relname = $1 AND relnamespace = 'public'::regnamespace;
      `, [tableName]);

      if (rlsCheck.rows.length > 0) {
        const rlsEnabled = rlsCheck.rows[0].rls_enabled;
        const forceRlsEnabled = rlsCheck.rows[0].force_rls_enabled;

        if (rlsEnabled) {
          rlsEnabledCount++;
        }
        if (forceRlsEnabled) {
          rlsForcedCount++;
        }
      }

      // Check for tenant isolation policies
      const policyCheck = await client.query(`
        SELECT COUNT(*) as policy_count
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = $1
          AND (
            policyname LIKE 'tenant_isolation_%'
            OR policyname LIKE $2
            OR policyname LIKE $3
          );
      `, [tableName, `${tableName}_tenant_isolation%`, `${tableName}_global_and_tenant_isolation%`]);

      if (parseInt(policyCheck.rows[0].policy_count, 10) > 0) {
        policiesCount++;
      }
    }

    const existingTablesCount = tenantScopedTables.length - missingTables.length;

    console.log(`  Tables checked: ${existingTablesCount}`);
    console.log(`  ✅ RLS enabled: ${rlsEnabledCount}/${existingTablesCount}`);
    console.log(`  ✅ RLS forced: ${rlsForcedCount}/${existingTablesCount}`);
    console.log(`  ✅ Policies exist: ${policiesCount}/${existingTablesCount}`);
    if (missingTables.length > 0) {
      console.log(`  ⚠️  Missing tables: ${missingTables.length} (${missingTables.join(', ')})`);
    }
    console.log('');

    // =========================================================================
    // STEP 2: Verify system views exist
    // =========================================================================

    console.log('[3/4] Verifying system views...');
    console.log('');

    const systemViews = [
      'v_rfq_with_items',
      'v_pricing_runs_with_totals',
      'v_price_agreements_active',
      'v_materials_full',
      'v_tenant_users_basic',
      'v_analytics_rfq_daily',
    ];

    let viewsFound = 0;
    const missingViews = [];

    for (const viewName of systemViews) {
      const viewCheck = await client.query(`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.views
          WHERE table_schema = 'public'
            AND table_name = $1
        );
      `, [viewName]);

      if (viewCheck.rows[0].exists) {
        viewsFound++;
      } else {
        missingViews.push(viewName);
      }
    }

    console.log(`  Views checked: ${systemViews.length}`);
    console.log(`  ✅ Views found: ${viewsFound}/${systemViews.length}`);
    if (missingViews.length > 0) {
      console.log(`  ❌ Missing views: ${missingViews.join(', ')}`);
    }
    console.log('');

    // =========================================================================
    // STEP 3: Verify materialized views exist
    // =========================================================================

    console.log('[4/4] Verifying materialized views...');
    console.log('');

    const materializedViews = [
      'mv_analytics_rfq_daily',
      'mv_analytics_pricing_margins',
    ];

    let mviewsFound = 0;
    const missingMViews = [];

    for (const mviewName of materializedViews) {
      const mviewCheck = await client.query(`
        SELECT EXISTS (
          SELECT 1 FROM pg_matviews
          WHERE schemaname = 'public'
            AND matviewname = $1
        );
      `, [mviewName]);

      if (mviewCheck.rows[0].exists) {
        mviewsFound++;
      } else {
        missingMViews.push(mviewName);
      }
    }

    console.log(`  Materialized views checked: ${materializedViews.length}`);
    console.log(`  ✅ Materialized views found: ${mviewsFound}/${materializedViews.length}`);
    if (missingMViews.length > 0) {
      console.log(`  ❌ Missing materialized views: ${missingMViews.join(', ')}`);
    }
    console.log('');

    // =========================================================================
    // SUMMARY
    // =========================================================================

    console.log('='.repeat(70));
    console.log('VERIFICATION SUMMARY');
    console.log('='.repeat(70));
    console.log('');

    // RLS Summary
    const rlsOk = rlsEnabledCount === existingTablesCount && 
                  rlsForcedCount === existingTablesCount && 
                  policiesCount === existingTablesCount;
    
    if (rlsOk) {
      console.log(`✅ RLS: OK on ${rlsEnabledCount}/${existingTablesCount} tenant tables`);
    } else {
      console.log(`⚠️  RLS: Partial (${rlsEnabledCount}/${existingTablesCount} enabled, ${rlsForcedCount}/${existingTablesCount} forced, ${policiesCount}/${existingTablesCount} with policies)`);
    }

    // Views Summary
    const viewsOk = viewsFound === systemViews.length;
    if (viewsOk) {
      console.log(`✅ Views: OK (${viewsFound}/${systemViews.length} present)`);
    } else {
      console.log(`❌ Views: Missing (${viewsFound}/${systemViews.length} present)`);
    }

    // Materialized Views Summary
    const mviewsOk = mviewsFound === materializedViews.length;
    if (mviewsOk) {
      console.log(`✅ Materialized views: OK (${mviewsFound}/${materializedViews.length} present)`);
    } else {
      console.log(`❌ Materialized views: Missing (${mviewsFound}/${materializedViews.length} present)`);
    }

    console.log('');

    // Overall status
    if (rlsOk && viewsOk && mviewsOk) {
      console.log('✅ Stage 1.5 verification PASSED');
      console.log('');
      console.log('All RLS policies, views, and materialized views are correctly configured.');
    } else {
      console.log('⚠️  Stage 1.5 verification has issues');
      console.log('');
      console.log('Please review the details above and ensure:');
      if (!rlsOk) {
        console.log('  - All tenant-scoped tables have RLS enabled and forced');
        console.log('  - All tenant-scoped tables have tenant isolation policies');
      }
      if (!viewsOk) {
        console.log('  - All system views are created (migration 054)');
      }
      if (!mviewsOk) {
        console.log('  - All materialized views are created (migration 055)');
      }
    }

    console.log('');

    await client.release();
    await pool.end();

    process.exit(rlsOk && viewsOk && mviewsOk ? 0 : 1);

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
verifyStage15().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

