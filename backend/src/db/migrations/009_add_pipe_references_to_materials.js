require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });

/**
 * Migration: Add Pipe References to Materials Table
 *
 * Adds foreign key columns to link materials to pipes and pipe_grades tables.
 * This allows tracking which pipe dimension and grade a material represents.
 */
async function up(db) {
  // db parameter is REQUIRED - migrations must use MIGRATION_DATABASE_URL
  if (!db) {
    throw new Error('Migration 009 requires db parameter. Migrations must use MIGRATION_DATABASE_URL.');
  }

  console.log('Running migration: Add Pipe References to Materials');

  try {
    // Check if materials table exists
    const materialsExists = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'materials'
      );
    `);
    
    if (!materialsExists.rows[0].exists) {
      console.log('⚠️  materials table does not exist, skipping pipe references migration');
      return;
    }

    // Check if pipe_grades table exists
    const pipeGradesExists = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'pipe_grades'
      );
    `);
    
    if (!pipeGradesExists.rows[0].exists) {
      console.log('⚠️  pipe_grades table does not exist, skipping pipe references migration');
      return;
    }

    // Check if pipe_id column already exists
    const hasPipeId = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.columns
        WHERE table_schema = 'public' 
          AND table_name = 'materials' 
          AND column_name = 'pipe_id'
      );
    `);

    // Add pipe_id column only if it doesn't exist
    if (!hasPipeId.rows[0].exists) {
      console.log('Adding pipe_id column...');
      await db.query(`
        ALTER TABLE materials
        ADD COLUMN pipe_id UUID;
      `);
    } else {
      console.log('pipe_id column already exists, skipping');
    }

    // Check if pipe_grade_id column already exists
    const hasPipeGradeId = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.columns
        WHERE table_schema = 'public' 
          AND table_name = 'materials' 
          AND column_name = 'pipe_grade_id'
      );
    `);

    // Add pipe_grade_id column only if it doesn't exist
    if (!hasPipeGradeId.rows[0].exists) {
      console.log('Adding pipe_grade_id column...');
      await db.query(`
        ALTER TABLE materials
        ADD COLUMN pipe_grade_id UUID REFERENCES pipe_grades(id) ON UPDATE CASCADE ON DELETE SET NULL;
      `);
    } else {
      console.log('pipe_grade_id column already exists, skipping');
    }

    // Create index on pipe_id for faster lookups
    console.log('Creating index on pipe_id...');
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_materials_pipe_id
      ON materials(pipe_id);
    `);

    // Create index on pipe_grade_id for faster lookups
    console.log('Creating index on pipe_grade_id...');
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_materials_pipe_grade_id
      ON materials(pipe_grade_id);
    `);

    // Create composite index for pipe + grade lookups
    console.log('Creating composite index on pipe_id + pipe_grade_id...');
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_materials_pipe_grade_combo
      ON materials(pipe_id, pipe_grade_id)
      WHERE pipe_id IS NOT NULL AND pipe_grade_id IS NOT NULL;
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
    throw new Error('Migration 009 down() requires db parameter. Migrations must use MIGRATION_DATABASE_URL.');
  }

  console.log('Rolling back migration: Add Pipe References to Materials');

  try {
    // Drop indexes
    console.log('Dropping indexes...');
    await db.query(`
      DROP INDEX IF EXISTS idx_materials_pipe_grade_combo;
      DROP INDEX IF EXISTS idx_materials_pipe_grade_id;
      DROP INDEX IF EXISTS idx_materials_pipe_id;
    `);

    // Drop columns
    console.log('Dropping pipe_grade_id column...');
    await db.query(`
      ALTER TABLE materials
      DROP COLUMN IF EXISTS pipe_grade_id;
    `);

    console.log('Dropping pipe_id column...');
    await db.query(`
      ALTER TABLE materials
      DROP COLUMN IF EXISTS pipe_id;
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
