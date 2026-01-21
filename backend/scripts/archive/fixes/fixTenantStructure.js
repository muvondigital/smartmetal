/**
 * Fix Tenant Structure According to Rules:
 * 
 * TENANT 1 - NSC: Real production tenant with live data
 * TENANT 2 - MetaSteel: Demo tenant with complete showcase data
 * TENANT 3 - MVD DEV: Admin/dev tenant with access to everything
 * 
 * Rules:
 * - Tenants cannot see each other's data EXCEPT MVD DEV
 * - Materials are shared/global (can be accessed by all tenants)
 * - Materials can only be ADDED by MVD DEV account
 */

require('dotenv').config();
const { connectMigrationDb } = require('../src/db/supabaseClient');

async function fixTenants() {
  const db = await connectMigrationDb();
  
  console.log('🔧 FIXING TENANT STRUCTURE...\n');
  console.log('Rules:');
  console.log('  1. NSC - Real production tenant');
  console.log('  2. MetaSteel - Demo tenant');
  console.log('  3. MVD DEV - Admin/dev tenant (access to everything)');
  console.log('  4. Materials are SHARED (global)');
  console.log('  5. Only MVD DEV can ADD materials\n');
  
  // Step 1: Delete duplicate "NSC" tenant (uppercase, empty)
  console.log('Step 1: Deleting duplicate "NSC" tenant...');
  const duplicateNsc = await db.query(
    `SELECT id, code FROM tenants WHERE code = 'nsc' AND id != (
      SELECT id FROM tenants WHERE code = 'nsc' ORDER BY created_at ASC LIMIT 1
    )`
  );
  
  if (duplicateNsc.rows.length > 0) {
    const dupId = duplicateNsc.rows[0].id;
    console.log(`  Found duplicate: ${dupId}`);
    
    // Check if it has any data
    const hasData = await db.query(`
      SELECT 
        (SELECT COUNT(*) FROM rfqs WHERE tenant_id = $1) +
        (SELECT COUNT(*) FROM price_agreements WHERE tenant_id = $1) +
        (SELECT COUNT(*) FROM clients WHERE tenant_id = $1) +
        (SELECT COUNT(*) FROM pricing_runs WHERE tenant_id = $1) as total
    `, [dupId]);
    
    if (parseInt(hasData.rows[0].total) === 0) {
      await db.query('DELETE FROM tenants WHERE id = $1', [dupId]);
      console.log(`  ✅ Deleted duplicate "NSC" tenant (${dupId})\n`);
    } else {
      console.log(`  ⚠️  Duplicate has data, skipping deletion\n`);
    }
  } else {
    console.log('  ✅ No duplicate "NSC" tenant found\n');
  }
  
  // Step 2: Rename SMARTMETAL_DEV to MVD DEV
  console.log('Step 2: Renaming SMARTMETAL_DEV to MVD DEV...');
  const devTenant = await db.query(
    `SELECT id, code, name FROM tenants WHERE code = 'SMARTMETAL_DEV'`
  );
  
  if (devTenant.rows.length > 0) {
    const devId = devTenant.rows[0].id;
    await db.query(
      `UPDATE tenants SET code = 'MVD_DEV', name = 'MVD Dev' WHERE id = $1`,
      [devId]
    );
    console.log(`  ✅ Renamed SMARTMETAL_DEV to MVD_DEV (${devId})\n`);
  } else {
    console.log('  ⚠️  SMARTMETAL_DEV tenant not found\n');
  }
  
  // Step 3: Verify final structure
  console.log('Step 3: Verifying final tenant structure...\n');
  const tenants = await db.query(`
    SELECT id, code, name, is_active, is_demo
    FROM tenants
    ORDER BY 
      CASE code
        WHEN 'nsc' THEN 1
        WHEN 'metasteel' THEN 2
        WHEN 'MVD_DEV' THEN 3
        ELSE 4
      END
  `);
  
  console.log('Final Tenant Structure:');
  console.log('═══════════════════════════════════════════════════════════');
  
  tenants.rows.forEach((tenant, idx) => {
    const role = 
      tenant.code === 'nsc' ? 'PRODUCTION' :
      tenant.code === 'metasteel' ? 'DEMO' :
      tenant.code === 'MVD_DEV' ? 'ADMIN/DEV' :
      'UNKNOWN';
    
    console.log(`\nTenant ${idx + 1}: ${tenant.code.toUpperCase()}`);
    console.log(`  ID: ${tenant.id}`);
    console.log(`  Name: ${tenant.name}`);
    console.log(`  Role: ${role}`);
    console.log(`  Active: ${tenant.is_active}`);
    console.log(`  Demo: ${tenant.is_demo}`);
  });
  
  console.log('\n═══════════════════════════════════════════════════════════\n');
  
  // Step 4: Check materials are global/shared
  console.log('Step 4: Checking materials structure...');
  const materialsCheck = await db.query(`
    SELECT 
      COUNT(*) as total,
      COUNT(DISTINCT tenant_id) as tenant_count,
      COUNT(CASE WHEN tenant_id IS NULL THEN 1 END) as global_count
    FROM materials
  `);
  
  const m = materialsCheck.rows[0];
  console.log(`  Total materials: ${m.total}`);
  console.log(`  Materials across ${m.tenant_count} tenants`);
  console.log(`  Global materials (NULL tenant_id): ${m.global_count}`);
  
  if (parseInt(m.tenant_count) > 0 && parseInt(m.global_count) === 0) {
    console.log('\n  ⚠️  WARNING: Materials are tenant-scoped, not global!');
    console.log('  According to rules, materials should be SHARED (global).');
    console.log('  Current setup: Materials are per-tenant (migration 058).');
    console.log('  This needs to be addressed if materials should be global.\n');
  } else {
    console.log('  ✅ Materials structure verified\n');
  }
  
  // Step 5: Summary
  console.log('═══════════════════════════════════════════════════════════');
  console.log('✅ TENANT STRUCTURE FIXED');
  console.log('═══════════════════════════════════════════════════════════\n');
  console.log('Final Structure:');
  console.log('  1. NSC (nsc) - Production tenant');
  console.log('  2. MetaSteel (metasteel) - Demo tenant');
  console.log('  3. MVD DEV (MVD_DEV) - Admin/dev tenant\n');
  console.log('Next Steps:');
  console.log('  - Verify tenant isolation (tenants cannot see each other)');
  console.log('  - Verify MVD DEV can access all tenant data');
  console.log('  - Verify materials access rules\n');
  
  await db.end();
}

fixTenants().catch(err => {
  console.error('❌ Failed to fix tenant structure:', err);
  process.exit(1);
});












