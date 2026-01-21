/**
 * Fix RLS on rfqs table
 */

require('dotenv').config();
const { connectMigrationDb } = require('../src/db/supabaseClient');

async function fixRls() {
  const db = await connectMigrationDb();
  
  console.log('🔧 Disabling RLS on rfqs table...\n');
  
  try {
    await db.query('ALTER TABLE rfqs DISABLE ROW LEVEL SECURITY');
    console.log('✅ RLS disabled on rfqs\n');
    
    // Verify
    const check = await db.query(`
      SELECT tablename, rowsecurity 
      FROM pg_tables 
      WHERE schemaname = 'public' AND tablename = 'rfqs'
    `);
    
    if (check.rows[0].rowsecurity === false) {
      console.log('✅ Verification: RLS is now DISABLED\n');
    } else {
      console.log('⚠️  Warning: RLS still enabled (check failed)\n');
    }
    
    // Test query
    const { getMetaSteelTenantId } = require('./shared/metasteelTenant');
    const tenantId = await getMetaSteelTenantId(db);
    const test = await db.query(
      'SELECT COUNT(*) as count FROM rfqs WHERE tenant_id = $1',
      [tenantId]
    );
    
    console.log(`✅ Test query result: ${test.rows[0].count} RFQs visible\n`);
    console.log('✅ RLS fix complete! RFQs should now be visible to API.\n');
    
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

