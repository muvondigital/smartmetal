/**
 * Migration 047: Extend tenants table with country configuration
 *
 * Part of Phase 10: Country-Specific Regulatory Profiles
 *
 * Purpose:
 * - Add home_country field to tenants table
 * - Add allowed_countries_of_import for regulatory context
 * - Enable tenant-specific country regulatory operations
 *
 * Design:
 * - home_country: Primary country of operation for the tenant
 * - allowed_countries_of_import: List of countries tenant imports from
 * - Both fields are nullable for backward compatibility
 * - Default to 'MY' (Malaysia) for existing NSC tenant
 */

async function up(db) {
  if (!db) {
    throw new Error('Migration 047 requires db parameter. Use runAllMigrations.js to run migrations.');
  }

  console.log('[Migration 047] Extending tenants table with country configuration...');

  try {
    await db.query('BEGIN');

    // Add home_country column
    await db.query(`
      ALTER TABLE tenants
      ADD COLUMN IF NOT EXISTS home_country VARCHAR(3);
    `);

    // Add constraint only if it doesn't exist
    const constraintCheck = await db.query(`
      SELECT constraint_name 
      FROM information_schema.table_constraints 
      WHERE table_name = 'tenants' 
      AND constraint_name = 'tenants_home_country_format';
    `);

    if (constraintCheck.rows.length === 0) {
      await db.query(`
        ALTER TABLE tenants
        ADD CONSTRAINT tenants_home_country_format 
          CHECK (home_country IS NULL OR home_country ~ '^[A-Z]{2,3}$');
      `);
    }

    console.log('✓ Added home_country column to tenants table');

    // Add allowed_countries_of_import column (JSONB array)
    await db.query(`
      ALTER TABLE tenants
      ADD COLUMN IF NOT EXISTS allowed_countries_of_import JSONB DEFAULT '[]'::jsonb;
    `);

    // Add constraint only if it doesn't exist
    const arrayConstraintCheck = await db.query(`
      SELECT constraint_name 
      FROM information_schema.table_constraints 
      WHERE table_name = 'tenants' 
      AND constraint_name = 'tenants_allowed_countries_array';
    `);

    if (arrayConstraintCheck.rows.length === 0) {
      await db.query(`
        ALTER TABLE tenants
        ADD CONSTRAINT tenants_allowed_countries_array
          CHECK (jsonb_typeof(allowed_countries_of_import) = 'array');
      `);
    }

    console.log('✓ Added allowed_countries_of_import column to tenants table');

    // Create index for home_country
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_tenants_home_country
        ON tenants(home_country);
    `);

    console.log('✓ Created index on home_country');

    // Update existing NSC tenant with default Malaysia configuration
    await db.query(`
      UPDATE tenants
      SET 
        home_country = 'MY',
        allowed_countries_of_import = '["MY", "TH", "CN", "SG", "ID", "VN", "JP", "KR", "US"]'::jsonb
      WHERE code = 'nsc' AND home_country IS NULL;
    `);

    console.log('✓ Updated NSC tenant with Malaysia default configuration');

    await db.query('COMMIT');
    console.log('[Migration 047] ✅ Successfully extended tenants table with country configuration');
  } catch (error) {
    await db.query('ROLLBACK');
    console.error('[Migration 047] ❌ Failed:', error);
    throw error;
  }
}

async function down(db) {
  if (!db) {
    throw new Error('Migration 047 requires db parameter. Use runAllMigrations.js to run migrations.');
  }

  console.log('[Migration 047] Rolling back tenant country configuration...');

  try {
    await db.query('BEGIN');

    // Drop indexes
    await db.query(`
      DROP INDEX IF EXISTS idx_tenants_home_country;
    `);

    // Drop constraints
    await db.query(`
      ALTER TABLE tenants
      DROP CONSTRAINT IF EXISTS tenants_home_country_format,
      DROP CONSTRAINT IF EXISTS tenants_allowed_countries_array;
    `);

    // Drop columns
    await db.query(`
      ALTER TABLE tenants
      DROP COLUMN IF EXISTS home_country,
      DROP COLUMN IF EXISTS allowed_countries_of_import;
    `);

    await db.query('COMMIT');
    console.log('[Migration 047] ✅ Rollback complete');
  } catch (error) {
    await db.query('ROLLBACK');
    console.error('[Migration 047] ❌ Rollback failed:', error);
    throw error;
  }
}

module.exports = { up, down };

