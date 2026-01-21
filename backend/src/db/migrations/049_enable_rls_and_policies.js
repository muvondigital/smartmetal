/**
 * Migration 049: Enable Row-Level Security (RLS) and Create Policies
 *
 * Purpose: Implement RLS policies on all tenant-scoped tables to enforce
 * data isolation at the database level. This provides defense-in-depth
 * security for multi-tenant data access.
 *
 * Strategy:
 * - Standard tenant-only tables: tenant_id must equal current_setting('app.tenant_id')
 * - Global+tenant tables (knowledge_base_articles, regulatory_learning_events):
 *   Allow tenant_id IS NULL (global) OR tenant_id = current_setting('app.tenant_id')
 * - Global reference tables: No RLS (remain accessible to all tenants)
 *
 * Created: 2025-12-10
 */

async function up(db) {
  // db parameter is REQUIRED - migrations must use MIGRATION_DATABASE_URL
  if (!db) {
    throw new Error('Migration 049 requires db parameter. Migrations must use MIGRATION_DATABASE_URL.');
  }

  console.log('[Migration 049] Enabling RLS and creating policies for tenant-scoped tables...');

  try {
    // List of tenant-scoped tables (excluding ai_api_usage which needs backfill first)
    // Based on docs/RLS_TABLE_MATRIX.md
    const tenantScopedTables = [
      // Foundation tables
      'clients',
      'users',
      'tenant_onboarding_status',
      // First-level dependencies
      'projects',
      'rfqs',
      'price_agreements',
      // Second-level dependencies
      'rfq_items',
      'document_extractions',
      'pricing_runs',
      // Third-level dependencies
      'pricing_run_items',
      'approval_history',
      'approval_events',
      'ai_predictions',
      'mto_extractions',
      // Derived tables
      'client_pricing_rules',
      'agreement_headers',
      'agreement_conditions',
      'agreement_scales',
      // Independent tables
      'assistant_documents',
      'regulatory_keyword_mappings_tenant',
    ];

    // Special tables that support global + tenant rows (nullable tenant_id)
    const globalAndTenantTables = [
      'knowledge_base_articles',
      'regulatory_learning_events',
    ];

    // Enable RLS and create policies for standard tenant-scoped tables
    for (const tableName of tenantScopedTables) {
      // Check if table exists before applying RLS
      const tableCheck = await db.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_schema = 'public'
          AND table_name = $1
        );
      `, [tableName]);

      if (!tableCheck.rows[0].exists) {
        console.log(`  ⚠️  Table ${tableName} does not exist, skipping RLS...`);
        continue;
      }

      console.log(`  Enabling RLS on ${tableName}...`);

      try {
        // Enable RLS
        await db.query(`
          ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY;
        `);

        // Drop existing policy if it exists (idempotent)
        await db.query(`
          DROP POLICY IF EXISTS ${tableName}_tenant_isolation ON ${tableName};
        `);

        // Create tenant isolation policy
        await db.query(`
          CREATE POLICY ${tableName}_tenant_isolation
          ON ${tableName}
          FOR ALL
          USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
        `);

        console.log(`  ✅ RLS enabled and policy created for ${tableName}`);
      } catch (permError) {
        if (permError.code === '42501') {
          console.log(`  ⚠️  Cannot enable RLS on ${tableName} (permissions). This is expected if table was created by init script.`);
        } else {
          throw permError;
        }
      }
    }

    // Enable RLS and create policies for global+tenant tables
    for (const tableName of globalAndTenantTables) {
      // Check if table exists before applying RLS
      const tableCheck = await db.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_schema = 'public'
          AND table_name = $1
        );
      `, [tableName]);

      if (!tableCheck.rows[0].exists) {
        console.log(`  ⚠️  Table ${tableName} does not exist, skipping RLS...`);
        continue;
      }

      console.log(`  Enabling RLS on ${tableName} (global+tenant support)...`);

      try {
        // Enable RLS
        await db.query(`
          ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY;
        `);

        // Drop existing policy if it exists (idempotent)
        await db.query(`
          DROP POLICY IF EXISTS ${tableName}_global_and_tenant_isolation ON ${tableName};
        `);

        // Create policy that allows global rows (tenant_id IS NULL) and tenant-specific rows
        await db.query(`
        CREATE POLICY ${tableName}_global_and_tenant_isolation
        ON ${tableName}
        FOR ALL
        USING (
          tenant_id IS NULL
          OR tenant_id = current_setting('app.tenant_id', true)::uuid
        );
      `);

        console.log(`  ✅ RLS enabled and policy created for ${tableName} (global+tenant)`);
      } catch (permError) {
        if (permError.code === '42501') {
          console.log(`  ⚠️  Cannot enable RLS on ${tableName} (permissions). This is expected if table was created by init script.`);
        } else {
          throw permError;
        }
      }
    }

    console.log('[Migration 049] ✅ RLS policies created successfully');
    console.log('');
    console.log('Note: ai_api_usage will be handled in migration 050 after tenant_id backfill');
    console.log('');
    console.log('Manual verification (via psql):');
    console.log('  -- Set tenant context');
    console.log("  SET LOCAL app.tenant_id = 'your-tenant-uuid';");
    console.log('  -- Query should only return rows for that tenant');
    console.log('  SELECT * FROM rfqs;');
    console.log('  -- For global+tenant tables, should return global + tenant rows');
    console.log('  SELECT * FROM knowledge_base_articles;');

  } catch (error) {
    console.error('[Migration 049] ❌ Failed to enable RLS:', error);
    throw error;
  }
}

async function down(db) {
  if (!db) {
    throw new Error('Migration 049 down() requires db parameter. Migrations must use MIGRATION_DATABASE_URL.');
  }

  console.log('[Migration 049] Rolling back RLS policies...');

  try {
    const tenantScopedTables = [
      'clients',
      'users',
      'tenant_onboarding_status',
      'projects',
      'rfqs',
      'price_agreements',
      'rfq_items',
      'document_extractions',
      'pricing_runs',
      'pricing_run_items',
      'approval_history',
      'approval_events',
      'ai_predictions',
      'mto_extractions',
      'client_pricing_rules',
      'agreement_headers',
      'agreement_conditions',
      'agreement_scales',
      'assistant_documents',
      'regulatory_keyword_mappings_tenant',
    ];

    const globalAndTenantTables = [
      'knowledge_base_articles',
      'regulatory_learning_events',
    ];

    // Drop policies and disable RLS for standard tables
    for (const tableName of tenantScopedTables) {
      await db.query(`
        DROP POLICY IF EXISTS ${tableName}_tenant_isolation ON ${tableName};
      `);
      await db.query(`
        ALTER TABLE ${tableName} DISABLE ROW LEVEL SECURITY;
      `);
    }

    // Drop policies and disable RLS for global+tenant tables
    for (const tableName of globalAndTenantTables) {
      await db.query(`
        DROP POLICY IF EXISTS ${tableName}_global_and_tenant_isolation ON ${tableName};
      `);
      await db.query(`
        ALTER TABLE ${tableName} DISABLE ROW LEVEL SECURITY;
      `);
    }

    console.log('[Migration 049] ✅ RLS policies rolled back');
  } catch (error) {
    console.error('[Migration 049] ❌ Failed to roll back RLS:', error);
    throw error;
  }
}

module.exports = {
  up,
  down,
};

