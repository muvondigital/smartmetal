const { Pool } = require('pg');
require('dotenv').config();

(async () => {
  const pool = new Pool({ connectionString: process.env.MIGRATION_DATABASE_URL });
  const client = await pool.connect();

  const rfqId = '74760752-7813-4f3f-85bb-e7a723bcdedc';

  console.log('📋 CHECKING ITEM DATA FOR MATERIAL MATCHING\n');

  // Sample items
  const items = await client.query(`
    SELECT description, material_description, material_code, quantity, unit
    FROM rfq_items
    WHERE rfq_id = $1
    LIMIT 5
  `, [rfqId]);

  console.log('Sample Items:');
  items.rows.forEach((item, i) => {
    console.log(`${i + 1}. ${(item.description || '').substring(0, 60)}${(item.description || '').length > 60 ? '...' : ''}`);
    console.log(`   Material Desc: ${(item.material_description || 'NONE').substring(0, 40)}`);
    console.log(`   Code: ${item.material_code || 'NULL'} | Qty: ${item.quantity || 0} ${item.unit || ''}\n`);
  });

  // Check how many have descriptions
  const stats = await client.query(`
    SELECT
      COUNT(*) as total,
      COUNT(description) as has_description,
      COUNT(material_description) as has_material_desc,
      COUNT(material_code) as has_material_code,
      COUNT(quantity) as has_quantity
    FROM rfq_items
    WHERE rfq_id = $1
  `, [rfqId]);

  console.log('\n📊 ITEM DATA STATISTICS:');
  console.log(`Total Items: ${stats.rows[0].total}`);
  console.log(`Has Description: ${stats.rows[0].has_description} (${Math.round(stats.rows[0].has_description / stats.rows[0].total * 100)}%)`);
  console.log(`Has Material Description: ${stats.rows[0].has_material_desc} (${Math.round(stats.rows[0].has_material_desc / stats.rows[0].total * 100)}%)`);
  console.log(`Has Material Code: ${stats.rows[0].has_material_code} (${Math.round(stats.rows[0].has_material_code / stats.rows[0].total * 100)}%)`);
  console.log(`Has Quantity: ${stats.rows[0].has_quantity} (${Math.round(stats.rows[0].has_quantity / stats.rows[0].total * 100)}%)`);

  console.log('\n🎯 PRICING PREDICTION:');
  const hasMatCode = parseInt(stats.rows[0].has_material_code);
  const total = parseInt(stats.rows[0].total);

  if (hasMatCode === 0) {
    console.log('❌ CRITICAL: NO items have material_code');
    console.log('   → Material matching WILL RUN but may fail');
    console.log('   → System will try to match on material_description');
    console.log('   → If no match found: base_cost = $0 or pricing error');
    console.log('\n💡 RECOMMENDATION:');
    console.log('   → Run pricing anyway to see what happens');
    console.log('   → Expect some items to price as $0');
    console.log('   → This is a POC - errors are expected and acceptable');
  } else if (hasMatCode < total) {
    console.log(`⚠️  WARNING: Only ${hasMatCode} of ${total} items have material_code`);
  } else {
    console.log('✅ All items have material_code - should match well');
  }

  client.release();
  await pool.end();
})();
