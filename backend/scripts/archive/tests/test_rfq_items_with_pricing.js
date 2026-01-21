/**
 * Test script to verify RFQ items with pricing endpoint
 * Usage: node scripts/test_rfq_items_with_pricing.js
 */

const { connectDb } = require('../src/db/supabaseClient');
const { getRfqItemsWithPricing } = require('../src/services/rfqService');

async function testRfqItemsWithPricing() {
  try {
    console.log('🔍 Testing RFQ Items with Pricing...\n');

    const db = await connectDb();

    // Find an RFQ that has items and a pricing run
    const rfqResult = await db.query(`
      SELECT DISTINCT r.id, r.title, COUNT(ri.id) as item_count
      FROM rfqs r
      JOIN rfq_items ri ON r.id = ri.rfq_id
      JOIN pricing_runs pr ON r.id = pr.rfq_id
      GROUP BY r.id, r.title
      LIMIT 1
    `);

    if (rfqResult.rows.length === 0) {
      console.log('❌ No RFQs found with items and pricing runs');
      console.log('   Please create an RFQ, add items, and run pricing first.');
      process.exit(0);
    }

    const rfq = rfqResult.rows[0];
    console.log(`✓ Found RFQ: ${rfq.title} (ID: ${rfq.id})`);
    console.log(`  Items: ${rfq.item_count}\n`);

    // Test the service function
    console.log('📊 Fetching items with pricing...\n');
    const itemsWithPricing = await getRfqItemsWithPricing(rfq.id);

    console.log(`✓ Retrieved ${itemsWithPricing.length} items\n`);

    // Display results
    itemsWithPricing.forEach((item, index) => {
      console.log(`─────────────────────────────────────────────────────────`);
      console.log(`Item #${item.line_number}: ${item.description.substring(0, 60)}...`);
      console.log(`  Quantity: ${item.quantity} ${item.unit}`);
      console.log(`  Material: ${item.material_code || 'Not matched'}`);

      if (item.has_pricing && item.pricing) {
        console.log(`  ✓ Pricing Available:`);
        console.log(`    - Base Cost: ${item.pricing.currency} ${item.pricing.base_cost.toFixed(2)}`);
        console.log(`    - Unit Price: ${item.pricing.currency} ${item.pricing.unit_price.toFixed(2)}`);
        console.log(`    - Total: ${item.pricing.currency} ${item.pricing.total_price.toFixed(2)}`);
        console.log(`    - Method: ${item.pricing.pricing_method.toUpperCase()}`);

        if (item.pricing.pricing_method === 'agreement' && item.pricing.price_agreement) {
          console.log(`    - Agreement: ${item.pricing.price_agreement.agreement_code}`);
          console.log(`      Valid: ${item.pricing.price_agreement.valid_from} to ${item.pricing.price_agreement.valid_to}`);
        } else {
          console.log(`    - Markup: ${(item.pricing.markup_pct * 100).toFixed(1)}%`);
        }
      } else {
        console.log(`  ✗ No pricing data available`);
      }
      console.log();
    });

    console.log(`═════════════════════════════════════════════════════════`);
    console.log(`✓ Test completed successfully!`);
    console.log(`  Total items: ${itemsWithPricing.length}`);
    console.log(`  Items with pricing: ${itemsWithPricing.filter(i => i.has_pricing).length}`);

    const agreementCount = itemsWithPricing.filter(i =>
      i.has_pricing && i.pricing && i.pricing.pricing_method === 'agreement'
    ).length;

    const ruleBasedCount = itemsWithPricing.filter(i =>
      i.has_pricing && i.pricing && i.pricing.pricing_method === 'rule_based'
    ).length;

    console.log(`  Agreement pricing: ${agreementCount}`);
    console.log(`  Rule-based pricing: ${ruleBasedCount}`);
    console.log(`═════════════════════════════════════════════════════════\n`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

testRfqItemsWithPricing();
