// Load environment variables
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

/**
 * Migration: Fix Critical Database Gaps
 *
 * Critical Issue #1: Orphaned Material Codes
 * - rfq_items.material_code is TEXT with no foreign key to materials.material_code
 * - Risk: Invalid codes silently accepted → pricing fails later
 * - Fix: Add FK validation
 *
 * Critical Issue #2: Missing Indexes Slowing Queries
 * - Dashboard queries scan entire table instead of indexed subset
 * - Fix: Add composite indexes for common query patterns
 */
async function up(db) {
  // db parameter is REQUIRED - migrations must use MIGRATION_DATABASE_URL
  if (!db) {
    throw new Error('Migration 001 requires db parameter. Migrations must use MIGRATION_DATABASE_URL.');
  }

  console.log('Running migration: Fix Critical Database Gaps');

  try {
    // CRITICAL FIX #1: Add foreign key constraint to rfq_items.material_code
    // This ensures only valid material codes can be referenced
    // First check if both tables exist (they should after migration 000)
    const tablesCheck = await db.query(`
      SELECT
        (SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'materials'
        )) AS materials_exists,
        (SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'rfq_items'
        )) AS rfq_items_exists;
    `);

    const materialsExists = tablesCheck.rows[0].materials_exists;
    const rfqItemsExists = tablesCheck.rows[0].rfq_items_exists;

    if (!materialsExists || !rfqItemsExists) {
      console.log('⚠️  Required tables do not exist yet, skipping FK constraint');
      console.log(`   materials table: ${materialsExists ? 'EXISTS' : 'MISSING'}`);
      console.log(`   rfq_items table: ${rfqItemsExists ? 'EXISTS' : 'MISSING'}`);
    } else {
      // Check if constraint already exists
      const constraintCheck = await db.query(`
        SELECT constraint_name
        FROM information_schema.table_constraints
        WHERE table_name = 'rfq_items'
          AND constraint_name = 'fk_rfq_items_material_code'
          AND constraint_type = 'FOREIGN KEY';
      `);

      if (constraintCheck.rows.length === 0) {
        try {
          // Try to add foreign key constraint for material_code validation
          // Note: This may fail if migration 058 has changed material_code to per-tenant unique
          // (tenant_id, material_code) instead of global unique (material_code)
          await db.query(`
            -- Add foreign key constraint for material_code validation
            -- Note: ON DELETE SET NULL allows materials to be deleted without cascading to rfq_items
            ALTER TABLE rfq_items
            ADD CONSTRAINT fk_rfq_items_material_code
            FOREIGN KEY (material_code)
            REFERENCES materials(material_code)
            ON DELETE SET NULL;
          `);
          console.log('✓ Added FK constraint: rfq_items.material_code → materials.material_code');
        } catch (fkError) {
          // If FK creation fails (e.g., due to migration 058 changing material_code to per-tenant unique),
          // log a warning but don't fail the migration
          // This is expected if migration 058 has run, which changes material_code to (tenant_id, material_code) unique
          if (fkError.code === '42830' || fkError.message.includes('unique constraint')) {
            console.log('⚠️  Skipping FK constraint: materials.material_code unique constraint not found');
            console.log('   Note: This is expected if migration 058 has run (per-tenant material_code uniqueness)');
            console.log('   The FK constraint cannot be created on a composite unique constraint');
            console.log('   Material code validation will be handled at application level');
          } else {
            // Re-throw unexpected errors
            throw fkError;
          }
        }
      } else {
        console.log('✓ FK constraint already exists: rfq_items.material_code → materials.material_code');
      }
    }

    // CRITICAL FIX #2: Add composite indexes for common query patterns
    // Only create indexes if the tables exist

    // Index for dashboard query: WHERE approval_status IN (...) AND created_at >= ...
    const pricingRunsExists = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'pricing_runs'
      );
    `);
    if (pricingRunsExists.rows[0].exists) {
      await db.query(`
        CREATE INDEX IF NOT EXISTS idx_pricing_runs_approval_status_created
        ON pricing_runs(approval_status, created_at DESC);
      `);
      console.log('✓ Added index: pricing_runs(approval_status, created_at)');
    } else {
      console.log('⚠️  pricing_runs table does not exist, skipping index');
    }

    // Index for RFQ status queries
    const rfqsExists = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'rfqs'
      );
    `);
    if (rfqsExists.rows[0].exists) {
      // Check if required columns exist
      const rfqsColumns = await db.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'rfqs' 
        AND column_name IN ('status', 'created_at')
      `);
      const hasStatus = rfqsColumns.rows.some(r => r.column_name === 'status');
      const hasCreatedAt = rfqsColumns.rows.some(r => r.column_name === 'created_at');
      
      if (hasStatus && hasCreatedAt) {
        await db.query(`
          CREATE INDEX IF NOT EXISTS idx_rfqs_status_created
          ON rfqs(status, created_at DESC);
        `);
        console.log('✓ Added index: rfqs(status, created_at)');
      } else {
        console.log('⚠️  rfqs table missing required columns (status, created_at), skipping index');
      }
    } else {
      console.log('⚠️  rfqs table does not exist, skipping index');
    }

    // Index for material origin type filtering (common in pricing)
    const materialsTableCheck = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'materials'
      );
    `);
    if (materialsTableCheck.rows[0].exists) {
      await db.query(`
        CREATE INDEX IF NOT EXISTS idx_materials_origin_category
        ON materials(origin_type, category);
    `);
      console.log('✓ Added index: materials(origin_type, category)');
    } else {
      console.log('⚠️  materials table does not exist, skipping index');
    }

    // Index for pricing run items with material references
    const pricingRunItemsExists = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'pricing_run_items'
      );
    `);
    if (pricingRunItemsExists.rows[0].exists) {
      await db.query(`
        CREATE INDEX IF NOT EXISTS idx_pricing_run_items_material
        ON pricing_run_items(pricing_run_id, rfq_item_id);
      `);
      console.log('✓ Added index: pricing_run_items(pricing_run_id, rfq_item_id)');
    } else {
      console.log('⚠️  pricing_run_items table does not exist, skipping index');
    }

    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  }
}

/**
 * Rollback migration
 */
async function down(db) {
  if (!db) {
    throw new Error('Migration 001 down() requires db parameter. Migrations must use MIGRATION_DATABASE_URL.');
  }

  console.log('Rolling back migration: Fix Critical Database Gaps');

  try {
    // Remove FK constraint
    await db.query(`
      ALTER TABLE rfq_items
      DROP CONSTRAINT IF EXISTS fk_rfq_items_material_code;
    `);
    console.log('✓ Removed FK constraint: fk_rfq_items_material_code');

    // Remove indexes
    await db.query(`
      DROP INDEX IF EXISTS idx_pricing_runs_approval_status_created;
      DROP INDEX IF EXISTS idx_rfqs_status_created;
      DROP INDEX IF EXISTS idx_materials_origin_category;
      DROP INDEX IF EXISTS idx_pricing_run_items_material;
    `);
    console.log('✓ Removed indexes');

    console.log('Rollback completed successfully');
  } catch (error) {
    console.error('Rollback failed:', error);
    throw error;
  }
}

module.exports = {
  up,
  down,
};
