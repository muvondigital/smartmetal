const { Pool } = require('pg');
require('dotenv').config();

(async () => {
  const pool = new Pool({ connectionString: process.env.MIGRATION_DATABASE_URL });
  const client = await pool.connect();

  const tenantResult = await client.query("SELECT id FROM tenants WHERE code = 'nsc'");
  const tenantId = tenantResult.rows[0].id;

  const materials = await client.query(`
    SELECT material_code, category, size_description, base_cost, spec_standard
    FROM materials
    WHERE tenant_id = $1
    LIMIT 5
  `, [tenantId]);

  console.log('Sample Materials:');
  materials.rows.forEach((m, i) => {
    console.log(`${i + 1}. [${m.category}] ${m.material_code}`);
    console.log(`   Spec: ${m.spec_standard || 'N/A'} | Size: ${m.size_description || 'N/A'} | Cost: $${m.base_cost}`);
  });

  client.release();
  await pool.end();
})();
