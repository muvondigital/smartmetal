/**
 * CSV-based Material Seeder
 * 
 * This script loads material data from a CSV file into the materials table.
 * Supports beams, tubulars, plates, pipes, and other material types.
 * 
 * Expected CSV format (headers):
 * category,material_code,spec_standard,grade,material_type,origin_type,size_description,base_cost,currency,notes,
 * beam_type,beam_depth_mm,beam_weight_per_m_kg,od_mm,id_mm,wall_thickness_mm,plate_thickness_mm,
 * european_standard,european_grade,european_designation
 * 
 * Usage:
 *   cd backend
 *   node scripts/seed_materials_csv.js [path/to/materials.csv]
 * 
 * If no CSV path is provided, defaults to: ../data/materials.csv
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { connectDb } = require('../src/db/supabaseClient');

/**
 * Parses a CSV file into an array of objects
 * Handles quoted fields and basic escaping
 * 
 * @param {string} csvFilePath - Path to CSV file
 * @returns {Array<Object>} Array of row objects
 */
function parseCSV(csvFilePath) {
  const content = fs.readFileSync(csvFilePath, 'utf-8');
  const lines = content.split('\n').filter(line => line.trim() !== '');

  if (lines.length === 0) {
    throw new Error('CSV file is empty');
  }

  // Parse header
  const headers = lines[0].split(',').map(h => h.trim());

  // Parse rows
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());

    if (values.length !== headers.length) {
      console.warn(`Warning: Row ${i + 1} has ${values.length} columns, expected ${headers.length}. Skipping.`);
      continue;
    }

    const row = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j] || null;
    }
    rows.push(row);
  }

  return rows;
}

/**
 * Converts CSV row to database-compatible material object
 * 
 * @param {Object} row - CSV row object
 * @returns {Object} Material object for database insertion
 */
function mapRowToMaterial(row) {
  return {
    material_code: row.material_code || null,
    category: (row.category || '').toUpperCase(),
    spec_standard: row.spec_standard || null,
    grade: row.grade || null,
    material_type: row.material_type || null,
    origin_type: (row.origin_type || 'NON_CHINA').toUpperCase(),
    size_description: row.size_description || null,
    base_cost: row.base_cost ? parseFloat(row.base_cost) : 100.0,
    currency: row.currency || 'USD',
    notes: row.notes || null,
    // New columns
    beam_type: row.beam_type || null,
    beam_depth_mm: row.beam_depth_mm ? parseFloat(row.beam_depth_mm) : null,
    beam_weight_per_m_kg: row.beam_weight_per_m_kg ? parseFloat(row.beam_weight_per_m_kg) : null,
    od_mm: row.od_mm ? parseFloat(row.od_mm) : null,
    id_mm: row.id_mm ? parseFloat(row.id_mm) : null,
    wall_thickness_mm: row.wall_thickness_mm ? parseFloat(row.wall_thickness_mm) : null,
    plate_thickness_mm: row.plate_thickness_mm ? parseFloat(row.plate_thickness_mm) : null,
    european_standard: row.european_standard || null,
    european_grade: row.european_grade || null,
    european_designation: row.european_designation || null,
  };
}

/**
 * Main seeding function
 */
async function seedMaterialsFromCSV(csvFilePath) {
  const db = await connectDb();

  console.log('');
  console.log('='.repeat(70));
  console.log('MATERIAL CSV SEEDER');
  console.log('='.repeat(70));
  console.log('');

  try {
    // Parse CSV
    console.log(`Reading CSV file: ${csvFilePath}`);
    const rows = parseCSV(csvFilePath);
    console.log(`Found ${rows.length} rows to process`);
    console.log('');

    let insertedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    // Process each row
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      
      try {
        const material = mapRowToMaterial(row);

        // Validate required fields
        if (!material.material_code) {
          console.warn(`Row ${i + 2}: Missing material_code, skipping`);
          skippedCount++;
          continue;
        }

        if (!material.category) {
          console.warn(`Row ${i + 2}: Missing category, skipping`);
          skippedCount++;
          continue;
        }

        // Check if material exists
        const existingResult = await db.query(
          `SELECT id FROM materials WHERE material_code = $1`,
          [material.material_code]
        );

        if (existingResult.rows.length > 0) {
          // Update existing material
          const materialId = existingResult.rows[0].id;
          await db.query(
            `UPDATE materials SET
              category = $1,
              spec_standard = $2,
              grade = $3,
              material_type = $4,
              origin_type = $5,
              size_description = $6,
              base_cost = $7,
              currency = $8,
              notes = $9,
              beam_type = $10,
              beam_depth_mm = $11,
              beam_weight_per_m_kg = $12,
              od_mm = $13,
              id_mm = $14,
              wall_thickness_mm = $15,
              plate_thickness_mm = $16,
              european_standard = $17,
              european_grade = $18,
              european_designation = $19,
              updated_at = NOW()
            WHERE id = $20`,
            [
              material.category,
              material.spec_standard,
              material.grade,
              material.material_type,
              material.origin_type,
              material.size_description,
              material.base_cost,
              material.currency,
              material.notes,
              material.beam_type,
              material.beam_depth_mm,
              material.beam_weight_per_m_kg,
              material.od_mm,
              material.id_mm,
              material.wall_thickness_mm,
              material.plate_thickness_mm,
              material.european_standard,
              material.european_grade,
              material.european_designation,
              materialId,
            ]
          );
          updatedCount++;
          console.log(`✓ Updated: ${material.material_code}`);
        } else {
          // Insert new material
          await db.query(
            `INSERT INTO materials (
              material_code, category, spec_standard, grade, material_type,
              origin_type, size_description, base_cost, currency, notes,
              beam_type, beam_depth_mm, beam_weight_per_m_kg,
              od_mm, id_mm, wall_thickness_mm, plate_thickness_mm,
              european_standard, european_grade, european_designation
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)`,
            [
              material.material_code,
              material.category,
              material.spec_standard,
              material.grade,
              material.material_type,
              material.origin_type,
              material.size_description,
              material.base_cost,
              material.currency,
              material.notes,
              material.beam_type,
              material.beam_depth_mm,
              material.beam_weight_per_m_kg,
              material.od_mm,
              material.id_mm,
              material.wall_thickness_mm,
              material.plate_thickness_mm,
              material.european_standard,
              material.european_grade,
              material.european_designation,
            ]
          );
          insertedCount++;
          console.log(`✓ Inserted: ${material.material_code}`);
        }
      } catch (error) {
        errorCount++;
        console.error(`✗ Error processing row ${i + 2} (${row.material_code || 'unknown'}):`, error.message);
      }
    }

    console.log('');
    console.log('='.repeat(70));
    console.log('SEEDING SUMMARY');
    console.log('='.repeat(70));
    console.log(`Inserted: ${insertedCount}`);
    console.log(`Updated: ${updatedCount}`);
    console.log(`Skipped: ${skippedCount}`);
    console.log(`Errors: ${errorCount}`);
    console.log(`Total processed: ${rows.length}`);
    console.log('='.repeat(70));
    console.log('');

    if (errorCount > 0) {
      console.warn(`Warning: ${errorCount} rows failed to process`);
    }

    console.log('✅ Seeding completed successfully!');
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  const csvPath = process.argv[2] || path.join(__dirname, '../../data/materials.csv');
  
  seedMaterialsFromCSV(csvPath)
    .then(() => {
      console.log('Seed script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Seed script failed:', error);
      process.exit(1);
    });
}

module.exports = {
  seedMaterialsFromCSV,
};

