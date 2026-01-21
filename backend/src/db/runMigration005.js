/**
 * Migration runner for 005_create_document_extractions_table
 * Run with: node src/db/runMigration005.js
 */

// Load environment variables
require('dotenv').config();

const { connectDb } = require('./supabaseClient');
const migration = require('./migrations/005_create_document_extractions_table');

async function runMigration() {
  console.log('='.repeat(60));
  console.log('RUNNING MIGRATION: Create document_extractions Table');
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
