/**
 * Seeding script for KGSB grating catalogue
 * 
 * This script loads the KGSB grating catalogue JSON file into the materials table.
 * It handles duplicate prevention and stores grating-specific attributes in the notes field as JSON.
 * 
 * Usage:
 *   cd backend
 *   node scripts/seed_kgsb_gratings.js
 * 
 * Or via npm:
 *   npm run seed:kgsb-gratings
 */

require('dotenv').config();
const path = require('path');
const fs = require('fs');
const { connectDb } = require('../src/db/supabaseClient');

/**
 * Maps JSON catalogue entry to database row
 */
function mapToDbRow(catalogEntry) {
  // Store grating-specific attributes in notes as JSON
  const gratingAttributes = {
    series: catalogEntry.series,
    pitch_mm: catalogEntry.pitch_mm,
    load_bar_width_mm: catalogEntry.load_bar_width_mm,
    load_bar_thickness_mm: catalogEntry.load_bar_thickness_mm,
    duty_class: catalogEntry.duty_class,
    surface: catalogEntry.surface,
    finish: catalogEntry.finish,
    imperial_code: catalogEntry.imperial_code,
  };

  // Build spec_standard: includes pitch info
  const specStandard = `${catalogEntry.pitch_mm}mm pitch (Series ${catalogEntry.series})`;

  // Build grade: series or duty class
  const grade = `Series ${catalogEntry.series} (${catalogEntry.duty_class} duty)`;

  // Map material_type
  const materialType = catalogEntry.material_type === 'MS' ? 'Mild Steel' : 'Stainless Steel';

  return {
    material_code: catalogEntry.material_code,
    category: catalogEntry.category,
    spec_standard: specStandard,
    grade: grade,
    material_type: materialType,
    origin_type: 'CHINA', // KGSB is typically Chinese origin, adjust if needed
    size_description: catalogEntry.size_description,
    base_cost: 0, // Base cost should be set via pricing rules or manual update
    currency: 'USD',
    notes: JSON.stringify(gratingAttributes, null, 2),
  };
}

/**
 * Main seeding function
 */
async function seedKgsbGratings() {
  const db = await connectDb();

  // Load catalogue JSON
  const catalogPath = path.join(__dirname, '..', 'seed', 'kgsb_grating_catalog.json');
  
  if (!fs.existsSync(catalogPath)) {
    throw new Error(`Catalogue file not found: ${catalogPath}`);
  }

  const catalogJson = fs.readFileSync(catalogPath, 'utf8');
  const catalogEntries = JSON.parse(catalogJson);

  if (!Array.isArray(catalogEntries) || catalogEntries.length === 0) {
    throw new Error('Catalogue file is empty or invalid');
  }

  console.log(`[KGSB Seed] Loading ${catalogEntries.length} grating entries from catalogue...`);

  let insertedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  try {
    for (const entry of catalogEntries) {
      try {
        const dbRow = mapToDbRow(entry);

        // Insert with conflict handling
        const result = await db.query(
          `INSERT INTO materials (
            material_code, category, spec_standard, grade, material_type,
            origin_type, size_description, base_cost, currency, notes
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT (material_code) 
          DO UPDATE SET
            category = EXCLUDED.category,
            spec_standard = EXCLUDED.spec_standard,
            grade = EXCLUDED.grade,
            material_type = EXCLUDED.material_type,
            size_description = EXCLUDED.size_description,
            notes = EXCLUDED.notes,
            updated_at = NOW()
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
          console.log(`[KGSB Seed] ✓ Inserted/Updated: ${dbRow.material_code}`);
        } else {
          skippedCount++;
          console.log(`[KGSB Seed] - Skipped (duplicate): ${dbRow.material_code}`);
        }
      } catch (error) {
        errorCount++;
        console.error(`[KGSB Seed] ✗ Error processing ${entry.material_code}:`, error.message);
      }
    }

    console.log('\n[KGSB Seed] ===========================================');
    console.log(`[KGSB Seed] Summary:`);
    console.log(`[KGSB Seed]   Inserted/Updated: ${insertedCount}`);
    console.log(`[KGSB Seed]   Skipped: ${skippedCount}`);
    console.log(`[KGSB Seed]   Errors: ${errorCount}`);
    console.log(`[KGSB Seed]   Total processed: ${catalogEntries.length}`);
    console.log('[KGSB Seed] ===========================================\n');

    if (errorCount > 0) {
      console.warn(`[KGSB Seed] Warning: ${errorCount} entries failed to process`);
    }

    console.log('[KGSB Seed] Seeding completed successfully!');
  } catch (error) {
    console.error('[KGSB Seed] Fatal error during seeding:', error);
    throw error;
  } finally {
    await db.end();
  }
}

// Run if executed directly
if (require.main === module) {
  seedKgsbGratings()
    .then(() => {
      console.log('[KGSB Seed] Script finished successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('[KGSB Seed] Script failed:', error);
      process.exit(1);
    });
}

module.exports = {
  seedKgsbGratings,
};

