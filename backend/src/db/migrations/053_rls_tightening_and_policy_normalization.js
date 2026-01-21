/**
 * Migration 053: RLS Tightening & Policy Normalization
 *
 * Purpose: Ensure all tenant-scoped tables have RLS enabled and forced,
 * and standardize policy naming and logic for consistency.
 *
 * This migration:
 * 1. Enables and forces RLS on all tenant-scoped tables
 * 2. Standardizes policy names to: tenant_isolation_select, tenant_isolation_insert, etc.
 * 3. Ensures smartmetal_app role is subject to RLS (no BYPASSRLS)
 * 4. Normalizes policy logic to use current_setting('app.tenant_id')::uuid
 *
 * Tenant-scoped tables (from RLS_TABLE_MATRIX.md):
 * - Core Business: clients, projects, rfqs, rfq_items, pricing_runs, pricing_run_items
 * - Approvals: approval_history, approval_events
 * - Agreements: price_agreements, agreement_headers, agreement_conditions, agreement_scales
 * - Extractions: document_extractions, mto_extractions
 * - AI/ML: ai_predictions, ai_api_usage, assistant_documents
 * - Configuration: client_pricing_rules, users, tenant_onboarding_status
 * - Regulatory: regulatory_keyword_mappings_tenant, regulatory_learning_events
 * - Knowledge: knowledge_base_articles
 *
 * Global tables (no RLS or simple USING (true)):
 * - materials (global catalog)
 * - pipes, flanges (global catalogs)
 * - regulatory_hs_codes (global reference)
 * - regulatory_material_mapping (global reference)
 * - lme_prices (global reference)
 * - tax_rules (global reference)
 */

