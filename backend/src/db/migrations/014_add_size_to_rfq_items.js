// Load environment variables
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });

/**
 * Migration: Add size columns to rfq_items table
 *
 * Adds size_display, size1_raw, and size2_raw columns to store parsed size information
 * from RFQ documents (e.g., "6\"", "12\"", "24\"")
 */
async function up(db) {
  if (!db) {
    throw new Error('Migration 014 requires db parameter. Use runAllMigrations.js to run migrations.');
  }

  console.log('Running migration: Add size columns to rfq_items');

  try {
    await db.query(`
      ALTER TABLE rfq_items
      ADD COLUMN IF NOT EXISTS size_display TEXT,
      ADD COLUMN IF NOT EXISTS size1_raw TEXT,
      ADD COLUMN IF NOT EXISTS size2_raw TEXT;
    `);
    console.log('✓ Added size columns to rfq_items: size_display, size1_raw, size2_raw');

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
    throw new Error('Migration 014 requires db parameter. Use runAllMigrations.js to run migrations.');
  }

  console.log('Rolling back migration: Add size columns to rfq_items');

  try {
    await db.query(`
      ALTER TABLE rfq_items
      DROP COLUMN IF EXISTS size_display,
      DROP COLUMN IF EXISTS size1_raw,
      DROP COLUMN IF EXISTS size2_raw;
    `);
    console.log('✓ Removed size columns from rfq_items');

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
