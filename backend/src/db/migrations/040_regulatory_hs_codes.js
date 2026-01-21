/**
 * Migration 040: Regulatory HS Codes Table
 *
 * Creates the foundational regulatory_hs_codes table for SmartMetal HS Code integration.
 * This table stores the curated HS code library with duty rates and regulatory information.
 *
 * Columns:
 * - id: UUID primary key
 * - hs_code: Unique HS code string (indexed)
 * - category: Material category (PIPE, FITTING, VALVE, STEEL, COPPER, NICKEL, ALLOY, etc.)
 * - sub_category: Optional finer grouping
 * - description: Full description of the HS code
 * - import_duty: Default import duty percentage (defaults to 0)
 * - surtax: Optional surtax percentage
 * - excise: Optional excise tax percentage
 * - notes: Additional notes
 * - is_active: Active status flag
 * - created_at, updated_at: Timestamps
 *
 * Indexes:
 * - hs_code (unique)
 * - category
 * - is_active
 */

async function up(db) {
  if (!db) {
    throw new Error('Migration 040 requires db parameter. Use runAllMigrations.js to run migrations.');
  }

  console.log('[Migration 040] Creating regulatory_hs_codes table...');

  try {
    await db.query('BEGIN');

    // Create regulatory_hs_codes table
    await db.query(`
      CREATE TABLE IF NOT EXISTS regulatory_hs_codes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        hs_code TEXT NOT NULL UNIQUE,
        category TEXT NOT NULL,
        sub_category TEXT,
        description TEXT NOT NULL,
        import_duty NUMERIC(10, 4) NOT NULL DEFAULT 0,
        surtax NUMERIC(10, 4),
        excise NUMERIC(10, 4),
        notes TEXT,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT regulatory_hs_codes_import_duty_check CHECK (import_duty >= 0),
        CONSTRAINT regulatory_hs_codes_surtax_check CHECK (surtax IS NULL OR surtax >= 0),
        CONSTRAINT regulatory_hs_codes_excise_check CHECK (excise IS NULL OR excise >= 0)
      );
    `);
    console.log('[Migration 040] ✓ Created regulatory_hs_codes table');

    // Create indexes
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_regulatory_hs_codes_hs_code
        ON regulatory_hs_codes(hs_code);
      CREATE INDEX IF NOT EXISTS idx_regulatory_hs_codes_category
        ON regulatory_hs_codes(category);
      CREATE INDEX IF NOT EXISTS idx_regulatory_hs_codes_is_active
        ON regulatory_hs_codes(is_active) WHERE is_active = true;
    `);
    console.log('[Migration 040] ✓ Created indexes on regulatory_hs_codes');

    // Create updated_at trigger
    await db.query(`
      DROP TRIGGER IF EXISTS trg_regulatory_hs_codes_updated_at ON regulatory_hs_codes;
      CREATE TRIGGER trg_regulatory_hs_codes_updated_at
        BEFORE UPDATE ON regulatory_hs_codes
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `);
    console.log('[Migration 040] ✓ Created updated_at trigger');

    await db.query('COMMIT');
    console.log('[Migration 040] ✅ Completed regulatory_hs_codes table');
  } catch (error) {
    await db.query('ROLLBACK');
    console.error('[Migration 040] ❌ Failed:', error);
    throw error;
  }
}

async function down(db) {
  if (!db) {
    throw new Error('Migration 040 requires db parameter. Use runAllMigrations.js to run migrations.');
  }

  console.log('[Migration 040] Rolling back regulatory_hs_codes table...');

  try {
    await db.query('BEGIN');

    await db.query('DROP TABLE IF EXISTS regulatory_hs_codes CASCADE;');

    await db.query('COMMIT');
    console.log('[Migration 040] ✅ Rollback complete');
  } catch (error) {
    await db.query('ROLLBACK');
    console.error('[Migration 040] ❌ Rollback failed:', error);
    throw error;
  }
}

module.exports = {
  up,
  down,
};

