/**
 * Check ALL tenants in database and explain what they are
 */

require('dotenv').config();
const { connectMigrationDb } = require('../src/db/supabaseClient');

async function checkTenants() {
  const db = await connectMigrationDb();
  
  console.log('🔍 CHECKING ALL TENANTS IN DATABASE...\n');
  
  const tenants = await db.query(`
    SELECT 
      id, 
      code, 
      name, 
      is_active, 
      is_demo,
      created_at,
      updated_at
    FROM tenants
    ORDER BY created_at ASC
  `);
  
  console.log(`Found ${tenants.rows.length} tenant(s):\n`);
  console.log('═══════════════════════════════════════════════════════════');
  
  tenants.rows.forEach((tenant, idx) => {
    console.log(`\nTenant ${idx + 1}:`);
    console.log(`  ID: ${tenant.id}`);
    console.log(`  Code: "${tenant.code}"`);
    console.log(`  Name: ${tenant.name}`);
    console.log(`  Active: ${tenant.is_active}`);
    console.log(`  Demo: ${tenant.is_demo}`);
    console.log(`  Created: ${tenant.created_at}`);
    console.log(`  Updated: ${tenant.updated_at}`);
  });
  
  console.log('\n═══════════════════════════════════════════════════════════\n');
  
  // Check for duplicates (case-insensitive)
  const duplicateCodes = await db.query(`
    SELECT UPPER(code) as code_upper, COUNT(*) as count, 
           array_agg(code ORDER BY code) as codes, 
           array_agg(id ORDER BY code) as ids
    FROM tenants
    GROUP BY UPPER(code)
    HAVING COUNT(*) > 1
  `);
  
  if (duplicateCodes.rows.length > 0) {
    console.log('⚠️  WARNING: DUPLICATE TENANT CODES FOUND!\n');
    duplicateCodes.rows.forEach(dup => {
      console.log(`  - Code "${dup.code_upper}" appears ${dup.count} times:`);
      console.log(`    Codes: ${dup.codes.join(', ')}`);
      console.log(`    IDs: ${dup.ids.join(', ')}`);
      console.log('');
    });
    console.log('⚠️  This could cause tenant resolution issues!');
    console.log('⚠️  Tenant middleware uses UPPER() normalization, so both would match.\n');
  } else {
    console.log('✅ No duplicate tenant codes found\n');
  }
  
  // Check which tenants have data
  console.log('Data counts per tenant:\n');
  for (const tenant of tenants.rows) {
    const counts = await db.query(`
      SELECT 
        (SELECT COUNT(*) FROM rfqs WHERE tenant_id = $1) as rfqs,
        (SELECT COUNT(*) FROM price_agreements WHERE tenant_id = $1) as price_agreements,
        (SELECT COUNT(*) FROM clients WHERE tenant_id = $1) as clients,
        (SELECT COUNT(*) FROM materials WHERE tenant_id = $1) as materials,
        (SELECT COUNT(*) FROM pricing_runs WHERE tenant_id = $1) as pricing_runs
    `, [tenant.id]);
    
    const c = counts.rows[0];
    console.log(`${tenant.code} (${tenant.id.substring(0, 8)}...):`);
    console.log(`  RFQs: ${c.rfqs}`);
    console.log(`  Price Agreements: ${c.price_agreements}`);
    console.log(`  Clients: ${c.clients}`);
    console.log(`  Materials: ${c.materials}`);
    console.log(`  Pricing Runs: ${c.pricing_runs}`);
    console.log('');
  }
  
  await db.end();
}

checkTenants().catch(console.error);

