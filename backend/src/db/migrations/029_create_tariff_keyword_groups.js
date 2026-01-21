/**
 * Migration 029: Create Tariff Keyword Groups Table
 *
 * Purpose: Creates tariff keyword mapping table for Malaysian PDK 2025 schedule
 * Part of: Stage 8 - Regulatory Integration (tariff classification support)
 *
 * Components:
 * - tariff_keyword_groups: Maps SmartMetal material keywords to HS code chapters
 *
 * This table enables AI-powered material classification to suggest relevant HS codes
 * based on material keywords (pipe, flange, fitting, etc.) from the PDK 2025 schedule.
 *
 * The data is seeded from backend/src/db/seeds/pdk2025_tariff_keywords.ts
 */

async function up(db) {
  console.log('Running migration: 029_create_tariff_keyword_groups');

  try {
    // Create tariff_keyword_groups table
    await db.query(`
      CREATE TABLE IF NOT EXISTS tariff_keyword_groups (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        keyword TEXT NOT NULL,
        schedule_code TEXT NOT NULL DEFAULT 'PDK2025',
        country TEXT NOT NULL DEFAULT 'MY' CHECK (LENGTH(country) = 2),
        hs_chapters JSONB NOT NULL,
        example_hs_codes JSONB NOT NULL,
        source TEXT NOT NULL,
        notes TEXT,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

        CONSTRAINT unique_keyword_schedule_country UNIQUE(keyword, schedule_code, country)
      );
    `);
    console.log('✅ Created tariff_keyword_groups table');

    // Create indexes for efficient lookup
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_tariff_keyword_groups_keyword
      ON tariff_keyword_groups(keyword)
      WHERE is_active = true;
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_tariff_keyword_groups_schedule_country
      ON tariff_keyword_groups(schedule_code, country)
      WHERE is_active = true;
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_tariff_keyword_groups_keyword_active
      ON tariff_keyword_groups(keyword, is_active);
    `);

    console.log('✅ Created indexes on tariff_keyword_groups');

    // Add updated_at trigger
    await db.query(`
      DROP TRIGGER IF EXISTS update_tariff_keyword_groups_updated_at ON tariff_keyword_groups;
      CREATE TRIGGER update_tariff_keyword_groups_updated_at
      BEFORE UPDATE ON tariff_keyword_groups
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
    `);

    console.log('✅ Created updated_at trigger');

    // Add comment
    await db.query(`
      COMMENT ON TABLE tariff_keyword_groups IS 'Maps SmartMetal material keywords to HS code chapters from Malaysian PDK 2025 schedule. Used for AI-powered tariff classification suggestions.';
    `);

    console.log('✅ Migration completed: tariff_keyword_groups table created');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

async function down(db) {
  console.log('Rolling back migration: 029_create_tariff_keyword_groups');

  try {
    // Remove trigger
    await db.query(`DROP TRIGGER IF EXISTS update_tariff_keyword_groups_updated_at ON tariff_keyword_groups;`);

    // Remove indexes
    await db.query(`DROP INDEX IF EXISTS idx_tariff_keyword_groups_keyword_active;`);
    await db.query(`DROP INDEX IF EXISTS idx_tariff_keyword_groups_schedule_country;`);
    await db.query(`DROP INDEX IF EXISTS idx_tariff_keyword_groups_keyword;`);

    // Remove table
    await db.query(`DROP TABLE IF EXISTS tariff_keyword_groups;`);

    console.log('✅ Migration rolled back: tariff_keyword_groups table removed');

  } catch (error) {
    console.error('❌ Rollback failed:', error);
    throw error;
  }
}

module.exports = { up, down };
