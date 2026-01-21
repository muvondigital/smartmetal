/**
 * Migration 016: Material Price History Tracking
 *
 * Creates price history table to track all material price changes over time.
 * This enables:
 * - Full audit trail of price changes
 * - Price trend analysis
 * - LME justification (e.g., "Price was $80 in Q1, now $84 in Q2")
 * - Historical price lookups
 *
 * Part of Phase 2: Manufacturer Price Management System
 */

async function up(db) {
  if (!db) {
    throw new Error('Migration 016 requires db parameter. Use runAllMigrations.js to run migrations.');
  }

  console.log('Running migration 016: Create material_price_history table...');

  try {
    // Create material_price_history table
    await db.query(`
      CREATE TABLE IF NOT EXISTS material_price_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        material_id UUID NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
        base_cost NUMERIC(12, 2) NOT NULL CHECK (base_cost >= 0),
        currency TEXT NOT NULL DEFAULT 'USD',
        effective_date DATE NOT NULL,
        source TEXT NOT NULL CHECK (source IN ('manufacturer_feed', 'manual_update', 'lme_adjustment', 'placeholder_estimate')),
        notes TEXT,
        uploaded_by TEXT,
        previous_base_cost NUMERIC(12, 2),
        price_change_pct NUMERIC(6, 2),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        
        -- Indexes will be created below
        CONSTRAINT material_price_history_currency_check CHECK (currency IN ('USD', 'MYR', 'IDR', 'SGD', 'EUR', 'CNY'))
      );
    `);

    console.log('✓ Created material_price_history table');

    // Create indexes for performance
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_material_price_history_material_id
      ON material_price_history(material_id);
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_material_price_history_effective_date
      ON material_price_history(effective_date DESC);
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_material_price_history_material_effective
      ON material_price_history(material_id, effective_date DESC);
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_material_price_history_source
      ON material_price_history(source);
    `);

    console.log('✓ Created indexes for material_price_history');

    // Create function to automatically calculate price_change_pct
    await db.query(`
      CREATE OR REPLACE FUNCTION calculate_price_change_pct()
      RETURNS TRIGGER AS $$
      BEGIN
        IF NEW.previous_base_cost IS NOT NULL AND NEW.previous_base_cost > 0 THEN
          NEW.price_change_pct := ROUND(
            ((NEW.base_cost - NEW.previous_base_cost) / NEW.previous_base_cost * 100)::NUMERIC,
            2
          );
        ELSE
          NEW.price_change_pct := NULL;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    console.log('✓ Created function to calculate price_change_pct');

    // Create trigger to automatically calculate price change percentage
    await db.query(`
      DROP TRIGGER IF EXISTS trigger_calculate_price_change_pct ON material_price_history;
      CREATE TRIGGER trigger_calculate_price_change_pct
      BEFORE INSERT OR UPDATE ON material_price_history
      FOR EACH ROW
      EXECUTE FUNCTION calculate_price_change_pct();
    `);

    console.log('✓ Created trigger for automatic price_change_pct calculation');

    // Create function to get previous price when inserting new price history
    await db.query(`
      CREATE OR REPLACE FUNCTION get_previous_material_price(material_uuid UUID, effective_dt DATE)
      RETURNS NUMERIC(12, 2) AS $$
      DECLARE
        prev_price NUMERIC(12, 2);
      BEGIN
        SELECT base_cost INTO prev_price
        FROM material_price_history
        WHERE material_id = material_uuid
          AND effective_date < effective_dt
        ORDER BY effective_date DESC
        LIMIT 1;
        
        -- If no history found, get current price from materials table
        IF prev_price IS NULL THEN
          SELECT base_cost INTO prev_price
          FROM materials
          WHERE id = material_uuid;
        END IF;
        
        RETURN prev_price;
      END;
      $$ LANGUAGE plpgsql;
    `);

    console.log('✓ Created function to get previous material price');

    console.log('Migration 016 completed successfully!');

  } catch (error) {
    console.error('Migration 016 failed:', error);
    throw error;
  }
}

async function down(db) {
  if (!db) {
    throw new Error('Migration 016 requires db parameter. Use runAllMigrations.js to run migrations.');
  }

  console.log('Rolling back migration 016...');

  try {
    // Drop trigger
    await db.query(`
      DROP TRIGGER IF EXISTS trigger_calculate_price_change_pct ON material_price_history;
    `);

    // Drop functions
    await db.query(`
      DROP FUNCTION IF EXISTS calculate_price_change_pct();
      DROP FUNCTION IF EXISTS get_previous_material_price(UUID, DATE);
    `);

    // Drop table (will cascade indexes)
    await db.query(`
      DROP TABLE IF EXISTS material_price_history CASCADE;
    `);

    console.log('Migration 016 rolled back successfully!');

  } catch (error) {
    console.error('Rollback failed:', error);
    throw error;
  }
}

// Run migration if called directly
if (require.main === module) {
  up()
    .then(() => {
      console.log('\n✅ Migration 016 completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Migration 016 failed:', error);
      process.exit(1);
    });
}

module.exports = { up, down };

