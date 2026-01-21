/**
 * Migration 051: Force Row-Level Security on Tenant-Scoped Tables
 *
 * Purpose: Add FORCE ROW LEVEL SECURITY to all tenant-scoped tables as an additional defense layer.
 *
 * Background (Stage 1.3):
 * - Migration 049 enabled RLS and created policies for all tenant-scoped tables
 * - Migration 050 backfilled ai_api_usage.tenant_id and enabled RLS
 * - However, RLS policies are BYPASSED if the database connection uses a SUPERUSER role
 * - The postgres role has BYPASSRLS = true by default
 * - This meant that even with RLS policies, cross-tenant data leakage was possible
 *
 * Solution:
 * - Stage 1.3 introduces a dedicated non-superuser application role: smartmetal_app
 * - This migration adds FORCE ROW LEVEL SECURITY to all tenant-scoped tables
 * - FORCE RLS ensures RLS is enforced even for table owners (defense-in-depth)
 *
 * What FORCE ROW LEVEL SECURITY Does:
 * - Normal RLS: Enforced for non-superuser roles, bypassed for table owners
 * - FORCE RLS: Enforced for EVERYONE including table owners
 * - This prevents accidental RLS bypass if a privileged role is used
 *
 * Safety:
 * - This migration is safe to run multiple times (FORCE is idempotent)
 * - Does not change RLS policies (those were created in migration 049)
 * - Does not affect data or schema structure
 * - Only changes how RLS enforcement works
 *
 * Tables Affected (24 tenant-scoped tables):
 * - Core business: clients, projects, rfqs, rfq_items, pricing_runs, pricing_run_items
 * - Approvals: approval_history, approval_events
 * - Agreements: price_agreements, agreement_headers, agreement_conditions, agreement_scales
 * - Extractions: document_extractions, mto_extractions
 * - AI/ML: ai_predictions, ai_api_usage, assistant_documents
 * - Configuration: client_pricing_rules, users, tenant_onboarding_status
 * - Regulatory: regulatory_keyword_mappings_tenant, regulatory_learning_events
 * - Knowledge: knowledge_base_articles
 *
 * See: docs/DB_APP_USER_AND_RLS_ENFORCEMENT.md for full Stage 1.3 implementation guide
 */

/**
 * Apply FORCE ROW LEVEL SECURITY to all tenant-scoped tables
 */
