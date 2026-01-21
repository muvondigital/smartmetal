/**
 * Migration runner script for Stage 8 Regulatory Integration
 * Run with: node src/db/runMigration022.js
 */

const { connectDb } = require('./supabaseClient');
const migration = require('./migrations/022_create_stage8_regulatory_tables');

async function runMigration() {
  console.log('='.repeat(60));
  console.log('RUNNING MIGRATION: Stage 8 Regulatory Integration');
  console.log('='.repeat(60));
  console.log('');

  const db = await connectDb();
  console.log('✅ Database connected');

  try {
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

