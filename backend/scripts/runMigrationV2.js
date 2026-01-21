/**
 * Script to run Pricer V2 database migration and seed data
 *
 * Usage:
 *   node backend/scripts/runMigrationV2.js
 */

require('dotenv').config();
const { enhancePricerV2 } = require('../src/db/enhancePricerV2');
const { seedPricerV2 } = require('../src/db/seeds/seedPricerV2');

async function runMigration() {
  console.log('');
  console.log('='.repeat(70));
  console.log('PRICER V2 MIGRATION - Vendavo-Inspired Enhancements');
  console.log('='.repeat(70));
  console.log('');

  try {
    // Step 1: Run migration
    console.log('STEP 1: Running database migration...');
    console.log('-'.repeat(70));
    await enhancePricerV2();

    console.log('');
    console.log('STEP 2: Seeding test data...');
    console.log('-'.repeat(70));
    await seedPricerV2();

    console.log('');
    console.log('='.repeat(70));
    console.log('✅ MIGRATION COMPLETED SUCCESSFULLY!');
    console.log('='.repeat(70));
    console.log('');
    console.log('Your database now includes:');
    console.log('  ✅ Price Agreements Module (Phase 1)');
    console.log('  ✅ Approval Workflow System (Phase 2)');
    console.log('  ✅ Analytics Support (Phase 3)');
    console.log('');
    console.log('Next steps:');
    console.log('  1. Review the new tables in your database');
    console.log('  2. Test with sample queries (see testMigration.js)');
    console.log('  3. Start building backend services (Week 2)');
    console.log('');

    process.exit(0);
  } catch (error) {
    console.error('');
    console.error('='.repeat(70));
    console.error('❌ MIGRATION FAILED');
    console.error('='.repeat(70));
    console.error('Error:', error.message);
    console.error('');
    console.error('Please check:');
    console.error('  1. DATABASE_URL is set correctly in .env');
    console.error('  2. Database is accessible');
    console.error('  3. Required tables (clients, materials, etc.) exist');
    console.error('');
    process.exit(1);
  }
}

runMigration();
