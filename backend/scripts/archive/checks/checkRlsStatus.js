/**
 * Check RLS Status
 * 
 * Verifies that RLS is enabled and policies are correctly configured
 */

require('dotenv').config();
const { getPool } = require('../src/db/supabaseClient');

async function checkRlsStatus() {
  const pool = getPool();

  try {
    // Check if RLS is enabled on rfqs table
    const rlsStatus = await pool.query(`
      SELECT 
        tablename,
        rowsecurity as rls_enabled
      FROM pg_tables
      WHERE schemaname = 'public' AND tablename = 'rfqs'
    `);

    console.log('RLS Status for rfqs table:');
    console.log(rlsStatus.rows);
    console.log('');

    // Check RLS policies on rfqs table
    const policies = await pool.query(`
      SELECT 
        schemaname,
        tablename,
        policyname,
        permissive,
        roles,
        cmd,
        qual,
        with_check
      FROM pg_policies
      WHERE tablename = 'rfqs'
    `);

    console.log('RLS Policies on rfqs table:');
    policies.rows.forEach(policy => {
      console.log(`  Policy: ${policy.policyname}`);
      console.log(`    Command: ${policy.cmd}`);
      console.log(`    Using: ${policy.qual}`);
      console.log('');
    });

    // Test setting app.tenant_id
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL app.tenant_id = '8a9c535c-2a1c-46d5-abac-63d13b5c42bb'`);
      
      const settingResult = await client.query(`SELECT current_setting('app.tenant_id', true) as tenant_id`);
      console.log('app.tenant_id setting test:');
      console.log(`  Set to: 8a9c535c-2a1c-46d5-abac-63d13b5c42bb`);
      console.log(`  Retrieved: ${settingResult.rows[0].tenant_id}`);
      console.log('');

      // Try querying rfqs with tenant context
      const rfqResult = await client.query(`
        SELECT COUNT(*) as count, 
               COUNT(DISTINCT tenant_id) as tenant_count,
               array_agg(DISTINCT tenant_id) as tenant_ids
        FROM rfqs
      `);
      console.log('RFQs query with tenant context:');
      console.log(`  Total rows visible: ${rfqResult.rows[0].count}`);
      console.log(`  Distinct tenants: ${rfqResult.rows[0].tenant_count}`);
      console.log(`  Tenant IDs: ${rfqResult.rows[0].tenant_ids}`);
      console.log('');

      await client.query('COMMIT');
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

checkRlsStatus();

