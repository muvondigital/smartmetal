/**
 * Flange Grades Seeder
 *
 * This script loads flange grade/material specifications from CSV
 * into the flange_grades table.
 *
 * Usage:
 *   cd backend
 *   node scripts/seedFlangeGradesFromCsv.js [path/to/csv]
 *
 * If no CSV path provided, defaults to: ../../data/flange_grades_mapping.csv
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { connectDb } = require('../src/db/supabaseClient');

/**
 * Parses a CSV file into an array of objects
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
      row[headers[j]] = values[j];
    }
    rows.push(row);
  }

  return rows;
}

/**
 * Safely parses a numeric value, returning null if invalid
 *
 * @param {string|number} value - Value to parse
 * @returns {number|null} Parsed number or null
 */
function parseNumericValue(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = parseFloat(value);
  return isNaN(parsed) ? null : parsed;
}

/**
 * Converts CSV row to database-compatible flange_grade object
 *
 * @param {Object} row - CSV row object
 * @returns {Object} Flange grade object for database insertion
 */
function mapRowToFlangeGrade(row) {
  return {
    spec: row.spec || null,
    product_form: row.product_form || null,
    grade: row.grade || null,
    material_family: row.material_family || 'CS',
    min_yield_psi: parseNumericValue(row.min_yield_psi),
    min_tensile_psi: parseNumericValue(row.min_tensile_psi),
    min_yield_mpa: parseNumericValue(row.min_yield_mpa),
    min_tensile_mpa: parseNumericValue(row.min_tensile_mpa),
    temp_service: row.temp_service || null,
    equiv_group: row.equiv_group || null,
    notes: row.notes || null,
  };
}

/**
 * Validates a flange grade object before insertion
 *
 * @param {Object} grade - Flange grade object
 * @returns {Object} Validation result { valid: boolean, errors: string[] }
 */
function validateFlangeGrade(grade) {
  const errors = [];

  if (!grade.spec) {
    errors.push('spec is required');
  }

  if (!grade.grade) {
    errors.push('grade is required');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Upserts a flange grade into the database
 * Uses composite key (spec, grade, product_form) to detect duplicates
 *
 * @param {Object} db - Database connection
 * @param {Object} grade - Flange grade object
 * @returns {Promise<Object>} Upserted flange grade record
 */
async function upsertFlangeGrade(db, grade) {
  // First, try to find existing grade with same spec, grade, and product_form
  const existingResult = await db.query(
    `SELECT id FROM flange_grades
     WHERE spec = $1 AND grade = $2 AND (product_form = $3 OR (product_form IS NULL AND $3 IS NULL))`,
    [grade.spec, grade.grade, grade.product_form]
  );

  if (existingResult.rows.length > 0) {
    // Update existing grade
    const gradeId = existingResult.rows[0].id;
    const result = await db.query(
      `UPDATE flange_grades SET
        product_form = $1,
        material_family = $2,
        min_yield_psi = $3,
        min_tensile_psi = $4,
        min_yield_mpa = $5,
        min_tensile_mpa = $6,
        temp_service = $7,
        equiv_group = $8,
        notes = $9,
        updated_at = NOW()
      WHERE id = $10
      RETURNING *`,
      [
        grade.product_form,
        grade.material_family,
        grade.min_yield_psi,
        grade.min_tensile_psi,
        grade.min_yield_mpa,
        grade.min_tensile_mpa,
        grade.temp_service,
        grade.equiv_group,
        grade.notes,
        gradeId,
      ]
    );
    return { grade: result.rows[0], action: 'updated' };
  } else {
    // Insert new grade
    const result = await db.query(
      `INSERT INTO flange_grades (
        spec, product_form, grade, material_family,
        min_yield_psi, min_tensile_psi, min_yield_mpa, min_tensile_mpa,
        temp_service, equiv_group, notes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
      [
        grade.spec,
        grade.product_form,
        grade.grade,
        grade.material_family,
        grade.min_yield_psi,
        grade.min_tensile_psi,
        grade.min_yield_mpa,
        grade.min_tensile_mpa,
        grade.temp_service,
        grade.equiv_group,
        grade.notes,
      ]
    );
    return { grade: result.rows[0], action: 'inserted' };
  }
}

/**
 * Main seeding function
 */
async function seedFlangeGradesFromCSV() {
  // Determine CSV file path
  const csvPath = process.argv[2] || path.join(__dirname, '..', '..', 'data', 'flange_grades_mapping.csv');

  console.log('='.repeat(60));
  console.log('Flange Grades Seeder');
  console.log('='.repeat(60));
  console.log(`CSV file: ${csvPath}`);
  console.log('');

  // Check if CSV file exists
  if (!fs.existsSync(csvPath)) {
    console.error(`❌ CSV file not found: ${csvPath}`);
    console.log('\nPlease ensure the flange grades CSV file exists.');
    process.exit(1);
  }

  let db;
  try {
    // Connect to database
    db = await connectDb();
    console.log('✓ Connected to database');

    // Parse CSV
    console.log('📄 Parsing CSV file...');
    const rows = parseCSV(csvPath);
    console.log(`✓ Parsed ${rows.length} rows from CSV`);
    console.log('');

    // Process each row
    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    const errors = [];

    console.log('Processing flange grades...');
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const grade = mapRowToFlangeGrade(row);

      // Validate
      const validation = validateFlangeGrade(grade);
      if (!validation.valid) {
        console.warn(`⚠️  Row ${i + 2}: Validation failed - ${validation.errors.join(', ')}`);
        skipped++;
        errors.push({ row: i + 2, errors: validation.errors });
        continue;
      }

      // Upsert (insert or update if exists)
      try {
        const result = await upsertFlangeGrade(db, grade);
        if (result.action === 'inserted') {
          inserted++;
          console.log(`  ✓ Inserted: ${grade.spec} ${grade.grade}`);
        } else {
          updated++;
          console.log(`  ✓ Updated: ${grade.spec} ${grade.grade}`);
        }
      } catch (error) {
        console.warn(`⚠️  Row ${i + 2}: Upsert failed - ${error.message}`);
        skipped++;
        errors.push({ row: i + 2, errors: [error.message] });
      }
    }

    console.log('');
    console.log('='.repeat(60));
    console.log('✅ Flange Grades Import Completed');
    console.log('='.repeat(60));
    console.log(`Total rows processed: ${rows.length}`);
    console.log(`Successfully inserted: ${inserted}`);
    console.log(`Successfully updated: ${updated}`);
    console.log(`Skipped (errors): ${skipped}`);

    if (errors.length > 0) {
      console.log('\nErrors:');
      errors.forEach(err => {
        console.log(`  Row ${err.row}: ${err.errors.join(', ')}`);
      });
    }

    console.log('');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Seed script failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  seedFlangeGradesFromCSV();
}

module.exports = {
  seedFlangeGradesFromCSV,
  parseCSV,
  mapRowToFlangeGrade,
  validateFlangeGrade,
  upsertFlangeGrade,
};

