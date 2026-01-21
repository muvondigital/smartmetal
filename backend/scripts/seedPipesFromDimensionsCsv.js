/**
 * ASME Pipe Dimensions Seeder
 *
 * This script loads pipe dimension data from the ASME B36.10M-2022 extracted CSV
 * into the pipes table. It handles the full ASME dataset with all columns.
 *
 * Usage:
 *   cd backend
 *   node scripts/seedPipesFromDimensionsCsv.js [path/to/csv]
 *
 * If no CSV path provided, defaults to: ../../data/pipes_dimensions_asme_b3610_extracted.csv
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { connectDb } = require('../src/db/supabaseClient');

/**
 * Parses a CSV file into an array of objects
 * Handles quoted fields properly
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
  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));

  // Parse rows
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const values = [];
    let current = '';
    let inQuotes = false;

    // Handle quoted fields properly
    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim()); // Add last value

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
 * Safely parses an integer value, returning null if invalid
 *
 * @param {string|number} value - Value to parse
 * @returns {number|null} Parsed integer or null
 */
function parseIntegerValue(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? null : parsed;
}

/**
 * Parses a boolean value from string
 *
 * @param {string|boolean} value - Value to parse
 * @returns {boolean} Parsed boolean
 */
function parseBooleanValue(value) {
  if (typeof value === 'boolean') return value;
  if (!value) return false;

  const str = String(value).toLowerCase().trim();
  return str === 'true' || str === '1' || str === 'yes';
}

/**
 * Converts CSV row to database-compatible pipe object
 *
 * @param {Object} row - CSV row object
 * @returns {Object} Pipe object for database insertion
 */
function mapRowToPipe(row) {
  let nps_inch = parseNumericValue(row.nps_inch);
  const outside_diameter_in = parseNumericValue(row.od_inch);

  // If nps_inch is missing, use outside_diameter_in as fallback
  // For pipes, NPS is approximately equal to OD for many sizes
  if (nps_inch === null && outside_diameter_in !== null) {
    nps_inch = outside_diameter_in;
  }

  return {
    standard: row.standard || null,
    nps_inch: nps_inch,
    dn_mm: parseIntegerValue(row.dn_mm),
    outside_diameter_in: outside_diameter_in,
    outside_diameter_mm: parseNumericValue(row.od_mm),
    schedule: row.schedule || null,
    wall_thickness_in: parseNumericValue(row.wall_thickness_inch),
    wall_thickness_mm: parseNumericValue(row.wall_thickness_mm),
    weight_lb_per_ft: parseNumericValue(row.weight_lb_per_ft),
    weight_kg_per_m: parseNumericValue(row.weight_kg_per_m),
    pipe_category: row.pipe_category || null,
    pressure_series: row.pressure_series || null,
    nps_display: row.nps_display || null,
    b3610_table: row.b3610_table || null,
    b3610_page: parseIntegerValue(row.b3610_page),
    source_file: row.source_file || null,
    is_active: parseBooleanValue(row.is_active),
  };
}

/**
 * Validates a pipe object before insertion
 *
 * @param {Object} pipe - Pipe object
 * @returns {Object} Validation result { valid: boolean, errors: string[] }
 */
