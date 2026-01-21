require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });

/**
 * Migration: Create Pipes Catalogue Table
 *
 * Creates a dedicated pipes table with comprehensive pipe specifications
 * including dimensions, schedules, weights, and manufacturing details.
 */
async function up(db) {
  // db parameter is REQUIRED - migrations must use MIGRATION_DATABASE_URL
  if (!db) {
    throw new Error('Migration 003 requires db parameter. Migrations must use MIGRATION_DATABASE_URL.');
  }

  console.log('Running migration: Create Pipes Table');

  try {
    // Create pipes table
    await db.query(`
      CREATE TABLE IF NOT EXISTS pipes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

        -- Standards and specifications
        standard TEXT NOT NULL,                    -- ASME B36.10, ASME B36.19, API 5L
        material_spec TEXT,                        -- e.g. ASTM A106 GR.B, API 5L X52
        manufacturing_method TEXT,                 -- SMLS, ERW, SAW, HFI

        -- Size specifications
        nps_inch NUMERIC NOT NULL,                 -- nominal pipe size (e.g. 0.5, 2, 3.5)
        dn_mm INTEGER,                             -- DN equivalent

        -- Diameter measurements
        outside_diameter_in NUMERIC,
        outside_diameter_mm NUMERIC,

        -- Schedule and wall thickness
        schedule TEXT,                             -- STD, XS, XXS, 10S, 40, 80, etc.
        wall_thickness_in NUMERIC,
        wall_thickness_mm NUMERIC,

        -- Weight specifications
        weight_lb_per_ft NUMERIC,
        weight_kg_per_m NUMERIC,
        shipping_weight_m3 NUMERIC,

        -- Additional attributes
        end_type TEXT DEFAULT 'PE',                -- PE (Plain End), BE (Beveled End), TE (Threaded End)
        is_stainless BOOLEAN DEFAULT FALSE,
        is_preferred BOOLEAN DEFAULT TRUE,

        notes TEXT,

        -- Timestamps
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log('✓ Created table: pipes');

    // Create composite index for common lookup pattern (NPS + Schedule)
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_pipes_nps_schedule
      ON pipes(nps_inch, schedule);
    `);
    console.log('✓ Added index: pipes(nps_inch, schedule)');

    // Create index for standard filtering
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_pipes_standard
      ON pipes(standard);
    `);
    console.log('✓ Added index: pipes(standard)');

    // Create index for material spec filtering
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_pipes_material_spec
      ON pipes(material_spec);
    `);
    console.log('✓ Added index: pipes(material_spec)');

    // Create index for preferred pipes
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_pipes_preferred
      ON pipes(is_preferred, nps_inch);
    `);
    console.log('✓ Added index: pipes(is_preferred, nps_inch)');

    // Create updated_at trigger function if it doesn't exist
    await db.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ language 'plpgsql';
    `);
    console.log('✓ Created trigger function: update_updated_at_column');

    // Create trigger for pipes table
    await db.query(`
      DROP TRIGGER IF EXISTS update_pipes_updated_at ON pipes;

      CREATE TRIGGER update_pipes_updated_at
      BEFORE UPDATE ON pipes
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
    `);
    console.log('✓ Created trigger: update_pipes_updated_at');

    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  }
}

/**
 * Rollback migration
 */
async function down(db) {
  if (!db) {
    throw new Error('Migration 003 down() requires db parameter. Migrations must use MIGRATION_DATABASE_URL.');
  }

  console.log('Rolling back migration: Create Pipes Table');

  try {
    // Drop trigger
    await db.query(`
      DROP TRIGGER IF EXISTS update_pipes_updated_at ON pipes;
    `);
    console.log('✓ Removed trigger: update_pipes_updated_at');

    // Drop indexes
    await db.query(`
      DROP INDEX IF EXISTS idx_pipes_nps_schedule;
      DROP INDEX IF EXISTS idx_pipes_standard;
      DROP INDEX IF EXISTS idx_pipes_material_spec;
      DROP INDEX IF EXISTS idx_pipes_preferred;
    `);
    console.log('✓ Removed indexes');

    // Drop table
    await db.query(`
      DROP TABLE IF EXISTS pipes;
    `);
    console.log('✓ Dropped table: pipes');

    console.log('Rollback completed successfully');
  } catch (error) {
    console.error('Rollback failed:', error);
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
