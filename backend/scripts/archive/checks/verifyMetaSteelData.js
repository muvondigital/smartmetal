/**
 * Verify MetaSteel Data Integrity
 * 
 * Checks that all MetaSteel data is properly connected and visible.
 * Run this after any upgrade or change to ensure nothing broke.
 * 
 * Usage: npm run verify:metasteel
 */

require('dotenv').config();
const { connectMigrationDb } = require('../src/db/supabaseClient');

async function verifyMetaSteelData() {
  const db = await connectMigrationDb();
  
  console.log('\n🔍 MetaSteel Data Integrity Check\n');
  console.log('═'.repeat(60));
  
  // 1. Check tenant exists
  const tenantResult = await db.query(
    `SELECT id, code, name FROM tenants WHERE UPPER(code) = 'METASTEEL' LIMIT 1`
  );
  
  if (tenantResult.rows.length === 0) {
    console.log('❌ CRITICAL: MetaSteel tenant not found!');
    process.exit(1);
  }
  
  const tenantId = tenantResult.rows[0].id;
  console.log(`✓ Tenant exists: ${tenantResult.rows[0].code}`);
  console.log(`  ID: ${tenantId}\n`);
  
  // 2. Check users
  const users = await db.query(
    `SELECT email, role FROM users WHERE tenant_id = $1`,
    [tenantId]
  );
  console.log(`✓ Users: ${users.rows.length}`);
  users.rows.forEach(u => console.log(`  • ${u.email} (${u.role})`));
  
  // 3. Check clients
  const clients = await db.query(
    `SELECT id, name FROM clients WHERE tenant_id = $1`,
    [tenantId]
  );
  console.log(`\n✓ Clients: ${clients.rows.length}`);
  
  // 4. Check projects
  const projects = await db.query(
    `SELECT id, name FROM projects WHERE tenant_id = $1`,
    [tenantId]
  );
  console.log(`✓ Projects: ${projects.rows.length}`);
  
  // 5. Check RFQs
  const rfqs = await db.query(
    `SELECT id, rfq_code, rfq_name, status, created_at FROM rfqs WHERE tenant_id = $1 ORDER BY created_at DESC`,
    [tenantId]
  );
  console.log(`\n✓ RFQs: ${rfqs.rows.length}`);
  rfqs.rows.forEach(r => console.log(`  • ${r.rfq_code}: ${r.rfq_name} (${r.status})`));
  
  // 6. Check RFQ items
  const rfqItems = await db.query(
    `SELECT COUNT(*) as count FROM rfq_items WHERE tenant_id = $1`,
    [tenantId]
  );
  console.log(`\n✓ RFQ Items: ${rfqItems.rows[0].count}`);
  
  // Check items per RFQ
  for (const rfq of rfqs.rows) {
    const items = await db.query(
      `SELECT COUNT(*) as count FROM rfq_items WHERE rfq_id = $1 AND tenant_id = $2`,
      [rfq.id, tenantId]
    );
    console.log(`  • ${rfq.rfq_code}: ${items.rows[0].count} items`);
  }
  
  // 7. Check pricing runs
  const pricingRuns = await db.query(
    `SELECT id, rfq_id, approval_status, total_price FROM pricing_runs WHERE tenant_id = $1`,
    [tenantId]
  );
  console.log(`\n✓ Pricing Runs: ${pricingRuns.rows.length}`);
  pricingRuns.rows.forEach(pr => {
    const rfq = rfqs.rows.find(r => r.id === pr.rfq_id);
    console.log(`  • ${rfq?.rfq_code}: ${pr.approval_status} - $${parseFloat(pr.total_price).toFixed(2)}`);
  });
  
  // 8. Check price agreements
  const agreements = await db.query(
    `SELECT COUNT(*) as count FROM price_agreements WHERE tenant_id = $1`,
    [tenantId]
  );
  console.log(`\n✓ Price Agreements: ${agreements.rows[0].count}`);
  
  // 9. Dashboard visibility check
  const today = new Date();
  const ninetyDaysAgo = new Date(today);
  ninetyDaysAgo.setDate(today.getDate() - 90);
  
  const dashboardRfqs = await db.query(
    `SELECT COUNT(*) as count FROM rfqs 
     WHERE tenant_id = $1 
     AND created_at >= $2`,
    [tenantId, ninetyDaysAgo.toISOString()]
  );
  
  console.log(`\n📊 Dashboard Visibility Check:`);
  console.log(`  • RFQs in last 90 days: ${dashboardRfqs.rows[0].count}`);
  console.log(`  • Date range: ${ninetyDaysAgo.toISOString().split('T')[0]} to ${today.toISOString().split('T')[0]}`);
  
  if (parseInt(dashboardRfqs.rows[0].count) === 0) {
    console.log('\n⚠️  WARNING: No RFQs found in dashboard date range!');
    console.log('   Dashboard will show 0 quotes.');
  }
  
  console.log('\n' + '═'.repeat(60));
  console.log('✅ Verification complete!\n');
  
  await db.end();
}

verifyMetaSteelData().catch(err => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});

