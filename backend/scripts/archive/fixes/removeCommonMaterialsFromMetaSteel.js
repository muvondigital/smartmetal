/**
 * Remove Common Materials from MetaSteel
 *
 * MetaSteel should only have its 12 unique materials (prefixed with M-)
 * The 5 common materials (without M- prefix) were added by the automatic seedMaterials()
 * and should be removed.
 */

require('dotenv').config();
const { getMigrationPool } = require('../src/db/supabaseClient');

const METASTEEL_TENANT_ID = '8e7bd2d0-9b6f-40d4-af25-920574e5e45f';

const COMMON_MATERIALS_TO_REMOVE = [
  'BOLT-A325-M20X60',
  'CS-ELBOW-6-SCH40-A234WPB',
  'CS-FLANGE-6-150RF-A105',
  'CS-PIPE-6-SCH40-A106B',
  'CS-PLATE-A516GR70-10MM'
];

async function removeCommonMaterialsFromMetaSteel() {
  const pool = getMigrationPool();

  console.log('🧹 Removing common materials from MetaSteel...\n');

  try {
    // Show current state
    console.log('📊 Current MetaSteel materials:');
    const currentMaterials = await pool.query(
      'SELECT material_code FROM materials WHERE tenant_id = $1 ORDER BY material_code',
      [METASTEEL_TENANT_ID]
    );
    console.log(`  Total: ${currentMaterials.rows.length} materials`);
    currentMaterials.rows.forEach(row => {
      const isCommon = COMMON_MATERIALS_TO_REMOVE.includes(row.material_code);
      console.log(`  ${isCommon ? '❌' : '✓'} ${row.material_code}`);
    });

    console.log('\n🗑️  Removing common materials...');

    for (const materialCode of COMMON_MATERIALS_TO_REMOVE) {
      const result = await pool.query(
        'DELETE FROM materials WHERE tenant_id = $1 AND material_code = $2 RETURNING id, material_code',
        [METASTEEL_TENANT_ID, materialCode]
      );

      if (result.rows.length > 0) {
        console.log(`  ✓ Deleted: ${materialCode} (${result.rows[0].id})`);
      } else {
        console.log(`  ⊙ Not found: ${materialCode}`);
      }
    }

    // Show final state
    console.log('\n📊 Final MetaSteel materials:');
    const finalMaterials = await pool.query(
      'SELECT material_code FROM materials WHERE tenant_id = $1 ORDER BY material_code',
      [METASTEEL_TENANT_ID]
    );
    console.log(`  Total: ${finalMaterials.rows.length} materials (should be 12)`);
    finalMaterials.rows.forEach(row => {
      console.log(`  ✓ ${row.material_code}`);
    });

    console.log('\n✅ Cleanup completed successfully!');
    console.log('\n💡 Final state:');
    console.log('  - NSC Sinergi: 5 materials');
    console.log('  - MetaSteel: 12 materials (all prefixed with M-)');

  } catch (error) {
    console.error('\n❌ Error during cleanup:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run if called directly
if (require.main === module) {
  removeCommonMaterialsFromMetaSteel()
    .then(() => {
      console.log('\n✅ Script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Script failed:', error);
      process.exit(1);
    });
}

module.exports = { removeCommonMaterialsFromMetaSteel };
