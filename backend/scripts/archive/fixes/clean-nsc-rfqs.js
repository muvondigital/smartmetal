/**
 * Clean All RFQs for NSC Tenant
 *
 * This script deletes all RFQs (soon to be renamed "Commercial Requests")
 * for the NSC tenant to prepare for the terminology transition.
 *
 * Safety: Only deletes for NSC tenant, preserves other tenants' data
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');

const NSC_TENANT_ID = 'b449bdd1-a9d2-4a20-afa2-979316c9ef0e';
const NSC_TENANT_CODE = 'nsc';

async function cleanNscRfqs() {
  console.log('='.repeat(70));
  console.log('Clean NSC Commercial Requests (RFQs)');
  console.log('='.repeat(70));
  console.log('');

  const connectionString = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;

  if (!connectionString) {
    console.error('❌ ERROR: DATABASE_URL is required!');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString,
    ssl: connectionString.includes('supabase') ? { rejectUnauthorized: false } : false,
  });

  try {
    // First, get a count of what we're about to delete
    const countResult = await pool.query(
      `SELECT COUNT(*) as total FROM rfqs WHERE tenant_id = $1`,
      [NSC_TENANT_ID]
    );

    const totalRfqs = parseInt(countResult.rows[0].total);

    if (totalRfqs === 0) {
      console.log('✅ No RFQs found for NSC tenant. Database is already clean.');
      await pool.end();
      return;
    }

    console.log(`Found ${totalRfqs} RFQs for NSC tenant (${NSC_TENANT_CODE})`);
    console.log('');
    console.log('This will delete:');
    console.log('  - All RFQs');
    console.log('  - Associated pricing runs');
    console.log('  - Associated approval history');
    console.log('  - Associated pricing run items');
    console.log('  - Associated line items');
    console.log('  - Associated document extractions');
    console.log('');
    console.log('⚠️  This operation cannot be undone!');
    console.log('');

    // Delete in proper order to respect foreign key constraints
    console.log('Starting deletion...\n');

    // 1. Delete approval_history (references pricing_runs)
    const approvalHistoryResult = await pool.query(
      `DELETE FROM approval_history
       WHERE pricing_run_id IN (
         SELECT id FROM pricing_runs WHERE rfq_id IN (
           SELECT id FROM rfqs WHERE tenant_id = $1
         )
       )`,
      [NSC_TENANT_ID]
    );
    console.log(`✅ Deleted ${approvalHistoryResult.rowCount} approval history records`);

    // 2. Delete approval_events (references pricing_runs via pricing_run_id)
    const approvalEventsResult = await pool.query(
      `DELETE FROM approval_events
       WHERE pricing_run_id IN (
         SELECT id FROM pricing_runs WHERE rfq_id IN (
           SELECT id FROM rfqs WHERE tenant_id = $1
         )
       )`,
      [NSC_TENANT_ID]
    );
    console.log(`✅ Deleted ${approvalEventsResult.rowCount} approval event records`);

    // 3. Delete pricing_run_items (references pricing_runs)
    const pricingRunItemsResult = await pool.query(
      `DELETE FROM pricing_run_items
       WHERE pricing_run_id IN (
         SELECT id FROM pricing_runs WHERE rfq_id IN (
           SELECT id FROM rfqs WHERE tenant_id = $1
         )
       )`,
      [NSC_TENANT_ID]
    );
    console.log(`✅ Deleted ${pricingRunItemsResult.rowCount} pricing run items`);

    // 4. Delete quote_candidates (references pricing_runs)
    const quoteCandidatesResult = await pool.query(
      `DELETE FROM quote_candidates
       WHERE pricing_run_id IN (
         SELECT id FROM pricing_runs WHERE rfq_id IN (
           SELECT id FROM rfqs WHERE tenant_id = $1
         )
       )`,
      [NSC_TENANT_ID]
    );
    console.log(`✅ Deleted ${quoteCandidatesResult.rowCount} quote candidates`);

    // 5. Delete pricing_runs (references rfqs)
    const pricingRunsResult = await pool.query(
      `DELETE FROM pricing_runs
       WHERE rfq_id IN (
         SELECT id FROM rfqs WHERE tenant_id = $1
       )`,
      [NSC_TENANT_ID]
    );
    console.log(`✅ Deleted ${pricingRunsResult.rowCount} pricing runs`);

    // 6. Delete rfq_items (references rfqs)
    const rfqItemsResult = await pool.query(
      `DELETE FROM rfq_items
       WHERE rfq_id IN (
         SELECT id FROM rfqs WHERE tenant_id = $1
       )`,
      [NSC_TENANT_ID]
    );
    console.log(`✅ Deleted ${rfqItemsResult.rowCount} RFQ line items`);

    // 7. Delete document_extractions (references rfqs via related_rfq_id)
    const documentExtractionsResult = await pool.query(
      `DELETE FROM document_extractions
       WHERE related_rfq_id IN (
         SELECT id FROM rfqs WHERE tenant_id = $1
       )`,
      [NSC_TENANT_ID]
    );
    console.log(`✅ Deleted ${documentExtractionsResult.rowCount} document extraction records`);

    // 8. Delete assistant_documents (check if rfq_id column exists first)
    let assistantDocsResult = { rowCount: 0 };
    try {
      assistantDocsResult = await pool.query(
        `DELETE FROM assistant_documents
         WHERE rfq_id IN (
           SELECT id FROM rfqs WHERE tenant_id = $1
         )`,
        [NSC_TENANT_ID]
      );
      console.log(`✅ Deleted ${assistantDocsResult.rowCount} assistant documents`);
    } catch (assistantErr) {
      if (assistantErr.code === '42703') {
        // Column doesn't exist, skip this step
        console.log(`ℹ️  Skipped assistant_documents (table structure doesn't reference rfqs)`);
      } else {
        throw assistantErr;
      }
    }

    // 9. Finally, delete the RFQs themselves
    const rfqsResult = await pool.query(
      `DELETE FROM rfqs WHERE tenant_id = $1`,
      [NSC_TENANT_ID]
    );
    console.log(`✅ Deleted ${rfqsResult.rowCount} RFQs`);

    console.log('');
    console.log('='.repeat(70));
    console.log('✅ Successfully cleaned all NSC RFQs and related data');
    console.log('='.repeat(70));
    console.log('');
    console.log('Summary:');
    console.log(`  Total RFQs deleted: ${rfqsResult.rowCount}`);
    console.log(`  Total records cleaned: ${
      approvalHistoryResult.rowCount +
      approvalEventsResult.rowCount +
      pricingRunItemsResult.rowCount +
      quoteCandidatesResult.rowCount +
      pricingRunsResult.rowCount +
      rfqItemsResult.rowCount +
      documentExtractionsResult.rowCount +
      assistantDocsResult.rowCount +
      rfqsResult.rowCount
    }`);
    console.log('');
    console.log('The database is now ready for the "Commercial Requests" transition.');

    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('');
    console.error('='.repeat(70));
    console.error('❌ Error cleaning RFQs:', error.message);
    console.error('='.repeat(70));
    console.error('');
    console.error('Full error:', error);
    await pool.end();
    process.exit(1);
  }
}

cleanNscRfqs();
