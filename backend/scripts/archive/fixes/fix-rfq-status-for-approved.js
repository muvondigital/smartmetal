/**
 * Fix RFQ Status for Approved Pricing Runs
 * 
 * This script updates RFQ status from 'draft' to 'quoted' for all RFQs that have
 * approved pricing runs but still have 'draft' status.
 * 
 * This fixes the issue where RFQs were showing as 'draft' even though their
 * pricing runs have been approved.
 * 
 * Usage: node backend/scripts/fix-rfq-status-for-approved.js [tenantId]
 */

// Load environment variables
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { connectDb } = require('../src/db/supabaseClient');

async function fixRfqStatusForApproved(tenantId = null) {
  const db = await connectDb();

  try {
    console.log('🔍 Finding RFQs with approved pricing runs but "draft" status...\n');

    // Build query - find RFQs that have approved pricing runs but status is still 'draft'
    let query = `
      SELECT DISTINCT
        r.id as rfq_id,
        r.status as current_status,
        r.title,
        COUNT(pr.id) as approved_pricing_runs_count,
        MAX(pr.approved_at) as latest_approval_date
      FROM rfqs r
      INNER JOIN pricing_runs pr ON pr.rfq_id = r.id
      WHERE r.status = 'draft'
        AND pr.approval_status = 'approved'
    `;

    const params = [];

    if (tenantId) {
      query += ` AND r.tenant_id = $1`;
      params.push(tenantId);
      console.log(`Filtering by tenant: ${tenantId}\n`);
    } else {
      query += ` AND r.tenant_id IS NOT NULL`;
      console.log('Updating RFQs for all tenants\n');
    }

    query += `
      GROUP BY r.id, r.status, r.title
      ORDER BY latest_approval_date DESC
    `;

    const result = await db.query(query, params);
    const rfqsToFix = result.rows;

    if (rfqsToFix.length === 0) {
      console.log('✅ No RFQs found that need fixing. All RFQs with approved pricing runs already have correct status.\n');
      return;
    }

    console.log(`Found ${rfqsToFix.length} RFQ(s) that need status update:\n`);
    
    rfqsToFix.forEach((rfq, index) => {
      console.log(`${index + 1}. RFQ ID: ${rfq.rfq_id}`);
      console.log(`   Title: ${rfq.title || 'Untitled RFQ'}`);
      console.log(`   Current Status: ${rfq.current_status}`);
      console.log(`   Approved Pricing Runs: ${rfq.approved_pricing_runs_count}`);
      console.log(`   Latest Approval: ${rfq.latest_approval_date || 'N/A'}\n`);
    });

    // Ask for confirmation (in non-interactive mode, proceed automatically)
    console.log('🔄 Updating RFQ status to "quoted"...\n');

    let updatedCount = 0;
    let errorCount = 0;

    await db.query('BEGIN');

    try {
      for (const rfq of rfqsToFix) {
        try {
          // Update RFQ status to 'quoted'
          const updateQuery = tenantId
            ? `UPDATE rfqs SET status = 'quoted', updated_at = NOW() WHERE id = $1 AND tenant_id = $2 AND status = 'draft'`
            : `UPDATE rfqs SET status = 'quoted', updated_at = NOW() WHERE id = $1 AND status = 'draft'`;
          
          const updateParams = tenantId ? [rfq.rfq_id, tenantId] : [rfq.rfq_id];
          
          const updateResult = await db.query(updateQuery, updateParams);

          if (updateResult.rowCount > 0) {
            updatedCount++;
            console.log(`✅ Updated RFQ ${rfq.rfq_id} status from 'draft' to 'quoted'`);
          } else {
            console.log(`⚠️  RFQ ${rfq.rfq_id} was already updated or doesn't exist`);
          }
        } catch (error) {
          errorCount++;
          console.error(`❌ Error updating RFQ ${rfq.rfq_id}:`, error.message);
        }
      }

      await db.query('COMMIT');
      console.log(`\n✅ Successfully updated ${updatedCount} RFQ(s)`);
      
      if (errorCount > 0) {
        console.log(`⚠️  ${errorCount} RFQ(s) had errors during update`);
      }
    } catch (error) {
      await db.query('ROLLBACK');
      console.error('\n❌ Transaction rolled back due to error:', error.message);
      throw error;
    }

    console.log('\n✨ Fix completed!\n');
  } catch (error) {
    console.error('❌ Error fixing RFQ statuses:', error);
    throw error;
  } finally {
    await db.end();
  }
}

// Run the script
const tenantId = process.argv[2] || null;

if (tenantId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId)) {
  console.error('❌ Invalid tenant ID format. Must be a valid UUID.');
  process.exit(1);
}

fixRfqStatusForApproved(tenantId)
  .then(() => {
    console.log('Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });

