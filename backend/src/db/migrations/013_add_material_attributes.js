require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

/**
 * Migration: Add material attribute columns to materials table
 * 
 * Adds columns for:
 * - Structural beams (beam_type, beam_depth_mm, beam_weight_per_m_kg)
 * - Tubulars (od_mm, id_mm, wall_thickness_mm)
 * - Plates (plate_thickness_mm)
 * - European standards (european_standard, european_grade, european_designation)
 * - Enhanced attributes (dimensional_attributes JSONB)
 * 
 * All columns are nullable to maintain backward compatibility with existing materials.
 */
async function addMaterialAttributes(db) {
  if (!db) {
    throw new Error('Migration 013 requires db parameter. Use runAllMigrations.js to run migrations.');
  }

  console.log('Starting migration: Add material attribute columns to materials table...');
  console.log('');

  try {
    // Step 1: Add structural beam columns
    console.log('Adding structural beam columns...');
    await db.query(`
      ALTER TABLE materials
      ADD COLUMN IF NOT EXISTS beam_type TEXT;
    `);
    
    await db.query(`
      ALTER TABLE materials
      ADD COLUMN IF NOT EXISTS beam_depth_mm NUMERIC;
    `);
    
    await db.query(`
      ALTER TABLE materials
      ADD COLUMN IF NOT EXISTS beam_weight_per_m_kg NUMERIC;
    `);

    // Step 2: Add tubular columns
    console.log('Adding tubular columns...');
    await db.query(`
      ALTER TABLE materials
      ADD COLUMN IF NOT EXISTS od_mm NUMERIC;
    `);
    
    await db.query(`
      ALTER TABLE materials
      ADD COLUMN IF NOT EXISTS id_mm NUMERIC;
    `);
    
    await db.query(`
      ALTER TABLE materials
      ADD COLUMN IF NOT EXISTS wall_thickness_mm NUMERIC;
    `);

    // Step 3: Add plate columns
    console.log('Adding plate columns...');
    await db.query(`
      ALTER TABLE materials
      ADD COLUMN IF NOT EXISTS plate_thickness_mm NUMERIC;
    `);

    // Step 4: Add European standard columns
    console.log('Adding European standard columns...');
    await db.query(`
      ALTER TABLE materials
      ADD COLUMN IF NOT EXISTS european_standard TEXT;
    `);
    
    await db.query(`
      ALTER TABLE materials
      ADD COLUMN IF NOT EXISTS european_grade TEXT;
    `);
    
    await db.query(`
      ALTER TABLE materials
      ADD COLUMN IF NOT EXISTS european_designation TEXT;
    `);

    // Step 5: Add enhanced attributes JSONB column
    console.log('Adding dimensional_attributes JSONB column...');
    await db.query(`
      ALTER TABLE materials
      ADD COLUMN IF NOT EXISTS dimensional_attributes JSONB;
    `);

    // Step 6: Create indexes for performance
    console.log('Creating indexes...');
    
    // Index for beam_type (partial index - only where beam_type is not null)
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_materials_beam_type 
      ON materials(beam_type) 
      WHERE beam_type IS NOT NULL;
    `);
    
    // Index for od_mm (partial index)
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_materials_od_mm 
      ON materials(od_mm) 
      WHERE od_mm IS NOT NULL;
    `);
    
    // Index for plate_thickness_mm (partial index)
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_materials_plate_thickness 
      ON materials(plate_thickness_mm) 
      WHERE plate_thickness_mm IS NOT NULL;
    `);
    
    // Index for european_standard (partial index)
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_materials_european_standard 
      ON materials(european_standard) 
      WHERE european_standard IS NOT NULL;
    `);
    
    // GIN index for dimensional_attributes JSONB
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_materials_dimensional_attributes 
      ON materials USING GIN (dimensional_attributes) 
      WHERE dimensional_attributes IS NOT NULL;
    `);

    console.log('');
    console.log('✅ Migration completed successfully!');
    console.log('');
    console.log('Added columns:');
    console.log('  - Structural beams: beam_type, beam_depth_mm, beam_weight_per_m_kg');
    console.log('  - Tubulars: od_mm, id_mm, wall_thickness_mm');
    console.log('  - Plates: plate_thickness_mm');
    console.log('  - European standards: european_standard, european_grade, european_designation');
    console.log('  - Enhanced: dimensional_attributes (JSONB)');
    console.log('');
    console.log('All columns are nullable - existing materials are unaffected.');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

/**
 * Rollback function (optional - for development/testing)
 */
async function removeMaterialAttributes(db) {
  if (!db) {
    throw new Error('Migration 013 requires db parameter. Use runAllMigrations.js to run migrations.');
  }

  console.log('Rolling back: Removing material attribute columns...');

  try {
    // Drop indexes first
    await db.query(`DROP INDEX IF EXISTS idx_materials_dimensional_attributes;`);
    await db.query(`DROP INDEX IF EXISTS idx_materials_european_standard;`);
    await db.query(`DROP INDEX IF EXISTS idx_materials_plate_thickness;`);
    await db.query(`DROP INDEX IF EXISTS idx_materials_od_mm;`);
    await db.query(`DROP INDEX IF EXISTS idx_materials_beam_type;`);

    // Drop columns
    await db.query(`ALTER TABLE materials DROP COLUMN IF EXISTS dimensional_attributes;`);
    await db.query(`ALTER TABLE materials DROP COLUMN IF EXISTS european_designation;`);
    await db.query(`ALTER TABLE materials DROP COLUMN IF EXISTS european_grade;`);
    await db.query(`ALTER TABLE materials DROP COLUMN IF EXISTS european_standard;`);
    await db.query(`ALTER TABLE materials DROP COLUMN IF EXISTS plate_thickness_mm;`);
    await db.query(`ALTER TABLE materials DROP COLUMN IF EXISTS wall_thickness_mm;`);
    await db.query(`ALTER TABLE materials DROP COLUMN IF EXISTS id_mm;`);
    await db.query(`ALTER TABLE materials DROP COLUMN IF EXISTS od_mm;`);
    await db.query(`ALTER TABLE materials DROP COLUMN IF EXISTS beam_weight_per_m_kg;`);
    await db.query(`ALTER TABLE materials DROP COLUMN IF EXISTS beam_depth_mm;`);
    await db.query(`ALTER TABLE materials DROP COLUMN IF EXISTS beam_type;`);

    console.log('✅ Rollback completed successfully!');
  } catch (error) {
    console.error('❌ Rollback failed:', error);
    throw error;
  }
}

// Run migration if called directly
if (require.main === module) {
  addMaterialAttributes()
    .then(() => {
      console.log('Migration script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration script failed:', error);
      process.exit(1);
    });
}

// Wrapper for migration runner
async function up(db) {
  return addMaterialAttributes(db);
}

async function down(db) {
  return removeMaterialAttributes(db);
}

module.exports = {
  up,
  down,
  addMaterialAttributes,
  removeMaterialAttributes,
};

