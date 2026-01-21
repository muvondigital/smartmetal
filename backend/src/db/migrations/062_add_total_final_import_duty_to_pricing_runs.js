/**
 * Migration 062: Add total_final_import_duty column to pricing_runs
 *
 * This migration adds the missing `total_final_import_duty` column to pricing_runs table.
 * This column stores the aggregated import duty across all items in a pricing run.
 *
 * Context:
 * - The code in pricingService.js:1363 references total_final_import_duty
 * - Migration 061 added logistics cost columns but missed the duty total
 * - This ensures schema aligns with code expectations for Phase 9 duty aggregation
 *
 * Multi-tenancy: Uses existing tenant_id from parent table
 */

async function up(db) {
  if (!db) {
    throw new Error('Migration 062 requires db parameter. Use runAllMigrations.js to run migrations.');
  }

  console.log('[Migration 062] Adding total_final_import_duty column to pricing_runs...');

  try {
    await db.query('BEGIN');

    // Add total_final_import_duty column to pricing_runs
    // This is the aggregated import duty total across all items
    // Default to 0 for existing rows (most pricing runs will have duty calculated)
    await db.query(`
      ALTER TABLE pricing_runs
      ADD COLUMN IF NOT EXISTS total_final_import_duty NUMERIC(12, 2) DEFAULT 0 NOT NULL;
    `);

    console.log('[Migration 062] ✓ Added total_final_import_duty column to pricing_runs');

    // Add comment for documentation
    await db.query(`
      COMMENT ON COLUMN pricing_runs.total_final_import_duty IS 'Total import duty across all items in this pricing run. Sum of final_import_duty from all pricing_run_items.';
    `);

    console.log('[Migration 062] ✓ Added column comment');

    await db.query('COMMIT');
    console.log('[Migration 062] ✅ Completed total_final_import_duty column migration');
  } catch (error) {
    await db.query('ROLLBACK');
    console.error('[Migration 062] ❌ Failed:', error);
    throw error;
  }
}

async function down(db) {
  if (!db) {
    throw new Error('Migration 062 requires db parameter. Use runAllMigrations.js to run migrations.');
  }

  console.log('[Migration 062] Rolling back total_final_import_duty column...');

  try {
    await db.query('BEGIN');

    // Remove total_final_import_duty column
    await db.query(`
      ALTER TABLE pricing_runs
      DROP COLUMN IF EXISTS total_final_import_duty;
    `);

    await db.query('COMMIT');
    console.log('[Migration 062] ✅ Rollback complete');
  } catch (error) {
    await db.query('ROLLBACK');
    console.error('[Migration 062] ❌ Rollback failed:', error);
    throw error;
  }
}

module.exports = {
  up,
  down,
};
