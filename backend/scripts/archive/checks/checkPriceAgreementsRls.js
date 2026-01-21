/**
 * Check RLS on price_agreements table
 */

require('dotenv').config();
const { connectMigrationDb } = require('../src/db/supabaseClient');

async function checkRls() {
  const db = await connectMigrationDb();
  
  console.log('🔍 Checking RLS on price_agreements table...\n');
  
  // Check if RLS is enabled
  const rlsCheck = await db.query(`
    SELECT tablename, rowsecurity 
    FROM pg_tables 
    WHERE schemaname = 'public' AND tablename = 'price_agreements'
  `);
  
  if (rlsCheck.rows.length === 0) {
    console.log('❌ price_agreements table not found');
    await db.end();
    return;
  }
  
  const rlsEnabled = rlsCheck.rows[0].rowsecurity;
  console.log(`RLS Enabled: ${rlsEnabled ? 'YES' : 'NO'}\n`);
  
  if (rlsEnabled) {
    // Check policies
    const policies = await db.query(`
      SELECT 
        policyname,
        permissive,
        roles,
        cmd,
        qual,
        with_check
      FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'price_agreements'
    `);
    
    console.log(`Policies: ${policies.rows.length}`);
    policies.rows.forEach(p => {
      console.log(`  - ${p.policyname} (${p.cmd})`);
      console.log(`    Roles: ${p.roles}`);
      console.log(`    Qual: ${p.qual || 'N/A'}`);
    });
    
    if (policies.rows.length === 0) {
      console.log('\n⚠️  NO POLICIES FOUND!');
      console.log('   RLS is enabled but no policies exist.');
      console.log('   This means NO rows are visible to runtime users.\n');
      console.log('🔧 FIX: Disable RLS or add a policy.\n');
    }
  }
  
  // Test with runtime user simulation
  const { getMetaSteelTenantId } = require('./shared/metasteelTenant');
  const tenantId = await getMetaSteelTenantId(db);
  
  console.log('Testing query as migration user (bypasses RLS):');
  const migrationResult = await db.query(
    'SELECT COUNT(*) as count FROM price_agreements WHERE tenant_id = $1',
    [tenantId]
  );
  console.log(`  Result: ${migrationResult.rows[0].count} agreements\n`);
  
  await db.end();
}

checkRls().catch(console.error);

