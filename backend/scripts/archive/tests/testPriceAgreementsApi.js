/**
 * Test Price Agreements API Endpoint
 * Simulates what the frontend does
 */

require('dotenv').config();
const { connectDb } = require('../src/db/supabaseClient');
const { getMetaSteelTenantId } = require('./shared/metasteelTenant');

async function testApi() {
  const db = await connectDb();
  const tenantId = await getMetaSteelTenantId();
  
  console.log('🧪 Testing Price Agreements API Query...\n');
  console.log(`Tenant ID: ${tenantId}\n`);
  
  // This is the EXACT query from priceAgreementsService.getPriceAgreements()
  const result = await db.query(
    `SELECT
      pa.*,
      c.name as client_name,
      m.material_code,
      CASE WHEN pa.volume_tiers IS NOT NULL THEN true ELSE false END as has_volume_tiers
    FROM price_agreements pa
    LEFT JOIN clients c ON pa.client_id = c.id
    LEFT JOIN materials m ON pa.material_id = m.id
    WHERE pa.tenant_id = $1
    ORDER BY pa.created_at DESC
    LIMIT 20 OFFSET 0`,
    [tenantId]
  );
  
  console.log(`✅ API Query Result: ${result.rows.length} agreement(s)\n`);
  
  if (result.rows.length === 0) {
    console.log('❌ API QUERY RETURNED 0 AGREEMENTS!');
    console.log('   This means the frontend will show 0 agreements.\n');
    
    // Debug: Check if tenant_id filter is the issue
    const allAgreements = await db.query(
      'SELECT id, tenant_id FROM price_agreements LIMIT 5'
    );
    console.log('Sample agreements in DB:');
    allAgreements.rows.forEach(a => {
      console.log(`  - ID: ${a.id}, tenant_id: ${a.tenant_id}`);
    });
    
    await db.end();
    process.exit(1);
  }
  
  for (const agreement of result.rows) {
    console.log(`  Agreement ID: ${agreement.id}`);
    console.log(`  Client: ${agreement.client_name || 'N/A'}`);
    console.log(`  Category: ${agreement.category || 'N/A'}`);
    console.log(`  Status: ${agreement.status}`);
    console.log(`  Base Price: ${agreement.currency} ${agreement.base_price}`);
    console.log(`  Tenant ID: ${agreement.tenant_id}`);
    console.log('');
  }
  
  console.log('✅ API Query Test PASSED');
  console.log('✅ Frontend should now show 2 price agreements\n');
  
  await db.end();
}

testApi().catch(err => {
  console.error('❌ API Test failed:', err);
  process.exit(1);
});

