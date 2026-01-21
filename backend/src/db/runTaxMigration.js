/**
 * Run Tax System Migration
 *
 * Executes migration 015 to create tax compliance infrastructure
 */

const migration = require('./migrations/015_create_tax_system');

async function runMigration() {
  console.log('='.repeat(60));
  console.log('TAX SYSTEM MIGRATION');
  console.log('='.repeat(60));
  console.log('');

  try {
    console.log('Starting migration...');
    await migration.up();
    console.log('');
    console.log('✓ Migration completed successfully!');
    console.log('');
    console.log('Tax system is now ready with:');
    console.log('  • Malaysia SST (6%)');
    console.log('  • Indonesia VAT (11%)');
    console.log('  • Singapore GST (9%)');
    console.log('  • Tax exemption categories');
    console.log('');
    process.exit(0);
  } catch (error) {
    console.error('');
    console.error('✗ Migration failed!');
    console.error('Error:', error.message);
    console.error('');
    process.exit(1);
  }
}

runMigration();
