/**
 * Test materials lookup for MetaSteel RFQ items
 */

require('dotenv').config();
const { connectMigrationDb } = require('../src/db/supabaseClient');
const { getMaterialsByCodes } = require('../src/services/materialsService');
const { getMetaSteelTenantId } = require('./shared/metasteelTenant');

async function test() {
  const db = await connectMigrationDb();
  const tenantId = await getMetaSteelTenantId(db);
  
  console.log('🧪 Testing Materials Lookup for MetaSteel...\n');
  console.log(`Tenant ID: ${tenantId}\n`);
  
  // Get RFQ items from a MetaSteel RFQ
  const rfqResult = await db.query(
    `SELECT id, rfq_name FROM rfqs WHERE tenant_id = $1 LIMIT 1`,
    [tenantId]
  );
  
  if (rfqResult.rows.length === 0) {
    console.log('❌ No RFQs found for MetaSteel');
    await db.end();
    return;
  }
  
  const rfqId = rfqResult.rows[0].id;
  console.log(`✓ Found RFQ: ${rfqResult.rows[0].rfq_name} (${rfqId})\n`);
  
  // Get RFQ items
  const itemsResult = await db.query(
    `SELECT material_code FROM rfq_items WHERE rfq_id = $1 AND material_code IS NOT NULL`,
    [rfqId]
  );
  
  const materialCodes = itemsResult.rows.map(r => r.material_code);
  console.log(`RFQ Items with material_code: ${materialCodes.length}`);
  materialCodes.forEach(code => console.log(`  - ${code}`));
  console.log('');
  
  // Test materials lookup
  console.log('Testing getMaterialsByCodes()...');
  const materialsMap = await getMaterialsByCodes(materialCodes, tenantId);
  
  console.log(`\n✓ Found ${materialsMap.size} material(s):`);
  for (const [code, material] of materialsMap.entries()) {
    console.log(`  - ${code}: ${material.category} (${material.base_cost} ${material.currency})`);
  }
  
  const missing = materialCodes.filter(code => !materialsMap.has(code));
  if (missing.length > 0) {
    console.log(`\n❌ Missing materials (${missing.length}):`);
    missing.forEach(code => console.log(`  - ${code}`));
    console.log('\n⚠️  These materials will use default pricing in pricing runs.\n');
  } else {
    console.log('\n✅ All materials found! Pricing runs should work correctly.\n');
  }
  
  await db.end();
}

test().catch(console.error);

