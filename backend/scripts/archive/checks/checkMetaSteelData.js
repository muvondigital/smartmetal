require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { connectDb } = require('../src/db/supabaseClient');

async function checkData() {
  const db = await connectDb();
  
  try {
    // Check price agreements
    console.log('\n=== Price Agreements by Tenant ===');
    const paResult = await db.query(`
      SELECT pa.id, pa.client_id, c.name as client_name, pa.category, pa.status, pa.tenant_id, t.code as tenant_code 
      FROM price_agreements pa 
      JOIN clients c ON pa.client_id = c.id 
      JOIN tenants t ON pa.tenant_id = t.id 
      ORDER BY t.code, c.name
    `);
    paResult.rows.forEach(r => {
      console.log(`  ${r.tenant_code}: ${r.client_name} - ${r.category || 'ANY'} (${r.status})`);
    });
    console.log(`\nTotal: ${paResult.rows.length} price agreements`);
    
    // Check RFQs
    console.log('\n=== RFQs by Tenant ===');
    const rfqResult = await db.query(`
      SELECT r.id, r.title, r.status, r.tenant_id, t.code as tenant_code 
      FROM rfqs r 
      JOIN tenants t ON r.tenant_id = t.id 
      ORDER BY t.code, r.created_at DESC
    `);
    rfqResult.rows.forEach(r => {
      console.log(`  ${r.tenant_code}: ${r.title} (${r.status})`);
    });
    console.log(`\nTotal: ${rfqResult.rows.length} RFQs`);
    
    // Check MetaSteel tenant ID
    console.log('\n=== MetaSteel Tenant ===');
    const tenantResult = await db.query(`
      SELECT id, code, name FROM tenants WHERE code = 'metasteel'
    `);
    if (tenantResult.rows.length > 0) {
      const tenant = tenantResult.rows[0];
      console.log(`  ID: ${tenant.id}`);
      console.log(`  Code: ${tenant.code}`);
      console.log(`  Name: ${tenant.name}`);
      
      // Count MetaSteel data
      const metaSteelPa = paResult.rows.filter(r => r.tenant_code === 'metasteel');
      const metaSteelRfqs = rfqResult.rows.filter(r => r.tenant_code === 'metasteel');
      console.log(`\n  MetaSteel Price Agreements: ${metaSteelPa.length}`);
      console.log(`  MetaSteel RFQs: ${metaSteelRfqs.length}`);
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await db.end();
  }
}

checkData();

