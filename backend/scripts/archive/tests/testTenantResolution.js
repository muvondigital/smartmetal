require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { connectDb } = require('../src/db/supabaseClient');

async function testTenantResolution() {
  const db = await connectDb();
  
  try {
    console.log('\n=== Testing Tenant Resolution ===\n');
    
    // Check MetaSteel users
    console.log('MetaSteel Users:');
    const metaSteelUsers = await db.query(`
      SELECT u.email, u.tenant_id, t.code as tenant_code, t.name as tenant_name
      FROM users u 
      JOIN tenants t ON u.tenant_id = t.id 
      WHERE u.email LIKE '%@metasteel.com'
    `);
    metaSteelUsers.rows.forEach(r => {
      console.log(`  ${r.email} -> ${r.tenant_code} (${r.tenant_id})`);
    });
    
    // Check what happens when we query price agreements with MetaSteel tenant
    if (metaSteelUsers.rows.length > 0) {
      const metaSteelTenantId = metaSteelUsers.rows[0].tenant_id;
      console.log(`\nPrice Agreements for MetaSteel (tenant_id: ${metaSteelTenantId}):`);
      const paResult = await db.query(`
        SELECT pa.id, c.name as client_name, pa.category, pa.status
        FROM price_agreements pa
        JOIN clients c ON pa.client_id = c.id
        WHERE pa.tenant_id = $1
      `, [metaSteelTenantId]);
      console.log(`  Found ${paResult.rows.length} agreements:`);
      paResult.rows.forEach(r => {
        console.log(`    - ${r.client_name}: ${r.category || 'ANY'} (${r.status})`);
      });
    }
    
    // Check NSC tenant
    console.log('\nNSC Tenant:');
    const nscTenant = await db.query(`
      SELECT id, code, name FROM tenants WHERE code = 'nsc'
    `);
    if (nscTenant.rows.length > 0) {
      const nscTenantId = nscTenant.rows[0].id;
      console.log(`  ID: ${nscTenantId}, Code: ${nscTenant.rows[0].code}`);
      
      const nscPaResult = await db.query(`
        SELECT COUNT(*) as count FROM price_agreements WHERE tenant_id = $1
      `, [nscTenantId]);
      console.log(`  NSC has ${nscPaResult.rows[0].count} price agreements`);
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await db.end();
  }
}

testTenantResolution();

