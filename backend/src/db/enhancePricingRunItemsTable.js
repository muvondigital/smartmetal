const { connectDb } = require('./supabaseClient');

/**
 * Enhances pricing_run_items table with additional columns for material-based pricing.
 * Idempotent - safe to run multiple times.
 */
async function enhancePricingRunItemsTable() {
  const db = await connectDb();

  const alterTableSQL = `
    -- Add columns if they don't exist
    DO $$ 
    BEGIN
      -- Add base_cost column
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'pricing_run_items' AND column_name = 'base_cost'
      ) THEN
        ALTER TABLE pricing_run_items ADD COLUMN base_cost NUMERIC;
      END IF;

      -- Add markup_pct column
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'pricing_run_items' AND column_name = 'markup_pct'
      ) THEN
        ALTER TABLE pricing_run_items ADD COLUMN markup_pct NUMERIC;
      END IF;

      -- Add logistics_cost column
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'pricing_run_items' AND column_name = 'logistics_cost'
      ) THEN
        ALTER TABLE pricing_run_items ADD COLUMN logistics_cost NUMERIC;
      END IF;

      -- Add currency column
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'pricing_run_items' AND column_name = 'currency'
      ) THEN
        ALTER TABLE pricing_run_items ADD COLUMN currency TEXT DEFAULT 'USD';
      END IF;

      -- Add origin_type column
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'pricing_run_items' AND column_name = 'origin_type'
      ) THEN
        ALTER TABLE pricing_run_items ADD COLUMN origin_type TEXT;
      END IF;

      -- Add material_id column (optional reference to materials table)
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'pricing_run_items' AND column_name = 'material_id'
      ) THEN
        ALTER TABLE pricing_run_items ADD COLUMN material_id UUID;
      END IF;

      -- Add foreign key constraint if it doesn't exist
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_pricing_run_items_material_id'
      ) THEN
        ALTER TABLE pricing_run_items ADD CONSTRAINT fk_pricing_run_items_material_id 
          FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE SET NULL;
      END IF;

      -- Add risk_pct column
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'pricing_run_items' AND column_name = 'risk_pct'
      ) THEN
        ALTER TABLE pricing_run_items ADD COLUMN risk_pct NUMERIC;
      END IF;

      -- Add risk_cost column
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'pricing_run_items' AND column_name = 'risk_cost'
      ) THEN
        ALTER TABLE pricing_run_items ADD COLUMN risk_cost NUMERIC;
      END IF;

      -- Add rule_origin_type column
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'pricing_run_items' AND column_name = 'rule_origin_type'
      ) THEN
        ALTER TABLE pricing_run_items ADD COLUMN rule_origin_type TEXT;
      END IF;

      -- Add rule_category column
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'pricing_run_items' AND column_name = 'rule_category'
      ) THEN
        ALTER TABLE pricing_run_items ADD COLUMN rule_category TEXT;
      END IF;

      -- Add rule_level column
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'pricing_run_items' AND column_name = 'rule_level'
      ) THEN
        ALTER TABLE pricing_run_items ADD COLUMN rule_level TEXT;
      END IF;
    END $$;
  `;

  try {
    await db.query(alterTableSQL);
    console.log('✓ pricing_run_items table enhanced successfully');
  } catch (error) {
    // If error is permissions-related (42501), that's okay - migrations handle this
    if (error.code === '42501') {
      console.log('⚠️  Cannot modify pricing_run_items (permissions). This is expected if migrations have run.');
      return;
    }
    console.error('Error enhancing pricing_run_items table:', error);
    throw error;
  }
}

module.exports = {
  enhancePricingRunItemsTable,
};

