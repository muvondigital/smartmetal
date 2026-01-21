/**
 * Migration runner for 017_create_mto_extractions_table
 * Run with: node src/db/runMigration017.js
 */

// Load environment variables
require('dotenv').config();

const { connectDb } = require('./supabaseClient');
const migration = require('./migrations/017_create_mto_extractions_table');

async function runMigration() {
  console.log('='.repeat(60));
  console.log('RUNNING MIGRATION: Create mto_extractions Table');
  console.log('Phase 0.5 - Enhanced MTO Extraction');
  console.log('='.repeat(60));
  console.log('');

  let db;
  try {
    // Connect to database
    db = await connectDb();
    console.log('✅ Database connected');
    console.log('');

    // Run migration
    await migration.up(db);

    console.log('');
    console.log('='.repeat(60));
    console.log('✅ MIGRATION COMPLETED SUCCESSFULLY');
    console.log('='.repeat(60));
    console.log('');
    console.log('The mto_extractions table has been created.');
    console.log('Phase 0.5 database setup is complete.');
    console.log('');
    process.exit(0);
  } catch (error) {
    console.log('');
    console.log('='.repeat(60));
    console.log('❌ MIGRATION FAILED');
    console.log('='.repeat(60));
    console.error(error);
    console.log('');
    console.log('Please check:');
    console.log('  1. DATABASE_URL is set correctly in .env file');
    console.log('  2. Database is accessible');
    console.log('  3. document_extractions table exists (prerequisite)');
    console.log('');
    process.exit(1);
  }
}

runMigration();

