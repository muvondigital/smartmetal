/**
 * ASME Flange Dimensions Seeder
 *
 * This script loads flange dimension data from the ASME B16.5 extracted CSV
 * into the flanges table. It handles the full ASME dataset with all columns.
 *
 * Usage:
 *   cd backend
 *   node scripts/seedFlangesFromDimensionsCsv.js [path/to/csv]
 *
 * If no CSV path provided, defaults to: ../../data/flanges_dimensions.csv
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
 * Converts CSV row to database-compatible flange object
 *
 * @param {Object} row - CSV row object
 * @returns {Object} Flange object for database insertion
 */
function mapRowToFlange(row) {
  return {
    standard: row.standard || null,
    nps_inch: parseNumericValue(row.nps_inch),
    dn_mm: parseIntegerValue(row.dn_mm),
    rating_class: parseIntegerValue(row.rating_class),
    type: row.type || null,
    facing: row.facing || null,
    bore_inch: parseNumericValue(row.bore_inch),
    od_inch: parseNumericValue(row.od_inch),
    thickness_inch: parseNumericValue(row.thickness_inch),
    hub_diameter_inch: parseNumericValue(row.hub_diameter_inch),
    hub_length_inch: parseNumericValue(row.hub_length_inch),
    bolt_circle_inch: parseNumericValue(row.bolt_circle_inch),
    bolt_hole_diameter_inch: parseNumericValue(row.bolt_hole_diameter_inch),
    number_of_bolts: parseIntegerValue(row.number_of_bolts),
    bolt_size_inch: row.bolt_size_inch || null,
    weight_kg: parseNumericValue(row.weight_kg),
    flange_category: row.flange_category || null,
    b165_table: row.b165_table || null,
    b165_page: parseIntegerValue(row.b165_page),
    source_file: row.source_file || null,
    is_active: parseBooleanValue(row.is_active),
  };
}

/**
 * Validates a flange object before insertion
 *
 * @param {Object} flange - Flange object
 * @returns {Object} Validation result { valid: boolean, errors: string[] }
 */
