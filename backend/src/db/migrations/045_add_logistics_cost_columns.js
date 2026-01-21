/**
 * Migration 045: Phase 9 - Landed Cost Engine V2 - Logistics Cost Components
 *
 * Extends pricing tables with comprehensive logistics cost breakdown:
 * - Per-item costs: freight, insurance, handling, local charges
 * - Aggregated totals at pricing run level
 * - Complete landed cost calculation support
 *
 * Purpose:
 * - Enable detailed landed cost breakdown for international shipments
 * - Support freight cost estimation per item
 * - Track insurance, handling, and local charges separately
 * - Provide complete cost transparency to customers
 *
 * Multi-tenancy: Uses existing tenant_id from parent tables
 */

async function up(db) {
  if (!db) {
    throw new Error('Migration 045 requires db parameter. Use runAllMigrations.js to run migrations.');
  }

  console.log('[Migration 045] Adding logistics cost columns...');

  try {
    await db.query('BEGIN');

    // 1. Add logistics cost columns to pricing_run_items
    console.log('[Migration 045] Adding columns to pricing_run_items...');
    
    await db.query(`
      ALTER TABLE pricing_run_items
      ADD COLUMN IF NOT EXISTS freight_cost NUMERIC(12, 2),
      ADD COLUMN IF NOT EXISTS insurance_cost NUMERIC(12, 2),
      ADD COLUMN IF NOT EXISTS handling_cost NUMERIC(12, 2),
      ADD COLUMN IF NOT EXISTS local_charges NUMERIC(12, 2),
      ADD COLUMN IF NOT EXISTS item_landed_cost NUMERIC(12, 2);
    `);
    
    console.log('[Migration 045] ✓ Added logistics cost columns to pricing_run_items');

    // 2. Add aggregated logistics cost columns to pricing_runs
    console.log('[Migration 045] Adding columns to pricing_runs...');
    
    await db.query(`
      ALTER TABLE pricing_runs
      ADD COLUMN IF NOT EXISTS total_freight_cost NUMERIC(12, 2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS total_insurance_cost NUMERIC(12, 2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS total_handling_cost NUMERIC(12, 2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS total_local_charges NUMERIC(12, 2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS total_landed_cost NUMERIC(12, 2);
    `);
    
    console.log('[Migration 045] ✓ Added logistics cost columns to pricing_runs');

    // 3. Create indexes for performance
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_pricing_run_items_freight_cost
        ON pricing_run_items(freight_cost)
        WHERE freight_cost IS NOT NULL;
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_pricing_runs_total_landed_cost
        ON pricing_runs(total_landed_cost)
        WHERE total_landed_cost IS NOT NULL;
    `);

    console.log('[Migration 045] ✓ Created indexes for logistics costs');

    // 4. Add comments for documentation
    await db.query(`
      COMMENT ON COLUMN pricing_run_items.freight_cost IS 'Estimated freight/shipping cost for this item';
      COMMENT ON COLUMN pricing_run_items.insurance_cost IS 'Estimated insurance cost for this item';
      COMMENT ON COLUMN pricing_run_items.handling_cost IS 'Estimated handling and port charges for this item';
      COMMENT ON COLUMN pricing_run_items.local_charges IS 'Local delivery and miscellaneous charges for this item';
      COMMENT ON COLUMN pricing_run_items.item_landed_cost IS 'Total landed cost for this item (unit_price + duty + logistics)';
    `);

    await db.query(`
      COMMENT ON COLUMN pricing_runs.total_freight_cost IS 'Total freight cost across all items';
      COMMENT ON COLUMN pricing_runs.total_insurance_cost IS 'Total insurance cost across all items';
      COMMENT ON COLUMN pricing_runs.total_handling_cost IS 'Total handling cost across all items';
      COMMENT ON COLUMN pricing_runs.total_local_charges IS 'Total local charges across all items';
      COMMENT ON COLUMN pricing_runs.total_landed_cost IS 'Complete landed cost (price + duty + freight + insurance + handling + local)';
    `);

    console.log('[Migration 045] ✓ Added column comments');

    await db.query('COMMIT');
    console.log('[Migration 045] ✅ Completed logistics cost columns migration');
  } catch (error) {
    await db.query('ROLLBACK');
    console.error('[Migration 045] ❌ Failed:', error);
    throw error;
  }
}

async function down(db) {
  if (!db) {
    throw new Error('Migration 045 requires db parameter. Use runAllMigrations.js to run migrations.');
  }

  console.log('[Migration 045] Rolling back logistics cost columns...');

  try {
    await db.query('BEGIN');

    // Drop indexes
    await db.query(`DROP INDEX IF EXISTS idx_pricing_runs_total_landed_cost;`);
    await db.query(`DROP INDEX IF EXISTS idx_pricing_run_items_freight_cost;`);

    // Remove columns from pricing_runs
    await db.query(`
      ALTER TABLE pricing_runs
      DROP COLUMN IF EXISTS total_landed_cost,
      DROP COLUMN IF EXISTS total_local_charges,
      DROP COLUMN IF EXISTS total_handling_cost,
      DROP COLUMN IF EXISTS total_insurance_cost,
      DROP COLUMN IF EXISTS total_freight_cost;
    `);

    // Remove columns from pricing_run_items
    await db.query(`
      ALTER TABLE pricing_run_items
      DROP COLUMN IF EXISTS item_landed_cost,
      DROP COLUMN IF EXISTS local_charges,
      DROP COLUMN IF EXISTS handling_cost,
      DROP COLUMN IF EXISTS insurance_cost,
      DROP COLUMN IF EXISTS freight_cost;
    `);

    await db.query('COMMIT');
    console.log('[Migration 045] ✅ Rollback complete');
  } catch (error) {
    await db.query('ROLLBACK');
    console.error('[Migration 045] ❌ Rollback failed:', error);
    throw error;
  }
}

module.exports = {
  up,
  down,
};

