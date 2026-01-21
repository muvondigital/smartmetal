/**
 * Migration 050: Backfill ai_api_usage.tenant_id and Enable RLS
 *
 * Purpose: 
 * - Backfill tenant_id in ai_api_usage table from related pricing_runs or rfqs
 * - Enforce tenant_id NOT NULL
 * - Add foreign key constraint and index
 * - Enable RLS on ai_api_usage
 *
 * Strategy:
 * - Backfill from pricing_runs.tenant_id (via pricing_run_id)
 * - Backfill from rfqs.tenant_id (via rfq_id)
 * - For orphaned rows (no pricing_run_id or rfq_id), delete them as they
 *   cannot be reliably assigned to a tenant
 *
 * Created: 2025-12-10
 */

async function up(db) {
  if (!db) {
    throw new Error('Migration 050 requires db parameter. Use runAllMigrations.js to run migrations.');
  }

  console.log('[Migration 050] Backfilling ai_api_usage.tenant_id and enabling RLS...');

  try {
    // Step 1: Check current state
    const checkResult = await db.query(`
      SELECT 
        COUNT(*) as total_rows,
        COUNT(tenant_id) as rows_with_tenant_id,
        COUNT(*) FILTER (WHERE pricing_run_id IS NOT NULL) as rows_with_pricing_run,
        COUNT(*) FILTER (WHERE rfq_id IS NOT NULL) as rows_with_rfq,
        COUNT(*) FILTER (WHERE pricing_run_id IS NULL AND rfq_id IS NULL) as orphaned_rows
      FROM ai_api_usage;
    `);

    const stats = checkResult.rows[0];
    console.log(`  Current state:`);
    console.log(`    Total rows: ${stats.total_rows}`);
    console.log(`    Rows with tenant_id: ${stats.rows_with_tenant_id}`);
    console.log(`    Rows with pricing_run_id: ${stats.rows_with_pricing_run}`);
    console.log(`    Rows with rfq_id: ${stats.rows_with_rfq}`);
    console.log(`    Orphaned rows (no pricing_run_id or rfq_id): ${stats.orphaned_rows}`);

    // Step 2: Backfill tenant_id from pricing_runs
    console.log('  Backfilling tenant_id from pricing_runs...');
    const pricingRunBackfill = await db.query(`
      UPDATE ai_api_usage aau
      SET tenant_id = pr.tenant_id
      FROM pricing_runs pr
      WHERE aau.pricing_run_id = pr.id
        AND aau.tenant_id IS NULL
        AND pr.tenant_id IS NOT NULL;
    `);
    console.log(`    ✅ Updated ${pricingRunBackfill.rowCount} rows from pricing_runs`);

    // Step 3: Backfill tenant_id from rfqs (for rows that don't have pricing_run_id)
    console.log('  Backfilling tenant_id from rfqs...');
    const rfqBackfill = await db.query(`
      UPDATE ai_api_usage aau
      SET tenant_id = r.tenant_id
      FROM rfqs r
      WHERE aau.rfq_id = r.id
        AND aau.tenant_id IS NULL
        AND aau.pricing_run_id IS NULL
        AND r.tenant_id IS NOT NULL;
    `);
    console.log(`    ✅ Updated ${rfqBackfill.rowCount} rows from rfqs`);

    // Step 4: Check for remaining NULL tenant_id rows
    const remainingNullResult = await db.query(`
      SELECT COUNT(*) as count
      FROM ai_api_usage
      WHERE tenant_id IS NULL;
    `);
    const remainingNullCount = parseInt(remainingNullResult.rows[0].count);

    if (remainingNullCount > 0) {
      console.log(`  ⚠️  Warning: ${remainingNullCount} rows still have NULL tenant_id`);
      console.log('  These rows will be deleted as they cannot be reliably assigned to a tenant.');
      
      // Delete orphaned rows that cannot be assigned to a tenant
      const deleteResult = await db.query(`
        DELETE FROM ai_api_usage
        WHERE tenant_id IS NULL;
      `);
      console.log(`    ✅ Deleted ${deleteResult.rowCount} orphaned rows`);
    }

    // Step 5: Verify all rows now have tenant_id
    const verifyResult = await db.query(`
      SELECT COUNT(*) as null_count
      FROM ai_api_usage
      WHERE tenant_id IS NULL;
    `);
    const nullCount = parseInt(verifyResult.rows[0].null_count);

    if (nullCount > 0) {
      throw new Error(`Cannot proceed: ${nullCount} rows still have NULL tenant_id after backfill`);
    }

    console.log('  ✅ All rows have tenant_id assigned');

    // Step 6: Enforce tenant_id NOT NULL
    console.log('  Enforcing tenant_id NOT NULL constraint...');
    await db.query(`
      ALTER TABLE ai_api_usage
      ALTER COLUMN tenant_id SET NOT NULL;
    `);
    console.log('  ✅ tenant_id is now NOT NULL');

    // Step 7: Add foreign key constraint to tenants table
    console.log('  Adding foreign key constraint to tenants table...');
    await db.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'ai_api_usage_tenant_fk'
        ) THEN
          ALTER TABLE ai_api_usage
          ADD CONSTRAINT ai_api_usage_tenant_fk
          FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
        END IF;
      END;
      $$;
    `);
    console.log('  ✅ Foreign key constraint added');

    // Step 8: Add index on tenant_id (if it doesn't already exist)
    // Note: Migration 028 already created idx_ai_usage_tenant_created, but we'll ensure
    // a simple index on tenant_id exists for RLS performance
    console.log('  Ensuring index on tenant_id exists...');
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_ai_api_usage_tenant_id
      ON ai_api_usage (tenant_id);
    `);
    console.log('  ✅ Index on tenant_id verified');

    // Step 9: Enable RLS
    console.log('  Enabling Row-Level Security...');
    await db.query(`
      ALTER TABLE ai_api_usage ENABLE ROW LEVEL SECURITY;
    `);
    console.log('  ✅ RLS enabled');

    // Step 10: Create RLS policy
    console.log('  Creating RLS policy...');
    await db.query(`
      DROP POLICY IF EXISTS ai_api_usage_tenant_isolation ON ai_api_usage;
    `);
    await db.query(`
      CREATE POLICY ai_api_usage_tenant_isolation
      ON ai_api_usage
      FOR ALL
      USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
    `);
    console.log('  ✅ RLS policy created');

    console.log('[Migration 050] ✅ ai_api_usage backfill and RLS setup completed successfully');

  } catch (error) {
    console.error('[Migration 050] ❌ Failed to backfill ai_api_usage:', error);
    throw error;
  }
}

