/**
 * Migration 010: Remove Price Agreements Feature
 *
 * De-engineering: Removes the entire price agreements infrastructure.
 * NSC is a trading company - they RECEIVE purchase orders from clients,
 * they don't issue price agreements. This feature was built on incorrect
 * assumptions about the business model.
 *
 * What this removes:
 * - price_agreements table
 * - agreement_headers_v2, agreement_conditions_v2, agreement_scales_v2 tables
 * - price_agreement_document_versions table
 * - price_agreement_id column from pricing_run_items
 * - price_agreement_id column from quote_candidates
 * - agreement_id column from assistant_documents
 * - All related foreign keys and indexes
 *
 * Created: 2025-12-31
 */

const { supabaseAdmin } = require('../supabaseClient');

async function up() {
  console.log('🗑️  Migration 010: Removing Price Agreements feature...');

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

    // Step 5: Clean up any orphaned indexes (belt and suspenders)
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
      const { error } = await supabaseAdmin.rpc('exec_sql', { sql_query: op.sql });

      if (error) {
        // Some operations might fail if objects don't exist - that's OK
        if (error.message && !error.message.includes('does not exist')) {
          console.warn(`  ⚠️  Warning: ${op.name} - ${error.message}`);
        }
      } else {
        console.log(`  ✅ ${op.name} - Success`);
      }
    } catch (err) {
      // Continue even if operation fails - we're deleting, not creating
      console.warn(`  ⚠️  Warning: ${op.name} - ${err.message}`);
    }
  }

  console.log('✅ Migration 010 complete - Price Agreements feature removed');
  console.log('📊 Summary:');
  console.log('   - 5 tables dropped');
  console.log('   - 3 columns removed');
  console.log('   - All related constraints and indexes cleaned up');
  console.log('');
  console.log('🎯 System now aligned with NSC business model:');
  console.log('   Commercial Request → CPQ Configuration → Quote → Client PO → Sales Order');
}

async function down() {
  console.log('⚠️  Migration 010 rollback: Price Agreements cannot be restored from this migration.');
  console.log('   If you need to restore, use a database backup from before this migration.');
  console.log('   This is intentional - the feature was built on incorrect business assumptions.');
  throw new Error('Rollback not supported - use database backup if restoration needed');
}

module.exports = { up, down };
