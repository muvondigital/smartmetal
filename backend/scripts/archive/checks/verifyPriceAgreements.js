/**
 * Verify Price Agreements for MetaSteel
 */

require('dotenv').config();
const { connectMigrationDb } = require('../src/db/supabaseClient');
const { getMetaSteelTenantId } = require('./shared/metasteelTenant');

async function verify() {
  const db = await connectMigrationDb();
  const tenantId = await getMetaSteelTenantId(db);
  
  console.log('🔍 Verifying MetaSteel Price Agreements...\n');
  console.log(`Tenant ID: ${tenantId}\n`);
  
  // Get price agreements
  const pa = await db.query(
    `SELECT 
      pa.id, 
      pa.tenant_id,
      pa.client_id, 
      pa.category, 
      pa.status, 
      pa.base_price,
      pa.currency,
      pa.valid_from,
      pa.valid_until,
      c.code as client_code,
      c.name as client_name
    FROM price_agreements pa
    LEFT JOIN clients c ON pa.client_id = c.id
    WHERE pa.tenant_id = $1
    ORDER BY pa.created_at DESC`,
    [tenantId]
  );
  
  console.log(`✅ Found ${pa.rows.length} price agreement(s):\n`);
  
  if (pa.rows.length === 0) {
    console.log('❌ NO PRICE AGREEMENTS FOUND!');
    await db.end();
    process.exit(1);
  }
  
  for (const agreement of pa.rows) {
    console.log(`  Agreement ID: ${agreement.id}`);
    console.log(`  Client: ${agreement.client_code || 'N/A'} (${agreement.client_name || 'N/A'})`);
    console.log(`  Client ID: ${agreement.client_id}`);
    console.log(`  Category: ${agreement.category || 'N/A'}`);
    console.log(`  Status: ${agreement.status}`);
    console.log(`  Base Price: ${agreement.currency} ${agreement.base_price}`);
    console.log(`  Valid From: ${agreement.valid_from}`);
    console.log(`  Valid Until: ${agreement.valid_until}`);
    console.log(`  Tenant ID: ${tenantId}`);
    console.log('');
  }
  
  // Verify tenant_id matches
  const allMatch = pa.rows.every(pa => pa.tenant_id === tenantId);
  if (!allMatch) {
    console.log('❌ ERROR: Some agreements have wrong tenant_id!');
    await db.end();
    process.exit(1);
  }
  
  console.log('✅ All agreements have correct tenant_id');
  console.log('✅ Verification PASSED\n');
  
  await db.end();
}

verify().catch(err => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});

