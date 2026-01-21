/**
 * Pipe Grades Seeder
 *
 * This script loads pipe grade/material specifications from CSV
 * into the pipe_grades table.
 *
 * Usage:
 *   cd backend
 *   node scripts/seedPipeGradesFromCsv.js [path/to/csv]
 *
 * If no CSV path provided, defaults to: ../../data/pipe_grades_mapping.csv
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
 * Converts CSV row to database-compatible pipe_grade object
 *
 * @param {Object} row - CSV row object
 * @returns {Object} Pipe grade object for database insertion
 */
function mapRowToPipeGrade(row) {
  return {
    spec: row.spec || null,
    product_form: row.product_form || null,
    grade: row.grade || null,
    material_family: row.material_family || 'CS',
    min_yield_psi: parseNumericValue(row.min_yield_psi),
    min_tensile_psi: parseNumericValue(row.min_tensile_psi),
    min_yield_mpa: parseNumericValue(row.min_yield_mpa),
    min_tensile_mpa: parseNumericValue(row.min_tensile_mpa),
    c_max: parseNumericValue(row.c_max),
    mn_min: parseNumericValue(row.mn_min),
    mn_max: parseNumericValue(row.mn_max),
    p_max: parseNumericValue(row.p_max),
    s_max: parseNumericValue(row.s_max),
    si_min: parseNumericValue(row.si_min),
    other_limits: row.other_limits || null,
    temp_service: row.temp_service || null,
    equiv_group: row.equiv_group || null,
    notes: row.notes || null,
  };
}

/**
 * Validates a pipe grade object before insertion
 *
 * @param {Object} grade - Pipe grade object
 * @returns {Object} Validation result { valid: boolean, errors: string[] }
 */
function validatePipeGrade(grade) {
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
 * Upserts a pipe grade into the database
 * Uses composite key (spec, grade) to detect duplicates
 *
 * @param {Object} db - Database connection
 * @param {Object} grade - Pipe grade object
 * @returns {Promise<Object>} Upserted pipe grade record
 */
async function upsertPipeGrade(db, grade) {
  // First, try to find existing grade with same spec and grade
  const existingResult = await db.query(
    `SELECT id FROM pipe_grades
     WHERE spec = $1 AND grade = $2`,
    [grade.spec, grade.grade]
  );

  if (existingResult.rows.length > 0) {
    // Update existing grade
    const gradeId = existingResult.rows[0].id;
    const result = await db.query(
      `UPDATE pipe_grades SET
        product_form = $1,
        material_family = $2,
        min_yield_psi = $3,
        min_tensile_psi = $4,
        min_yield_mpa = $5,
        min_tensile_mpa = $6,
        c_max = $7,
        mn_min = $8,
        mn_max = $9,
        p_max = $10,
        s_max = $11,
        si_min = $12,
        other_limits = $13,
        temp_service = $14,
        equiv_group = $15,
        notes = $16,
        updated_at = NOW()
      WHERE id = $17
      RETURNING *`,
      [
        grade.product_form,
        grade.material_family,
        grade.min_yield_psi,
        grade.min_tensile_psi,
        grade.min_yield_mpa,
        grade.min_tensile_mpa,
        grade.c_max,
        grade.mn_min,
        grade.mn_max,
        grade.p_max,
        grade.s_max,
        grade.si_min,
        grade.other_limits,
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
      `INSERT INTO pipe_grades (
        spec, product_form, grade, material_family,
        min_yield_psi, min_tensile_psi, min_yield_mpa, min_tensile_mpa,
        c_max, mn_min, mn_max, p_max, s_max, si_min,
        other_limits, temp_service, equiv_group, notes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
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
        grade.c_max,
        grade.mn_min,
        grade.mn_max,
        grade.p_max,
        grade.s_max,
        grade.si_min,
        grade.other_limits,
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
async function seedPipeGradesFromCSV() {
  // Determine CSV file path
  const csvPath = process.argv[2] || path.join(__dirname, '..', '..', 'data', 'pipe_grades_mapping.csv');

  console.log('='.repeat(60));
  console.log('Pipe Grades Seeder');
  console.log('='.repeat(60));
  console.log(`CSV file: ${csvPath}`);
  console.log('');

  // Check if CSV file exists
  if (!fs.existsSync(csvPath)) {
    console.error(`L CSV file not found: ${csvPath}`);
    console.log('\nPlease ensure the pipe grades CSV file exists.');
    process.exit(1);
  }

  let db;
  try {
    // Connect to database
    db = await connectDb();
    console.log(' Connected to database');

    // Parse CSV
    console.log('=Ä Parsing CSV file...');
    const rows = parseCSV(csvPath);
    console.log(` Parsed ${rows.length} rows from CSV`);
    console.log('');

    // Process each row
    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    const errors = [];

    console.log('Processing pipe grades...');
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const grade = mapRowToPipeGrade(row);

      // Validate
      const validation = validatePipeGrade(grade);
      if (!validation.valid) {
        console.warn(`   Row ${i + 2}: Validation failed - ${validation.errors.join(', ')}`);
        skipped++;
        errors.push({ row: i + 2, errors: validation.errors });
        continue;
      }

      // Upsert (insert or update if exists)
      try {
        const result = await upsertPipeGrade(db, grade);
        if (result.action === 'inserted') {
          inserted++;
          console.log(`   Inserted: ${grade.spec} ${grade.grade}`);
        } else {
          updated++;
          console.log(`   Updated: ${grade.spec} ${grade.grade}`);
        }
      } catch (error) {
        console.warn(`   Row ${i + 2}: Upsert failed - ${error.message}`);
        skipped++;
        errors.push({ row: i + 2, errors: [error.message] });
      }
    }

    console.log('');
    console.log('='.repeat(60));
    console.log(' Pipe Grades Import Completed');
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
    console.error('\nL Seed script failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  seedPipeGradesFromCSV();
}

module.exports = {
  seedPipeGradesFromCSV,
  parseCSV,
  mapRowToPipeGrade,
  validatePipeGrade,
  upsertPipeGrade,
};
