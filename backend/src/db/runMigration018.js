/**
 * Migration runner for 018_add_project_type_support
 * Run with: node src/db/runMigration018.js
 */

// Load environment variables
require('dotenv').config();

const { connectDb } = require('./supabaseClient');
const migration = require('./migrations/018_add_project_type_support');

async function runMigration() {
  console.log('='.repeat(60));
  console.log('RUNNING MIGRATION: Add Project Type Support');
  console.log('Phase 3 - Advanced Pricing Logic');
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
    console.log('Project type support has been added to:');
    console.log('  - rfqs table (project_type column)');
    console.log('  - client_pricing_rules table (project_type column)');
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
    console.log('  3. Required tables (rfqs, client_pricing_rules) exist');
    console.log('');
    process.exit(1);
  }
}

runMigration();

