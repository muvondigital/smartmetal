require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

/**
 * Migration: Add Flange References to Materials Table
 *
 * Adds foreign key columns to link materials to flanges and flange_grades tables.
 * This allows tracking which flange dimension and grade a material represents.
 */
async function up(db) {
  if (!db) {
    throw new Error('Migration 012 requires db parameter. Use runAllMigrations.js to run migrations.');
  }

  console.log('Running migration: Add Flange References to Materials');

  try {
    // Add flange_id column
    console.log('Adding flange_id column...');
    await db.query(`
      ALTER TABLE materials
      ADD COLUMN IF NOT EXISTS flange_id UUID REFERENCES flanges(id) ON DELETE SET NULL;
    `);

    // Add flange_grade_id column
    console.log('Adding flange_grade_id column...');
    await db.query(`
      ALTER TABLE materials
      ADD COLUMN IF NOT EXISTS flange_grade_id UUID REFERENCES flange_grades(id) ON DELETE SET NULL;
    `);

    // Create index on flange_id for faster lookups
    console.log('Creating index on flange_id...');
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_materials_flange_id
      ON materials(flange_id);
    `);

    // Create index on flange_grade_id for faster lookups
    console.log('Creating index on flange_grade_id...');
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_materials_flange_grade_id
      ON materials(flange_grade_id);
    `);

    // Create composite index for flange + grade lookups
    console.log('Creating composite index on flange_id + flange_grade_id...');
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_materials_flange_grade_combo
      ON materials(flange_id, flange_grade_id)
      WHERE flange_id IS NOT NULL AND flange_grade_id IS NOT NULL;
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
    throw new Error('Migration 012 requires db parameter. Use runAllMigrations.js to run migrations.');
  }

  console.log('Rolling back migration: Add Flange References to Materials');

  try {
    // Drop indexes
    console.log('Dropping indexes...');
    await db.query(`
      DROP INDEX IF EXISTS idx_materials_flange_grade_combo;
      DROP INDEX IF EXISTS idx_materials_flange_grade_id;
      DROP INDEX IF EXISTS idx_materials_flange_id;
    `);

    // Drop columns
    console.log('Dropping flange_grade_id column...');
    await db.query(`
      ALTER TABLE materials
      DROP COLUMN IF EXISTS flange_grade_id;
    `);

    console.log('Dropping flange_id column...');
    await db.query(`
      ALTER TABLE materials
      DROP COLUMN IF EXISTS flange_id;
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

