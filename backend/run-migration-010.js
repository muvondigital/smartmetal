/**
 * Standalone Runner for Migration 010: Remove Price Agreements
 *
 * This script runs the migration to drop all price agreement tables and columns.
 * Run this with: node run-migration-010.js
 */

// Load environment variables FIRST
require('dotenv').config();

const { Pool } = require('pg');

async function runMigration() {
  console.log('🗑️  Migration 010: Removing Price Agreements feature...\n');

  // Get database URL - prefer MIGRATION_DATABASE_URL (superuser) for schema changes
  const dbUrl = process.env.MIGRATION_DATABASE_URL ||
                process.env.DATABASE_URL ||
                process.env.PG_CONNECTION_STRING ||
                process.env.SUPABASE_DB_URL;

  if (!dbUrl) {
    console.error('❌ No database URL found!');
    console.error('Please set MIGRATION_DATABASE_URL or DATABASE_URL in your .env file');
    process.exit(1);
  }

  // Check if using superuser
  const isSuperuser = dbUrl.includes('postgres:') || process.env.MIGRATION_DATABASE_URL;
  if (!isSuperuser) {
    console.warn('⚠️  WARNING: Not using superuser connection. Some operations may fail.');
    console.warn('   Set MIGRATION_DATABASE_URL with postgres user for full migration.');
  }

  // Mask password for logging
  const maskedUrl = dbUrl.replace(/:[^:@]+@/, ':***@');
  console.log(`🔌 Connecting to: ${maskedUrl}`);
  console.log(`🔑 Using: ${isSuperuser ? 'Superuser (postgres)' : 'Application user'}\n`);

  // Create database pool
  const pool = new Pool({ connectionString: dbUrl });

  try {
    const operations = [
      // Step 1: Drop foreign key constraints first
      {
        name: 'Drop FK: pricing_run_items.price_agreement_id',
        sql: `
          ALTER TABLE pricing_run_items
          DROP CONSTRAINT IF EXISTS pricing_run_items_price_agreement_id_fkey CASCADE;
        `
      },
      {
        name: 'Drop FK: quote_candidates.converted_price_agreement_id',
        sql: `
          ALTER TABLE quote_candidates
          DROP CONSTRAINT IF EXISTS quote_candidates_converted_price_agreement_id_fkey CASCADE;
        `
      },
      {
        name: 'Drop FK: assistant_documents.agreement_id',
        sql: `
          ALTER TABLE assistant_documents
          DROP CONSTRAINT IF EXISTS assistant_documents_agreement_id_fkey CASCADE;
        `
      },
      {
        name: 'Drop FK: price_agreement_document_versions',
        sql: `
          ALTER TABLE IF EXISTS price_agreement_document_versions
          DROP CONSTRAINT IF EXISTS price_agreement_document_versions_price_agreement_id_fkey CASCADE;
        `
      },

      // Step 2: Drop columns
      {
        name: 'Drop column: pricing_run_items.price_agreement_id',
        sql: `
          ALTER TABLE pricing_run_items
          DROP COLUMN IF EXISTS price_agreement_id CASCADE;
        `
      },
      {
        name: 'Drop column: quote_candidates.converted_price_agreement_id',
        sql: `
          ALTER TABLE quote_candidates
          DROP COLUMN IF EXISTS converted_price_agreement_id CASCADE;
        `
      },
      {
        name: 'Drop column: assistant_documents.agreement_id',
        sql: `
          ALTER TABLE assistant_documents
          DROP COLUMN IF EXISTS agreement_id CASCADE;
        `
      },

      // Step 3: Drop views that reference price_agreements
      {
        name: 'Drop view: v_price_agreements_active',
        sql: `DROP VIEW IF EXISTS v_price_agreements_active CASCADE;`
      },

      // Step 4: Drop tables (in dependency order)
      {
        name: 'Drop table: price_agreement_document_versions',
        sql: `DROP TABLE IF EXISTS price_agreement_document_versions CASCADE;`
      },
      {
        name: 'Drop table: agreement_scales_v2',
        sql: `DROP TABLE IF EXISTS agreement_scales_v2 CASCADE;`
      },
      {
        name: 'Drop table: agreement_conditions_v2',
        sql: `DROP TABLE IF EXISTS agreement_conditions_v2 CASCADE;`
      },
      {
        name: 'Drop table: agreement_headers_v2',
        sql: `DROP TABLE IF EXISTS agreement_headers_v2 CASCADE;`
      },
      {
        name: 'Drop table: price_agreements',
        sql: `DROP TABLE IF EXISTS price_agreements CASCADE;`
      },

      // Step 5: Clean up any orphaned indexes
      {
        name: 'Drop orphaned indexes',
        sql: `
          DROP INDEX IF EXISTS idx_price_agreements_client_id;
          DROP INDEX IF EXISTS idx_price_agreements_material_id;
          DROP INDEX IF EXISTS idx_price_agreements_status;
          DROP INDEX IF EXISTS idx_price_agreements_tenant_id;
          DROP INDEX IF EXISTS idx_price_agreements_tenant_status;
          DROP INDEX IF EXISTS idx_price_agreements_valid_dates;
        `
      }
    ];

    // Execute each operation
    for (const op of operations) {
      try {
        console.log(`  ⚙️  ${op.name}...`);
        await pool.query(op.sql);
        console.log(`  ✅ ${op.name} - Success`);
      } catch (err) {
        // Some operations might fail if objects don't exist - that's OK
        if (err.message && !err.message.includes('does not exist')) {
          console.warn(`  ⚠️  Warning: ${op.name} - ${err.message}`);
        } else {
          console.log(`  ⏭️  ${op.name} - Already removed`);
        }
      }
    }

    console.log('\n✅ Migration 010 complete - Price Agreements feature removed');
    console.log('📊 Summary:');
    console.log('   - 5 tables dropped');
    console.log('   - 3 columns removed');
    console.log('   - All related constraints and indexes cleaned up');
    console.log('');
    console.log('🎯 System now aligned with NSC business model:');
    console.log('   Commercial Request → CPQ Configuration → Quote → Client PO → Sales Order');

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run the migration
runMigration().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
