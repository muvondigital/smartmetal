require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

/**
 * Migration: Create Flanges Table
 *
 * Creates a dedicated flanges table with comprehensive ASME B16.5 specifications
 * including dimensions, ratings, types, facings, and bolt specifications.
 */
async function up(db) {
  if (!db) {
    throw new Error('Migration 010 requires db parameter. Use runAllMigrations.js to run migrations.');
  }

  console.log('Running migration: Create Flanges Table');

  try {
    // Create flanges table
    await db.query(`
      CREATE TABLE IF NOT EXISTS flanges (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

        -- Standards and specifications
        standard TEXT NOT NULL,                    -- ASME B16.5-2022
        nps_inch NUMERIC NOT NULL,                 -- Nominal pipe size in inches
        dn_mm INTEGER,                            -- DN equivalent in millimeters
        rating_class INTEGER NOT NULL,             -- Pressure rating class (150, 300, 600, 900, 1500, 2500)
        type TEXT NOT NULL,                        -- Flange type (WN, SO, BL, SW, THD, LJ, ORIFICE)
        facing TEXT NOT NULL,                      -- Facing type (RF, RTJ, FF, T&G, M&F)

        -- Dimensional specifications
        bore_inch NUMERIC,                         -- Bore diameter in inches (nullable, more relevant for WN)
        od_inch NUMERIC,                           -- Outside diameter in inches
        thickness_inch NUMERIC,                   -- Overall thickness in inches
        hub_diameter_inch NUMERIC,                 -- Hub diameter for WN flanges (nullable)
        hub_length_inch NUMERIC,                  -- Hub length for WN flanges (nullable)

        -- Bolt specifications
        bolt_circle_inch NUMERIC,                  -- Bolt circle diameter in inches
        bolt_hole_diameter_inch NUMERIC,           -- Bolt hole diameter in inches
        number_of_bolts INTEGER,                   -- Number of bolt holes
        bolt_size_inch TEXT,                       -- Bolt size (e.g. "3/4", "7/8", "1")

        -- Weight and material
        weight_kg NUMERIC,                         -- Weight per piece in kilograms
        flange_category TEXT,                      -- Material category (CS, SS, LTCS, ALLOY)

        -- Source reference
        b165_table TEXT,                           -- ASME B16.5 table reference (e.g. "Table 7")
        b165_page INTEGER,                         -- Page number in PDF
        source_file TEXT,                          -- Source PDF filename
        is_active BOOLEAN DEFAULT TRUE,             -- Active flag

        -- Timestamps
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log('✓ Created table: flanges');

    // Create composite index for common lookup pattern (NPS + Rating Class + Type + Facing)
    console.log('Creating composite index on (nps_inch, rating_class, type, facing)...');
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_flanges_nps_rating_type_facing
      ON flanges(nps_inch, rating_class, type, facing);
    `);

    // Create index on standard
    console.log('Creating index on standard...');
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_flanges_standard
      ON flanges(standard);
    `);

    // Create index on rating_class
    console.log('Creating index on rating_class...');
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_flanges_rating_class
      ON flanges(rating_class);
    `);

    // Create index on type
    console.log('Creating index on type...');
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_flanges_type
      ON flanges(type);
    `);

    // Create index on is_active
    console.log('Creating index on is_active...');
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_flanges_is_active
      ON flanges(is_active);
    `);

    console.log('✅ Migration completed successfully');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

/**
 * Rollback migration
 */
async function down(db) {
  if (!db) {
    throw new Error('Migration 010 requires db parameter. Use runAllMigrations.js to run migrations.');
  }

  console.log('Rolling back migration: Create Flanges Table');

  try {
    // Drop indexes
    console.log('Dropping indexes...');
    await db.query(`
      DROP INDEX IF EXISTS idx_flanges_is_active;
      DROP INDEX IF EXISTS idx_flanges_type;
      DROP INDEX IF EXISTS idx_flanges_rating_class;
      DROP INDEX IF EXISTS idx_flanges_standard;
      DROP INDEX IF EXISTS idx_flanges_nps_rating_type_facing;
    `);

    // Drop table
    console.log('Dropping table...');
    await db.query(`
      DROP TABLE IF EXISTS flanges;
    `);

    console.log('✅ Rollback completed successfully');
  } catch (error) {
    console.error('❌ Rollback failed:', error);
    throw error;
  }
}

// Run migration if called directly
if (require.main === module) {
  up()
    .then(() => {
      console.log('Migration script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration script failed:', error);
      process.exit(1);
    });
}

module.exports = {
  up,
  down,
};

