/**
 * Debug script for MetaSteel RFQ items.
 *
 * Findings before the LEFT JOIN fix:
 * - rfq_items had 6 rows for RFQ-PIPEMART-001 (MetaSteel)
 * - The items-with-pricing endpoint returned 0 rows because the pricing join filtered everything
 *
 * After the fix (LEFT JOIN on pricing_run_items), items-with-pricing returns all 6 items,
 * with pricing fields null when no pricing row exists. Tenant scoping is enforced via rfqs.tenant_id.
 */

const { connectDb } = require('../src/db/supabaseClient');
const rfqService = require('../src/services/rfqService');

async function main() {
  const db = await connectDb();

  const tenantResult = await db.query(
    `SELECT id, code FROM tenants WHERE UPPER(code) = 'METASTEEL' LIMIT 1`
  );
  if (tenantResult.rows.length === 0) {
    console.error('MetaSteel tenant not found');
    return;
  }
  const tenantId = tenantResult.rows[0].id;
  console.log('MetaSteel tenant:', tenantResult.rows[0]);

  const rfqResult = await db.query(
    `SELECT id, title FROM rfqs WHERE tenant_id = $1 AND title = 'RFQ-PIPEMART-001' LIMIT 1`,
    [tenantId]
  );
  if (rfqResult.rows.length === 0) {
    console.error('RFQ-PIPEMART-001 not found for MetaSteel');
    return;
  }
  const rfqId = rfqResult.rows[0].id;
  console.log('Target RFQ:', rfqResult.rows[0]);

  const countResult = await db.query(
    `SELECT COUNT(*) FROM rfq_items WHERE rfq_id = $1`,
    [rfqId]
  );
  console.log('rfq_items count:', countResult.rows[0].count);

  const itemsResult = await db.query(
    `SELECT id, line_number, description, quantity, unit, material_code
     FROM rfq_items WHERE rfq_id = $1 ORDER BY line_number`,
    [rfqId]
  );
  console.log('rfq_items rows:', itemsResult.rows);

  const withPricing = await rfqService.getRfqItemsWithPricing(rfqId, tenantId);
  console.log('items-with-pricing rows:', withPricing);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
