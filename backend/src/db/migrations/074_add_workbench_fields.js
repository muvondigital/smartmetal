/**
 * Migration 074: Add workbench fields for audit flags, supplier selection, and pricing run lock state
 */

async function up(db) {
  console.log('Running migration: 074_add_workbench_fields');

  await db.query(`
    ALTER TABLE rfq_items
      ADD COLUMN IF NOT EXISTS needs_review BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS quantity_source TEXT,
      ADD COLUMN IF NOT EXISTS confidence TEXT,
      ADD COLUMN IF NOT EXISTS supplier_options JSONB,
      ADD COLUMN IF NOT EXISTS supplier_selected_option TEXT,
      ADD COLUMN IF NOT EXISTS supplier_selected_at TIMESTAMPTZ
  `);

  await db.query(`
    ALTER TABLE rfq_items
      DROP CONSTRAINT IF EXISTS rfq_items_quantity_source_check
  `);

  await db.query(`
    ALTER TABLE rfq_items
      ADD CONSTRAINT rfq_items_quantity_source_check
      CHECK (
        quantity_source IS NULL OR
        quantity_source IN ('explicit', 'inferred_price_line', 'default_1')
      )
  `);

  await db.query(`
    ALTER TABLE rfq_items
      DROP CONSTRAINT IF EXISTS rfq_items_confidence_check
  `);

  await db.query(`
    ALTER TABLE rfq_items
      ADD CONSTRAINT rfq_items_confidence_check
      CHECK (
        confidence IS NULL OR
        confidence IN ('low', 'medium', 'high')
      )
  `);

  await db.query(`
    ALTER TABLE rfq_items
      DROP CONSTRAINT IF EXISTS rfq_items_supplier_selected_option_check
  `);

  await db.query(`
    ALTER TABLE rfq_items
      ADD CONSTRAINT rfq_items_supplier_selected_option_check
      CHECK (
        supplier_selected_option IS NULL OR
        supplier_selected_option IN ('A', 'B', 'C')
      )
  `);

  await db.query(`
    ALTER TABLE pricing_runs
      ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS locked_by TEXT
  `);

  console.log('✓ Migration 074 completed');
}

async function down(db) {
  console.log('Rolling back migration: 074_add_workbench_fields');

  await db.query(`
    ALTER TABLE rfq_items
      DROP CONSTRAINT IF EXISTS rfq_items_quantity_source_check
  `);
  await db.query(`
    ALTER TABLE rfq_items
      DROP CONSTRAINT IF EXISTS rfq_items_confidence_check
  `);
  await db.query(`
    ALTER TABLE rfq_items
      DROP CONSTRAINT IF EXISTS rfq_items_supplier_selected_option_check
  `);

  await db.query(`
    ALTER TABLE rfq_items
      DROP COLUMN IF EXISTS needs_review,
      DROP COLUMN IF EXISTS quantity_source,
      DROP COLUMN IF EXISTS confidence,
      DROP COLUMN IF EXISTS supplier_options,
      DROP COLUMN IF EXISTS supplier_selected_option,
      DROP COLUMN IF EXISTS supplier_selected_at
  `);

  await db.query(`
    ALTER TABLE pricing_runs
      DROP COLUMN IF EXISTS is_locked,
      DROP COLUMN IF EXISTS locked_at,
      DROP COLUMN IF EXISTS locked_by
  `);

  console.log('✓ Migration 074 rollback completed');
}

module.exports = { up, down };
