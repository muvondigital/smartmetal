/**
 * Seeding script for fasteners catalogue
 * 
 * This script loads the fasteners catalogue JSON file into the materials table.
 * It handles duplicate prevention and stores fastener-specific attributes in the notes field as JSON.
 * 
 * Usage:
 *   cd backend
 *   node scripts/seed_fasteners.js
 * 
 * Or via npm:
 *   npm run seed:fasteners
 */

require('dotenv').config();
const path = require('path');
const fs = require('fs');
const { connectDb } = require('../src/db/supabaseClient');

/**
 * Maps JSON catalogue entry to database row
 */
function mapToDbRow(catalogEntry) {
  // Store fastener-specific attributes in notes as JSON
  const fastenerAttributes = {
    ...catalogEntry,
  };

  // Build size_description
  const sizeDescription = catalogEntry.size_description || 
    catalogEntry.description ||
    (catalogEntry.size ? catalogEntry.size : 'N/A');

  // Map material_family to material_type description if present
  let materialType = catalogEntry.material_type;
  if (catalogEntry.material_family) {
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
  }

  return {
    material_code: catalogEntry.material_code,
    category: catalogEntry.category ? catalogEntry.category.toLowerCase() : 'fastener',
    spec_standard: catalogEntry.standard || catalogEntry.spec_standard,
    grade: catalogEntry.grade,
    material_type: materialType,
    origin_type: catalogEntry.origin_type || 'NON_CHINA',
    size_description: sizeDescription,
    base_cost: catalogEntry.base_cost || 0,
    currency: catalogEntry.currency || 'USD',
    notes: JSON.stringify(fastenerAttributes, null, 2),
  };
}

/**
 * Main seeding function
 */
async function seedFasteners() {
  const db = await connectDb();

  // Load catalogue JSON
  const catalogPath = path.join(__dirname, '..', 'seed', 'fasteners_catalog.json');
  
  if (!fs.existsSync(catalogPath)) {
    throw new Error(`Catalogue file not found: ${catalogPath}`);
  }

  const catalogJson = fs.readFileSync(catalogPath, 'utf8').trim();
  
  if (!catalogJson || catalogJson === '') {
    console.log('[Fasteners Seed] Catalogue file is empty, skipping...');
    await db.end();
    return;
  }

  const catalogEntries = JSON.parse(catalogJson);

  if (!Array.isArray(catalogEntries) || catalogEntries.length === 0) {
    console.log('[Fasteners Seed] Catalogue file is empty, skipping...');
    await db.end();
    return;
  }

  console.log(`[Fasteners Seed] Loading ${catalogEntries.length} fastener entries from catalogue...`);

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
            console.log(`[Fasteners Seed] ✓ Updated: ${dbRow.material_code}`);
          } else {
            skippedCount++;
            console.log(`[Fasteners Seed] - Skipped: ${dbRow.material_code}`);
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
            console.log(`[Fasteners Seed] ✓ Inserted: ${dbRow.material_code}`);
          } else {
            skippedCount++;
            console.log(`[Fasteners Seed] - Skipped: ${dbRow.material_code}`);
          }
        }
      } catch (error) {
        errorCount++;
        console.error(`[Fasteners Seed] ✗ Error processing ${entry.material_code || 'unknown'}:`, error.message);
      }
    }

    console.log('\n[Fasteners Seed] ===========================================');
    console.log(`[Fasteners Seed] Summary:`);
    console.log(`[Fasteners Seed]   Inserted: ${insertedCount}`);
    console.log(`[Fasteners Seed]   Updated: ${updatedCount}`);
    console.log(`[Fasteners Seed]   Skipped: ${skippedCount}`);
    console.log(`[Fasteners Seed]   Errors: ${errorCount}`);
    console.log(`[Fasteners Seed]   Total processed: ${catalogEntries.length}`);
    console.log('[Fasteners Seed] ===========================================\n');

    if (errorCount > 0) {
      console.warn(`[Fasteners Seed] Warning: ${errorCount} entries failed to process`);
    }

    console.log('[Fasteners Seed] Seeding completed successfully!');
  } catch (error) {
    console.error('[Fasteners Seed] Fatal error during seeding:', error);
    throw error;
  } finally {
    await db.end();
  }
}

// Run if executed directly
if (require.main === module) {
  seedFasteners()
    .then(() => {
      console.log('[Fasteners Seed] Script finished successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('[Fasteners Seed] Script failed:', error);
      process.exit(1);
    });
}

module.exports = {
  seedFasteners,
};

