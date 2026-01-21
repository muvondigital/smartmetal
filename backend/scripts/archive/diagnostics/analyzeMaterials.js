require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { connectMigrationDb } = require('../src/db/supabaseClient');

async function analyzeMaterials() {
  const db = await connectMigrationDb();

  try {
    // Get total count
    const totalCount = await db.query('SELECT COUNT(*) as count FROM materials');
    console.log(`\n📊 Total materials: ${totalCount.rows[0].count}\n`);

    // Check if tenant_id column exists
    const tenantIdCheck = await db.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'materials' AND column_name = 'tenant_id';
    `);
    const hasTenantId = tenantIdCheck.rows.length > 0;

    if (hasTenantId) {
      // Group by tenant_id
      const byTenant = await db.query(`
        SELECT 
          tenant_id,
          COUNT(*) as count
        FROM materials
        GROUP BY tenant_id
        ORDER BY tenant_id NULLS LAST;
      `);
      console.log('Materials by tenant_id:');
      byTenant.rows.forEach(row => {
        console.log(`  ${row.tenant_id || 'NULL'}: ${row.count} materials`);
      });

      // Check for duplicates by (tenant_id, material_code)
      const duplicates = await db.query(`
        SELECT 
          tenant_id,
          material_code,
          COUNT(*) as count,
          array_agg(id ORDER BY created_at) as material_ids
        FROM materials
        GROUP BY tenant_id, material_code
        HAVING COUNT(*) > 1
        ORDER BY tenant_id, material_code;
      `);
      
      if (duplicates.rows.length > 0) {
        console.log(`\n⚠️  Found ${duplicates.rows.length} duplicate groups (by tenant_id + material_code):`);
        duplicates.rows.forEach(dup => {
          console.log(`  - ${dup.material_code} (tenant: ${dup.tenant_id || 'NULL'}): ${dup.count} duplicates`);
        });
      }

      // Check for materials with same material_code but different tenant_id
      const sameCodeDiffTenant = await db.query(`
        SELECT 
          material_code,
          COUNT(DISTINCT tenant_id) as tenant_count,
          COUNT(*) as total_count,
          array_agg(DISTINCT tenant_id) as tenant_ids
        FROM materials
        GROUP BY material_code
        HAVING COUNT(DISTINCT tenant_id) > 1
        ORDER BY material_code;
      `);
      
      if (sameCodeDiffTenant.rows.length > 0) {
        console.log(`\n⚠️  Found ${sameCodeDiffTenant.rows.length} materials with same code but different tenants:`);
        sameCodeDiffTenant.rows.forEach(row => {
          console.log(`  - ${row.material_code}: ${row.total_count} total (across ${row.tenant_count} tenants)`);
        });
      }
    } else {
      // Check for duplicates by material_code only
      const duplicates = await db.query(`
        SELECT 
          material_code,
          COUNT(*) as count,
          array_agg(id ORDER BY created_at) as material_ids
        FROM materials
        GROUP BY material_code
        HAVING COUNT(*) > 1
        ORDER BY material_code;
      `);
      
      if (duplicates.rows.length > 0) {
        console.log(`\n⚠️  Found ${duplicates.rows.length} duplicate groups (by material_code):`);
        duplicates.rows.forEach(dup => {
          console.log(`  - ${dup.material_code}: ${dup.count} duplicates`);
        });
      }
    }

    // Show all materials
    const allMaterials = await db.query(`
      SELECT 
        id,
        material_code,
        category,
        tenant_id,
        created_at
      FROM materials
      ORDER BY created_at;
    `);
    
    console.log(`\n📋 All materials (${allMaterials.rows.length}):`);
    allMaterials.rows.forEach((m, i) => {
      console.log(`  ${i + 1}. ${m.material_code} (${m.category}) - tenant: ${m.tenant_id || 'NULL'} - created: ${m.created_at}`);
    });

  } catch (error) {
    console.error('❌ Error analyzing materials:', error);
    throw error;
  } finally {
    await db.end();
  }
}

if (require.main === module) {
  analyzeMaterials()
    .then(() => {
      console.log('\n✅ Analysis complete');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Analysis failed:', error);
      process.exit(1);
    });
}

module.exports = { analyzeMaterials };












