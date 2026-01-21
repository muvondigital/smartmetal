const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

/**
 * Migration runner script for 048_create_knowledge_base_articles
 * Run with: node src/db/runMigration048.js
 */

const migration = require('./migrations/048_create_knowledge_base_articles');

async function runMigration() {
  console.log('='.repeat(60));
  console.log('RUNNING DATABASE MIGRATION 048: Knowledge Base Articles');
  console.log('='.repeat(60));
  console.log('');

  try {
    await migration.up();
    console.log('');
    console.log('='.repeat(60));
    console.log('✅ MIGRATION 048 COMPLETED SUCCESSFULLY');
    console.log('='.repeat(60));
    process.exit(0);
  } catch (error) {
    console.log('');
    console.log('='.repeat(60));
    console.log('❌ MIGRATION 048 FAILED');
    console.log('='.repeat(60));
    console.error(error);
    process.exit(1);
  }
}

runMigration();
