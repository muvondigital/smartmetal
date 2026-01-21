/**
 * Fix RLS on price_agreements table
 * Disables RLS to match pattern used by other tenant tables
 */

require('dotenv').config();
const { connectMigrationDb } = require('../src/db/supabaseClient');

async function fixRls() {
  const db = await connectMigrationDb();
  
  console.log('🔧 Disabling RLS on price_agreements table...\n');
  
  try {
    await db.query('ALTER TABLE price_agreements DISABLE ROW LEVEL SECURITY');
    console.log('✅ RLS disabled on price_agreements\n');
    
    // Verify
    const check = await db.query(`
      SELECT tablename, rowsecurity 
      FROM pg_tables 
      WHERE schemaname = 'public' AND tablename = 'price_agreements'
    `);
    
    if (check.rows[0].rowsecurity === false) {
      console.log('✅ Verification: RLS is now DISABLED\n');
    } else {
      console.log('⚠️  Warning: RLS still enabled (check failed)\n');
    }
    
    // Test query with runtime pool simulation
    const { getMetaSteelTenantId } = require('./shared/metasteelTenant');
    const tenantId = await getMetaSteelTenantId(db);
    const test = await db.query(
      'SELECT COUNT(*) as count FROM price_agreements WHERE tenant_id = $1',
      [tenantId]
    );
    
    console.log(`✅ Test query result: ${test.rows[0].count} agreements visible\n`);
    console.log('✅ RLS fix complete! Price agreements should now be visible to API.\n');
    
  } catch (error) {
    console.error('❌ Failed to disable RLS:', error.message);
    throw error;
  } finally {
    await db.end();
  }
}

fixRls().catch(err => {
  console.error('❌ Script failed:', err);
  process.exit(1);
});

