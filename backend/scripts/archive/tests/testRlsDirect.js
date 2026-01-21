require('dotenv').config();
const { getPool } = require('../src/db/supabaseClient');

(async () => {
  const pool = getPool();
  const client = await pool.connect();
  
  try {
    console.log('Test 1: Query without setting app.tenant_id');
    const result1 = await client.query('SELECT COUNT(*) as count FROM rfqs');
    console.log(`  RFQs visible: ${result1.rows[0].count}`);
    console.log('');
    
    console.log('Test 2: Set app.tenant_id to NSC and query');
    await client.query('BEGIN');
    await client.query(`SET LOCAL app.tenant_id = 'adaf9597-6bc5-4f2e-a8c9-706eb1b0f951'`);
    const setting = await client.query(`SELECT current_setting('app.tenant_id', true) as tenant_id`);
    console.log(`  app.tenant_id set to: ${setting.rows[0].tenant_id}`);
    
    const result2 = await client.query(`
      SELECT COUNT(*) as count, 
             array_agg(DISTINCT tenant_id) as tenant_ids
      FROM rfqs
    `);
    console.log(`  RFQs visible: ${result2.rows[0].count}`);
    console.log(`  Tenant IDs: ${result2.rows[0].tenant_ids}`);
    await client.query('COMMIT');
    console.log('');
    
    console.log('Test 3: Set app.tenant_id to MetaSteel and query');
    await client.query('BEGIN');
    await client.query(`SET LOCAL app.tenant_id = 'a85da60f-8d72-4cb4-9307-555187f33f0e'`);
    const setting2 = await client.query(`SELECT current_setting('app.tenant_id', true) as tenant_id`);
    console.log(`  app.tenant_id set to: ${setting2.rows[0].tenant_id}`);
    
    const result3 = await client.query(`
      SELECT COUNT(*) as count, 
             array_agg(DISTINCT tenant_id) as tenant_ids
      FROM rfqs
    `);
    console.log(`  RFQs visible: ${result3.rows[0].count}`);
    console.log(`  Tenant IDs: ${result3.rows[0].tenant_ids}`);
    await client.query('COMMIT');
    
  } finally {
    client.release();
    await pool.end();
  }
})();

