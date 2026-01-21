require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });

/**
 * Migration: Create Pipe Grades Table
 *
 * Creates a table to store pipe material grades and specifications
 * including mechanical properties and chemical composition.
 */
async function up(db) {
  if (!db) {
    throw new Error('Migration 008 requires db parameter. Use runAllMigrations.js to run migrations.');
  }

  console.log('Running migration: Create Pipe Grades Table');

  try {
    // Create pipe_grades table
    await db.query(`
      CREATE TABLE IF NOT EXISTS pipe_grades (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

        -- Specification and grade
        spec TEXT NOT NULL,                       -- e.g., ASTM A106, API 5L, ASTM A53
        product_form TEXT,                        -- e.g., Seamless Pipe, Welded Pipe
        grade TEXT NOT NULL,                      -- e.g., Gr B, Grade B PSL1, X52
        material_family TEXT DEFAULT 'CS',        -- CS (Carbon Steel), SS (Stainless), etc.

        -- Mechanical properties (PSI)
        min_yield_psi NUMERIC,                    -- Minimum yield strength in PSI
        min_tensile_psi NUMERIC,                  -- Minimum tensile strength in PSI

        -- Mechanical properties (MPa)
        min_yield_mpa NUMERIC,                    -- Minimum yield strength in MPa
        min_tensile_mpa NUMERIC,                  -- Minimum tensile strength in MPa

        -- Chemical composition (percentage)
        c_max NUMERIC,                            -- Carbon max %
        mn_min NUMERIC,                           -- Manganese min %
        mn_max NUMERIC,                           -- Manganese max %
        p_max NUMERIC,                            -- Phosphorus max %
        s_max NUMERIC,                            -- Sulfur max %
        si_min NUMERIC,                           -- Silicon min %

        -- Additional specifications
        other_limits TEXT,                        -- Other chemical/mechanical limits
        temp_service TEXT,                        -- Service temperature range
        equiv_group TEXT,                         -- Equivalent grade grouping
        notes TEXT,

        -- Timestamps
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log(' Created table: pipe_grades');

    // Create composite unique constraint on spec + grade
    await db.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_pipe_grades_spec_grade_unique
      ON pipe_grades(spec, grade);
    `);
    console.log(' Added unique constraint: pipe_grades(spec, grade)');

    // Create index for material family filtering
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_pipe_grades_material_family
      ON pipe_grades(material_family);
    `);
    console.log(' Added index: pipe_grades(material_family)');

    // Create index for spec filtering
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_pipe_grades_spec
      ON pipe_grades(spec);
    `);
    console.log(' Added index: pipe_grades(spec)');

    // Create updated_at trigger
    await db.query(`
      DROP TRIGGER IF EXISTS update_pipe_grades_updated_at ON pipe_grades;

      CREATE TRIGGER update_pipe_grades_updated_at
      BEFORE UPDATE ON pipe_grades
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
    `);
    console.log(' Created trigger: update_pipe_grades_updated_at');

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
    throw new Error('Migration 008 requires db parameter. Use runAllMigrations.js to run migrations.');
  }

  console.log('Rolling back migration: Create Pipe Grades Table');

  try {
    // Drop trigger
    await db.query(`
      DROP TRIGGER IF EXISTS update_pipe_grades_updated_at ON pipe_grades;
    `);
    console.log(' Removed trigger: update_pipe_grades_updated_at');

    // Drop indexes
    await db.query(`
      DROP INDEX IF EXISTS idx_pipe_grades_spec;
      DROP INDEX IF EXISTS idx_pipe_grades_material_family;
      DROP INDEX IF EXISTS idx_pipe_grades_spec_grade_unique;
    `);
    console.log(' Removed indexes');

    // Drop table
    await db.query(`
      DROP TABLE IF EXISTS pipe_grades;
    `);
    console.log(' Dropped table: pipe_grades');

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
