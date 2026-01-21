/**
 * Migration 072: Add rejection_reason Column to pricing_runs
 *
 * Purpose: Add rejection_reason column to pricing_runs table to store
 *          the reason why a pricing run was rejected during approval
 *
 * Issue: approvalService.rejectPricingRun() tries to update rejection_reason
 *        but the column doesn't exist in pricing_runs table
 *
 * Solution: Add rejection_reason TEXT column to pricing_runs
 *
 * Created: Dec 18, 2025
 */

async function up(db) {
  if (!db) {
    throw new Error('Migration 072 requires db parameter. Use runAllMigrations.js to run migrations.');
  }

  console.log('Adding rejection_reason column to pricing_runs...');

  await db.query(`
    -- Add rejection_reason column if it doesn't exist
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'pricing_runs' AND column_name = 'rejection_reason'
      ) THEN
        ALTER TABLE pricing_runs ADD COLUMN rejection_reason TEXT;
        COMMENT ON COLUMN pricing_runs.rejection_reason IS 'Reason provided when rejecting this pricing run during approval';
      END IF;
    END $$;
  `);

  console.log('✅ Added rejection_reason column to pricing_runs');
}

async function down(db) {
  if (!db) {
    throw new Error('Migration 072 requires db parameter. Use runAllMigrations.js to run migrations.');
  }

  console.log('Removing rejection_reason column from pricing_runs...');

  await db.query(`
    ALTER TABLE pricing_runs DROP COLUMN IF EXISTS rejection_reason;
  `);

  console.log('✅ Removed rejection_reason column from pricing_runs');
}

module.exports = { up, down };