async function up(db) {
  console.log('');
  console.log('='.repeat(60));
  console.log('Migration 051: Force Row-Level Security on Tenant Tables');
  console.log('='.repeat(60));
  console.log('');

  // List of all tenant-scoped tables (from RLS_TABLE_MATRIX.md)
  // Grouped by category for clarity
  const tenantTables = {
    'Core Business': [
      'clients',
      'projects',
      'rfqs',
      'rfq_items',
      'pricing_runs',
      'pricing_run_items',
    ],
    'Approvals': [
      'approval_history',
      'approval_events',
    ],
    'Agreements': [
      'price_agreements',
      'agreement_headers',
      'agreement_conditions',
      'agreement_scales',
    ],
    'Extractions': [
      'document_extractions',
      'mto_extractions',
    ],
    'AI/ML': [
      'ai_predictions',
      'ai_api_usage',
      'assistant_documents',
    ],
    'Configuration': [
      'client_pricing_rules',
      'users',
      'tenant_onboarding_status',
    ],
    'Regulatory': [
      'regulatory_keyword_mappings_tenant',
      'regulatory_learning_events',
    ],
    'Knowledge': [
      'knowledge_base_articles',
    ],
  };

  console.log('Adding FORCE ROW LEVEL SECURITY to all tenant-scoped tables...');
  console.log('');

  let totalTables = 0;
  let successCount = 0;
  let skipCount = 0;

  // Process each category
  for (const [category, tables] of Object.entries(tenantTables)) {
    console.log(`📁 ${category}:`);

    for (const tableName of tables) {
      totalTables++;

      try {
        // Check if table exists first
        const tableCheck = await db.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables
            WHERE table_schema = 'public'
            AND table_name = $1
          );
        `, [tableName]);

        if (!tableCheck.rows[0].exists) {
          console.log(`   ⚠️  ${tableName} - Table does not exist, skipping`);
          skipCount++;
          continue;
        }

        // Check if RLS is enabled (should be from migration 049)
        const rlsCheck = await db.query(`
          SELECT
            relname,
            relrowsecurity AS rls_enabled,
            relforcerowsecurity AS force_rls_enabled
          FROM pg_class
          WHERE relname = $1 AND relnamespace = 'public'::regnamespace;
        `, [tableName]);

        if (!rlsCheck.rows[0] || !rlsCheck.rows[0].rls_enabled) {
          console.log(`   ⚠️  ${tableName} - RLS not enabled, skipping FORCE RLS`);
          skipCount++;
          continue;
        }

        // Check if FORCE RLS is already enabled
        if (rlsCheck.rows[0].force_rls_enabled) {
          console.log(`   ✅ ${tableName} - FORCE RLS already enabled`);
          successCount++;
          continue;
        }

        // Add FORCE ROW LEVEL SECURITY
        await db.query(`ALTER TABLE ${tableName} FORCE ROW LEVEL SECURITY;`);
        console.log(`   ✅ ${tableName} - FORCE RLS enabled`);
        successCount++;

      } catch (error) {
        console.error(`   ❌ ${tableName} - Error: ${error.message}`);
        // Continue to next table instead of failing entire migration
        // This allows partial success if some tables have issues
      }
    }

    console.log('');
  }

  // Summary
  console.log('='.repeat(60));
  console.log('Migration 051 Summary:');
  console.log(`  Total tables processed: ${totalTables}`);
  console.log(`  ✅ FORCE RLS enabled: ${successCount}`);
  if (skipCount > 0) {
    console.log(`  ⚠️  Skipped: ${skipCount}`);
  }
  console.log('='.repeat(60));
  console.log('');

  // Verify final state
  console.log('Verifying FORCE RLS enforcement...');
  const verifyResult = await db.query(`
    SELECT
      pt.schemaname,
      pt.tablename,
      pc.relrowsecurity AS rls_enabled,
      pc.relforcerowsecurity AS force_rls
    FROM pg_tables pt
    JOIN pg_class pc ON pc.relname = pt.tablename
    JOIN pg_namespace pn ON pn.oid = pc.relnamespace AND pn.nspname = pt.schemaname
    WHERE pt.schemaname = 'public'
      AND pc.relrowsecurity = true
    ORDER BY pt.tablename;
  `);

  const forceRlsTables = verifyResult.rows.filter(r => r.force_rls).length;
  console.log(`✅ ${forceRlsTables} tables have FORCE RLS enabled`);
  console.log('');

  if (successCount < totalTables && skipCount === 0) {
    throw new Error(
      `Migration 051 completed with errors. ${successCount}/${totalTables} tables updated. ` +
      'Check error messages above for details.'
    );
  }

  console.log('✅ Migration 051 completed successfully');
  console.log('');
  console.log('Next Steps:');
  console.log('  1. Create smartmetal_app database role (see docs/DB_APP_USER_AND_RLS_ENFORCEMENT.md)');
  console.log('  2. Update DATABASE_URL to use smartmetal_app role');
  console.log('  3. Restart backend server');
  console.log('  4. Run RLS tests: npm test -- rls');
  console.log('');
}

/**
 * Rollback migration (remove FORCE ROW LEVEL SECURITY)
 */
async function down(db) {
  console.log('');
  console.log('='.repeat(60));
  console.log('Migration 051 Rollback: Remove FORCE RLS');
  console.log('='.repeat(60));
  console.log('');

  // Same table list as up()
  const allTables = [
    // Core Business
    'clients', 'projects', 'rfqs', 'rfq_items', 'pricing_runs', 'pricing_run_items',
    // Approvals
    'approval_history', 'approval_events',
    // Agreements
    'price_agreements', 'agreement_headers', 'agreement_conditions', 'agreement_scales',
    // Extractions
    'document_extractions', 'mto_extractions',
    // AI/ML
    'ai_predictions', 'ai_api_usage', 'assistant_documents',
    // Configuration
    'client_pricing_rules', 'users', 'tenant_onboarding_status',
    // Regulatory
    'regulatory_keyword_mappings_tenant', 'regulatory_learning_events',
    // Knowledge
    'knowledge_base_articles',
  ];

  console.log('Removing FORCE ROW LEVEL SECURITY from all tenant-scoped tables...');
  console.log('');

  let successCount = 0;
  for (const tableName of allTables) {
    try {
      // Check if table exists
      const tableCheck = await db.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_schema = 'public'
          AND table_name = $1
        );
      `, [tableName]);

      if (!tableCheck.rows[0].exists) {
        console.log(`⚠️  ${tableName} - Table does not exist, skipping`);
        continue;
      }

      // Remove FORCE RLS
      await db.query(`ALTER TABLE ${tableName} NO FORCE ROW LEVEL SECURITY;`);
      console.log(`✅ ${tableName} - FORCE RLS removed`);
      successCount++;

    } catch (error) {
      console.error(`❌ ${tableName} - Error: ${error.message}`);
    }
  }

  console.log('');
  console.log(`✅ Rollback complete: ${successCount} tables updated`);
  console.log('');
  console.log('⚠️  WARNING: RLS policies are still enabled, but FORCE RLS is removed.');
  console.log('   This means RLS can be bypassed by table owners.');
  console.log('   Ensure you are using a non-superuser role for application queries.');
  console.log('');
}

module.exports = { up, down };
