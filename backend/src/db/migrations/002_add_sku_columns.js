require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });

/**
 * Migration: Add SKU columns to materials table
 * 
 * Adds:
 * - sku: VARCHAR(128), UNIQUE, NOT NULL (after backfill)
 * - sku_attributes: JSONB for structured attribute storage
 * - sku_generated: BOOLEAN flag
 * - Index on sku for fast lookup
 */
async function addSkuColumns(db) {
  // db parameter is REQUIRED - migrations must use MIGRATION_DATABASE_URL
  if (!db) {
    throw new Error('Migration 002 requires db parameter. Migrations must use MIGRATION_DATABASE_URL.');
  }

  console.log('Starting migration: Add SKU columns to materials table...');

  try {
    // Check if materials table exists
    const materialsExists = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'materials'
      );
    `);
    
    if (!materialsExists.rows[0].exists) {
      console.log('⚠️  materials table does not exist, skipping SKU columns migration');
      return;
    }

    // Step 1: Add sku_attributes column (nullable initially)
    console.log('Adding sku_attributes column...');
    await db.query(`
      ALTER TABLE materials
      ADD COLUMN IF NOT EXISTS sku_attributes JSONB;
    `);

    // Step 2: Add sku_generated flag
    console.log('Adding sku_generated flag...');
    await db.query(`
      ALTER TABLE materials
      ADD COLUMN IF NOT EXISTS sku_generated BOOLEAN DEFAULT FALSE;
    `);

    // Step 3: Add sku column (nullable initially, will be set to NOT NULL after backfill)
    console.log('Adding sku column (nullable for now)...');
    await db.query(`
      ALTER TABLE materials
      ADD COLUMN IF NOT EXISTS sku VARCHAR(128);
    `);

    // Step 4: Create index on sku
    console.log('Creating index on sku column...');
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_materials_sku ON materials(sku);
    `);

    // Step 5: Create index on sku_attributes for JSONB queries
    console.log('Creating GIN index on sku_attributes...');
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_materials_sku_attributes ON materials USING GIN (sku_attributes);
    `);

    console.log('✅ Migration completed successfully!');
    console.log('');
    console.log('Next steps:');
    console.log('1. Run the backfill script to generate SKUs for all materials');
    console.log('2. After backfill, run the final migration to set sku as NOT NULL and UNIQUE');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

/**
 * Final migration step: Set sku as NOT NULL and UNIQUE after backfill
 */
async function finalizeSkuColumn(db) {
  if (!db) {
    throw new Error('Migration 002 finalizeSkuColumn() requires db parameter. Migrations must use MIGRATION_DATABASE_URL.');
  }

  console.log('Finalizing SKU column: Setting NOT NULL and UNIQUE constraints...');

  try {
    // Check if all materials have SKUs
    const result = await db.query(`
      SELECT COUNT(*) as total, COUNT(sku) as with_sku
      FROM materials;
    `);

    const { total, with_sku } = result.rows[0];

    if (parseInt(with_sku) < parseInt(total)) {
      throw new Error(
        `Cannot finalize: ${parseInt(total) - parseInt(with_sku)} materials are missing SKUs. Run backfill first.`
      );
    }

    // Add UNIQUE constraint
    console.log('Adding UNIQUE constraint on sku...');
    await db.query(`
      ALTER TABLE materials
      ADD CONSTRAINT materials_sku_unique UNIQUE (sku);
    `);

    // Set NOT NULL
    console.log('Setting sku as NOT NULL...');
    await db.query(`
      ALTER TABLE materials
      ALTER COLUMN sku SET NOT NULL;
    `);

    console.log('✅ SKU column finalized successfully!');
  } catch (error) {
    console.error('❌ Finalization failed:', error);
    throw error;
  }
}

// Run migration if called directly
if (require.main === module) {
  addSkuColumns()
    .then(() => {
      console.log('Migration script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration script failed:', error);
      process.exit(1);
    });
}

module.exports = {
  addSkuColumns,
  finalizeSkuColumn,
};

