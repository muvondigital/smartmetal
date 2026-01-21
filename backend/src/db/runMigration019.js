/**
 * Migration Runner: 019_add_multi_level_approval
 * 
 * Executes migration 019 to add multi-level approval workflow support
 * 
 * Usage: node backend/src/db/runMigration019.js
 */

require('dotenv').config();
const { connectDb } = require('./supabaseClient');
const migration = require('./migrations/019_add_multi_level_approval');

async function runMigration() {
  console.log('🚀 Running migration: 019_add_multi_level_approval');
  console.log('   This migration adds multi-level approval workflow support');
  console.log('   - Approval level tracking (0-4)');
  console.log('   - Level-specific approval columns (sales, procurement, management)');
  console.log('   - SLA tracking and enforcement');
  console.log('   - Escalation and backup approver support');
  console.log('');
  
  const db = await connectDb();
  
  try {
    await migration.up(db);
    console.log('');
    console.log('✅ Migration 019 completed successfully!');
    console.log('');
    console.log('Next steps:');
    console.log('1. Configure approval thresholds in backend/src/config/approvalRules.js');
    console.log('2. Set backup approver emails in backend/src/config/approvalRules.js');
    console.log('3. Set up SLA enforcement job (see backend/src/jobs/slaEnforcementJob.js)');
    console.log('4. Test the multi-level approval workflow');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    console.log('');
    console.log('Attempting rollback...');
    try {
      await migration.down(db);
      console.log('✅ Rollback completed');
    } catch (rollbackError) {
      console.error('❌ Rollback failed:', rollbackError);
    }
    process.exit(1);
  }
}

runMigration();

