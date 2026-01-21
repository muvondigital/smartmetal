require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });

/**
 * Migration: Add Unique Constraint to Pipes Table
 *
 * Adds a unique constraint on (standard, nps_inch, schedule, wall_thickness_in)
 * to prevent duplicate pipe entries and enable upsert operations.
 */
async function up(db) {
  if (!db) {
    throw new Error('Migration 004_add_pipes_unique_constraint requires db parameter. Use runAllMigrations.js to run migrations.');
  }

  console.log('Running migration: Add Unique Constraint to Pipes Table');

  try {
    // Add unique constraint for pipe identification
    // Using standard, nps_inch, schedule, and wall_thickness_in as composite key
    await db.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_pipes_unique_spec
      ON pipes(standard, nps_inch, schedule, wall_thickness_in)
      WHERE standard IS NOT NULL
        AND nps_inch IS NOT NULL
        AND schedule IS NOT NULL
        AND wall_thickness_in IS NOT NULL;
    `);
    console.log('✓ Added unique constraint: pipes(standard, nps_inch, schedule, wall_thickness_in)');

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
    throw new Error('Migration 004_add_pipes_unique_constraint requires db parameter. Use runAllMigrations.js to run migrations.');
  }

  console.log('Rolling back migration: Add Unique Constraint to Pipes Table');

  try {
    // Remove unique constraint
    await db.query(`
      DROP INDEX IF EXISTS idx_pipes_unique_spec;
    `);
    console.log('✓ Removed unique constraint: idx_pipes_unique_spec');

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
