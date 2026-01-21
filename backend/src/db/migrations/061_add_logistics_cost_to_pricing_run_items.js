/**
 * Migration 061: Add logistics_cost column to pricing_run_items
 *
 * This migration adds the missing `logistics_cost` column to pricing_run_items table.
 * This column stores the total logistics cost per item (sum of freight, insurance, handling, local charges).
 *
 * Context:
 * - Migration 045 added breakdown columns (freight_cost, insurance_cost, handling_cost, local_charges)
 * - But the code also references a singular `logistics_cost` column for the total
 * - This migration ensures backward compatibility and aligns schema with code expectations
 *
 * Multi-tenancy: Uses existing tenant_id from parent table
 */

async function up(db) {
  if (!db) {
    throw new Error('Migration 061 requires db parameter. Use runAllMigrations.js to run migrations.');
  }

  console.log('[Migration 061] Adding logistics_cost column to pricing_run_items...');

  try {
    await db.query('BEGIN');

    // Add logistics_cost column to pricing_run_items
    // This is the total logistics cost (sum of freight + insurance + handling + local)
    // Default to 0 for existing rows, allow NULL for flexibility
    await db.query(`
      ALTER TABLE pricing_run_items
      ADD COLUMN IF NOT EXISTS logistics_cost NUMERIC(12, 2) DEFAULT 0;
    `);

    console.log('[Migration 061] ✓ Added logistics_cost column to pricing_run_items');

    // Add comment for documentation
    await db.query(`
      COMMENT ON COLUMN pricing_run_items.logistics_cost IS 'Total logistics cost for this item (freight + insurance + handling + local charges). Can be calculated from breakdown fields or set directly.';
    `);

    console.log('[Migration 061] ✓ Added column comment');

    // Ensure migration 045 columns also exist (idempotent safety check)
    // This ensures freight_cost, insurance_cost, handling_cost, local_charges exist
    await db.query(`
      ALTER TABLE pricing_run_items
      ADD COLUMN IF NOT EXISTS freight_cost NUMERIC(12, 2),
      ADD COLUMN IF NOT EXISTS insurance_cost NUMERIC(12, 2),
      ADD COLUMN IF NOT EXISTS handling_cost NUMERIC(12, 2),
      ADD COLUMN IF NOT EXISTS local_charges NUMERIC(12, 2),
      ADD COLUMN IF NOT EXISTS item_landed_cost NUMERIC(12, 2);
    `);

    console.log('[Migration 061] ✓ Verified migration 045 columns exist');

    // Ensure pricing_runs has the aggregated columns (idempotent safety check)
    await db.query(`
      ALTER TABLE pricing_runs
      ADD COLUMN IF NOT EXISTS total_freight_cost NUMERIC(12, 2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS total_insurance_cost NUMERIC(12, 2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS total_handling_cost NUMERIC(12, 2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS total_local_charges NUMERIC(12, 2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS total_landed_cost NUMERIC(12, 2);
    `);

    console.log('[Migration 061] ✓ Verified pricing_runs aggregated columns exist');

    await db.query('COMMIT');
    console.log('[Migration 061] ✅ Completed logistics_cost column migration');
  } catch (error) {
    await db.query('ROLLBACK');
    console.error('[Migration 061] ❌ Failed:', error);
    throw error;
  }
}

async function down(db) {
  if (!db) {
    throw new Error('Migration 061 requires db parameter. Use runAllMigrations.js to run migrations.');
  }

  console.log('[Migration 061] Rolling back logistics_cost column...');

  try {
    await db.query('BEGIN');

    // Remove logistics_cost column
    await db.query(`
      ALTER TABLE pricing_run_items
      DROP COLUMN IF EXISTS logistics_cost;
    `);

    await db.query('COMMIT');
    console.log('[Migration 061] ✅ Rollback complete');
  } catch (error) {
    await db.query('ROLLBACK');
    console.error('[Migration 061] ❌ Rollback failed:', error);
    throw error;
  }
}

module.exports = {
  up,
  down,
};

