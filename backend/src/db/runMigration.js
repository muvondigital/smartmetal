/**
 * Migration runner script
 * Run with: node src/db/runMigration.js
 */

const migration = require('./migrations/001_fix_critical_gaps');

async function runMigration() {
  console.log('='.repeat(60));
  console.log('RUNNING DATABASE MIGRATION: Fix Critical Gaps');
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
