/**
 * Migration 042: Add HS Code Fields to RFQ Items
 *
 * Adds HS Code and import duty fields to rfq_items table for Phase 3 integration.
 * These fields enable automatic HS code mapping and duty calculation in RFQ workflows.
 *
 * Columns added:
 * - hs_code: HS code string (nullable)
 * - import_duty_rate: Import duty percentage (nullable, numeric)
 * - import_duty_amount: Calculated import duty amount (nullable, numeric)
 * - hs_match_source: Source of HS code match (RULE, MAPPING, DIRECT_HS, MANUAL, NONE)
 * - hs_confidence: Confidence score 0-1 for automatic matches (nullable, numeric)
 *
 * All fields are nullable to maintain backward compatibility with existing RFQs.
 */

async function up(db) {
  if (!db) {
    throw new Error('Migration 042 requires db parameter. Use runAllMigrations.js to run migrations.');
  }

  console.log('[Migration 042] Adding HS code fields to rfq_items table...');

  try {
    await db.query('BEGIN');

    // Add HS code and duty fields
    await db.query(`
      ALTER TABLE rfq_items
      ADD COLUMN IF NOT EXISTS hs_code TEXT,
      ADD COLUMN IF NOT EXISTS import_duty_rate NUMERIC(10, 4),
      ADD COLUMN IF NOT EXISTS import_duty_amount NUMERIC(10, 2),
      ADD COLUMN IF NOT EXISTS hs_match_source TEXT,
      ADD COLUMN IF NOT EXISTS hs_confidence NUMERIC(3, 2);
    `);
    console.log('[Migration 042] ✓ Added HS code fields to rfq_items');

    // Add check constraint for hs_match_source valid values
    await db.query(`
      ALTER TABLE rfq_items
      DROP CONSTRAINT IF EXISTS rfq_items_hs_match_source_check;
    `);
    await db.query(`
      ALTER TABLE rfq_items
      ADD CONSTRAINT rfq_items_hs_match_source_check
      CHECK (hs_match_source IS NULL OR hs_match_source IN ('RULE', 'MAPPING', 'DIRECT_HS', 'MANUAL', 'NONE'));
    `);
    console.log('[Migration 042] ✓ Added check constraint for hs_match_source');

    // Add check constraint for hs_confidence range (0 to 1)
    await db.query(`
      ALTER TABLE rfq_items
      DROP CONSTRAINT IF EXISTS rfq_items_hs_confidence_check;
    `);
    await db.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'rfq_items_hs_confidence_check'
        ) THEN
          ALTER TABLE rfq_items
          ADD CONSTRAINT rfq_items_hs_confidence_check
          CHECK (hs_confidence IS NULL OR (hs_confidence >= 0 AND hs_confidence <= 1));
        END IF;
      END;
      $$;
    `);
    console.log('[Migration 042] ✓ Added check constraint for hs_confidence');

    // Add index on hs_code for faster lookups
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_rfq_items_hs_code
      ON rfq_items(hs_code)
      WHERE hs_code IS NOT NULL;
    `);
    console.log('[Migration 042] ✓ Created index on hs_code');

    await db.query('COMMIT');
    console.log('[Migration 042] ✓ Migration completed successfully');
  } catch (error) {
    await db.query('ROLLBACK');
    console.error('[Migration 042] ✗ Migration failed:', error);
    throw error;
  }
}

/**
 * Rollback migration
 */
async function down(db) {
  if (!db) {
    throw new Error('Migration 042 requires db parameter. Use runAllMigrations.js to run migrations.');
  }

  console.log('[Migration 042] Rolling back: Removing HS code fields from rfq_items...');

  try {
    await db.query('BEGIN');

    // Drop constraints first
    await db.query(`
      ALTER TABLE rfq_items
      DROP CONSTRAINT IF EXISTS rfq_items_hs_match_source_check;
    `);
    await db.query(`
      ALTER TABLE rfq_items
      DROP CONSTRAINT IF EXISTS rfq_items_hs_confidence_check;
    `);

    // Drop index
    await db.query(`
      DROP INDEX IF EXISTS idx_rfq_items_hs_code;
    `);

    // Drop columns
    await db.query(`
      ALTER TABLE rfq_items
      DROP COLUMN IF EXISTS hs_code,
      DROP COLUMN IF EXISTS import_duty_rate,
      DROP COLUMN IF EXISTS import_duty_amount,
      DROP COLUMN IF EXISTS hs_match_source,
      DROP COLUMN IF EXISTS hs_confidence;
    `);

    await db.query('COMMIT');
    console.log('[Migration 042] ✓ Rollback completed successfully');
  } catch (error) {
    await db.query('ROLLBACK');
    console.error('[Migration 042] ✗ Rollback failed:', error);
    throw error;
  }
}

module.exports = {
  up,
  down,
};

