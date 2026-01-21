/**
 * Migration 063: Enable RLS on Critical Tables (Phase 1 Tenant Isolation)
 *
 * Purpose: Enforce tenant isolation on critical tables that were missed or need strengthening.
 * This migration is BLOCKING for workflow development - must be completed first.
 *
 * Actions:
 * 1. Enable RLS + FORCE RLS on rfqs and price_agreements (policies already exist from migration 049)
 * 2. Make client_pricing_rules tenant-safe:
 *    - Add tenant_id column (nullable initially for backfill)
 *    - Backfill tenant_id from clients table via client_id FK
 *    - Add NOT NULL constraint after backfill
 *    - Add FK to tenants table
 *    - Enable RLS + FORCE RLS
 *    - Create tenant isolation policy
 *
 * Safety:
 * - Idempotent: Can be run multiple times safely
 * - Checks for existing RLS/policies before creating
 * - Guards against missing dependencies
 *
 * Created: 2025-12-12
 */

async function up(db) {
  if (!db) {
    throw new Error('Migration 063 requires db parameter. Use runAllMigrations.js to run migrations.');
  }

  const getTableOwner = async (tableName) => {
    const ownerRes = await db.query(
      `
        SELECT tableowner
        FROM pg_tables
        WHERE schemaname = 'public'
          AND tablename = $1
      `,
      [tableName]
    );
    return ownerRes.rows[0]?.tableowner || null;
  };

  const isClientPricingRulesTenantSafe = async () => {
    // Check if tenant_id column exists
    const columnRes = await db.query(`
      SELECT is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'client_pricing_rules'
        AND column_name = 'tenant_id'
    `);

    const tenantColumnExists = columnRes.rows.length > 0;
    const tenantColumnNotNull = tenantColumnExists && columnRes.rows[0].is_nullable === 'NO';

    // Check FK
    const fkRes = await db.query(`
      SELECT COUNT(*) AS count
      FROM pg_constraint
      WHERE conname = 'fk_client_pricing_rules_tenant'
        AND conrelid = 'client_pricing_rules'::regclass
        AND confrelid = 'tenants'::regclass;
    `);
    const hasFk = parseInt(fkRes.rows[0]?.count || '0', 10) > 0;

    // Check policy
    const policyRes = await db.query(`
      SELECT COUNT(*) AS count
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'client_pricing_rules'
        AND policyname = 'client_pricing_rules_tenant_isolation';
    `);
    const hasPolicy = parseInt(policyRes.rows[0]?.count || '0', 10) > 0;

    // Check RLS flags
    const rlsRes = await db.query(`
      SELECT relrowsecurity, relforcerowsecurity
      FROM pg_class
      WHERE relname = 'client_pricing_rules'
        AND relnamespace = 'public'::regnamespace;
    `);
    const hasRls = Boolean(rlsRes.rows[0]?.relrowsecurity);
    const hasForceRls = Boolean(rlsRes.rows[0]?.relforcerowsecurity);

    // Check for NULL tenant_ids if the column exists
    let nullCount = 0;
    if (tenantColumnExists) {
      const nullRes = await db.query(`
        SELECT COUNT(*) AS count
        FROM client_pricing_rules
        WHERE tenant_id IS NULL;
      `);
      nullCount = parseInt(nullRes.rows[0]?.count || '0', 10);
    }

    const complete = tenantColumnExists && tenantColumnNotNull && hasFk && hasPolicy && hasRls && hasForceRls && nullCount === 0;

    return {
      complete,
      details: {
        tenantColumnExists,
        tenantColumnNotNull,
        hasFk,
        hasPolicy,
        hasRls,
        hasForceRls,
        nullCount,
      },
    };
  };

  console.log('[Migration 063] Enabling RLS on critical tables (Phase 1 Tenant Isolation)...');

  try {
    // Check early exit: if already tenant-safe, skip to keep re-runs idempotent (useful when running as non-owner)
    const completionStatus = await isClientPricingRulesTenantSafe();
    if (completionStatus.complete) {
      console.log('[Migration 063] ✓ client_pricing_rules already tenant-safe — skipping migration body');
      return;
    }

    const currentUserRes = await db.query('SELECT current_user');
    const currentUser = currentUserRes.rows[0]?.current_user || 'unknown';

    await db.query('BEGIN');
    // The migration connection (e.g., postgres on Supabase) might not own the tables.
    // Assume the app role so ALTER TABLE/RLS statements succeed.
    const roleToAssume = process.env.MIGRATION_TABLE_OWNER_ROLE || 'smartmetal_app';
    let roleAssumed = false;
    try {
      await db.query(`SET ROLE ${roleToAssume};`);
      roleAssumed = true;
      console.log(`[Migration 063] SET ROLE ${roleToAssume} for table ownership`);
    } catch (setRoleErr) {
      console.warn(`[Migration 063] ⚠️  Could not SET ROLE ${roleToAssume}: ${setRoleErr.message}`);
      console.warn('Proceeding without role switch (may fail if not table owner)...');
    }

    // ============================================================================
    // PART 1: Enable RLS + FORCE RLS on rfqs and price_agreements
    // ============================================================================

    console.log('[Migration 063] Part 1: Enabling RLS on rfqs and price_agreements...');

    const criticalTables = ['rfqs', 'price_agreements'];

    for (const tableName of criticalTables) {
      // Check if table exists
      const tableCheck = await db.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_schema = 'public'
          AND table_name = $1
        );
      `, [tableName]);

      if (!tableCheck.rows[0].exists) {
        console.log(`  ⚠️  Table ${tableName} does not exist, skipping...`);
        continue;
      }

      const tableOwner = await getTableOwner(tableName);

      // Check current RLS state
      const rlsCheck = await db.query(`
        SELECT relrowsecurity, relforcerowsecurity
        FROM pg_class
        WHERE relname = $1 AND relnamespace = 'public'::regnamespace;
      `, [tableName]);

      const hasRLS = rlsCheck.rows[0]?.relrowsecurity || false;
      const hasForceRLS = rlsCheck.rows[0]?.relforcerowsecurity || false;

      // If we're not the owner and everything is already enforced, skip mutating this table
      if (tableOwner && tableOwner !== currentUser) {
        if (hasRLS && hasForceRLS && parseInt((await db.query(`
          SELECT COUNT(*) AS count
          FROM pg_policies
          WHERE tablename = $1 AND policyname = $2;
        `, [tableName, `${tableName}_tenant_isolation`])).rows[0].count, 10) > 0) {
          console.log(`  ✓ ${tableName} already secured and current_user=${currentUser} is not owner (${tableOwner}) — skipping ALTERs`);
          continue;
        }

        throw new Error(
          `Migration 063 requires ownership of ${tableName}. Current user: ${currentUser}, owner: ${tableOwner}. ` +
          `Run migrations with the table owner or adjust ownership.`
        );
      }

      // Enable RLS if not already enabled
      if (!hasRLS) {
        await db.query(`ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY;`);
        console.log(`  ✅ Enabled RLS on ${tableName}`);
      } else {
        console.log(`  ✓ RLS already enabled on ${tableName}`);
      }

      // Enable FORCE RLS if not already enabled
      if (!hasForceRLS) {
        await db.query(`ALTER TABLE ${tableName} FORCE ROW LEVEL SECURITY;`);
        console.log(`  ✅ Enabled FORCE RLS on ${tableName}`);
      } else {
        console.log(`  ✓ FORCE RLS already enabled on ${tableName}`);
      }

      // Verify policy exists (should exist from migration 049)
      const policyCheck = await db.query(`
        SELECT COUNT(*) as count
        FROM pg_policies
        WHERE tablename = $1 AND policyname = $2;
      `, [tableName, `${tableName}_tenant_isolation`]);

      if (parseInt(policyCheck.rows[0].count) === 0) {
        throw new Error(
          `CRITICAL: RLS policy ${tableName}_tenant_isolation does not exist! ` +
          `Migration 049 should have created this policy. Please verify migration 049 ran successfully.`
        );
      }

      console.log(`  ✓ Verified policy ${tableName}_tenant_isolation exists`);
    }

    console.log('[Migration 063] ✅ Part 1 complete: RLS enabled on rfqs and price_agreements');

    // ============================================================================
    // PART 2: Make client_pricing_rules tenant-safe
    // ============================================================================

    console.log('[Migration 063] Part 2: Making client_pricing_rules tenant-safe...');

    // Check if client_pricing_rules table exists
    const cprTableCheck = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'client_pricing_rules'
      );
    `);

    if (!cprTableCheck.rows[0].exists) {
      console.log('  ⚠️  Table client_pricing_rules does not exist, skipping Part 2...');
    } else {
      const cprOwner = await getTableOwner('client_pricing_rules');
      if (cprOwner && cprOwner !== currentUser) {
        // If not owner, fail fast with actionable message
        throw new Error(
          `Migration 063 requires ownership of client_pricing_rules. Current user: ${currentUser}, owner: ${cprOwner}. ` +
          `Either run migrations as ${cprOwner} or transfer ownership so the migration can proceed.`
        );
      }

      // Step 1: Add tenant_id column (nullable initially)
      const tenantIdColCheck = await db.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.columns
          WHERE table_schema = 'public'
          AND table_name = 'client_pricing_rules'
          AND column_name = 'tenant_id'
        );
      `);

      if (!tenantIdColCheck.rows[0].exists) {
        await db.query(`
          ALTER TABLE client_pricing_rules
          ADD COLUMN tenant_id UUID NULL;
        `);
        console.log('  ✅ Added tenant_id column to client_pricing_rules');
      } else {
        console.log('  ✓ tenant_id column already exists on client_pricing_rules');
      }

      // Step 2: Backfill tenant_id from clients table via client_id FK
      // Rules that have client_id should inherit tenant_id from clients table
      const backfillResult = await db.query(`
        UPDATE client_pricing_rules cpr
        SET tenant_id = c.tenant_id
        FROM clients c
        WHERE cpr.client_id = c.id
          AND cpr.tenant_id IS NULL;
      `);

      console.log(`  ✅ Backfilled tenant_id for ${backfillResult.rowCount} rows from clients table`);

      // Step 3: Check for rows where tenant_id is still NULL
      const nullTenantCheck = await db.query(`
        SELECT COUNT(*) as count
        FROM client_pricing_rules
        WHERE tenant_id IS NULL;
      `);

      const nullCount = parseInt(nullTenantCheck.rows[0].count);

      if (nullCount > 0) {
        // CRITICAL: Do NOT assign orphaned rows to NSC by default
        // This would poison NSC with data that doesn't belong to it
        // Instead, fail the migration with a clear error message and report
        
        console.error(`  ❌ CRITICAL: Found ${nullCount} orphaned client_pricing_rules rows without tenant_id`);
        console.error(`  ❌ Migration cannot proceed: Refusing to assign orphaned rows to NSC`);
        
        // Generate a report of orphaned row IDs
        const orphanedRowsResult = await db.query(`
          SELECT id, client_id, origin_type, category, created_at
          FROM client_pricing_rules
          WHERE tenant_id IS NULL
          ORDER BY created_at DESC
        `);
        
        // Create a report table to store orphaned row IDs
        await db.query(`
          CREATE TABLE IF NOT EXISTS migration_063_orphaned_report (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            orphaned_rule_id UUID NOT NULL,
            client_id UUID,
            origin_type TEXT,
            category TEXT,
            created_at TIMESTAMP WITH TIME ZONE,
            reported_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
          );
        `);
        
        // Insert orphaned rows into report
        for (const row of orphanedRowsResult.rows) {
          await db.query(`
            INSERT INTO migration_063_orphaned_report (orphaned_rule_id, client_id, origin_type, category, created_at)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT DO NOTHING
          `, [row.id, row.client_id, row.origin_type, row.category, row.created_at]);
        }
        
        console.error(`  📋 Report: ${orphanedRowsResult.rows.length} orphaned rows logged to migration_063_orphaned_report table`);
        console.error(`  📋 Query report: SELECT * FROM migration_063_orphaned_report ORDER BY reported_at DESC;`);
        
        // Throw error to fail migration
        throw new Error(
          `Migration 063 FAILED: Found ${nullCount} orphaned client_pricing_rules rows without tenant_id. ` +
          `Refusing to assign to NSC by default. ` +
          `Please manually backfill tenant_id for these rows using trustworthy relationships (e.g., join to clients table). ` +
          `Orphaned row IDs have been logged to migration_063_orphaned_report table. ` +
          `After fixing, re-run this migration.`
        );
      }

      // Step 4: Add NOT NULL constraint on tenant_id (tenant-scoped by default)
      // First check if there are still NULL values
      const finalNullCheck = await db.query(`
        SELECT COUNT(*) as count
        FROM client_pricing_rules
        WHERE tenant_id IS NULL;
      `);
      
      const finalNullCount = parseInt(finalNullCheck.rows[0].count);
      
      if (finalNullCount === 0) {
        // All rows have tenant_id - can add NOT NULL constraint
        const notNullCheck = await db.query(`
          SELECT column_name, is_nullable
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'client_pricing_rules'
            AND column_name = 'tenant_id'
        `);
        
        if (notNullCheck.rows.length > 0 && notNullCheck.rows[0].is_nullable === 'YES') {
          await db.query(`
            ALTER TABLE client_pricing_rules
            ALTER COLUMN tenant_id SET NOT NULL;
          `);
          console.log('  ✅ Added NOT NULL constraint on tenant_id (tenant-scoped by default)');
        } else {
          console.log('  ✓ tenant_id already has NOT NULL constraint');
        }
      } else {
        console.log(`  ⚠️  ${finalNullCount} rows still have NULL tenant_id - NOT NULL constraint not applied`);
        console.log('  ⚠️  These rows will be inaccessible until tenant_id is set');
      }

      // Step 5: Add FK to tenants table (if not exists)
      const fkCheck = await db.query(`
        SELECT COUNT(*) as count
        FROM information_schema.table_constraints
        WHERE table_schema = 'public'
          AND table_name = 'client_pricing_rules'
          AND constraint_type = 'FOREIGN KEY'
          AND constraint_name = 'fk_client_pricing_rules_tenant';
      `);

      if (parseInt(fkCheck.rows[0].count) === 0) {
        await db.query(`
          ALTER TABLE client_pricing_rules
          ADD CONSTRAINT fk_client_pricing_rules_tenant
          FOREIGN KEY (tenant_id) REFERENCES tenants(id)
          ON DELETE CASCADE;
        `);
        console.log('  ✅ Added FK constraint to tenants table');
      } else {
        console.log('  ✓ FK constraint to tenants already exists');
      }

      // Step 6: Add index on tenant_id for RLS performance
      await db.query(`
        CREATE INDEX IF NOT EXISTS idx_client_pricing_rules_tenant_id
        ON client_pricing_rules(tenant_id);
      `);
      console.log('  ✅ Created index on tenant_id');

      // Step 7: Enable RLS
      const cprRlsCheck = await db.query(`
        SELECT relrowsecurity, relforcerowsecurity
        FROM pg_class
        WHERE relname = 'client_pricing_rules' AND relnamespace = 'public'::regnamespace;
      `);

      const cprHasRLS = cprRlsCheck.rows[0]?.relrowsecurity || false;
      const cprHasForceRLS = cprRlsCheck.rows[0]?.relforcerowsecurity || false;

      if (!cprHasRLS) {
        await db.query(`ALTER TABLE client_pricing_rules ENABLE ROW LEVEL SECURITY;`);
        console.log('  ✅ Enabled RLS on client_pricing_rules');
      } else {
        console.log('  ✓ RLS already enabled on client_pricing_rules');
      }

      if (!cprHasForceRLS) {
        await db.query(`ALTER TABLE client_pricing_rules FORCE ROW LEVEL SECURITY;`);
        console.log('  ✅ Enabled FORCE RLS on client_pricing_rules');
      } else {
        console.log('  ✓ FORCE RLS already enabled on client_pricing_rules');
      }

      // Step 8: Create RLS policy (tenant-scoped only)
      // Policy: Show rows where tenant_id matches current tenant (tenant-scoped by default)
      await db.query(`
        DROP POLICY IF EXISTS client_pricing_rules_tenant_isolation ON client_pricing_rules;
      `);

      await db.query(`
        CREATE POLICY client_pricing_rules_tenant_isolation
        ON client_pricing_rules
        FOR ALL
        USING (
          tenant_id = current_setting('app.tenant_id', true)::uuid
        );
      `);

      console.log('  ✅ Created RLS policy (tenant-scoped isolation)');

      console.log('[Migration 063] ✅ Part 2 complete: client_pricing_rules is now tenant-safe');
    }

    await db.query('COMMIT');
    console.log('[Migration 063] ✅✅✅ Migration completed successfully');

  } catch (error) {
    await db.query('ROLLBACK');
    console.error('[Migration 063] ❌ Migration failed:', error);
    throw error;
  } finally {
    // Reset role for safety
    try {
      await db.query('RESET ROLE;');
    } catch (resetErr) {
      console.warn(`[Migration 063] ⚠️  Failed to RESET ROLE: ${resetErr.message}`);
    }
  }
}

async function down(db) {
  if (!db) {
    throw new Error('Migration 063 requires db parameter. Use runAllMigrations.js to run migrations.');
  }

  console.log('[Migration 063] Rolling back RLS changes...');

  try {
    await db.query('BEGIN');

    // Rollback Part 2: client_pricing_rules
    const cprTableCheck = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'client_pricing_rules'
      );
    `);

    if (cprTableCheck.rows[0].exists) {
      await db.query(`DROP POLICY IF EXISTS client_pricing_rules_tenant_isolation ON client_pricing_rules;`);
      await db.query(`ALTER TABLE client_pricing_rules DISABLE ROW LEVEL SECURITY;`);
      await db.query(`DROP INDEX IF EXISTS idx_client_pricing_rules_tenant_id;`);
      await db.query(`ALTER TABLE client_pricing_rules DROP CONSTRAINT IF EXISTS fk_client_pricing_rules_tenant;`);
      await db.query(`ALTER TABLE client_pricing_rules DROP COLUMN IF EXISTS tenant_id;`);
      console.log('  ✅ Rolled back client_pricing_rules changes');
    }

    // Note: We do NOT disable RLS on rfqs/price_agreements as they should remain protected
    // If you truly need to rollback, manually run:
    // ALTER TABLE rfqs DISABLE ROW LEVEL SECURITY;
    // ALTER TABLE price_agreements DISABLE ROW LEVEL SECURITY;

    await db.query('COMMIT');
    console.log('[Migration 063] ✅ Rollback complete');

  } catch (error) {
    await db.query('ROLLBACK');
    console.error('[Migration 063] ❌ Rollback failed:', error);
    throw error;
  }
}

module.exports = {
  up,
  down,
};
