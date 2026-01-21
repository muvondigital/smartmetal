/**
 * Remove Duplicate Materials Script
 *
 * This script removes duplicate materials that were created by the automatic
 * seedMaterials() function that ran on every server startup.
 *
 * Strategy:
 * - Keep materials for NSC Sinergi (6e783cd4-167d-407e-acd3-2635c1ea02ca) - 5 materials
 * - Keep materials for MetaSteel (8e7bd2d0-9b6f-40d4-af25-920574e5e45f) - 12 materials
 * - Remove materials for NSC Sinergi Sdn Bhd (b449bdd1-a9d2-4a20-afa2-979316c9ef0e) - 5 duplicates
 * - Remove materials for MVD Dev (c2b7adb7-4478-4e23-89e9-039c0e63c767) - 5 duplicates
 *
 * The 5 duplicate materials in MetaSteel will be kept as they are part of MetaSteel's catalog.
 */

require('dotenv').config();
const { getMigrationPool } = require('../src/db/supabaseClient');

const TENANTS_TO_REMOVE_MATERIALS = [
  'b449bdd1-a9d2-4a20-afa2-979316c9ef0e', // NSC Sinergi Sdn Bhd
  'c2b7adb7-4478-4e23-89e9-039c0e63c767'  // MVD Dev
];

async function removeDuplicateMaterials() {
  const pool = getMigrationPool();

  console.log('🧹 Starting duplicate materials cleanup...\n');

  try {
    // First, show current state
    console.log('📊 Current materials count by tenant:');
    const currentCount = await pool.query(`
      SELECT t.name, t.id, COUNT(m.id) as material_count
      FROM tenants t
      LEFT JOIN materials m ON m.tenant_id = t.id
      GROUP BY t.id, t.name
      ORDER BY t.name
    `);
    currentCount.rows.forEach(row => {
      console.log(`  - ${row.name}: ${row.material_count} materials`);
    });

    console.log('\n🗑️  Removing materials from duplicate tenants...');

    for (const tenantId of TENANTS_TO_REMOVE_MATERIALS) {
      // Get tenant name
      const tenantResult = await pool.query(
        'SELECT name FROM tenants WHERE id = $1',
        [tenantId]
      );

      if (tenantResult.rows.length === 0) {
        console.log(`  ⚠️  Tenant ${tenantId} not found, skipping...`);
        continue;
      }

      const tenantName = tenantResult.rows[0].name;

      // Get materials to be deleted
      const materialsToDelete = await pool.query(
        'SELECT id, material_code FROM materials WHERE tenant_id = $1',
        [tenantId]
      );

      if (materialsToDelete.rows.length === 0) {
        console.log(`  ⊙ No materials to delete for ${tenantName}`);
        continue;
      }

      console.log(`  Deleting ${materialsToDelete.rows.length} materials from ${tenantName}:`);
      materialsToDelete.rows.forEach(m => {
        console.log(`    - ${m.material_code} (${m.id})`);
      });

      // Delete materials
      const deleteResult = await pool.query(
        'DELETE FROM materials WHERE tenant_id = $1',
        [tenantId]
      );

      console.log(`  ✓ Deleted ${deleteResult.rowCount} materials from ${tenantName}\n`);
    }

    // Show final state
    console.log('📊 Final materials count by tenant:');
    const finalCount = await pool.query(`
      SELECT t.name, t.id, COUNT(m.id) as material_count
      FROM tenants t
      LEFT JOIN materials m ON m.tenant_id = t.id
      GROUP BY t.id, t.name
      ORDER BY t.name
    `);
    finalCount.rows.forEach(row => {
      console.log(`  - ${row.name}: ${row.material_count} materials`);
    });

    console.log('\n✅ Duplicate materials cleanup completed successfully!');
    console.log('\n💡 Summary:');
    console.log('  - NSC Sinergi: Should have 5 materials');
    console.log('  - MetaSteel: Should have 17 materials (12 unique + 5 common)');
    console.log('  - NSC Sinergi Sdn Bhd: Materials removed (duplicates)');
    console.log('  - MVD Dev: Materials removed (duplicates)');
    console.log('\n⚠️  Note: The backend server has been updated to prevent future duplicates.');
    console.log('   seedMaterials() will no longer run automatically on server startup.');

  } catch (error) {
    console.error('\n❌ Error during cleanup:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run if called directly
if (require.main === module) {
  removeDuplicateMaterials()
    .then(() => {
      console.log('\n✅ Script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Script failed:', error);
      process.exit(1);
    });
}

module.exports = { removeDuplicateMaterials };
