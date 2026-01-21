const { Client } = require('pg');
require('dotenv').config();

(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  // Get the specific RFQ from the URL
  const targetRfqId = '74760752-7813-4f3f-85bb-e7a723bcdedc';
  const rfq = await client.query(`
    SELECT id, rfq_code
    FROM rfqs
    WHERE id = $1
  `, [targetRfqId]);

  if (rfq.rows.length === 0) {
    console.log('No RFQ found');
    await client.end();
    return;
  }

  const rfqId = rfq.rows[0].id;
  const rfqCode = rfq.rows[0].rfq_code;

  console.log(`Checking RFQ: ${rfqCode} (${rfqId})\n`);

  // Check item readiness
  const check = await client.query(`
    SELECT
      COUNT(*) as total_items,
      SUM(CASE WHEN needs_review = true THEN 1 ELSE 0 END) as needs_review_count,
      SUM(CASE WHEN supplier_selected_option IS NULL THEN 1 ELSE 0 END) as missing_supplier_count,
      SUM(CASE WHEN material_code IS NULL THEN 1 ELSE 0 END) as missing_material_count,
      SUM(CASE WHEN quantity = 0 OR quantity IS NULL THEN 1 ELSE 0 END) as zero_quantity_count
    FROM rfq_items
    WHERE rfq_id = $1
  `, [rfqId]);

  const stats = check.rows[0];

  console.log('PRICING READINESS CHECK:');
  console.log('========================');
  console.log(`Total Items: ${stats.total_items}`);
  console.log(`Items Needing Review: ${stats.needs_review_count} ${stats.needs_review_count > 0 ? '⚠️ BLOCKS PRICING' : '✅'}`);
  console.log(`Missing Supplier Selection: ${stats.missing_supplier_count} ${stats.missing_supplier_count > 0 ? '⚠️ BLOCKS PRICING' : '✅'}`);
  console.log(`Missing Material Code: ${stats.missing_material_count} ${stats.missing_material_count > 0 ? '⚠️ WARNING' : '✅'}`);
  console.log(`Zero/Null Quantity: ${stats.zero_quantity_count} ${stats.zero_quantity_count > 0 ? '⚠️ WARNING' : '✅'}`);

  if (stats.needs_review_count > 0 || stats.missing_supplier_count > 0) {
    console.log('\n❌ PRICING WILL FAIL - Fix blockers above');
  } else {
    console.log('\n✅ PRICING CAN RUN - All validations pass');
  }

  await client.end();
})();
