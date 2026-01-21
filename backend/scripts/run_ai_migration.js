/**
 * Run AI Approval Migration
 * Adds AI columns to pricing_runs table
 */

require('dotenv').config();
const migration = require('../src/db/migrations/004_add_ai_approval_columns');

async function runMigration() {
  console.log('');
  console.log('='.repeat(70));
  console.log('AI APPROVAL MIGRATION - Stage 1');
  console.log('='.repeat(70));
  console.log('');

  try {
    await migration.up();
    console.log('');
    console.log('='.repeat(70));
    console.log('✅ MIGRATION COMPLETED SUCCESSFULLY!');
    console.log('='.repeat(70));
    console.log('');
    console.log('Added AI columns to pricing_runs:');
    console.log('  ✅ ai_risk_level, ai_risk_score, ai_recommendation');
    console.log('  ✅ ai_risk_factors (JSONB), ai_rationale, ai_key_points');
    console.log('  ✅ ai_warnings, ai_confidence, ai_assessed_at');
    console.log('');
    process.exit(0);
  } catch (error) {
    console.error('');
    console.error('='.repeat(70));
    console.error('❌ MIGRATION FAILED');
    console.error('='.repeat(70));
    console.error('Error:', error.message);
    console.error('');
    process.exit(1);
  }
}

runMigration();

