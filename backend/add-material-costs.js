const { Pool } = require('pg');
require('dotenv').config();

(async () => {
  const pool = new Pool({ connectionString: process.env.MIGRATION_DATABASE_URL });
  const client = await pool.connect();

  console.log('💰 ADDING REALISTIC BASE COSTS TO MATERIALS\n');

  try {
    const tenantResult = await client.query("SELECT id FROM tenants WHERE code = 'nsc'");
    const tenantId = tenantResult.rows[0].id;

    // Typical material costs (USD per unit) for industrial steel products
    const costRanges = {
      'PIPE': { min: 50, max: 500, unit: 'per meter' },
      'FLANGE': { min: 30, max: 300, unit: 'per piece' },
      'FITTING': { min: 20, max: 200, unit: 'per piece' },
      'PLATE': { min: 100, max: 800, unit: 'per kg' },
      'STRUCTURAL_BEAM': { min: 80, max: 600, unit: 'per meter' },
      'FASTENER': { min: 5, max: 50, unit: 'per piece' },
    };

    console.log('Cost Ranges:');
    Object.entries(costRanges).forEach(([cat, range]) => {
      console.log(`  ${cat}: $${range.min}-$${range.max} ${range.unit}`);
    });

    console.log('\n⏳ Updating material costs...\n');

    let updated = 0;

    for (const [category, range] of Object.entries(costRanges)) {
      // Calculate a mid-range cost with some variation
      const baseCost = (range.min + range.max) / 2;

      const result = await client.query(`
        UPDATE materials
        SET base_cost = $1 + (RANDOM() * $2)::numeric(10,2),
            updated_at = NOW()
        WHERE tenant_id = $3
          AND category = $4
          AND (base_cost IS NULL OR base_cost = 0)
        RETURNING id
      `, [baseCost * 0.8, baseCost * 0.4, tenantId, category]);

      const count = result.rowCount;
      updated += count;
      console.log(`✅ Updated ${count} ${category} materials`);
    }

    console.log('\n' + '='.repeat(60));
    console.log(`TOTAL UPDATED: ${updated} materials now have realistic base costs`);
    console.log('='.repeat(60));

    // Verify
    const verification = await client.query(`
      SELECT category, COUNT(*) as total, AVG(base_cost)::numeric(10,2) as avg_cost
      FROM materials
      WHERE tenant_id = $1 AND base_cost > 0
      GROUP BY category
      ORDER BY category
    `, [tenantId]);

    console.log('\n📊 Cost Verification:');
    verification.rows.forEach(row => {
      console.log(`  ${row.category}: ${row.total} items, avg $${row.avg_cost}`);
    });

    console.log('\n✅ Material costs added successfully!');

  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
})();
