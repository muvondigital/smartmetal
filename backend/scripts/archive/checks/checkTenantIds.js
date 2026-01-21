require('dotenv').config();
const { getPool } = require('../src/db/supabaseClient');

(async () => {
  const pool = getPool();
  
  const tenants = await pool.query('SELECT id, code, name FROM tenants ORDER BY code');
  console.log('Tenants:');
  tenants.rows.forEach(t => {
    console.log(`  ${t.code}: ${t.id} - ${t.name}`);
  });
  
  const rfqs = await pool.query('SELECT DISTINCT tenant_id, COUNT(*) as count FROM rfqs GROUP BY tenant_id');
  console.log('\nRFQ tenant distribution:');
  rfqs.rows.forEach(r => {
    console.log(`  ${r.tenant_id}: ${r.count} RFQs`);
  });
  
  await pool.end();
})();

