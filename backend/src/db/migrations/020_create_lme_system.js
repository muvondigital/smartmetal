/**
 * Migration 020: LME Pricing Engine System
 * 
 * Purpose: Creates LME price tracking infrastructure for Stage 5
 * Part of: Stage 5 - LME Pricing Engine
 * 
 * Components:
 * - lme_prices table: Stores LME commodity prices (Nickel, Copper, Moly)
 * - Material-commodity mapping: Adds lme_commodity and lme_sensitivity to materials table
 * 
 * Confirmed NSC Values:
 * - Metals: Nickel, Copper, Moly
 * - Cycle: Quarterly
 * - Adjustment threshold: 3% movement
 */

async function up(db) {
  console.log('Running migration: 020_create_lme_system');
  
  try {
    // 1. Create lme_prices table
    await db.query(`
      CREATE TABLE IF NOT EXISTS lme_prices (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        commodity TEXT NOT NULL CHECK (commodity IN ('nickel', 'copper', 'moly')),
        price_usd_per_ton NUMERIC(12, 2) NOT NULL,
        effective_date DATE NOT NULL,
        quarter TEXT, -- 'Q1-2025', 'Q2-2025', etc.
        source TEXT DEFAULT 'manual_entry' CHECK (source IN ('lme_api', 'manual_entry')),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        created_by TEXT,
        notes TEXT,
        UNIQUE(commodity, effective_date)
      );
    `);
    console.log('✅ Created lme_prices table');
    
    // 2. Create index on commodity and effective_date for quick lookups
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_lme_prices_commodity_date
      ON lme_prices(commodity, effective_date DESC);
    `);
    console.log('✅ Created index on lme_prices(commodity, effective_date)');
    
    // 3. Create index on quarter for quarterly queries
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_lme_prices_quarter
      ON lme_prices(quarter)
      WHERE quarter IS NOT NULL;
    `);
    console.log('✅ Created index on lme_prices(quarter)');
    
    // 4. Add LME columns to materials table
    await db.query(`
      ALTER TABLE materials
      ADD COLUMN IF NOT EXISTS lme_commodity TEXT 
        CHECK (lme_commodity IS NULL OR lme_commodity IN ('nickel', 'copper', 'moly')),
      ADD COLUMN IF NOT EXISTS lme_sensitivity NUMERIC(5, 4) 
        CHECK (lme_sensitivity IS NULL OR (lme_sensitivity >= 0 AND lme_sensitivity <= 1));
    `);
    console.log('✅ Added lme_commodity and lme_sensitivity columns to materials table');
    
    // 5. Create index on materials.lme_commodity for quick filtering
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_materials_lme_commodity
      ON materials(lme_commodity)
      WHERE lme_commodity IS NOT NULL;
    `);
    console.log('✅ Created index on materials(lme_commodity)');
    
    // 6. Create price_adjustments table to track LME-based price changes
    await db.query(`
      CREATE TABLE IF NOT EXISTS price_adjustments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        material_id UUID REFERENCES materials(id) ON DELETE CASCADE,
        commodity TEXT NOT NULL,
        previous_price NUMERIC(12, 2),
        adjusted_price NUMERIC(12, 2),
        lme_previous_price NUMERIC(12, 2) NOT NULL,
        lme_current_price NUMERIC(12, 2) NOT NULL,
        lme_movement_percent NUMERIC(8, 4) NOT NULL,
        price_adjustment_percent NUMERIC(8, 4) NOT NULL,
        quarter TEXT,
        effective_date DATE NOT NULL,
        justification_report_id UUID,
        status TEXT DEFAULT 'suggested' CHECK (status IN ('suggested', 'applied', 'rejected')),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        created_by TEXT,
        applied_at TIMESTAMP WITH TIME ZONE,
        applied_by TEXT,
        notes TEXT
      );
    `);
    console.log('✅ Created price_adjustments table');
    
    // 7. Create index on price_adjustments for filtering by status and quarter
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_price_adjustments_status
      ON price_adjustments(status, quarter, effective_date DESC);
    `);
    console.log('✅ Created index on price_adjustments(status, quarter)');
    
    console.log('✅ Migration completed: LME pricing system created');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

async function down(db) {
  console.log('Rolling back migration: 020_create_lme_system');
  
  try {
    // Remove indexes
    await db.query(`DROP INDEX IF EXISTS idx_price_adjustments_status;`);
    await db.query(`DROP INDEX IF EXISTS idx_materials_lme_commodity;`);
    await db.query(`DROP INDEX IF EXISTS idx_lme_prices_quarter;`);
    await db.query(`DROP INDEX IF EXISTS idx_lme_prices_commodity_date;`);
    
    // Remove tables
    await db.query(`DROP TABLE IF EXISTS price_adjustments;`);
    
    // Remove columns from materials table
    await db.query(`
      ALTER TABLE materials
      DROP COLUMN IF EXISTS lme_sensitivity,
      DROP COLUMN IF EXISTS lme_commodity;
    `);
    
    // Remove lme_prices table
    await db.query(`DROP TABLE IF EXISTS lme_prices;`);
    
    console.log('✅ Migration rolled back: LME pricing system removed');
    
  } catch (error) {
    console.error('❌ Rollback failed:', error);
    throw error;
  }
}

module.exports = { up, down };

