/**
 * Quick diagnostic: Check if price agreements exist for MetaSteel
 */

require('dotenv').config();
const { connectMigrationDb } = require('../src/db/supabaseClient');

async function check() {
  const db = await connectMigrationDb();
  const tenantId = '8e7bd2d0-9b6f-40d4-af25-920574e5e45f';
  
  console.log('Checking MetaSteel price agreements...\n');
  
  // Check price agreements
  const pa = await db.query(
    'SELECT id, client_id, category, status, tenant_id, base_price FROM price_agreements WHERE tenant_id = $1',
    [tenantId]
  );
  console.log(`Price Agreements: ${pa.rows.length}`);
  pa.rows.forEach(r => {
    console.log(`  - ID: ${r.id}`);
    console.log(`    Client ID: ${r.client_id}`);
    console.log(`    Category: ${r.category}`);
    console.log(`    Status: ${r.status}`);
    console.log(`    Base Price: ${r.base_price}`);
    console.log('');
  });
  
  // Check clients
  const clients = await db.query(
    'SELECT id, code, name FROM clients WHERE tenant_id = $1',
    [tenantId]
  );
  console.log(`Clients: ${clients.rows.length}`);
  clients.rows.forEach(c => {
    console.log(`  - ${c.code}: ${c.id} (${c.name})`);
  });
  
  await db.end();
}

check().catch(console.error);

