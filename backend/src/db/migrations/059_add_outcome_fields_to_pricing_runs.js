/**
 * Migration 059: Add Win/Loss Tracking Fields to Pricing Runs
 * 
 * Phase C: Win/Loss Tracking
 * 
 * Purpose: Adds columns to track commercial outcome of pricing runs
 * - outcome: Final outcome (won, lost, pending, cancelled)
 * - outcome_date: When the outcome was determined
 * - outcome_reason: Optional reason/notes for the outcome
 * 
 * These fields are nullable and additive only - no existing behavior changes.
 */

async function up(db) {
  if (!db) {
    throw new Error('Migration 059 requires db parameter. Use runAllMigrations.js to run migrations.');
  }

  console.log('');
  console.log('='.repeat(60));
  console.log('Migration 059: Add Win/Loss Tracking Fields to Pricing Runs');
  console.log('='.repeat(60));
  console.log('');

  try {
    // Add outcome column (TEXT, nullable, with CHECK constraint)
    console.log('[1/3] Adding outcome column to pricing_runs table...');
    await db.query(`
      ALTER TABLE pricing_runs
      ADD COLUMN IF NOT EXISTS outcome TEXT
      CHECK (outcome IS NULL OR outcome IN ('won', 'lost', 'pending', 'cancelled'));
    `);
    console.log('  ✓ Added outcome column with CHECK constraint');

    // Add outcome_date column (TIMESTAMPTZ, nullable)
    console.log('[2/3] Adding outcome_date column to pricing_runs table...');
    await db.query(`
      ALTER TABLE pricing_runs
      ADD COLUMN IF NOT EXISTS outcome_date TIMESTAMP WITH TIME ZONE;
    `);
    console.log('  ✓ Added outcome_date column');

    // Add outcome_reason column (TEXT, nullable)
    console.log('[3/3] Adding outcome_reason column to pricing_runs table...');
    await db.query(`
      ALTER TABLE pricing_runs
      ADD COLUMN IF NOT EXISTS outcome_reason TEXT;
    `);
    console.log('  ✓ Added outcome_reason column');

    console.log('');
    console.log('✅ Migration 059 completed successfully!');
    console.log('');
    console.log('Summary:');
    console.log('  - Added outcome column (TEXT, nullable, CHECK constraint)');
    console.log('  - Added outcome_date column (TIMESTAMPTZ, nullable)');
    console.log('  - Added outcome_reason column (TEXT, nullable)');
    console.log('');

  } catch (error) {
    console.error('');
    console.error('❌ Migration 059 failed:', error);
    console.error('');
    throw error;
  }
}

async function down(db) {
  if (!db) {
    throw new Error('Migration 059 requires db parameter. Use runAllMigrations.js to run migrations.');
  }

  console.log('');
  console.log('='.repeat(60));
  console.log('Rolling back Migration 059: Remove Win/Loss Tracking Fields');
  console.log('='.repeat(60));
  console.log('');

  try {
    // Drop columns in reverse order
    console.log('[1/3] Dropping outcome_reason column...');
    await db.query(`
      ALTER TABLE pricing_runs
      DROP COLUMN IF EXISTS outcome_reason;
    `);
    console.log('  ✓ Dropped outcome_reason column');

    console.log('[2/3] Dropping outcome_date column...');
    await db.query(`
      ALTER TABLE pricing_runs
      DROP COLUMN IF EXISTS outcome_date;
    `);
    console.log('  ✓ Dropped outcome_date column');

    console.log('[3/3] Dropping outcome column...');
    // Note: PostgreSQL will automatically drop the CHECK constraint when the column is dropped
    await db.query(`
      ALTER TABLE pricing_runs
      DROP COLUMN IF EXISTS outcome;
    `);
    console.log('  ✓ Dropped outcome column');

    console.log('');
    console.log('✅ Rollback completed successfully');
    console.log('');

  } catch (error) {
    console.error('');
    console.error('❌ Rollback failed:', error);
    console.error('');
    throw error;
  }
}

module.exports = {
  up,
  down,
};