function validateFlange(flange) {
  const errors = [];

  if (!flange.standard) {
    errors.push('standard is required');
  }

  if (flange.nps_inch === null || isNaN(flange.nps_inch)) {
    errors.push('nps_inch is required and must be a valid number');
  }

  if (flange.rating_class === null || isNaN(flange.rating_class)) {
    errors.push('rating_class is required and must be a valid integer');
  }

  if (!flange.type) {
    errors.push('type is required');
  }

  if (!flange.facing) {
    errors.push('facing is required');
  }

  if (flange.od_inch === null || isNaN(flange.od_inch)) {
    errors.push('od_inch is required and must be a valid number');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Upserts a flange into the database
 * Uses composite key (standard, nps_inch, rating_class, type, facing) to detect duplicates
 *
 * @param {Object} db - Database connection
 * @param {Object} flange - Flange object
 * @returns {Promise<Object>} Upserted flange record
 */
async function upsertFlange(db, flange) {
  // First, try to find existing flange with same composite key
  const existingResult = await db.query(
    `SELECT id FROM flanges
     WHERE standard = $1
       AND nps_inch = $2
       AND rating_class = $3
       AND type = $4
       AND facing = $5`,
    [flange.standard, flange.nps_inch, flange.rating_class, flange.type, flange.facing]
  );

  if (existingResult.rows.length > 0) {
    // Update existing flange
    const flangeId = existingResult.rows[0].id;
    const result = await db.query(
      `UPDATE flanges SET
        dn_mm = $1,
        bore_inch = $2,
        od_inch = $3,
        thickness_inch = $4,
        hub_diameter_inch = $5,
        hub_length_inch = $6,
        bolt_circle_inch = $7,
        bolt_hole_diameter_inch = $8,
        number_of_bolts = $9,
        bolt_size_inch = $10,
        weight_kg = $11,
        flange_category = $12,
        b165_table = $13,
        b165_page = $14,
        source_file = $15,
        is_active = $16,
        updated_at = NOW()
      WHERE id = $17
      RETURNING *`,
      [
        flange.dn_mm,
        flange.bore_inch,
        flange.od_inch,
        flange.thickness_inch,
        flange.hub_diameter_inch,
        flange.hub_length_inch,
        flange.bolt_circle_inch,
        flange.bolt_hole_diameter_inch,
        flange.number_of_bolts,
        flange.bolt_size_inch,
        flange.weight_kg,
        flange.flange_category,
        flange.b165_table,
        flange.b165_page,
        flange.source_file,
        flange.is_active,
        flangeId,
      ]
    );
    return { flange: result.rows[0], action: 'updated' };
  } else {
    // Insert new flange
    const result = await db.query(
      `INSERT INTO flanges (
        standard, nps_inch, dn_mm, rating_class, type, facing,
        bore_inch, od_inch, thickness_inch,
        hub_diameter_inch, hub_length_inch,
        bolt_circle_inch, bolt_hole_diameter_inch, number_of_bolts, bolt_size_inch,
        weight_kg, flange_category,
        b165_table, b165_page, source_file, is_active
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
      RETURNING *`,
      [
        flange.standard,
        flange.nps_inch,
        flange.dn_mm,
        flange.rating_class,
        flange.type,
        flange.facing,
        flange.bore_inch,
        flange.od_inch,
        flange.thickness_inch,
        flange.hub_diameter_inch,
        flange.hub_length_inch,
        flange.bolt_circle_inch,
        flange.bolt_hole_diameter_inch,
        flange.number_of_bolts,
        flange.bolt_size_inch,
        flange.weight_kg,
        flange.flange_category,
        flange.b165_table,
        flange.b165_page,
        flange.source_file,
        flange.is_active,
      ]
    );
    return { flange: result.rows[0], action: 'inserted' };
  }
}

/**
 * Main seeding function
 */
async function seedFlangesFromASME() {
  // Determine CSV file path
  const csvPath = process.argv[2] || path.join(__dirname, '..', '..', 'data', 'flanges_dimensions.csv');

  console.log('='.repeat(60));
  console.log('ASME B16.5 Flange Dimensions Seeder');
  console.log('='.repeat(60));
  console.log(`CSV file: ${csvPath}`);
  console.log('');

  // Check if CSV file exists
  if (!fs.existsSync(csvPath)) {
    console.error(`❌ CSV file not found: ${csvPath}`);
    console.log('\nPlease ensure the ASME extracted CSV file exists.');
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

    console.log('Processing flange dimensions...');
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const flange = mapRowToFlange(row);

      // Validate
      const validation = validateFlange(flange);
      if (!validation.valid) {
        console.warn(`⚠️  Row ${i + 2}: Validation failed - ${validation.errors.join(', ')}`);
        skipped++;
        errors.push({ row: i + 2, errors: validation.errors });
        continue;
      }

      // Upsert (insert or update if exists)
      try {
        const result = await upsertFlange(db, flange);
        if (result.action === 'inserted') {
          inserted++;
        } else {
          updated++;
        }

        if ((inserted + updated) % 50 === 0) {
          console.log(`  Processed ${inserted + updated} flanges...`);
        }
      } catch (error) {
        console.warn(`⚠️  Row ${i + 2}: Upsert failed - ${error.message}`);
        skipped++;
        errors.push({ row: i + 2, errors: [error.message] });
      }
    }

    console.log('');
    console.log('='.repeat(60));
    console.log('✅ ASME Flange Dimensions Import Completed');
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
    console.error('\n❌ Seed script failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  seedFlangesFromASME();
}

module.exports = {
  seedFlangesFromASME,
  parseCSV,
  mapRowToFlange,
  validateFlange,
  upsertFlange,
};

