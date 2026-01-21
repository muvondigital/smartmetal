/**
 * Check for duplicate PIPE material_codes
 */

require('dotenv').config();
const { connectDb } = require('../src/db/supabaseClient');

async function checkPipeDuplicates() {
  const db = await connectDb();

  try {
    // Check for duplicates in the new format
    const duplicatesQuery = `
      SELECT material_code, COUNT(*) as count
      FROM materials
      WHERE category = 'PIPE' AND material_code LIKE 'PIPE-%'
      GROUP BY material_code
      HAVING COUNT(*) > 1
      ORDER BY count DESC
      LIMIT 30
    `;

    const duplicatesResult = await db.query(duplicatesQuery);

    console.log('============================================================');
    console.log('Duplicate PIPE material_codes (new PIPE- format)');
    console.log('============================================================\n');

    if (duplicatesResult.rows.length === 0) {
      console.log('✓ No duplicates found in new format\n');
    } else {
      console.log('Found duplicates:');
      duplicatesResult.rows.forEach((r, i) => {
        console.log(`  [${i + 1}] ${r.material_code}: ${r.count} copies`);
      });
      console.log('');

      // Get details of first duplicate
      if (duplicatesResult.rows.length > 0) {
        const firstDupe = duplicatesResult.rows[0].material_code;
        const detailsQuery = `
          SELECT id, material_code, sku, pipe_id, pipe_grade_id, created_at
          FROM materials
          WHERE material_code = $1
          ORDER BY created_at
        `;

        const detailsResult = await db.query(detailsQuery, [firstDupe]);

        console.log(`\nDetails for first duplicate (${firstDupe}):`);
        detailsResult.rows.forEach((r, i) => {
          console.log(`  [${i + 1}] ID: ${r.id}`);
          console.log(`      SKU: ${r.sku}`);
          console.log(`      Created: ${r.created_at}`);
          console.log('');
        });
      }
    }

    // Check total PIPE materials
    const countQuery = `
      SELECT COUNT(*) as total FROM materials WHERE category = 'PIPE'
    `;
    const countResult = await db.query(countQuery);
    console.log(`Total PIPE materials: ${countResult.rows[0].total}`);

    await db.end();
  } catch (error) {
    console.error('❌ Error:', error.message);
    await db.end();
    process.exit(1);
  }
}

checkPipeDuplicates().catch(console.error);
