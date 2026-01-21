require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

/**
 * Migration: Create Flange Grades Table
 *
 * Creates a table to store flange material grades and specifications
 * including mechanical properties and service temperature ranges.
 */
async function up(db) {
  if (!db) {
    throw new Error('Migration 011 requires db parameter. Use runAllMigrations.js to run migrations.');
  }

  console.log('Running migration: Create Flange Grades Table');

  try {
    // Create flange_grades table
    await db.query(`
      CREATE TABLE IF NOT EXISTS flange_grades (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

        -- Specification and grade
        spec TEXT NOT NULL,                       -- e.g., ASTM A105, ASTM A350, ASTM A182
        product_form TEXT,                        -- e.g., Flange, Forged Flange
        grade TEXT NOT NULL,                      -- e.g., A105, LF2, F304, F316L
        material_family TEXT DEFAULT 'CS',        -- CS (Carbon Steel), SS (Stainless), LTCS, ALLOY

        -- Mechanical properties (PSI)
        min_yield_psi NUMERIC,                    -- Minimum yield strength in PSI
        min_tensile_psi NUMERIC,                  -- Minimum tensile strength in PSI

        -- Mechanical properties (MPa)
        min_yield_mpa NUMERIC,                    -- Minimum yield strength in MPa
        min_tensile_mpa NUMERIC,                  -- Minimum tensile strength in MPa

        -- Additional specifications
        temp_service TEXT,                        -- Service temperature range
        equiv_group TEXT,                         -- Equivalent grade grouping
        notes TEXT,

        -- Timestamps
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),

        -- Unique constraint on (spec, grade, product_form)
        CONSTRAINT unique_flange_grade UNIQUE (spec, grade, product_form)
      );
    `);
    console.log('✓ Created table: flange_grades');

    // Create index on spec
    console.log('Creating index on spec...');
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_flange_grades_spec
      ON flange_grades(spec);
    `);

    // Create index on grade
    console.log('Creating index on grade...');
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_flange_grades_grade
      ON flange_grades(grade);
    `);

    // Create index on material_family
    console.log('Creating index on material_family...');
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_flange_grades_material_family
      ON flange_grades(material_family);
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
    throw new Error('Migration 011 requires db parameter. Use runAllMigrations.js to run migrations.');
  }

  console.log('Rolling back migration: Create Flange Grades Table');

  try {
    // Drop indexes
    console.log('Dropping indexes...');
    await db.query(`
      DROP INDEX IF EXISTS idx_flange_grades_material_family;
      DROP INDEX IF EXISTS idx_flange_grades_grade;
      DROP INDEX IF EXISTS idx_flange_grades_spec;
    `);

    // Drop table
    console.log('Dropping table...');
    await db.query(`
      DROP TABLE IF EXISTS flange_grades;
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

