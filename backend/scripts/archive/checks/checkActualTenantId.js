/**
 * Check ACTUAL tenant ID for MetaSteel in database
 */

require('dotenv').config();
const { connectMigrationDb } = require('../src/db/supabaseClient');

async function check() {
  const db = await connectMigrationDb();
  
  console.log('🔍 Checking ACTUAL MetaSteel Tenant ID in Database...\n');
  
  // Get MetaSteel tenant from database
  const tenantResult = await db.query(
    `SELECT id, code, name, is_demo 
     FROM tenants 
     WHERE code = 'metasteel' OR name ILIKE '%metasteel%'
     ORDER BY created_at ASC`
  );
  
  if (tenantResult.rows.length === 0) {
    console.log('❌ NO METASTEEL TENANT FOUND IN DATABASE!\n');
    await db.end();
    return;
  }
  
  console.log(`Found ${tenantResult.rows.length} tenant(s):\n`);
  
  tenantResult.rows.forEach((tenant, idx) => {
    console.log(`Tenant ${idx + 1}:`);
    console.log(`  ID: ${tenant.id}`);
    console.log(`  Code: ${tenant.code}`);
    console.log(`  Name: ${tenant.name}`);
    console.log(`  Is Demo: ${tenant.is_demo}`);
    console.log('');
  });
  
  // Get the PRIMARY one (first one, or the one with is_demo = true)
  const primaryTenant = tenantResult.rows.find(t => t.is_demo === true) || tenantResult.rows[0];
  
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  PRIMARY METASTEEL TENANT ID (USE THIS EVERYWHERE):');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  ${primaryTenant.id}`);
  console.log(`  Code: ${primaryTenant.code}`);
  console.log(`  Name: ${primaryTenant.name}`);
  console.log('═══════════════════════════════════════════════════════════\n');
  
  // Verify data exists for this tenant
  console.log('Verifying data for this tenant:\n');
  
  const checks = [
    { name: 'Price Agreements', query: 'SELECT COUNT(*) as count FROM price_agreements WHERE tenant_id = $1' },
    { name: 'RFQs', query: 'SELECT COUNT(*) as count FROM rfqs WHERE tenant_id = $1' },
    { name: 'Clients', query: 'SELECT COUNT(*) as count FROM clients WHERE tenant_id = $1' },
    { name: 'Materials', query: 'SELECT COUNT(*) as count FROM materials WHERE tenant_id = $1' },
  ];
  
  for (const check of checks) {
    const result = await db.query(check.query, [primaryTenant.id]);
    const count = parseInt(result.rows[0].count);
    console.log(`  ${check.name}: ${count}`);
  }
  
  console.log('\n✅ This is the CORRECT tenant ID to use everywhere.\n');
  
  await db.end();
}

check().catch(console.error);