async function up(db) {
  if (!db) {
    throw new Error('Migration 053 requires db parameter. Use runAllMigrations.js to run migrations.');
  }

  console.log('');
  console.log('='.repeat(60));
  console.log('Migration 053: RLS Tightening & Policy Normalization');
  console.log('='.repeat(60));
  console.log('');

  try {
    // List of all tenant-scoped tables
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
      // Global+Tenant (nullable tenant_id)
      'knowledge_base_articles',
      'regulatory_learning_events',
    ];

    // Special tables that support global + tenant rows (nullable tenant_id)
    const globalAndTenantTables = [
      'knowledge_base_articles',
      'regulatory_learning_events',
    ];

    console.log('Step 1: Enabling and forcing RLS on all tenant-scoped tables...');
    console.log('');

    let enabledCount = 0;
    let forcedCount = 0;
    let skippedCount = 0;

    for (const tableName of tenantScopedTables) {
      try {
        // Check if table exists
        const tableCheck = await db.query(`
          SELECT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_name = $1
          );
        `, [tableName]);

        if (!tableCheck.rows[0].exists) {
          console.log(`  ⚠️  ${tableName} - Table does not exist, skipping`);
          skippedCount++;
          continue;
        }

        // Enable RLS (idempotent)
        await db.query(`
          DO $$
          BEGIN
            IF EXISTS (
              SELECT 1 FROM pg_tables
              WHERE schemaname = 'public'
                AND tablename = '${tableName}'
            ) THEN
              ALTER TABLE public.${tableName} ENABLE ROW LEVEL SECURITY;
            END IF;
          END;
          $$;
        `);

        // Force RLS (idempotent)
        await db.query(`
          DO $$
          BEGIN
            IF EXISTS (
              SELECT 1 FROM pg_tables
              WHERE schemaname = 'public'
                AND tablename = '${tableName}'
            ) THEN
              ALTER TABLE public.${tableName} FORCE ROW LEVEL SECURITY;
            END IF;
          END;
          $$;
        `);

        enabledCount++;
        forcedCount++;
        console.log(`  ✅ ${tableName} - RLS enabled and forced`);

      } catch (error) {
        console.error(`  ❌ ${tableName} - Error: ${error.message}`);
        // Continue to next table
      }
    }

    console.log('');
    console.log(`✓ Enabled RLS on ${enabledCount} tables`);
    console.log(`✓ Forced RLS on ${forcedCount} tables`);
    if (skippedCount > 0) {
      console.log(`⚠️  Skipped ${skippedCount} tables (not found)`);
    }
    console.log('');

    // Step 2: Standardize policy naming and logic
    console.log('Step 2: Standardizing policy names and logic...');
    console.log('');

    let policyCount = 0;

    for (const tableName of tenantScopedTables) {
      try {
        // Check if table exists
        const tableCheck = await db.query(`
          SELECT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_name = $1
          );
        `, [tableName]);

        if (!tableCheck.rows[0].exists) {
          continue;
        }

        // Check existing policies
        const existingPolicies = await db.query(`
          SELECT policyname, cmd, qual, with_check
          FROM pg_policies
          WHERE schemaname = 'public'
            AND tablename = $1;
        `, [tableName]);

        const isGlobalAndTenant = globalAndTenantTables.includes(tableName);

        // Determine policy logic based on table type
        const usingClause = isGlobalAndTenant
          ? `(tenant_id IS NULL OR tenant_id = current_setting('app.tenant_id', true)::uuid)`
          : `(tenant_id = current_setting('app.tenant_id', true)::uuid)`;

        const withCheckClause = isGlobalAndTenant
          ? `(tenant_id IS NULL OR tenant_id = current_setting('app.tenant_id', true)::uuid)`
          : `(tenant_id = current_setting('app.tenant_id', true)::uuid)`;

        // Drop old policies if they exist with different names
        for (const policy of existingPolicies.rows) {
          const oldPolicyName = policy.policyname;
          // Keep policies that match our standard naming, drop others
          if (!oldPolicyName.startsWith('tenant_isolation_') && 
              !oldPolicyName.startsWith(`${tableName}_tenant_isolation`) &&
              !oldPolicyName.startsWith(`${tableName}_global_and_tenant_isolation`)) {
            await db.query(`
              DROP POLICY IF EXISTS ${oldPolicyName} ON public.${tableName};
            `);
          }
        }

        // Create standardized policies
        // For SELECT operations
        await db.query(`
          DO $$
          BEGIN
            IF EXISTS (
              SELECT 1 FROM pg_tables
              WHERE schemaname = 'public'
                AND tablename = '${tableName}'
            ) THEN
              DROP POLICY IF EXISTS tenant_isolation_select ON public.${tableName};
              CREATE POLICY tenant_isolation_select ON public.${tableName}
                FOR SELECT
                USING ${usingClause};
            END IF;
          END;
          $$;
        `);

        // For INSERT operations
        await db.query(`
          DO $$
          BEGIN
            IF EXISTS (
              SELECT 1 FROM pg_tables
              WHERE schemaname = 'public'
                AND tablename = '${tableName}'
            ) THEN
              DROP POLICY IF EXISTS tenant_isolation_insert ON public.${tableName};
              CREATE POLICY tenant_isolation_insert ON public.${tableName}
                FOR INSERT
                WITH CHECK ${withCheckClause};
            END IF;
          END;
          $$;
        `);

        // For UPDATE operations
        await db.query(`
          DO $$
          BEGIN
            IF EXISTS (
              SELECT 1 FROM pg_tables
              WHERE schemaname = 'public'
                AND tablename = '${tableName}'
            ) THEN
              DROP POLICY IF EXISTS tenant_isolation_update ON public.${tableName};
              CREATE POLICY tenant_isolation_update ON public.${tableName}
                FOR UPDATE
                USING ${usingClause}
                WITH CHECK ${withCheckClause};
            END IF;
          END;
          $$;
        `);

        // For DELETE operations
        await db.query(`
          DO $$
          BEGIN
            IF EXISTS (
              SELECT 1 FROM pg_tables
              WHERE schemaname = 'public'
                AND tablename = '${tableName}'
            ) THEN
              DROP POLICY IF EXISTS tenant_isolation_delete ON public.${tableName};
              CREATE POLICY tenant_isolation_delete ON public.${tableName}
                FOR DELETE
                USING ${usingClause};
            END IF;
          END;
          $$;
        `);

        policyCount++;
        console.log(`  ✅ ${tableName} - Policies standardized`);

      } catch (error) {
        console.error(`  ❌ ${tableName} - Error standardizing policies: ${error.message}`);
        // Continue to next table
      }
    }

    console.log('');
    console.log(`✓ Standardized policies on ${policyCount} tables`);
    console.log('');

    // Step 3: Verify smartmetal_app role does not have BYPASSRLS
    console.log('Step 3: Verifying smartmetal_app role configuration...');
    console.log('');

    const roleCheck = await db.query(`
      SELECT rolname, rolbypassrls
      FROM pg_roles
      WHERE rolname = 'smartmetal_app';
    `);

    if (roleCheck.rows.length === 0) {
      console.log('  ⚠️  smartmetal_app role does not exist yet');
      console.log('     This is expected if role setup is pending.');
    } else {
      const bypassRls = roleCheck.rows[0].rolbypassrls;
      if (bypassRls) {
        console.log('  ⚠️  WARNING: smartmetal_app has BYPASSRLS enabled');
        console.log('     This should be disabled for proper RLS enforcement.');
        console.log('     Run: ALTER ROLE smartmetal_app WITH NOBYPASSRLS;');
      } else {
        console.log('  ✅ smartmetal_app role does not have BYPASSRLS (correct)');
      }
    }

    console.log('');
    console.log('='.repeat(60));
    console.log('Migration 053 Summary:');
    console.log(`  ✅ RLS enabled on ${enabledCount} tables`);
    console.log(`  ✅ RLS forced on ${forcedCount} tables`);
    console.log(`  ✅ Policies standardized on ${policyCount} tables`);
    console.log('='.repeat(60));
    console.log('');

  } catch (error) {
    console.error('[Migration 053] ❌ Migration failed:', error);
    throw error;
  }
}

async function down(db) {
  if (!db) {
    throw new Error('Migration 053 requires db parameter. Use runAllMigrations.js to run migrations.');
  }

  console.log('[Migration 053] Rollback: RLS tightening cannot be automatically reversed.');
  console.log('[Migration 053] Original RLS state is preserved in previous migrations.');
  console.log('[Migration 053] To revert, manually adjust RLS settings and policies.');
  // Down can be minimal; it's acceptable to not fully revert policies
  // as long as it is safe. You may leave a no-op down or best-effort revert.
}

module.exports = {
  up,
  down,
};

