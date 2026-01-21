/**
 * HS Code Database Seeder
 * 
 * Loads HS codes from the JSON seed file into the regulatory_hs_codes table.
 * This seeder is idempotent and uses UPSERT to prevent duplicates.
 * 
 * Usage:
 *   node scripts/db/seed_hs_codes.js
 *   OR
 *   npm run seed:hs
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { connectDb } = require('../../src/db/supabaseClient');
const fs = require('fs').promises;
const path = require('path');

const SEED_FILE = path.join(__dirname, '..', '..', 'src', 'db', 'seeds', 'data', 'hs_codes_seed.json');

/**
 * Load and parse JSON seed file
 */
async function loadSeedFile() {
  try {
    await fs.access(SEED_FILE);
  } catch (error) {
    throw new Error(`Seed file not found: ${SEED_FILE}\nPlease run 'npm run generate:hs-seed' first.`);
  }

  try {
    const content = await fs.readFile(SEED_FILE, 'utf8');
    const data = JSON.parse(content);
    
    if (!Array.isArray(data)) {
      throw new Error('Seed file must contain a JSON array');
    }
    
    return data;
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`Seed file not found: ${SEED_FILE}\nPlease run 'npm run generate:hs-seed' first.`);
    }
    throw new Error(`Error loading seed file: ${error.message}`);
  }
}

/**
 * Main seeding function
 */
async function seedHsCodes() {
  console.log('='.repeat(60));
  console.log('HS CODE DATABASE SEEDER');
  console.log('='.repeat(60));
  console.log('');

  // Check DATABASE_URL
  if (!process.env.DATABASE_URL) {
    console.error('❌ ERROR: DATABASE_URL environment variable is not set!');
    console.error('');
    console.error('Please set DATABASE_URL in your .env file:');
    console.error('  DATABASE_URL=postgresql://user:password@host:port/database');
    console.error('');
    process.exit(1);
  }

  const db = await connectDb();

  try {
    // Check if table exists
    const tableCheck = await db.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'regulatory_hs_codes'
    `);

    if (tableCheck.rows.length === 0) {
      throw new Error('regulatory_hs_codes table not found. Please run migration 040 first.');
    }

    // Load seed data
    console.log('📂 Loading seed file...');
    const hsCodesData = await loadSeedFile();
    console.log(`   Found ${hsCodesData.length} HS code entries`);
    console.log('');

    if (hsCodesData.length === 0) {
      console.log('⚠️  No HS codes to seed (seed file is empty)');
      process.exit(0);
    }

    // Begin transaction
    await db.query('BEGIN');

    console.log('📋 Seeding HS codes...');
    
    let totalCount = 0;
    let insertedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    const categoryCounts = {};

    // Process each HS code entry
    for (const hsCodeData of hsCodesData) {
      try {
        // Validate required fields
        if (!hsCodeData.hs_code || !hsCodeData.category || !hsCodeData.description) {
          console.warn(`⚠️  Skipping invalid HS code entry: missing required fields`, {
            hs_code: hsCodeData.hs_code || 'MISSING',
            category: hsCodeData.category || 'MISSING',
            description: hsCodeData.description || 'MISSING'
          });
          skippedCount++;
          continue;
        }

        // Map JSON field names to DB column names
        // JSON uses: default_import_duty_rate
        // DB uses: import_duty
        const importDuty = hsCodeData.default_import_duty_rate !== undefined 
          ? hsCodeData.default_import_duty_rate 
          : 0;

        // Normalize category: convert lowercase plural to uppercase singular
        // Database expects: PIPE, FLANGE, FITTING, FASTENER, GRATING, PLATE, GASKET, STEEL, OTHER
        const categoryMap = {
          'pipes': 'PIPE',
          'pipe': 'PIPE',
          'flanges': 'FLANGE',
          'flange': 'FLANGE',
          'fittings': 'FITTING',
          'fitting': 'FITTING',
          'fasteners': 'FASTENER',
          'fastener': 'FASTENER',
          'gratings': 'GRATING',
          'grating': 'GRATING',
          'plates': 'PLATE',
          'plate': 'PLATE',
          'gaskets': 'GASKET',
          'gasket': 'GASKET',
          'valves': 'VALVE',
          'valve': 'VALVE',
          'steel': 'STEEL',
          'copper': 'COPPER',
          'nickel': 'NICKEL',
          'zinc': 'ZINC',
          'iron': 'IRON',
          'alloy': 'ALLOY',
          'alloys': 'ALLOY'
        };
        const normalizedCategory = categoryMap[hsCodeData.category?.toLowerCase()] || 
                                  hsCodeData.category?.toUpperCase() || 
                                  'OTHER';

        // Check if exists
        const existingCheck = await db.query(
          `SELECT id FROM regulatory_hs_codes WHERE hs_code = $1`,
          [hsCodeData.hs_code]
        );

        if (existingCheck.rows.length > 0) {
          // Update existing
          await db.query(
            `UPDATE regulatory_hs_codes SET
              category = $1,
              sub_category = $2,
              description = $3,
              import_duty = $4,
              updated_at = NOW()
            WHERE hs_code = $5`,
            [
              normalizedCategory,
              hsCodeData.sub_category || null,
              hsCodeData.description,
              importDuty,
              hsCodeData.hs_code,
            ]
          );
          updatedCount++;
        } else {
          // Insert new
          await db.query(
            `INSERT INTO regulatory_hs_codes (
              hs_code,
              category,
              sub_category,
              description,
              import_duty,
              is_active
            )
            VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              hsCodeData.hs_code,
              normalizedCategory,
              hsCodeData.sub_category || null,
              hsCodeData.description,
              importDuty,
              hsCodeData.is_active !== undefined ? hsCodeData.is_active : true,
            ]
          );
          insertedCount++;
        }

        // Track category counts (use normalized category)
        categoryCounts[normalizedCategory] = (categoryCounts[normalizedCategory] || 0) + 1;
        totalCount++;

      } catch (error) {
        console.error(`❌ Error processing HS code ${hsCodeData.hs_code || 'UNKNOWN'}:`, error.message);
        errorCount++;
      }
    }

    // Commit transaction
    await db.query('COMMIT');

    console.log('');
    console.log('='.repeat(60));
    console.log('✅ HS CODE SEEDING COMPLETED');
    console.log('='.repeat(60));
    console.log('');
    console.log(`Total HS codes processed: ${totalCount}`);
    console.log(`  ✓ Inserted: ${insertedCount}`);
    console.log(`  ✓ Updated: ${updatedCount}`);
    if (skippedCount > 0) {
      console.log(`  ⚠️  Skipped: ${skippedCount}`);
    }
    if (errorCount > 0) {
      console.log(`  ❌ Errors: ${errorCount}`);
    }
    console.log('');
    console.log('Category breakdown:');
    const sortedCategories = Object.keys(categoryCounts).sort();
    for (const cat of sortedCategories) {
      console.log(`  ${cat}: ${categoryCounts[cat]}`);
    }
    console.log('');

    process.exit(0);
  } catch (error) {
    await db.query('ROLLBACK');
    console.error('');
    console.error('='.repeat(60));
    console.error('❌ HS CODE SEEDING FAILED');
    console.error('='.repeat(60));
    console.error('');
    console.error('Error:', error.message);
    if (error.stack) {
      console.error('');
      console.error('Stack trace:');
      console.error(error.stack);
    }
    console.error('');
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  seedHsCodes()
    .catch((error) => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = { seedHsCodes };