async function down(db) {
  if (!db) {
    throw new Error('Migration 050 requires db parameter. Use runAllMigrations.js to run migrations.');
  }

  console.log('[Migration 050] Rolling back ai_api_usage RLS and constraints...');

  try {
    // Drop RLS policy and disable RLS
    await db.query(`
      DROP POLICY IF EXISTS ai_api_usage_tenant_isolation ON ai_api_usage;
    `);
    await db.query(`
      ALTER TABLE ai_api_usage DISABLE ROW LEVEL SECURITY;
    `);

    // Drop foreign key constraint
    await db.query(`
      ALTER TABLE ai_api_usage
      DROP CONSTRAINT IF EXISTS ai_api_usage_tenant_fk;
    `);

    // Drop index (only the simple one we created, keep the composite index from migration 028)
    await db.query(`
      DROP INDEX IF EXISTS idx_ai_api_usage_tenant_id;
    `);

    // Make tenant_id nullable again
    await db.query(`
      ALTER TABLE ai_api_usage
      ALTER COLUMN tenant_id DROP NOT NULL;
    `);

    // Note: We don't restore NULL values in tenant_id as we don't know which rows
    // were originally NULL vs which were backfilled. This is intentional - the
    // rollback makes the column nullable but doesn't restore original state.

    console.log('[Migration 050] ✅ Rollback completed');
  } catch (error) {
    console.error('[Migration 050] ❌ Failed to roll back:', error);
    throw error;
  }
}

module.exports = {
  up,
  down,
};

