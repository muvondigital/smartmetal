require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });

/**
 * Migration: Add ASME B36.10M Dimension Columns to Pipes Table
 *
 * Adds additional columns to match the ASME B36.10M-2022 extracted data schema:
 * - od_inch, od_mm (outside diameter)
 * - pipe_category (CS for carbon steel)
 * - pressure_series (STD, XS, XXS, etc.)
 * - nps_display (display format like "6\"")
 * - b3610_table, b3610_page (source reference)
 * - source_file (PDF reference)
 * - is_active (boolean flag)
 */
async function up(db) {
  if (!db) {
    throw new Error('Migration 007 requires db parameter. Use runAllMigrations.js to run migrations.');
  }

  console.log('Running migration: Add ASME Dimension Columns to Pipes Table');

  try {
    // Add od_inch column
    console.log('Adding od_inch column...');
    await db.query(`
      ALTER TABLE pipes
      ADD COLUMN IF NOT EXISTS od_inch NUMERIC;
    `);

    // Add od_mm column
    console.log('Adding od_mm column...');
    await db.query(`
      ALTER TABLE pipes
      ADD COLUMN IF NOT EXISTS od_mm NUMERIC;
    `);

    // Add pipe_category column
    console.log('Adding pipe_category column...');
    await db.query(`
      ALTER TABLE pipes
      ADD COLUMN IF NOT EXISTS pipe_category TEXT;
    `);

    // Add pressure_series column
    console.log('Adding pressure_series column...');
    await db.query(`
      ALTER TABLE pipes
      ADD COLUMN IF NOT EXISTS pressure_series TEXT;
    `);

    // Add nps_display column
    console.log('Adding nps_display column...');
    await db.query(`
      ALTER TABLE pipes
      ADD COLUMN IF NOT EXISTS nps_display TEXT;
    `);

    // Add b3610_table column
    console.log('Adding b3610_table column...');
    await db.query(`
      ALTER TABLE pipes
      ADD COLUMN IF NOT EXISTS b3610_table TEXT;
    `);

    // Add b3610_page column
    console.log('Adding b3610_page column...');
    await db.query(`
      ALTER TABLE pipes
      ADD COLUMN IF NOT EXISTS b3610_page INTEGER;
    `);

    // Add source_file column
    console.log('Adding source_file column...');
    await db.query(`
      ALTER TABLE pipes
      ADD COLUMN IF NOT EXISTS source_file TEXT;
    `);

    // Add is_active column
    console.log('Adding is_active column...');
    await db.query(`
      ALTER TABLE pipes
      ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
    `);

    // Create index on od_inch for lookups
    console.log('Creating index on od_inch...');
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_pipes_od_inch
      ON pipes(od_inch);
    `);

    // Create index on is_active
    console.log('Creating index on is_active...');
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_pipes_is_active
      ON pipes(is_active);
    `);

    console.log(' Migration completed successfully');
  } catch (error) {
    console.error('L Migration failed:', error);
    throw error;
  }
}

/**
 * Rollback migration
 */
async function down(db) {
  if (!db) {
    throw new Error('Migration 007 requires db parameter. Use runAllMigrations.js to run migrations.');
  }

  console.log('Rolling back migration: Add ASME Dimension Columns to Pipes Table');

  try {
    // Drop indexes
    console.log('Dropping indexes...');
    await db.query(`
      DROP INDEX IF EXISTS idx_pipes_is_active;
      DROP INDEX IF EXISTS idx_pipes_od_inch;
    `);

    // Drop columns
    console.log('Dropping columns...');
    await db.query(`
      ALTER TABLE pipes
      DROP COLUMN IF EXISTS is_active,
      DROP COLUMN IF EXISTS source_file,
      DROP COLUMN IF EXISTS b3610_page,
      DROP COLUMN IF EXISTS b3610_table,
      DROP COLUMN IF EXISTS nps_display,
      DROP COLUMN IF EXISTS pressure_series,
      DROP COLUMN IF EXISTS pipe_category,
      DROP COLUMN IF EXISTS od_mm,
      DROP COLUMN IF EXISTS od_inch;
    `);

    console.log(' Rollback completed successfully');
  } catch (error) {
    console.error('L Rollback failed:', error);
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
