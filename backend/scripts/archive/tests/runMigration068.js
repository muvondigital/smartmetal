/**
 * Run migration 068: Add document_type to rfqs table
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const migration = require('../src/db/migrations/068_add_document_type_to_rfqs.js');
const { connectMigrationDb } = require('../src/db/supabaseClient');

async function runMigration068() {
  console.log('Running migration 068: Add document_type to rfqs table');
  console.log('');
  
  const db = await connectMigrationDb();
  
  try {
    await migration.up(db);
    console.log('');
    console.log('✅ Migration 068 completed successfully');
  } catch (error) {
    console.error('');
    console.error('❌ Migration 068 failed:', error.message);
    console.error(error.stack);
    throw error;
  } finally {
    await db.end();
  }
}

if (require.main === module) {
  runMigration068()
    .then(() => {
      console.log('✅ Script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Script failed:', error);
      process.exit(1);
    });
}

module.exports = { runMigration068 };
