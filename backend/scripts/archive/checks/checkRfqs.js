/**
 * Check RFQs for MetaSteel
 */

require('dotenv').config();
const { connectDb, connectMigrationDb } = require('../src/db/supabaseClient');
const { getMetaSteelTenantId } = require('./shared/metasteelTenant');

async function check() {
  const tenantId = await getMetaSteelTenantId();
  
  console.log('🔍 Checking RFQs for MetaSteel...\n');
  console.log(`Tenant ID: ${tenantId}\n`);
  
  // Check with migration pool (bypasses RLS)
  console.log('With Migration Pool (RLS bypassed):');
  const migrationDb = await connectMigrationDb();
  const rfqsMigration = await migrationDb.query(
    `SELECT id, rfq_name, tenant_id FROM rfqs WHERE tenant_id = $1 LIMIT 5`,
    [tenantId]
  );
  console.log(`  Found: ${rfqsMigration.rows.length} RFQs`);
  rfqsMigration.rows.forEach(r => {
    console.log(`    - ${r.rfq_name} (${r.id})`);
  });
  console.log('');
  
  // Check with runtime pool (RLS enforced)
  console.log('With Runtime Pool (RLS enforced):');
  const runtimeDb = await connectDb();
  const rfqsRuntime = await runtimeDb.query(
    `SELECT id, rfq_name, tenant_id FROM rfqs WHERE tenant_id = $1 LIMIT 5`,
    [tenantId]
  );
  console.log(`  Found: ${rfqsRuntime.rows.length} RFQs`);
  rfqsRuntime.rows.forEach(r => {
    console.log(`    - ${r.rfq_name} (${r.id})`);
  });
  console.log('');
  
  if (rfqsMigration.rows.length > 0 && rfqsRuntime.rows.length === 0) {
    console.log('⚠️  RLS is blocking RFQs!');
    console.log('   Migration pool can see them, but runtime pool cannot.\n');
  } else if (rfqsMigration.rows.length === rfqsRuntime.rows.length) {
    console.log('✅ RFQs visible to both pools\n');
  }
  
  await migrationDb.end();
  await runtimeDb.end();
}

check().catch(console.error);

