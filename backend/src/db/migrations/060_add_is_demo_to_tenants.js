/**
 * Migration 060: Add Demo Mode Flag to Tenants
 * 
 * Phase D: Demo Mode Safety and Banner
 * 
 * Purpose: Adds is_demo column to tenants table to support demo mode functionality.
 * - Demo tenants will have email sending suppressed
 * - Demo tenants will show a banner in the frontend
 * - Default is false to ensure no behavior change for existing tenants
 */

async function up(db) {
  if (!db) {
    throw new Error('Migration 060 requires db parameter. Use runAllMigrations.js to run migrations.');
  }

  console.log('');
  console.log('='.repeat(60));
  console.log('Migration 060: Add Demo Mode Flag to Tenants');
  console.log('='.repeat(60));
  console.log('');

  try {
    // Add is_demo column (BOOLEAN, NOT NULL, DEFAULT false)
    console.log('[1/1] Adding is_demo column to tenants table...');
    await db.query(`
      ALTER TABLE tenants
      ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;
    `);
    console.log('  ✓ Added is_demo column with NOT NULL DEFAULT false');

    // Create index for demo tenants (optional, for filtering)
    console.log('[2/2] Creating index on is_demo...');
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_tenants_is_demo
      ON tenants(is_demo)
      WHERE is_demo = true;
    `);
    console.log('  ✓ Created index on is_demo');

    console.log('');
    console.log('✅ Migration 060 completed successfully!');
    console.log('');
    console.log('Summary:');
    console.log('  - Added is_demo column (BOOLEAN NOT NULL DEFAULT false)');
    console.log('  - Created index on is_demo for demo tenants');
    console.log('  - All existing tenants will have is_demo = false (no behavior change)');
    console.log('');

  } catch (error) {
    console.error('');
    console.error('❌ Migration 060 failed:', error);
    console.error('');
    throw error;
  }
}

async function down(db) {
  if (!db) {
    throw new Error('Migration 060 requires db parameter. Use runAllMigrations.js to run migrations.');
  }

  console.log('');
  console.log('='.repeat(60));
  console.log('Rolling back Migration 060: Remove Demo Mode Flag');
  console.log('='.repeat(60));
  console.log('');

  try {
    // Drop index first
    console.log('[1/2] Dropping index on is_demo...');
    await db.query(`
      DROP INDEX IF EXISTS idx_tenants_is_demo;
    `);
    console.log('  ✓ Dropped index');

    // Drop column
    console.log('[2/2] Dropping is_demo column...');
    await db.query(`
      ALTER TABLE tenants
      DROP COLUMN IF EXISTS is_demo;
    `);
    console.log('  ✓ Dropped is_demo column');

    console.log('');
    console.log('✅ Rollback completed successfully');
    console.log('');

  } catch (error) {
    console.error('');
    console.error('❌ Rollback failed:', error);
    console.error('');
    throw error;
  }
}

module.exports = {
  up,
  down,
};

