/**
 * Migration 046: Create regulatory_country_profiles table
 *
 * Part of Phase 10: Country-Specific Regulatory Profiles
 *
 * Purpose:
 * - Prepare SmartMetal for multi-country operations
 * - Store country-specific HS code systems and trade agreement profiles
 * - Enable future multi-country regulatory operations
 *
 * Design:
 * - Currently focused on Malaysian system (MY_HS_2025)
 * - Designed to support multiple HS systems in future
 * - Country profiles include default trade agreements
 */

async function up(db) {
  if (!db) {
    throw new Error('Migration 046 requires db parameter. Use runAllMigrations.js to run migrations.');
  }

  console.log('[Migration 046] Creating regulatory_country_profiles table...');

  try {
    await db.query('BEGIN');

    // Create regulatory_country_profiles table
    await db.query(`
      CREATE TABLE IF NOT EXISTS regulatory_country_profiles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        country_code VARCHAR(3) NOT NULL UNIQUE,
        country_name VARCHAR(255) NOT NULL,
        hs_code_system VARCHAR(100) NOT NULL,
        default_trade_agreements JSONB DEFAULT '[]'::jsonb,
        duty_calculation_rules JSONB DEFAULT '{}'::jsonb,
        notes TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        
        CONSTRAINT country_code_format CHECK (country_code ~ '^[A-Z]{2,3}$'),
        CONSTRAINT default_trade_agreements_array CHECK (jsonb_typeof(default_trade_agreements) = 'array')
      );
    `);

    console.log('✓ Created regulatory_country_profiles table');

    // Create indexes
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_regulatory_country_profiles_country_code
        ON regulatory_country_profiles(country_code);
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_regulatory_country_profiles_is_active
        ON regulatory_country_profiles(is_active);
    `);

    console.log('✓ Created indexes');

    // Create updated_at trigger
    await db.query(`
      DROP TRIGGER IF EXISTS trg_regulatory_country_profiles_updated_at 
        ON regulatory_country_profiles;
      CREATE TRIGGER trg_regulatory_country_profiles_updated_at
        BEFORE UPDATE ON regulatory_country_profiles
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `);

    console.log('✓ Created updated_at trigger');

    await db.query('COMMIT');
    console.log('[Migration 046] ✅ Successfully created regulatory_country_profiles table');
  } catch (error) {
    await db.query('ROLLBACK');
    console.error('[Migration 046] ❌ Failed:', error);
    throw error;
  }
}

async function down(db) {
  if (!db) {
    throw new Error('Migration 046 requires db parameter. Use runAllMigrations.js to run migrations.');
  }

  console.log('[Migration 046] Rolling back regulatory_country_profiles table...');

  try {
    await db.query('BEGIN');

    await db.query(`
      DROP TABLE IF EXISTS regulatory_country_profiles CASCADE;
    `);

    await db.query('COMMIT');
    console.log('[Migration 046] ✅ Rollback complete');
  } catch (error) {
    await db.query('ROLLBACK');
    console.error('[Migration 046] ❌ Rollback failed:', error);
    throw error;
  }
}

module.exports = { up, down };

