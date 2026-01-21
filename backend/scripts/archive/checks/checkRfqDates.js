require('dotenv').config();
const { connectMigrationDb } = require('../src/db/supabaseClient');

async function checkRfqDates() {
  const db = await connectMigrationDb();
  
  const tenantId = '8e7bd2d0-9b6f-40d4-af25-920574e5e45f';
  
  console.log('Checking RFQs in database...\n');
  
  const result = await db.query(`
    SELECT 
      id,
      rfq_code,
      rfq_name,
      status,
      created_at,
      tenant_id
    FROM rfqs
    WHERE tenant_id = $1
    ORDER BY created_at DESC
  `, [tenantId]);
  
  console.log(`Found ${result.rows.length} RFQs:\n`);
  
  result.rows.forEach(row => {
    console.log(`  ${row.rfq_code || 'NO CODE'}: ${row.rfq_name || 'NO NAME'}`);
    console.log(`    Status: ${row.status}`);
    console.log(`    Created: ${row.created_at}`);
    console.log(`    Tenant: ${row.tenant_id}`);
    console.log('');
  });
  
  // Check what the analytics query would return
  const today = new Date();
  const ninetyDaysAgo = new Date(today);
  ninetyDaysAgo.setDate(today.getDate() - 90);
  
  console.log('\n📊 Analytics Query Test:');
  console.log(`  Date range: ${ninetyDaysAgo.toISOString().split('T')[0]} to ${today.toISOString().split('T')[0]}\n`);
  
  const analyticsResult = await db.query(`
    SELECT
      COUNT(*) as total_quotes,
      COUNT(*) FILTER (WHERE status = 'draft') as pending_quotes,
      COUNT(*) FILTER (WHERE status = 'approved') as approved_quotes,
      COUNT(*) FILTER (WHERE status = 'rejected') as rejected_quotes
    FROM rfqs
    WHERE tenant_id = $1::uuid 
      AND created_at::date >= $2::date 
      AND created_at::date <= $3::date
  `, [tenantId, ninetyDaysAgo.toISOString().split('T')[0], today.toISOString().split('T')[0]]);
  
  console.log('  Analytics query result:');
  console.log(`    Total: ${analyticsResult.rows[0].total_quotes}`);
  console.log(`    Pending: ${analyticsResult.rows[0].pending_quotes}`);
  console.log(`    Approved: ${analyticsResult.rows[0].approved_quotes}`);
  console.log(`    Rejected: ${analyticsResult.rows[0].rejected_quotes}`);
  
  await db.end();
}

checkRfqDates().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});

