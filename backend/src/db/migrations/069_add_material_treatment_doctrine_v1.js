/**
 * Migration: Add Material Treatment Doctrine v1 to rfq_items table
 *
 * Purpose: Classify each commercial request item (rfq_item) into treatment types:
 * - CANONICAL: Standard catalog items with no customization
 * - PARAMETERIZED: Catalog items with specific parameters (length, cut size, etc.)
 * - PROJECT_SPECIFIC: Custom fabrications, assemblies, or project-unique items
 *
 * This migration:
 * 1. Adds material_treatment_type column to rfq_items table (default 'CANONICAL')
 * 2. Adds item_parameters JSONB column for storing extracted parameters
 * 3. Creates btree index on material_treatment_type for filtering
 * 4. Creates GIN index on item_parameters for JSONB queries
 *
 * Part of: Material Treatment Doctrine v1 - Catalog Write-Safety
 * Migration number: 069
 */

async function up(db) {
  console.log('Running migration: 069_add_material_treatment_doctrine_v1');

  // Step 1: Add material_treatment_type column with default 'CANONICAL' for backward compatibility
  console.log('  Adding material_treatment_type column to rfq_items table...');
  await db.query(`
    ALTER TABLE rfq_items
    ADD COLUMN IF NOT EXISTS material_treatment_type TEXT DEFAULT 'CANONICAL'
      CHECK (material_treatment_type IN ('CANONICAL', 'PARAMETERIZED', 'PROJECT_SPECIFIC'));
  `);

  // Step 2: Update existing records to have material_treatment_type = 'CANONICAL' (if NULL)
  console.log('  Updating existing records to default to CANONICAL...');
  await db.query(`
    UPDATE rfq_items
    SET material_treatment_type = 'CANONICAL'
    WHERE material_treatment_type IS NULL;
  `);

  // Step 3: Make material_treatment_type NOT NULL after setting defaults
  console.log('  Making material_treatment_type NOT NULL...');
  await db.query(`
    ALTER TABLE rfq_items
    ALTER COLUMN material_treatment_type SET NOT NULL;
  `);

  // Step 4: Add item_parameters JSONB column (nullable - only populated when parameters exist)
  console.log('  Adding item_parameters JSONB column to rfq_items table...');
  await db.query(`
    ALTER TABLE rfq_items
    ADD COLUMN IF NOT EXISTS item_parameters JSONB NULL;
  `);

  // Step 5: Create btree index on material_treatment_type for filtering
  console.log('  Creating btree index on material_treatment_type...');
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_rfq_items_treatment
    ON rfq_items(tenant_id, material_treatment_type);
  `);

  // Step 6: Create GIN index on item_parameters for JSONB queries
  console.log('  Creating GIN index on item_parameters...');
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_rfq_items_parameters
    ON rfq_items USING GIN (item_parameters);
  `);

  console.log('✓ Migration 069 completed: Material Treatment Doctrine v1 schema added');
}

async function down(db) {
  console.log('Rolling back migration: 069_add_material_treatment_doctrine_v1');

  // Drop indexes first
  console.log('  Dropping indexes...');
  await db.query(`DROP INDEX IF EXISTS idx_rfq_items_parameters;`);
  await db.query(`DROP INDEX IF EXISTS idx_rfq_items_treatment;`);

  // Remove columns
  console.log('  Removing columns...');
  await db.query(`ALTER TABLE rfq_items DROP COLUMN IF EXISTS item_parameters;`);
  await db.query(`ALTER TABLE rfq_items DROP COLUMN IF EXISTS material_treatment_type;`);

  console.log('✓ Migration 069 rolled back');
}

module.exports = { up, down };
