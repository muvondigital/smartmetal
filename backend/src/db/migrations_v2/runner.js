/**
 * Migration Runner for V2 Consolidated Migrations
 */

const { createClient } = require('../supabaseClient');
const path = require('path');

async function runMigrations() {
  const client = createClient();

  console.log('🚀 Starting migration runner...');

  const migrationFiles = [
    '000_bootstrap_core_schema.js',
    '001_tenant_system.js',
    '002_catalog_system.js',
    '003_pricing_intelligence.js',
    '004_regulatory_framework.js',
    '005_approval_workflow.js',
    '006_ai_services.js',
    '007_assistant_knowledge.js',
    '008_analytics_views.js',
    '009_security_hardening.js'
  ];

  for (const file of migrationFiles) {
    try {
      console.log(`Running ${file}...`);
      const migration = require(path.join(__dirname, file));
      await migration.up(client);
      console.log(`✅ ${file} completed`);
    } catch (error) {
      console.error(`❌ Migration ${file} failed:`, error);
      throw error;
    }
  }

  console.log('✅ All migrations completed successfully');
}

if (require.main === module) {
  runMigrations().catch(console.error);
}

module.exports = { runMigrations };
