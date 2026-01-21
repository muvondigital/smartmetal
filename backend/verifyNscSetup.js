const { Pool } = require('pg');
require('dotenv').config();

(async () => {
  const pool = new Pool({ connectionString: process.env.MIGRATION_DATABASE_URL });
  const client = await pool.connect();

  const tenantResult = await client.query("SELECT id FROM tenants WHERE code='nsc'");
  const tenantId = tenantResult.rows[0].id;

  const suppliers = await client.query('SELECT COUNT(*) FROM suppliers WHERE tenant_id=$1', [tenantId]);
  const materials = await client.query('SELECT COUNT(*) FROM materials WHERE tenant_id=$1', [tenantId]);
  const clients = await client.query('SELECT COUNT(*) FROM clients WHERE tenant_id=$1', [tenantId]);

  console.log('\n📊 NSC DATA SUMMARY:');
  console.log('==================');
  console.log(`  Suppliers: ${suppliers.rows[0].count}`);
  console.log(`  Materials: ${materials.rows[0].count}`);
  console.log(`  Clients: ${clients.rows[0].count}`);

  console.log('\n📦 SUPPLIERS:');
  const supList = await client.query(
    'SELECT name, code, origin_type, status FROM suppliers WHERE tenant_id=$1',
    [tenantId]
  );
  supList.rows.forEach(s => {
    console.log(`  ✓ ${s.name} (${s.code}) - ${s.origin_type} - ${s.status}`);
  });

  console.log('\n🔧 MATERIALS (sample):');
  const matList = await client.query(
    'SELECT material_code, category, spec_standard, base_cost FROM materials WHERE tenant_id=$1 LIMIT 5',
    [tenantId]
  );
  matList.rows.forEach(m => {
    console.log(`  ✓ ${m.material_code} - ${m.category} - $${m.base_cost}`);
  });

  console.log('\n👥 CLIENTS:');
  const clientList = await client.query(
    'SELECT name, code, country FROM clients WHERE tenant_id=$1',
    [tenantId]
  );
  clientList.rows.forEach(c => {
    console.log(`  ✓ ${c.name} (${c.code}) - ${c.country}`);
  });

  client.release();
  await pool.end();
})();
