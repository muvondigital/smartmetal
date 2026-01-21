/**
 * Force run migration 032 with explicit output
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

console.log('='.repeat(70));
console.log('FORCE RUNNING MIGRATION 032: Create Agreement V2 Tables');
console.log('='.repeat(70));
console.log('');

const migration032 = require('../src/db/migrations/032_create_agreement_v2_tables');

migration032.up()
  .then(() => {
    console.log('');
    console.log('='.repeat(70));
    console.log('✅ MIGRATION 032 COMPLETED SUCCESSFULLY');
    console.log('='.repeat(70));
    console.log('');
    console.log('Next steps:');
    console.log('  1. Verify tables exist');
    console.log('  2. Restart backend server');
    console.log('  3. Test creating an agreement');
    process.exit(0);
  })
  .catch((error) => {
    console.error('');
    console.error('='.repeat(70));
    console.error('❌ MIGRATION 032 FAILED');
    console.error('='.repeat(70));
    console.error('');
    console.error('Error:', error.message);
    console.error('Code:', error.code);
    if (error.stack) {
      console.error('');
      console.error('Stack trace:');
      console.error(error.stack);
    }
    console.error('');
    process.exit(1);
  });
