/**
 * Migration runner script for 014_add_size_to_rfq_items
 * Run with: node src/db/runMigration014.js
 */

const migration = require('./migrations/014_add_size_to_rfq_items');

async function runMigration() {
  console.log('='.repeat(60));
  console.log('RUNNING DATABASE MIGRATION: Add Size to RFQ Items');
  console.log('='.repeat(60));
  console.log('');

  try {
    await migration.up();
    console.log('');
    console.log('='.repeat(60));
    console.log('✅ MIGRATION COMPLETED SUCCESSFULLY');
    console.log('='.repeat(60));
    process.exit(0);
  } catch (error) {
    console.log('');
    console.log('='.repeat(60));
    console.log('❌ MIGRATION FAILED');
    console.log('='.repeat(60));
    console.error(error);
    process.exit(1);
  }
}

runMigration();
