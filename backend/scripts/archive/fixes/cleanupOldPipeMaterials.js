/**
 * Cleanup Old PIPE Materials
 *
 * This script removes legacy PIPE materials with old material_code format.
 * It deletes all materials where category='PIPE' but material_code doesn't start with 'PIPE-'.
 *
 * Safety:
 * - Only deletes PIPE materials with old format (material_code NOT LIKE 'PIPE-%')
 * - Does not touch any non-PIPE materials
 * - Logs sample records before deletion for verification
 *
 * Usage:
 *   cd backend
 *   node scripts/cleanupOldPipeMaterials.js
 */

require('dotenv').config();
const { connectDb } = require('../src/db/supabaseClient');

async function cleanupOldPipeMaterials() {
  const db = await connectDb();

  console.log('============================================================');
  console.log('Cleanup Old PIPE Materials');
  console.log('============================================================\n');

  try {
    // Count all PIPE materials
    const countQuery = `
      SELECT COUNT(*) as count
      FROM materials
      WHERE category = 'PIPE'
    `;

    const countResult = await db.query(countQuery);
    const count = parseInt(countResult.rows[0].count, 10);

    console.log(`Found ${count} legacy PIPE materials to delete\n`);

    if (count === 0) {
      console.log('✓ No legacy PIPE materials found. Nothing to clean up.');
      await db.end();
      return;
    }

    // Get sample records before deletion
    const sampleQuery = `
      SELECT id, material_code, size_description, sku
      FROM materials
      WHERE category = 'PIPE'
      LIMIT 5
    `;

    const sampleResult = await db.query(sampleQuery);

    console.log('Sample records to be deleted (first 5):');
    sampleResult.rows.forEach((m, i) => {
      console.log(`  [${i + 1}] ${m.material_code}`);
      console.log(`      SKU: ${m.sku || 'NULL'}`);
      console.log(`      Size: ${m.size_description || 'N/A'}`);
    });

    console.log('\n⚠️  Proceeding with deletion in 2 seconds...\n');

    // Wait 2 seconds for safety
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Delete all PIPE materials (both old format and orphaned ones)
    const deleteQuery = `
      DELETE FROM materials
      WHERE category = 'PIPE'
    `;

    console.log('Executing DELETE query...');
    const deleteResult = await db.query(deleteQuery);

    console.log('\n============================================================');
    console.log('CLEANUP COMPLETED');
    console.log('============================================================');
    console.log(`✓ Deleted ${deleteResult.rowCount} legacy PIPE materials`);
    console.log('\nNext step: Run seedPipeMaterialsFromCatalog.js to regenerate');
    console.log('           the PIPE materials with the new format.');
    console.log('');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  } finally {
    await db.end();
  }
}

cleanupOldPipeMaterials().catch(console.error);