function validatePipe(pipe) {
  const errors = [];

  if (!pipe.standard) {
    errors.push('standard is required');
  }

  if (!pipe.schedule) {
    errors.push('schedule is required');
  }

  if (pipe.wall_thickness_in === null || isNaN(pipe.wall_thickness_in)) {
    errors.push('wall_thickness_in is required and must be a valid number');
  }

  if (pipe.outside_diameter_in === null || isNaN(pipe.outside_diameter_in)) {
    errors.push('outside_diameter_in is required and must be a valid number');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Upserts a pipe into the database
 * Uses composite key (standard, od_inch, schedule, wall_thickness_inch) to detect duplicates
 *
 * @param {Object} db - Database connection
 * @param {Object} pipe - Pipe object
 * @returns {Promise<Object>} Upserted pipe record
 */
async function upsertPipe(db, pipe) {
  // First, try to find existing pipe with same composite key
  const existingResult = await db.query(
    `SELECT id FROM pipes
     WHERE standard = $1
       AND outside_diameter_in = $2
       AND schedule = $3
       AND wall_thickness_in = $4`,
    [pipe.standard, pipe.outside_diameter_in, pipe.schedule, pipe.wall_thickness_in]
  );

  if (existingResult.rows.length > 0) {
    // Update existing pipe
    const pipeId = existingResult.rows[0].id;
    const result = await db.query(
      `UPDATE pipes SET
        nps_inch = $1,
        dn_mm = $2,
        outside_diameter_mm = $3,
        wall_thickness_mm = $4,
        weight_lb_per_ft = $5,
        weight_kg_per_m = $6,
        pipe_category = $7,
        pressure_series = $8,
        nps_display = $9,
        b3610_table = $10,
        b3610_page = $11,
        source_file = $12,
        is_active = $13,
        updated_at = NOW()
      WHERE id = $14
      RETURNING *`,
      [
        pipe.nps_inch,
        pipe.dn_mm,
        pipe.outside_diameter_mm,
        pipe.wall_thickness_mm,
        pipe.weight_lb_per_ft,
        pipe.weight_kg_per_m,
        pipe.pipe_category,
        pipe.pressure_series,
        pipe.nps_display,
        pipe.b3610_table,
        pipe.b3610_page,
        pipe.source_file,
        pipe.is_active,
        pipeId,
      ]
    );
    return { pipe: result.rows[0], action: 'updated' };
  } else {
    // Insert new pipe
    const result = await db.query(
      `INSERT INTO pipes (
        standard, nps_inch, dn_mm, outside_diameter_in, outside_diameter_mm,
        schedule, wall_thickness_in, wall_thickness_mm,
        weight_lb_per_ft, weight_kg_per_m,
        pipe_category, pressure_series, nps_display,
        b3610_table, b3610_page, source_file, is_active
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING *`,
      [
        pipe.standard,
        pipe.nps_inch,
        pipe.dn_mm,
        pipe.outside_diameter_in,
        pipe.outside_diameter_mm,
        pipe.schedule,
        pipe.wall_thickness_in,
        pipe.wall_thickness_mm,
        pipe.weight_lb_per_ft,
        pipe.weight_kg_per_m,
        pipe.pipe_category,
        pipe.pressure_series,
        pipe.nps_display,
        pipe.b3610_table,
        pipe.b3610_page,
        pipe.source_file,
        pipe.is_active,
      ]
    );
    return { pipe: result.rows[0], action: 'inserted' };
  }
}

/**
 * Main seeding function
 */
async function seedPipesFromASME() {
  // Determine CSV file path
  const csvPath = process.argv[2] || path.join(__dirname, '..', '..', 'data', 'pipes_dimensions_asme_b3610_extracted.csv');

  console.log('='.repeat(60));
  console.log('ASME B36.10M Pipe Dimensions Seeder');
  console.log('='.repeat(60));
  console.log(`CSV file: ${csvPath}`);
  console.log('');

  // Check if CSV file exists
  if (!fs.existsSync(csvPath)) {
    console.error(`L CSV file not found: ${csvPath}`);
    console.log('\nPlease ensure the ASME extracted CSV file exists.');
    process.exit(1);
  }

  let db;
  try {
    // Connect to database
    db = await connectDb();
    console.log(' Connected to database');

    // Parse CSV
    console.log('=� Parsing CSV file...');
    const rows = parseCSV(csvPath);
    console.log(` Parsed ${rows.length} rows from CSV`);
    console.log('');

    // Process each row
    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    const errors = [];

    console.log('Processing pipe dimensions...');
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const pipe = mapRowToPipe(row);

      // Validate
      const validation = validatePipe(pipe);
      if (!validation.valid) {
        console.warn(`�  Row ${i + 2}: Validation failed - ${validation.errors.join(', ')}`);
        skipped++;
        errors.push({ row: i + 2, errors: validation.errors });
        continue;
      }

      // Upsert (insert or update if exists)
      try {
        const result = await upsertPipe(db, pipe);
        if (result.action === 'inserted') {
          inserted++;
        } else {
          updated++;
        }

        if ((inserted + updated) % 50 === 0) {
          console.log(`  Processed ${inserted + updated} pipes...`);
        }
      } catch (error) {
        console.warn(`�  Row ${i + 2}: Upsert failed - ${error.message}`);
        skipped++;
        errors.push({ row: i + 2, errors: [error.message] });
      }
    }

    console.log('');
    console.log('='.repeat(60));
    console.log(' ASME Pipe Dimensions Import Completed');
    console.log('='.repeat(60));
    console.log(`Total rows processed: ${rows.length}`);
    console.log(`Successfully inserted: ${inserted}`);
    console.log(`Successfully updated: ${updated}`);
    console.log(`Skipped (errors): ${skipped}`);

    if (errors.length > 0 && errors.length <= 10) {
      console.log('\nErrors:');
      errors.forEach(err => {
        console.log(`  Row ${err.row}: ${err.errors.join(', ')}`);
      });
    } else if (errors.length > 10) {
      console.log(`\n${errors.length} errors occurred. First 10:`);
      errors.slice(0, 10).forEach(err => {
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
  seedPipesFromASME();
}

module.exports = {
  seedPipesFromASME,
  parseCSV,
  mapRowToPipe,
  validatePipe,
  upsertPipe,
};
