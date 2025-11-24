/**
 * Seeding script for pipe catalogue
 * 
 * This script loads the pipe catalogue JSON file into the materials table.
 * It handles duplicate prevention and stores pipe-specific attributes in the notes field as JSON.
 * 
 * Usage:
 *   cd backend
 *   node scripts/seed_pipes.js
 * 
 * Or via npm:
 *   npm run seed:pipes
 */

require('dotenv').config();
const path = require('path');
const fs = require('fs');
const { connectDb } = require('../src/db/supabaseClient');

/**
 * Maps JSON catalogue entry to database row
 * 
 * Pipe data model:
 * - material_code: Unique identifier (e.g., "PIPE-CS-A106B-6IN-SCH40-SEAMLESS")
 * - category: "pipe" (lowercase to match existing conventions)
 * - size_description: Human-readable size (e.g., "6\" SCH40")
 * - spec_standard: Standard specification (e.g., "ASTM A106", "API 5L")
 * - grade: Material grade (e.g., "A106 GR.B", "X52", "TP316L")
 * - material_type: Material family description (e.g., "Carbon Steel", "Stainless Steel")
 * - notes: JSON string containing pipe-specific attributes (NPS, OD, schedule, wall thickness, form, etc.)
 */
function mapToDbRow(catalogEntry) {
  // Store pipe-specific attributes in notes as JSON
  const pipeAttributes = {
    nps_inch: catalogEntry.nps_inch,
    outside_diameter_mm: catalogEntry.outside_diameter_mm,
    schedule: catalogEntry.schedule,
    wall_thickness_mm: catalogEntry.wall_thickness_mm,
    material_family: catalogEntry.material_family,
    form: catalogEntry.form,
  };

  // Build size_description: e.g., "6\" SCH40"
  const sizeDescription = `${catalogEntry.nps_inch}" SCH${catalogEntry.schedule}`;

  // Map material_family to material_type description
  let materialType;
  switch (catalogEntry.material_family) {
    case 'CS':
      materialType = 'Carbon Steel';
      break;
    case 'LTCS':
      materialType = 'Low Temperature Carbon Steel';
      break;
    case 'SS':
      materialType = 'Stainless Steel';
      break;
    case 'ALLOY':
      materialType = 'Alloy Steel';
      break;
    default:
      materialType = catalogEntry.material_family;
  }

  return {
    material_code: catalogEntry.material_code,
    category: catalogEntry.category.toLowerCase(), // Use lowercase to match existing conventions
    spec_standard: catalogEntry.standard,
    grade: catalogEntry.grade,
    material_type: materialType,
    origin_type: 'NON_CHINA', // Default to NON_CHINA, can be adjusted per entry if needed
    size_description: sizeDescription,
    base_cost: 0, // Base cost should be set via pricing rules or manual update
    currency: 'USD',
    notes: JSON.stringify(pipeAttributes, null, 2),
  };
}

/**
 * Main seeding function
 */
async function seedPipes() {
  const db = await connectDb();

  // Load catalogue JSON
  const catalogPath = path.join(__dirname, '..', 'seed', 'pipe_catalog.json');
  
  if (!fs.existsSync(catalogPath)) {
    throw new Error(`Catalogue file not found: ${catalogPath}`);
  }

  const catalogJson = fs.readFileSync(catalogPath, 'utf8');
  const catalogEntries = JSON.parse(catalogJson);

  if (!Array.isArray(catalogEntries) || catalogEntries.length === 0) {
    throw new Error('Catalogue file is empty or invalid');
  }

  console.log(`[Pipe Seed] Loading ${catalogEntries.length} pipe entries from catalogue...`);

  let insertedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  try {
    for (const entry of catalogEntries) {
      try {
        const dbRow = mapToDbRow(entry);

        // Check if material_code already exists
        const existing = await db.query(
          `SELECT material_code FROM materials WHERE material_code = $1`,
          [dbRow.material_code]
        );

        if (existing.rows.length > 0) {
          // Update existing entry
          const result = await db.query(
            `UPDATE materials SET
              category = $1,
              spec_standard = $2,
              grade = $3,
              material_type = $4,
              size_description = $5,
              notes = $6,
              updated_at = NOW()
            WHERE material_code = $7
            RETURNING material_code`,
            [
              dbRow.category,
              dbRow.spec_standard,
              dbRow.grade,
              dbRow.material_type,
              dbRow.size_description,
              dbRow.notes,
              dbRow.material_code,
            ]
          );

          if (result.rows.length > 0) {
            updatedCount++;
            console.log(`[Pipe Seed] ✓ Updated: ${dbRow.material_code}`);
          } else {
            skippedCount++;
            console.log(`[Pipe Seed] - Skipped: ${dbRow.material_code}`);
          }
        } else {
          // Insert new entry
          const result = await db.query(
            `INSERT INTO materials (
              material_code, category, spec_standard, grade, material_type,
              origin_type, size_description, base_cost, currency, notes
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING material_code`,
            [
              dbRow.material_code,
              dbRow.category,
              dbRow.spec_standard,
              dbRow.grade,
              dbRow.material_type,
              dbRow.origin_type,
              dbRow.size_description,
              dbRow.base_cost,
              dbRow.currency,
              dbRow.notes,
            ]
          );

          if (result.rows.length > 0) {
            insertedCount++;
            console.log(`[Pipe Seed] ✓ Inserted: ${dbRow.material_code}`);
          } else {
            skippedCount++;
            console.log(`[Pipe Seed] - Skipped: ${dbRow.material_code}`);
          }
        }
      } catch (error) {
        errorCount++;
        console.error(`[Pipe Seed] ✗ Error processing ${entry.material_code}:`, error.message);
      }
    }

    console.log('\n[Pipe Seed] ===========================================');
    console.log(`[Pipe Seed] Summary:`);
    console.log(`[Pipe Seed]   Inserted: ${insertedCount}`);
    console.log(`[Pipe Seed]   Updated: ${updatedCount}`);
    console.log(`[Pipe Seed]   Skipped: ${skippedCount}`);
    console.log(`[Pipe Seed]   Errors: ${errorCount}`);
    console.log(`[Pipe Seed]   Total processed: ${catalogEntries.length}`);
    console.log('[Pipe Seed] ===========================================\n');

    if (errorCount > 0) {
      console.warn(`[Pipe Seed] Warning: ${errorCount} entries failed to process`);
    }

    console.log('[Pipe Seed] Seeding completed successfully!');
  } catch (error) {
    console.error('[Pipe Seed] Fatal error during seeding:', error);
    throw error;
  } finally {
    await db.end();
  }
}

// Run if executed directly
if (require.main === module) {
  seedPipes()
    .then(() => {
      console.log('[Pipe Seed] Script finished successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('[Pipe Seed] Script failed:', error);
      process.exit(1);
    });
}

module.exports = {
  seedPipes,
};

