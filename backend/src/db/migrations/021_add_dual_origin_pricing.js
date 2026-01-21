/**
 * Migration: Add Dual-Origin Pricing Support (Stage 3)
 * 
 * Purpose: Adds support for storing dual pricing (China and Non-China) in pricing_run_items
 * Part of: Stage 3 - Dual-Origin Pricing and AML/AVL Rules
 * 
 * This migration adds:
 * - dual_pricing_data JSONB column to store alternative origin pricing
 * - origin_selection_data JSONB column to store origin selection results
 */

async function up(db) {
  console.log('Running migration: 021_add_dual_origin_pricing');
  
  try {
    // Add dual_pricing_data column to pricing_run_items
    await db.query(`
      ALTER TABLE pricing_run_items
      ADD COLUMN IF NOT EXISTS dual_pricing_data JSONB;
    `);
    console.log('✅ Added dual_pricing_data column to pricing_run_items table');
    
    // Add origin_selection_data column to pricing_run_items
    await db.query(`
      ALTER TABLE pricing_run_items
      ADD COLUMN IF NOT EXISTS origin_selection_data JSONB;
    `);
    console.log('✅ Added origin_selection_data column to pricing_run_items table');
    
    // Add index for querying dual pricing data
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_pricing_run_items_dual_pricing
      ON pricing_run_items USING GIN (dual_pricing_data)
      WHERE dual_pricing_data IS NOT NULL;
    `);
    console.log('✅ Created GIN index on dual_pricing_data');
    
    // Add index for origin selection data
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_pricing_run_items_origin_selection
      ON pricing_run_items USING GIN (origin_selection_data)
      WHERE origin_selection_data IS NOT NULL;
    `);
    console.log('✅ Created GIN index on origin_selection_data');
    
    console.log('✅ Migration completed: Dual-origin pricing support added');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

async function down(db) {
  console.log('Rolling back migration: 021_add_dual_origin_pricing');
  
  try {
    // Remove indexes
    await db.query(`DROP INDEX IF EXISTS idx_pricing_run_items_origin_selection;`);
    await db.query(`DROP INDEX IF EXISTS idx_pricing_run_items_dual_pricing;`);
    
    // Remove columns
    await db.query(`ALTER TABLE pricing_run_items DROP COLUMN IF EXISTS origin_selection_data;`);
    await db.query(`ALTER TABLE pricing_run_items DROP COLUMN IF EXISTS dual_pricing_data;`);
    
    console.log('✅ Migration rolled back: Dual-origin pricing support removed');
    
  } catch (error) {
    console.error('❌ Rollback failed:', error);
    throw error;
  }
}

module.exports = { up, down };

