// Load environment variables
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../../.env') });

/**
 * Migration 073: Add tenant_id to ai_predictions table
 *
 * This migration adds tenant isolation to the ai_predictions table to ensure
 * proper RLS enforcement for multi-tenant AI prediction queries.
 *
 * Changes:
 * - Add tenant_id column to ai_predictions
 * - Backfill tenant_id from pricing_runs
 * - Enable RLS on ai_predictions
 * - Add RLS policies for tenant isolation
 */

async function up(db) {
  if (!db) {
    throw new Error('Migration 073 requires db parameter. Migrations must use MIGRATION_DATABASE_URL.');
  }

  console.log('[Migration 073] Adding tenant_id to ai_predictions table...');

  try {
    // Step 1: Add tenant_id column (nullable first for backfill)
    console.log('  Adding tenant_id column...');
    await db.query(`
      ALTER TABLE ai_predictions
      ADD COLUMN IF NOT EXISTS tenant_id UUID;
    `);

    // Step 2: Backfill tenant_id from pricing_runs
    console.log('  Backfilling tenant_id from pricing_runs...');
    await db.query(`
      UPDATE ai_predictions ap
      SET tenant_id = pr.tenant_id
      FROM pricing_runs pr
      WHERE ap.pricing_run_id = pr.id
      AND ap.tenant_id IS NULL;
    `);

    // Step 3: Make tenant_id NOT NULL
    console.log('  Making tenant_id NOT NULL...');
    await db.query(`
      ALTER TABLE ai_predictions
      ALTER COLUMN tenant_id SET NOT NULL;
    `);

    // Step 4: Add foreign key constraint to tenants
    console.log('  Adding foreign key constraint to tenants...');
    await db.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'ai_predictions_tenant_id_fkey'
          AND table_name = 'ai_predictions'
        ) THEN
          ALTER TABLE ai_predictions
          ADD CONSTRAINT ai_predictions_tenant_id_fkey
          FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
        END IF;
      END $$;
    `);

    // Step 5: Create index on tenant_id for performance
    console.log('  Creating index on tenant_id...');
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_ai_predictions_tenant_id
      ON ai_predictions(tenant_id);
    `);

    // Step 6: Enable RLS on ai_predictions
    console.log('  Enabling RLS on ai_predictions...');
    await db.query(`
      ALTER TABLE ai_predictions ENABLE ROW LEVEL SECURITY;
    `);

    // Step 7: Drop existing policies if any
    console.log('  Dropping existing RLS policies...');
    await db.query(`
      DROP POLICY IF EXISTS ai_predictions_tenant_isolation ON ai_predictions;
    `);

    // Step 8: Create RLS policy for tenant isolation
    console.log('  Creating RLS policy for tenant isolation...');
    await db.query(`
      CREATE POLICY ai_predictions_tenant_isolation ON ai_predictions
      FOR ALL
      USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
    `);

    console.log('[Migration 073] ✅ Successfully added tenant_id to ai_predictions');
    return true;
  } catch (error) {
    console.error('[Migration 073] ❌ Failed:', error);
    throw error;
  }
}

async function down(db) {
  if (!db) {
    throw new Error('Migration 073 down() requires db parameter. Migrations must use MIGRATION_DATABASE_URL.');
  }

  console.log('[Migration 073] Rolling back tenant_id addition to ai_predictions...');

  try {
    // Drop RLS policies
    await db.query(`
      DROP POLICY IF EXISTS ai_predictions_tenant_isolation ON ai_predictions;
    `);

    // Disable RLS
    await db.query(`
      ALTER TABLE ai_predictions DISABLE ROW LEVEL SECURITY;
    `);

    // Drop index
    await db.query(`
      DROP INDEX IF EXISTS idx_ai_predictions_tenant_id;
    `);

    // Drop foreign key constraint
    await db.query(`
      ALTER TABLE ai_predictions
      DROP CONSTRAINT IF EXISTS ai_predictions_tenant_id_fkey;
    `);

    // Drop tenant_id column
    await db.query(`
      ALTER TABLE ai_predictions
      DROP COLUMN IF EXISTS tenant_id;
    `);

    console.log('[Migration 073] ✅ Rollback completed');
    return true;
  } catch (error) {
    console.error('[Migration 073] ❌ Rollback failed:', error);
    throw error;
  }
}

module.exports = { up, down };
