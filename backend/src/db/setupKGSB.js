/**
 * Complete KGSB Setup Script
 * Runs both migration and catalog seeding in one go
 *
 * Usage: node src/db/setupKGSB.js
 */

// Load environment variables
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const migration = require('./migrations/001_fix_critical_gaps');
const { seedKGSBCatalog } = require('./seeds/seedKGSBCatalog');

async function setup() {
  console.log('');
  console.log('═'.repeat(70));
  console.log('  KGSB PRICER SETUP');
  console.log('  Fixing Database Gaps + Seeding KGSB Catalog');
  console.log('═'.repeat(70));
  console.log('');

  try {
    // Step 1: Run migration to fix database gaps
    console.log('STEP 1: Running database migration...');
    console.log('─'.repeat(70));
    await migration.up();
    console.log('');

    // Step 2: Seed KGSB catalog
    console.log('STEP 2: Seeding KGSB catalog...');
    console.log('─'.repeat(70));
    await seedKGSBCatalog();
    console.log('');

    // Success summary
    console.log('═'.repeat(70));
    console.log('✅ SETUP COMPLETED SUCCESSFULLY');
    console.log('═'.repeat(70));
    console.log('');
    console.log('Summary:');
    console.log('  ✓ Fixed orphaned material_code issue (added FK constraint)');
    console.log('  ✓ Added missing database indexes for faster queries');
    console.log('  ✓ Seeded 500+ KGSB grating catalog items');
    console.log('');
    console.log('Your database is now ready for KGSB grating RFQs!');
    console.log('');

    process.exit(0);
  } catch (error) {
    console.log('');
    console.log('═'.repeat(70));
    console.log('❌ SETUP FAILED');
    console.log('═'.repeat(70));
    console.error(error);
    console.log('');
    process.exit(1);
  }
}

setup();
