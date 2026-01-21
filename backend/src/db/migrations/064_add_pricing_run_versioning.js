/**
 * Migration 064: Add Pricing Run Versioning Fields
 *
 * Purpose: Enable controlled versioning of pricing runs for RFQs.
 * Supports workflow where only one "current" pricing run exists per RFQ,
 * with explicit versioning for re-pricing scenarios.
 *
 * Changes:
 * 1. Add version_number integer (starting at 1 for existing runs)
 * 2. Add is_current boolean (default true, only one per RFQ)
 * 3. Add superseded_by uuid (nullable, FK to pricing_runs)
 * 4. Add superseded_reason text (nullable, reason for versioning)
 *
 * Safety:
 * - Idempotent: Can be run multiple times safely
 * - Backfills existing data: All existing runs become version 1, is_current=true
 * - Creates indexes for performance
 *
 * Created: 2025-01-XX
 */

async function up(db) {
  if (!db) {
    throw new Error('Migration 064 requires db parameter. Use runAllMigrations.js to run migrations.');
  }

  console.log('[Migration 064] Adding pricing run versioning fields...');

  try {
    await db.query('BEGIN');

    // Step 1: Add version_number column
    const versionNumberCheck = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'pricing_runs'
          AND column_name = 'version_number'
      );
    `);

    if (!versionNumberCheck.rows[0].exists) {
      await db.query(`
        ALTER TABLE pricing_runs
        ADD COLUMN version_number INTEGER;
      `);
      console.log('  ✅ Added version_number column');

      // Backfill: Set all existing runs to version 1
      await db.query(`
        UPDATE pricing_runs
        SET version_number = 1
        WHERE version_number IS NULL;
      `);

      // Set NOT NULL and default
      await db.query(`
        ALTER TABLE pricing_runs
        ALTER COLUMN version_number SET NOT NULL,
        ALTER COLUMN version_number SET DEFAULT 1;
      `);
      console.log('  ✅ Backfilled version_number (all existing runs = 1)');
    } else {
      console.log('  ✓ version_number column already exists');
    }

    // Step 2: Add is_current column
    const isCurrentCheck = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'pricing_runs'
          AND column_name = 'is_current'
      );
    `);

    if (!isCurrentCheck.rows[0].exists) {
      await db.query(`
        ALTER TABLE pricing_runs
        ADD COLUMN is_current BOOLEAN;
      `);
      console.log('  ✅ Added is_current column');

      // Backfill: Set all existing runs to is_current=true
      // Note: This means multiple runs per RFQ will all be "current" initially
      // Business logic should handle this transition
      await db.query(`
        UPDATE pricing_runs
        SET is_current = true
        WHERE is_current IS NULL;
      `);

      // Set NOT NULL and default
      await db.query(`
        ALTER TABLE pricing_runs
        ALTER COLUMN is_current SET NOT NULL,
        ALTER COLUMN is_current SET DEFAULT true;
      `);
      console.log('  ✅ Backfilled is_current (all existing runs = true)');
    } else {
      console.log('  ✓ is_current column already exists');
    }

    // Step 3: Add superseded_by column (nullable FK)
    const supersededByCheck = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'pricing_runs'
          AND column_name = 'superseded_by'
      );
    `);

    if (!supersededByCheck.rows[0].exists) {
      await db.query(`
        ALTER TABLE pricing_runs
        ADD COLUMN superseded_by UUID REFERENCES pricing_runs(id) ON DELETE SET NULL;
      `);
      console.log('  ✅ Added superseded_by column (FK to pricing_runs)');
    } else {
      console.log('  ✓ superseded_by column already exists');
    }

    // Step 4: Add superseded_reason column
    const supersededReasonCheck = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'pricing_runs'
          AND column_name = 'superseded_reason'
      );
    `);

    if (!supersededReasonCheck.rows[0].exists) {
      await db.query(`
        ALTER TABLE pricing_runs
        ADD COLUMN superseded_reason TEXT;
      `);
      console.log('  ✅ Added superseded_reason column');
    } else {
      console.log('  ✓ superseded_reason column already exists');
    }

    // Step 5: Create indexes for performance
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_pricing_runs_rfq_is_current
      ON pricing_runs(rfq_id, is_current)
      WHERE is_current = true;
    `);
    console.log('  ✅ Created index on (rfq_id, is_current)');

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_pricing_runs_version_number
      ON pricing_runs(rfq_id, version_number DESC);
    `);
    console.log('  ✅ Created index on (rfq_id, version_number)');

    await db.query('COMMIT');
    console.log('[Migration 064] ✅✅✅ Migration completed successfully');

  } catch (error) {
    await db.query('ROLLBACK');
    console.error('[Migration 064] ❌ Migration failed:', error);
    throw error;
  }
}

async function down(db) {
  if (!db) {
    throw new Error('Migration 064 requires db parameter. Use runAllMigrations.js to run migrations.');
  }

  console.log('[Migration 064] Rolling back pricing run versioning fields...');

  try {
    await db.query('BEGIN');

    // Drop indexes
    await db.query(`DROP INDEX IF EXISTS idx_pricing_runs_rfq_is_current;`);
    await db.query(`DROP INDEX IF EXISTS idx_pricing_runs_version_number;`);

    // Drop columns (in reverse order due to FK)
    await db.query(`ALTER TABLE pricing_runs DROP COLUMN IF EXISTS superseded_reason;`);
    await db.query(`ALTER TABLE pricing_runs DROP COLUMN IF EXISTS superseded_by;`);
    await db.query(`ALTER TABLE pricing_runs DROP COLUMN IF EXISTS is_current;`);
    await db.query(`ALTER TABLE pricing_runs DROP COLUMN IF EXISTS version_number;`);

    await db.query('COMMIT');
    console.log('[Migration 064] ✅ Rollback complete');

  } catch (error) {
    await db.query('ROLLBACK');
    console.error('[Migration 064] ❌ Rollback failed:', error);
    throw error;
  }
}

module.exports = {
  up,
  down,
};

