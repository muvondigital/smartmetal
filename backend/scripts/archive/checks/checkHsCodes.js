/**
 * Check HS Codes in Database
 * 
 * This script queries the actual database to see what HS codes exist.
 * Usage: node scripts/checkHsCodes.js
 */

require('dotenv').config();
const { connectDb } = require('../src/db/supabaseClient');

async function checkHsCodes() {
  const db = await connectDb();

  console.log('='.repeat(70));
  console.log('HS CODES DATABASE CHECK');
  console.log('='.repeat(70));
  console.log('');

  try {
    // Get total count
    const countResult = await db.query('SELECT COUNT(*) AS count FROM hs_codes');
    const totalCount = parseInt(countResult.rows[0]?.count || 0, 10);

    console.log(`📊 TOTAL HS CODES: ${totalCount}`);
    console.log('');

    if (totalCount === 0) {
      console.log('⚠️  No HS codes found in the database.');
      console.log('   Run: node scripts/seedDemoRegulatoryData.js to seed demo data');
      console.log('');
      process.exit(0);
    }

    // Get count by source
    const sourceCountResult = await db.query(`
      SELECT source, COUNT(*) AS count 
      FROM hs_codes 
      GROUP BY source 
      ORDER BY source
    `);

    console.log('📋 BREAKDOWN BY SOURCE:');
    console.log('-'.repeat(70));
    sourceCountResult.rows.forEach(row => {
      console.log(`  ${row.source.padEnd(10)} → ${row.count} codes`);
    });
    console.log('');

    // Get count by category
    const categoryCountResult = await db.query(`
      SELECT category, COUNT(*) AS count 
      FROM hs_codes 
      GROUP BY category 
      ORDER BY category
    `);

    console.log('📋 BREAKDOWN BY CATEGORY:');
    console.log('-'.repeat(70));
    categoryCountResult.rows.forEach(row => {
      console.log(`  ${row.category.padEnd(15)} → ${row.count} codes`);
    });
    console.log('');

    // Get all HS codes (limit to first 50 for display)
    const codesResult = await db.query(`
      SELECT hs_code, description, category, material_group, source, created_at
      FROM hs_codes
      ORDER BY hs_code
      LIMIT 50
    `);

    console.log('📋 HS CODES LIST (showing first 50):');
    console.log('-'.repeat(70));
    codesResult.rows.forEach((row, idx) => {
      console.log(`${(idx + 1).toString().padStart(3)}. ${row.hs_code.padEnd(10)} | ${row.category.padEnd(10)} | ${row.material_group.padEnd(15)} | ${row.source}`);
      if (row.description && row.description.length > 80) {
        console.log(`     ${row.description.substring(0, 77)}...`);
      } else if (row.description) {
        console.log(`     ${row.description}`);
      }
      console.log('');
    });

    if (totalCount > 50) {
      console.log(`... and ${totalCount - 50} more codes (not shown)`);
      console.log('');
    }

    console.log('='.repeat(70));
    console.log('✅ Check complete');
    console.log('='.repeat(70));

  } catch (error) {
    console.error('❌ Error checking HS codes:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

// Run the check
checkHsCodes().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
