require('dotenv').config();
const { getDb } = require('../src/db/supabaseClient');

(async () => {
  const db = await getDb();

  // Get the latest RFQ ID
  const rfqResult = await db.query(`
    SELECT id, title FROM rfqs ORDER BY created_at DESC LIMIT 1
  `);

  if (rfqResult.rows.length === 0) {
    console.log('No RFQs found');
    process.exit(0);
  }

  const rfqId = rfqResult.rows[0].id;
  console.log(`Checking line items for RFQ: ${rfqResult.rows[0].title}`);
  console.log(`RFQ ID: ${rfqId}`);
  console.log('');

  const result = await db.query(`
    SELECT line_number, description, quantity, unit, size_display, material_code
    FROM rfq_items
    WHERE rfq_id = $1
    ORDER BY line_number
  `, [rfqId]);

  console.log(`Found ${result.rows.length} line items:\n`);

  result.rows.forEach((item, idx) => {
    console.log(`Item ${idx + 1}:`);
    console.log(`  Line Number: ${item.line_number}`);
    console.log(`  Description: "${item.description || '(empty)'}"`);
    console.log(`  Quantity: ${item.quantity} ${item.unit || ''}`);
    console.log(`  Size: ${item.size_display || 'N/A'}`);
    console.log(`  Material Code: ${item.material_code || 'N/A'}`);
    console.log('');
  });

  process.exit(0);
})();
