/**
 * Seed Script for PDK 2025 Tariff Keywords
 *
 * Seeds tariff keyword mappings from Malaysian PDK 2025 schedule.
 * This data maps SmartMetal material keywords (pipe, flange, fitting, etc.)
 * to relevant HS code chapters for customs classification.
 *
 * Data source: backend/src/db/seeds/pdk2025_tariff_keywords.ts
 * Created: 2025-12-03
 *
 * Usage:
 *   node backend/scripts/seedTariffKeywords.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { connectDb } = require('../src/db/supabaseClient');

// Import tariff keyword data
// Note: We require the TypeScript file directly - Node.js will handle it if ts-node is available
// Otherwise, we'll need to transpile or use require hooks
let PDK2025_TARIFF_KEYWORDS;
try {
  // Try to load compiled JS version first (if it exists)
  PDK2025_TARIFF_KEYWORDS = require('../src/db/seeds/pdk2025_tariff_keywords.js').PDK2025_TARIFF_KEYWORDS;
} catch (e) {
  try {
    // Try to load TS version with ts-node
    require('ts-node/register');
    PDK2025_TARIFF_KEYWORDS = require('../src/db/seeds/pdk2025_tariff_keywords.ts').PDK2025_TARIFF_KEYWORDS;
  } catch (e2) {
    // Inline the data as fallback
    console.log('⚠️  Could not load TypeScript file. Using inline data.');
    // For now, we'll just throw an error and require manual compilation
    console.error('❌ Please compile the TypeScript seed file first or install ts-node.');
    console.error('   Run: npm install --save-dev ts-node');
    process.exit(1);
  }
}

async function seedTariffKeywords() {
  console.log('='.repeat(60));
  console.log('SEEDING PDK 2025 TARIFF KEYWORD MAPPINGS');
  console.log('='.repeat(60));
  console.log('');
  console.log(`Total keywords to seed: ${PDK2025_TARIFF_KEYWORDS.length}`);
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
    await db.query('BEGIN');

    console.log('📋 Inserting tariff keyword mappings...');

    let insertedCount = 0;
    let skippedCount = 0;

    for (const keyword of PDK2025_TARIFF_KEYWORDS) {
      const result = await db.query(
        `INSERT INTO tariff_keyword_groups (
          keyword,
          schedule_code,
          country,
          hs_chapters,
          example_hs_codes,
          source,
          notes,
          is_active
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (keyword, schedule_code, country)
        DO UPDATE SET
          hs_chapters = EXCLUDED.hs_chapters,
          example_hs_codes = EXCLUDED.example_hs_codes,
          source = EXCLUDED.source,
          notes = EXCLUDED.notes,
          is_active = EXCLUDED.is_active,
          updated_at = NOW()
        RETURNING id`,
        [
          keyword.keyword,
          keyword.schedule_code,
          keyword.country,
          JSON.stringify(keyword.hs_chapters),
          JSON.stringify(keyword.example_hs_codes),
          keyword.source,
          keyword.notes || null,
          keyword.is_active
        ]
      );

      if (result.rowCount > 0) {
        insertedCount++;
        console.log(`  ✓ ${keyword.keyword} (${keyword.hs_chapters.length} chapters)`);
      } else {
        skippedCount++;
      }
    }

    await db.query('COMMIT');

    console.log('');
    console.log('='.repeat(60));
    console.log('SEED SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ Inserted/Updated: ${insertedCount}`);
    if (skippedCount > 0) {
      console.log(`⚠️  Skipped (duplicates): ${skippedCount}`);
    }
    console.log('');
    console.log('✅ Tariff keyword seeding completed successfully!');
    console.log('');

    // Display some statistics
    const statsResult = await db.query(`
      SELECT
        COUNT(*) as total_keywords,
        COUNT(DISTINCT schedule_code) as schedules,
        COUNT(DISTINCT country) as countries,
        SUM((hs_chapters::jsonb) - 0) as total_chapters
      FROM tariff_keyword_groups
      WHERE is_active = true
    `);

    const stats = statsResult.rows[0];
    console.log('Database Statistics:');
    console.log(`  Total active keywords: ${stats.total_keywords}`);
    console.log(`  Schedules: ${stats.schedules}`);
    console.log(`  Countries: ${stats.countries}`);
    console.log('');

  } catch (error) {
    await db.query('ROLLBACK');
    console.error('');
    console.error('❌ Error seeding tariff keywords:', error);
    console.error('');
    console.error('Transaction rolled back. No changes were made.');
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  seedTariffKeywords()
    .then(() => {
      console.log('Seed script completed.');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = { seedTariffKeywords };
