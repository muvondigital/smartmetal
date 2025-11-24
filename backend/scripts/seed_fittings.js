/**
 * Seeding script for fittings catalogue
 * 
 * This script loads the fittings catalogue JSON file into the materials table.
 * It handles duplicate prevention and stores fitting-specific attributes in the notes field as JSON.
 * 
 * Usage:
 *   cd backend
 *   node scripts/seed_fittings.js
 * 
 * Or via npm:
 *   npm run seed:fittings
 */

require('dotenv').config();
const path = require('path');
const fs = require('fs');
const { connectDb } = require('../src/db/supabaseClient');

/**
 * Maps JSON catalogue entry to database row
 */
function mapToDbRow(catalogEntry) {
  // Store fitting-specific attributes in notes as JSON
  const fittingAttributes = {
    fitting_type: catalogEntry.fitting_type,
    angle_deg: catalogEntry.angle_deg,
    radius: catalogEntry.radius,
    nps_inch_run: catalogEntry.nps_inch_run,
    nps_inch_branch: catalogEntry.nps_inch_branch,
    schedule: catalogEntry.schedule,
    material_family: catalogEntry.material_family,
    description: catalogEntry.description,
  };

  // Build size_description from description or NPS
  const sizeDescription = catalogEntry.description 
    ? catalogEntry.description.split(' ')[0] + '"' + (catalogEntry.description.includes('SCH') ? ' ' + catalogEntry.description.split('SCH')[1].split(' ')[0] : '')
    : `${catalogEntry.nps_inch_run}" SCH${catalogEntry.schedule}`;

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
    category: catalogEntry.category.toLowerCase(),
    spec_standard: catalogEntry.standard,
    grade: catalogEntry.grade,
    material_type: materialType,
    origin_type: 'NON_CHINA',
    size_description: sizeDescription,
    base_cost: 0,
    currency: 'USD',
    notes: JSON.stringify(fittingAttributes, null, 2),
  };
}

/**
 * Main seeding function
 */
async function seedFittings() {
  const db = await connectDb();

  // Load catalogue JSON
  const catalogPath = path.join(__dirname, '..', 'seed', 'fittings_catalog.json');
  
  if (!fs.existsSync(catalogPath)) {
    throw new Error(`Catalogue file not found: ${catalogPath}`);
  }

  const catalogJson = fs.readFileSync(catalogPath, 'utf8');
  const catalogEntries = JSON.parse(catalogJson);

  if (!Array.isArray(catalogEntries) || catalogEntries.length === 0) {
    console.log('[Fittings Seed] Catalogue file is empty, skipping...');
    await db.end();
    return;
  }

  console.log(`[Fittings Seed] Loading ${catalogEntries.length} fitting entries from catalogue...`);

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
            console.log(`[Fittings Seed] ✓ Updated: ${dbRow.material_code}`);
          } else {
            skippedCount++;
            console.log(`[Fittings Seed] - Skipped: ${dbRow.material_code}`);
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
            console.log(`[Fittings Seed] ✓ Inserted: ${dbRow.material_code}`);
          } else {
            skippedCount++;
            console.log(`[Fittings Seed] - Skipped: ${dbRow.material_code}`);
          }
        }
      } catch (error) {
        errorCount++;
        console.error(`[Fittings Seed] ✗ Error processing ${entry.material_code}:`, error.message);
      }
    }

    console.log('\n[Fittings Seed] ===========================================');
    console.log(`[Fittings Seed] Summary:`);
    console.log(`[Fittings Seed]   Inserted: ${insertedCount}`);
    console.log(`[Fittings Seed]   Updated: ${updatedCount}`);
    console.log(`[Fittings Seed]   Skipped: ${skippedCount}`);
    console.log(`[Fittings Seed]   Errors: ${errorCount}`);
    console.log(`[Fittings Seed]   Total processed: ${catalogEntries.length}`);
    console.log('[Fittings Seed] ===========================================\n');

    if (errorCount > 0) {
      console.warn(`[Fittings Seed] Warning: ${errorCount} entries failed to process`);
    }

    console.log('[Fittings Seed] Seeding completed successfully!');
  } catch (error) {
    console.error('[Fittings Seed] Fatal error during seeding:', error);
    throw error;
  } finally {
    await db.end();
  }
}

// Run if executed directly
if (require.main === module) {
  seedFittings()
    .then(() => {
      console.log('[Fittings Seed] Script finished successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('[Fittings Seed] Script failed:', error);
      process.exit(1);
    });
}

module.exports = {
  seedFittings,
};



