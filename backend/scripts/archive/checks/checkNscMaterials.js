/**
 * Check NSC Tenant Materials
 * 
 * Diagnoses why NSC tenant has no materials visible
 */

require('dotenv').config();
const { connectMigrationDb } = require('../src/db/supabaseClient');

async function checkNscMaterials() {
  const db = await connectMigrationDb();
  
  try {
    console.log('='.repeat(60));
    console.log('NSC Tenant Materials Diagnostic');
    console.log('='.repeat(60));
    console.log('');
    
    // Step 1: Find NSC tenant
    console.log('[1/5] Finding NSC tenant...');
    const tenantResult = await db.query(
      "SELECT id, code, name FROM tenants WHERE LOWER(code) = 'nsc'"
    );
    
    if (tenantResult.rows.length === 0) {
      console.log('❌ NSC tenant not found in database');
      await db.end();
      return;
    }
    
    const nscTenant = tenantResult.rows[0];
    console.log(`✓ Found NSC tenant: ${nscTenant.code} (${nscTenant.name})`);
    console.log(`  ID: ${nscTenant.id}`);
    console.log('');
    
    // Step 2: Check if materials table has tenant_id column
    console.log('[2/5] Checking materials table schema...');
    const schemaCheck = await db.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'materials' AND column_name = 'tenant_id'
    `);
    
    if (schemaCheck.rows.length === 0) {
      console.log('❌ materials table does NOT have tenant_id column');
      console.log('   → Migration 058 may not have run');
      console.log('');
    } else {
      console.log('✓ materials table has tenant_id column');
      console.log(`  Type: ${schemaCheck.rows[0].data_type}`);
      console.log(`  Nullable: ${schemaCheck.rows[0].is_nullable}`);
      console.log('');
    }
    
    // Step 3: Count materials for NSC tenant
    console.log('[3/5] Counting materials for NSC tenant...');
    const countResult = await db.query(
      'SELECT COUNT(*) as count FROM materials WHERE tenant_id = $1',
      [nscTenant.id]
    );
    const materialCount = parseInt(countResult.rows[0].count, 10);
    console.log(`✓ Materials count for NSC: ${materialCount}`);
    console.log('');
    
    // Step 4: Check for materials without tenant_id (legacy)
    console.log('[4/5] Checking for legacy materials (no tenant_id)...');
    const legacyCountResult = await db.query(
      'SELECT COUNT(*) as count FROM materials WHERE tenant_id IS NULL'
    );
    const legacyCount = parseInt(legacyCountResult.rows[0].count, 10);
    console.log(`✓ Legacy materials (tenant_id IS NULL): ${legacyCount}`);
    console.log('');
    
    // Step 5: Sample materials for NSC
    console.log('[5/5] Sample materials for NSC tenant...');
    if (materialCount > 0) {
      const sampleResult = await db.query(
        `SELECT material_code, category, spec_standard, grade 
         FROM materials 
         WHERE tenant_id = $1 
         ORDER BY category, material_code 
         LIMIT 10`,
        [nscTenant.id]
      );
      console.log(`✓ Found ${sampleResult.rows.length} sample materials:`);
      sampleResult.rows.forEach((mat, idx) => {
        console.log(`  ${idx + 1}. ${mat.material_code} (${mat.category})`);
      });
    } else {
      console.log('⚠️  No materials found for NSC tenant');
      console.log('');
      console.log('Possible causes:');
      console.log('  1. Materials were never seeded for NSC tenant');
      console.log('  2. Materials exist but with different tenant_id');
      console.log('  3. Migration 058 may have failed to duplicate materials');
      console.log('');
      console.log('Solutions:');
      console.log('  1. Run: node scripts/seed_mto_wphpdn_pages26_32.js nsc');
      console.log('  2. Check migration 058 status');
      console.log('  3. Verify tenant_id matches in materials table');
    }
    console.log('');
    
    // Summary
    console.log('='.repeat(60));
    console.log('Summary');
    console.log('='.repeat(60));
    console.log(`NSC Tenant ID: ${nscTenant.id}`);
    console.log(`Materials for NSC: ${materialCount}`);
    console.log(`Legacy materials (no tenant): ${legacyCount}`);
    console.log(`Has tenant_id column: ${schemaCheck.rows.length > 0 ? 'YES' : 'NO'}`);
    console.log('');
    
    if (materialCount === 0) {
      console.log('⚠️  ACTION REQUIRED: NSC tenant has no materials');
      console.log('   Run the seeder: npm run seed:mto:wphpdn');
    } else {
      console.log('✓ NSC tenant has materials in database');
      console.log('   If not visible in UI, check API/frontend filtering');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await db.end();
  }
}

// Run if called directly
if (require.main === module) {
  checkNscMaterials()
    .then(() => {
      console.log('Done.');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = { checkNscMaterials };
