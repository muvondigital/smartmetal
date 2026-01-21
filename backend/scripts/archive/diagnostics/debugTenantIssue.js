require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { connectDb } = require('../src/db/supabaseClient');

async function debugTenantIssue() {
  const db = await connectDb();
  
  try {
    console.log('\n=== Debugging Tenant Issue ===\n');
    
    // Get MetaSteel tenant
    const metaSteelTenant = await db.query(`
      SELECT id, code, name FROM tenants WHERE code = 'metasteel'
    `);
    
    if (metaSteelTenant.rows.length === 0) {
      console.log('❌ MetaSteel tenant not found!');
      return;
    }
    
    const metaSteelTenantId = metaSteelTenant.rows[0].id;
    console.log('MetaSteel Tenant:', metaSteelTenant.rows[0]);
    
    // Count RFQs by tenant
    console.log('\nRFQ Counts by Tenant:');
    const rfqCounts = await db.query(`
      SELECT t.code, COUNT(*) as count
      FROM rfqs r
      JOIN tenants t ON r.tenant_id = t.id
      GROUP BY t.code
      ORDER BY t.code
    `);
    rfqCounts.rows.forEach(r => {
      console.log(`  ${r.code}: ${r.count} RFQs`);
    });
    
    // List MetaSteel RFQs
    console.log('\nMetaSteel RFQs:');
    const metaSteelRfqs = await db.query(`
      SELECT r.id, r.title, r.status, c.name as client_name
      FROM rfqs r
      JOIN projects p ON r.project_id = p.id
      JOIN clients c ON p.client_id = c.id
      WHERE r.tenant_id = $1
      ORDER BY r.created_at DESC
    `, [metaSteelTenantId]);
    
    console.log(`  Found ${metaSteelRfqs.rows.length} RFQs:`);
    metaSteelRfqs.rows.forEach(r => {
      console.log(`    - ${r.title} (${r.client_name}) - ${r.status}`);
    });
    
    // List NSC RFQs
    const nscTenant = await db.query(`
      SELECT id FROM tenants WHERE code = 'nsc'
    `);
    if (nscTenant.rows.length > 0) {
      const nscTenantId = nscTenant.rows[0].id;
      console.log('\nNSC RFQs:');
      const nscRfqs = await db.query(`
        SELECT r.id, r.title, r.status, c.name as client_name
        FROM rfqs r
        JOIN projects p ON r.project_id = p.id
        JOIN clients c ON p.client_id = c.id
        WHERE r.tenant_id = $1
        ORDER BY r.created_at DESC
        LIMIT 10
      `, [nscTenantId]);
      
      console.log(`  Found ${nscRfqs.rows.length} RFQs (showing first 10):`);
      nscRfqs.rows.forEach(r => {
        console.log(`    - ${r.title} (${r.client_name}) - ${r.status}`);
      });
    }
    
    console.log('\n✅ Database filtering is correct.');
    console.log('⚠️  If you see NSC RFQs in the UI, the issue is:');
    console.log('   1. Frontend not sending X-Tenant-Code header');
    console.log('   2. Backend defaulting to NSC tenant');
    console.log('   3. Check browser Network tab for X-Tenant-Code header');
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await db.end();
  }
}

debugTenantIssue();

