const { Pool } = require('pg');
require('dotenv').config();

(async () => {
  // Use MIGRATION_DATABASE_URL (service role) to bypass RLS
  const pool = new Pool({ connectionString: process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL });
  const client = await pool.connect();

  const rfqId = '74760752-7813-4f3f-85bb-e7a723bcdedc';

  console.log(`Checking RFQ: ${rfqId}\n`);

  // Get RFQ info
  const rfqResult = await client.query(
    'SELECT rfq_code, tenant_id FROM rfqs WHERE id = $1',
    [rfqId]
  );

  if (rfqResult.rows.length === 0) {
    console.log('❌ RFQ not found');
    client.release();
    await pool.end();
    return;
  }

  const rfq = rfqResult.rows[0];
  console.log(`Found: ${rfq.rfq_code}`);
  console.log(`Tenant ID: ${rfq.tenant_id}\n`);

  // Set RLS context for this tenant
  await client.query(`SET LOCAL app.current_tenant_id = '${rfq.tenant_id}'`);

  // Check item readiness
  const itemsResult = await client.query(
    'SELECT needs_review, supplier_selected_option, material_code, quantity FROM rfq_items WHERE rfq_id = $1',
    [rfqId]
  );

  const items = itemsResult.rows;

  const stats = {
    total: items.length,
    needsReview: items.filter(i => i.needs_review === true).length,
    missingSupplier: items.filter(i => i.supplier_selected_option === null).length,
    missingMaterial: items.filter(i => i.material_code === null).length,
    zeroQuantity: items.filter(i => !i.quantity || i.quantity === 0).length,
  };

  console.log('PRICING READINESS CHECK:');
  console.log('========================');
  console.log(`Total Items: ${stats.total}`);
  console.log(`Items Needing Review: ${stats.needsReview} ${stats.needsReview > 0 ? '⚠️ BLOCKS PRICING' : '✅'}`);
  console.log(`Missing Supplier Selection: ${stats.missingSupplier} ${stats.missingSupplier > 0 ? '⚠️ BLOCKS PRICING' : '✅'}`);
  console.log(`Missing Material Code: ${stats.missingMaterial} ${stats.missingMaterial > 0 ? '⚠️ WARNING' : '✅'}`);
  console.log(`Zero/Null Quantity: ${stats.zeroQuantity} ${stats.zeroQuantity > 0 ? '⚠️ WARNING' : '✅'}`);

  console.log('\n' + '='.repeat(50));
  if (stats.needsReview > 0 || stats.missingSupplier > 0) {
    console.log('❌ PRICING WILL FAIL');
    console.log('\nBLOCKERS TO FIX:');
    if (stats.needsReview > 0) {
      console.log(`  - ${stats.needsReview} items flagged for review`);
    }
    if (stats.missingSupplier > 0) {
      console.log(`  - ${stats.missingSupplier} items missing supplier selection`);
    }
  } else {
    console.log('✅ PRICING CAN RUN');
    if (stats.missingMaterial > 0 || stats.zeroQuantity > 0) {
      console.log('\nWARNINGS (won\'t block, but might cause issues):');
      if (stats.missingMaterial > 0) {
        console.log(`  - ${stats.missingMaterial} items without material code`);
      }
      if (stats.zeroQuantity > 0) {
        console.log(`  - ${stats.zeroQuantity} items with zero quantity`);
      }
    }
  }
  console.log('='.repeat(50));

  client.release();
  await pool.end();
})();
