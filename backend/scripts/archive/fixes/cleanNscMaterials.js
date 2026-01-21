/**
 * Clean NSC Materials Database
 * 
 * Removes all materials from NSC tenant to prepare for standard catalog seeding.
 */

require('dotenv').config();
const { connectMigrationDb } = require('../src/db/supabaseClient');

async function cleanNscMaterials() {
  const db = await connectMigrationDb();
  
  try {
    console.log('='.repeat(60));
    console.log('NSC Materials Database Cleanup');
    console.log('='.repeat(60));
    console.log('');
    
    // Find NSC tenant
    console.log('[1/4] Finding NSC tenant...');
    const tenantResult = await db.query(
      "SELECT id, code, name FROM tenants WHERE LOWER(code) = 'nsc'"
    );
    
    if (tenantResult.rows.length === 0) {
      console.log('❌ NSC tenant not found');
      await db.end();
      return;
    }
    
    const nscTenant = tenantResult.rows[0];
    console.log(`✓ Found NSC tenant: ${nscTenant.code} (${nscTenant.name})`);
    console.log(`  ID: ${nscTenant.id}`);
    console.log('');
    
    // Count current materials
    console.log('[2/4] Counting current materials...');
    const countResult = await db.query(
      'SELECT COUNT(*) as count FROM materials WHERE tenant_id = $1',
      [nscTenant.id]
    );
    const materialCount = parseInt(countResult.rows[0].count, 10);
    console.log(`✓ Current materials count: ${materialCount}`);
    console.log('');
    
    if (materialCount === 0) {
      console.log('✓ NSC tenant already has no materials. Nothing to clean.');
      await db.end();
      return;
    }
    
    // Show sample materials
    console.log('[3/4] Sample materials to be deleted:');
    const sampleResult = await db.query(
      `SELECT material_code, category 
       FROM materials 
       WHERE tenant_id = $1 
       ORDER BY category, material_code 
       LIMIT 10`,
      [nscTenant.id]
    );
    
    if (sampleResult.rows.length > 0) {
      sampleResult.rows.forEach((mat, idx) => {
        console.log(`  ${idx + 1}. ${mat.material_code} (${mat.category})`);
      });
      if (materialCount > 10) {
        console.log(`  ... and ${materialCount - 10} more`);
      }
    }
    console.log('');
    
    // Delete all materials
    console.log('[4/4] Deleting all materials...');
    const deleteResult = await db.query(
      'DELETE FROM materials WHERE tenant_id = $1',
      [nscTenant.id]
    );
    
    console.log(`✓ Deleted ${deleteResult.rowCount} materials`);
    console.log('');
    
    // Verify
    const verifyResult = await db.query(
      'SELECT COUNT(*) as count FROM materials WHERE tenant_id = $1',
      [nscTenant.id]
    );
    const remainingCount = parseInt(verifyResult.rows[0].count, 10);
    
    if (remainingCount === 0) {
      console.log('✓ Verification: NSC tenant now has 0 materials');
      console.log('');
      console.log('Ready to build standard catalog!');
    } else {
      console.log(`⚠️  Warning: ${remainingCount} materials still remain`);
    }
    
    console.log('');
    console.log('='.repeat(60));
    console.log('Cleanup Complete');
    console.log('='.repeat(60));
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    throw error;
  } finally {
    await db.end();
  }
}

if (require.main === module) {
  cleanNscMaterials()
    .then(() => {
      console.log('Done.');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = { cleanNscMaterials };
