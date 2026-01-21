/**
 * Migration 041: Regulatory Material Mapping Table
 *
 * Creates the regulatory_material_mapping table that links material keywords
 * to HS codes. This enables automated HS code detection from material descriptions.
 *
 * Columns:
 * - id: UUID primary key
 * - keyword: Normalized keyword string (lowercase, indexed)
 * - hs_code_id: Foreign key to regulatory_hs_codes.id (CASCADE delete)
 * - priority: Integer priority (lower = higher priority, default 10)
 * - created_at, updated_at: Timestamps
 *
 * Indexes:
 * - keyword (for fast lookups)
 * - hs_code_id (for reverse lookups)
 * - priority (for ordering)
 *
 * Rules:
 * - keyword must be normalized to lowercase before insert
 * - Foreign key enforces referential integrity with CASCADE delete
 */

async function up(db) {
  if (!db) {
    throw new Error('Migration 041 requires db parameter. Use runAllMigrations.js to run migrations.');
  }

  console.log('[Migration 041] Creating regulatory_material_mapping table...');

  try {
    await db.query('BEGIN');

    // Create regulatory_material_mapping table
    await db.query(`
      CREATE TABLE IF NOT EXISTS regulatory_material_mapping (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        keyword TEXT NOT NULL,
        hs_code_id UUID NOT NULL REFERENCES regulatory_hs_codes(id) ON DELETE CASCADE,
        priority INTEGER NOT NULL DEFAULT 10,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    console.log('[Migration 041] ✓ Created regulatory_material_mapping table');

    // Create indexes
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_regulatory_material_mapping_keyword
        ON regulatory_material_mapping(LOWER(keyword));
      CREATE INDEX IF NOT EXISTS idx_regulatory_material_mapping_hs_code_id
        ON regulatory_material_mapping(hs_code_id);
      CREATE INDEX IF NOT EXISTS idx_regulatory_material_mapping_priority
        ON regulatory_material_mapping(priority);
    `);
    console.log('[Migration 041] ✓ Created indexes on regulatory_material_mapping');

    // Create updated_at trigger
    await db.query(`
      DROP TRIGGER IF EXISTS trg_regulatory_material_mapping_updated_at ON regulatory_material_mapping;
      CREATE TRIGGER trg_regulatory_material_mapping_updated_at
        BEFORE UPDATE ON regulatory_material_mapping
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `);
    console.log('[Migration 041] ✓ Created updated_at trigger');

    // Create trigger to normalize keyword to lowercase on insert/update
    await db.query(`
      CREATE OR REPLACE FUNCTION normalize_regulatory_keyword()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.keyword = LOWER(TRIM(NEW.keyword));
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await db.query(`
      DROP TRIGGER IF EXISTS trg_normalize_regulatory_keyword ON regulatory_material_mapping;
      CREATE TRIGGER trg_normalize_regulatory_keyword
        BEFORE INSERT OR UPDATE ON regulatory_material_mapping
        FOR EACH ROW
        EXECUTE FUNCTION normalize_regulatory_keyword();
    `);
    console.log('[Migration 041] ✓ Created keyword normalization trigger');

    await db.query('COMMIT');
    console.log('[Migration 041] ✅ Completed regulatory_material_mapping table');
  } catch (error) {
    await db.query('ROLLBACK');
    console.error('[Migration 041] ❌ Failed:', error);
    throw error;
  }
}

async function down(db) {
  if (!db) {
    throw new Error('Migration 041 requires db parameter. Use runAllMigrations.js to run migrations.');
  }

  console.log('[Migration 041] Rolling back regulatory_material_mapping table...');

  try {
    await db.query('BEGIN');

    await db.query('DROP TRIGGER IF EXISTS trg_normalize_regulatory_keyword ON regulatory_material_mapping;');
    await db.query('DROP FUNCTION IF EXISTS normalize_regulatory_keyword();');
    await db.query('DROP TABLE IF EXISTS regulatory_material_mapping CASCADE;');

    await db.query('COMMIT');
    console.log('[Migration 041] ✅ Rollback complete');
  } catch (error) {
    await db.query('ROLLBACK');
    console.error('[Migration 041] ❌ Rollback failed:', error);
    throw error;
  }
}

module.exports = {
  up,
  down,
};

