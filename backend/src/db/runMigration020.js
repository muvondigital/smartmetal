/**
 * Run LME Pricing Engine Migration
 * 
 * Executes migration 020 to create LME pricing infrastructure
 * Part of: Stage 5 - LME Pricing Engine
 * 
 * Usage:
 *   node backend/src/db/runMigration020.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { connectDb } = require('./supabaseClient');
const migration = require('./migrations/020_create_lme_system');

async function runMigration() {
  console.log('🚀 Running migration: 020_create_lme_system');
  console.log('   This migration creates LME pricing engine infrastructure');
  console.log('   - lme_prices table (Nickel, Copper, Moly)');
  console.log('   - Material-commodity mapping columns');
  console.log('   - price_adjustments table');
  console.log('');
  
  const db = await connectDb();
  
  try {
    await migration.up(db);
    console.log('');
    console.log('✅ Migration 020 completed successfully!');
    console.log('');
    console.log('LME Pricing Engine infrastructure created:');
    console.log('  - lme_prices table');
    console.log('  - Materials table enhanced with lme_commodity and lme_sensitivity');
    console.log('  - price_adjustments table');
    console.log('');
    console.log('Next steps:');
    console.log('1. Map materials to commodities (update materials.lme_commodity)');
    console.log('2. Set material sensitivity values (materials.lme_sensitivity)');
    console.log('3. Enter LME prices via UI (/lme-prices) or API');
    console.log('4. Set up quarterly sync job (backend/src/jobs/lmePriceSync.js)');
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

