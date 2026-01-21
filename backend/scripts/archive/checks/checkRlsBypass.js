require('dotenv').config();
const { getPool } = require('../src/db/supabaseClient');

(async () => {
  const pool = getPool();
  
  // Check current user and RLS bypass status
  const userInfo = await pool.query(`
    SELECT 
      current_user as username,
      current_setting('role') as role,
      current_setting('is_superuser') as is_superuser
  `);
  console.log('Database User Info:');
  console.log(`  Username: ${userInfo.rows[0].username}`);
  console.log(`  Role: ${userInfo.rows[0].role}`);
  console.log(`  Is Superuser: ${userInfo.rows[0].is_superuser}`);
  console.log('');
  
  // Check if user has BYPASSRLS
  const bypassCheck = await pool.query(`
    SELECT 
      rolname,
      rolbypassrls
    FROM pg_roles
    WHERE rolname = current_user
  `);
  console.log('RLS Bypass Status:');
  console.log(`  Role: ${bypassCheck.rows[0].rolname}`);
  console.log(`  BYPASSRLS: ${bypassCheck.rows[0].rolbypassrls}`);
  console.log('');
  
  // Check RLS policy expression
  const policyInfo = await pool.query(`
    SELECT 
      pol.polname,
      pol.polcmd,
      pg_get_expr(pol.polqual, pol.polrelid) as using_expr
    FROM pg_policy pol
    JOIN pg_class pc ON pol.polrelid = pc.oid
    WHERE pc.relname = 'rfqs'
  `);
  console.log('RLS Policy for rfqs table:');
  policyInfo.rows.forEach(r => {
    console.log(`  Policy: ${r.polname}`);
    console.log(`  Command: ${r.polcmd}`);
    console.log(`  Using expression: ${r.using_expr}`);
  });
  
  await pool.end();
})();

