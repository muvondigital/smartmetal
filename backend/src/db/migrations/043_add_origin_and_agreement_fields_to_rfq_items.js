/**
 * Migration 043: Add Origin Country and Trade Agreement Fields to RFQ Items
 *
 * Adds origin country, trade agreement, and final duty calculation fields to rfq_items table
 * for Phase 5 Regulatory Engine v2 integration.
 *
 * Columns added:
 * - origin_country: Country code (VARCHAR, nullable)
 * - trade_agreement: Detected trade agreement (VARCHAR, nullable)
 * - final_import_duty_rate: Final calculated duty rate after agreements/rules (NUMERIC(10,4), nullable)
 * - final_import_duty_amount: Final calculated duty amount (NUMERIC(12,2), nullable)
 *
 * All fields are nullable to maintain backward compatibility with existing RFQs.
 */

async function up(db) {
  if (!db) {
    throw new Error('Migration 043 requires db parameter. Use runAllMigrations.js to run migrations.');
  }

  console.log('[Migration 043] Adding origin country and agreement fields to rfq_items table...');

  try {
    await db.query('BEGIN');

    // Add origin country and trade agreement fields
    await db.query(`
      ALTER TABLE rfq_items
      ADD COLUMN IF NOT EXISTS origin_country VARCHAR(10),
      ADD COLUMN IF NOT EXISTS trade_agreement VARCHAR(50),
      ADD COLUMN IF NOT EXISTS final_import_duty_rate NUMERIC(10, 4),
      ADD COLUMN IF NOT EXISTS final_import_duty_amount NUMERIC(12, 2);
    `);
    console.log('[Migration 043] ✓ Added origin country and agreement fields to rfq_items');

    // Add check constraint for trade_agreement valid values
    await db.query(`
      ALTER TABLE rfq_items
      DROP CONSTRAINT IF EXISTS rfq_items_trade_agreement_check;
    `);
    await db.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'rfq_items_trade_agreement_check'
        ) THEN
          ALTER TABLE rfq_items
          ADD CONSTRAINT rfq_items_trade_agreement_check
          CHECK (trade_agreement IS NULL OR trade_agreement IN ('ASEAN', 'RCEP', 'AFTA', 'MFN', 'CUSTOM'));
        END IF;
      END;
      $$;
    `);
    console.log('[Migration 043] ✓ Added check constraint for trade_agreement');

    // Add index on origin_country for faster lookups
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_rfq_items_origin_country
      ON rfq_items(origin_country)
      WHERE origin_country IS NOT NULL;
    `);
    console.log('[Migration 043] ✓ Created index on origin_country');

    await db.query('COMMIT');
    console.log('[Migration 043] ✓ Migration completed successfully');
  } catch (error) {
    await db.query('ROLLBACK');
    console.error('[Migration 043] ✗ Migration failed:', error);
    throw error;
  }
}

/**
 * Rollback migration
 */
async function down(db) {
  if (!db) {
    throw new Error('Migration 043 requires db parameter. Use runAllMigrations.js to run migrations.');
  }

  console.log('[Migration 043] Rolling back: Removing origin country and agreement fields from rfq_items...');

  try {
    await db.query('BEGIN');

    // Drop constraint
    await db.query(`
      ALTER TABLE rfq_items
      DROP CONSTRAINT IF EXISTS rfq_items_trade_agreement_check;
    `);

    // Drop index
    await db.query(`
      DROP INDEX IF EXISTS idx_rfq_items_origin_country;
    `);

    // Drop columns
    await db.query(`
      ALTER TABLE rfq_items
      DROP COLUMN IF EXISTS origin_country,
      DROP COLUMN IF EXISTS trade_agreement,
      DROP COLUMN IF EXISTS final_import_duty_rate,
      DROP COLUMN IF EXISTS final_import_duty_amount;
    `);

    await db.query('COMMIT');
    console.log('[Migration 043] ✓ Rollback completed successfully');
  } catch (error) {
    await db.query('ROLLBACK');
    console.error('[Migration 043] ✗ Rollback failed:', error);
    throw error;
  }
}

module.exports = {
  up,
  down,
};

