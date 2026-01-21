require('dotenv').config();
const { connectMigrationDb } = require('../src/db/supabaseClient');

async function testQuery() {
  const db = await connectMigrationDb();
  
  const tenantId = '8e7bd2d0-9b6f-40d4-af25-920574e5e45f';
  const start_date = '2025-09-12';
  const end_date = '2025-12-11';
  
  console.log('\n🔍 Testing dashboard query...\n');
  console.log('Parameters:');
  console.log('  tenant_id:', tenantId);
  console.log('  start_date:', start_date);
  console.log('  end_date:', end_date);
  console.log('\n');
  
  // Test the exact query from analyticsService
  const result = await db.query(`
    SELECT
      COUNT(*) as total_quotes,
      COUNT(*) FILTER (WHERE status = 'draft') as pending_quotes,
      COUNT(*) FILTER (WHERE status = 'approved') as approved_quotes,
      COUNT(*) FILTER (WHERE status = 'rejected') as rejected_quotes
    FROM rfqs
    WHERE tenant_id = $1::uuid 
      AND created_at::date >= $2::date 
      AND created_at::date <= $3::date
  `, [tenantId, start_date, end_date]);
  
  console.log('Result from dashboard query:');
  console.log(result.rows[0]);
  console.log('\n');
  
  // Now test without date filter
  const result2 = await db.query(`
    SELECT
      COUNT(*) as total_quotes,
      MIN(created_at) as earliest,
      MAX(created_at) as latest
    FROM rfqs
    WHERE tenant_id = $1::uuid
  `, [tenantId]);
  
  console.log('All RFQs for tenant (no date filter):');
  console.log(result2.rows[0]);
  console.log('\n');
  
  // Check individual RFQs
  const result3 = await db.query(`
    SELECT 
      id,
      rfq_name,
      created_at,
      created_at::date as created_date,
      created_at::date >= $2::date as matches_start,
      created_at::date <= $3::date as matches_end
    FROM rfqs
    WHERE tenant_id = $1::uuid
    ORDER BY created_at DESC
  `, [tenantId, start_date, end_date]);
  
  console.log('Individual RFQs with date checks:');
  result3.rows.forEach(row => {
    console.log(`  ${row.rfq_name}:`);
    console.log(`    created_at: ${row.created_at}`);
    console.log(`    created_date: ${row.created_date}`);
    console.log(`    >= ${start_date}: ${row.matches_start}`);
    console.log(`    <= ${end_date}: ${row.matches_end}`);
    console.log('');
  });
  
  await db.end();
}

testQuery().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});

