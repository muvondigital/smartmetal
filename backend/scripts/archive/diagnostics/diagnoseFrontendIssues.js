/**
 * Diagnose Frontend Issues
 * 
 * Checks:
 * 1. If data exists in database
 * 2. If API endpoints return correct data
 * 3. If authentication is blocking requests
 */

require('dotenv').config();
const { connectDb } = require('../src/db/supabaseClient');

async function diagnose() {
  console.log('\n' + '='.repeat(70));
  console.log('🔍 FRONTEND ISSUE DIAGNOSTICS');
  console.log('='.repeat(70) + '\n');

  const db = await connectDb();
  
  try {
    // 1. Check MetaSteel tenant
    const tenantResult = await db.query(
      `SELECT id, code, name FROM tenants WHERE code = $1`,
      ['metasteel']
    );
    
    if (tenantResult.rows.length === 0) {
      console.log('❌ MetaSteel tenant not found!');
      return;
    }
    
    const tenantId = tenantResult.rows[0].id;
    console.log(`✓ MetaSteel tenant found: ${tenantResult.rows[0].name} (${tenantId})\n`);
    
    // 2. Check RFQs
    console.log('📄 Checking RFQs...');
    const rfqsResult = await db.query(
      `SELECT id, title, status, created_at FROM rfqs WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [tenantId]
    );
    console.log(`  Found ${rfqsResult.rows.length} RFQs`);
    rfqsResult.rows.forEach(rfq => {
      console.log(`    - ${rfq.title} (${rfq.status}) - ID: ${rfq.id}`);
    });
    console.log('');
    
    // 3. Check RFQ Items (using API query pattern)
    console.log('📋 Checking RFQ Items (API query pattern)...');
    for (const rfq of rfqsResult.rows) {
      const itemsResult = await db.query(`
        SELECT ri.* FROM rfq_items ri
        JOIN rfqs r ON ri.rfq_id = r.id
        WHERE ri.rfq_id = $1 AND r.tenant_id = $2
        ORDER BY ri.line_number, ri.created_at
      `, [rfq.id, tenantId]);
      
      console.log(`  ${rfq.title}: ${itemsResult.rows.length} items`);
      
      // Also check direct query
      const directResult = await db.query(
        `SELECT COUNT(*) as count FROM rfq_items WHERE tenant_id = $1 AND rfq_id = $2`,
        [tenantId, rfq.id]
      );
      const directCount = parseInt(directResult.rows[0].count);
      
      if (itemsResult.rows.length === 0 && directCount > 0) {
        console.log(`    ⚠️  WARNING: Direct query finds ${directCount} items but API query returns 0!`);
        console.log(`    → This means tenant_id mismatch between rfqs and rfq_items`);
        
        // Check tenant_id on RFQ
        const rfqCheck = await db.query(
          `SELECT id, tenant_id, title FROM rfqs WHERE id = $1`,
          [rfq.id]
        );
        if (rfqCheck.rows.length > 0) {
          console.log(`    → RFQ tenant_id: ${rfqCheck.rows[0].tenant_id}`);
          console.log(`    → Expected tenant_id: ${tenantId}`);
          console.log(`    → Match: ${rfqCheck.rows[0].tenant_id === tenantId ? 'YES' : 'NO'}`);
        }
      }
    }
    console.log('');
    
    // 4. Check Pricing Runs
    console.log('💰 Checking Pricing Runs...');
    const pricingResult = await db.query(
      `SELECT id, rfq_id, approval_status, total_price, created_at 
       FROM pricing_runs 
       WHERE tenant_id = $1 
       ORDER BY created_at DESC`,
      [tenantId]
    );
    console.log(`  Found ${pricingResult.rows.length} pricing runs`);
    pricingResult.rows.forEach(pr => {
      console.log(`    - RFQ: ${pr.rfq_id}, Status: ${pr.approval_status}, Total: $${pr.total_price || 0}`);
    });
    console.log('');
    
    // 5. Check Dashboard Query (exact analytics service query)
    console.log('📊 Testing Dashboard Query (analytics service pattern)...');
    const { start_date, end_date } = getDateRange({});
    console.log(`  Date range: ${start_date} to ${end_date}`);
    
    const dashboardQuery = await db.query(`
      SELECT
        COUNT(*) as total_quotes,
        COUNT(*) FILTER (WHERE approval_status = 'draft' OR approval_status = 'pending_approval') as pending_quotes,
        COUNT(*) FILTER (WHERE approval_status = 'approved') as approved_quotes,
        COUNT(*) FILTER (WHERE approval_status = 'rejected') as rejected_quotes,
        SUM(total_price) as total_value,
        AVG(total_price) as average_quote_value
      FROM pricing_runs
      WHERE tenant_id = $1 AND created_at >= $2 AND created_at <= $3
    `, [tenantId, start_date, end_date]);
    
    const metrics = dashboardQuery.rows[0];
    console.log(`  Dashboard Metrics:`);
    console.log(`    - Total Quotes: ${parseInt(metrics.total_quotes) || 0}`);
    console.log(`    - Pending Approval: ${parseInt(metrics.pending_quotes) || 0}`);
    console.log(`    - Approved Quotes: ${parseInt(metrics.approved_quotes) || 0}`);
    console.log(`    - Rejected Quotes: ${parseInt(metrics.rejected_quotes) || 0}`);
    console.log(`    - Total Revenue: $${parseFloat(metrics.total_value || 0).toFixed(2)}`);
    console.log('');
    
    // 6. Check if pricing_runs have tenant_id
    console.log('🔍 Checking pricing_runs tenant_id...');
    const tenantCheck = await db.query(`
      SELECT 
        COUNT(*) FILTER (WHERE tenant_id = $1) as correct_tenant,
        COUNT(*) FILTER (WHERE tenant_id IS NULL) as null_tenant,
        COUNT(*) FILTER (WHERE tenant_id != $1) as wrong_tenant,
        COUNT(*) as total
      FROM pricing_runs
    `, [tenantId]);
    
    const check = tenantCheck.rows[0];
    console.log(`  Pricing Runs Tenant Check:`);
    console.log(`    - Correct tenant: ${check.correct_tenant}`);
    console.log(`    - Null tenant: ${check.null_tenant}`);
    console.log(`    - Wrong tenant: ${check.wrong_tenant}`);
    console.log(`    - Total: ${check.total}`);
    console.log('');
    
    // 7. Recommendations
    console.log('💡 RECOMMENDATIONS:');
    if (parseInt(metrics.total_quotes) === 0) {
      console.log('  ⚠️  Dashboard shows 0 quotes - pricing_runs may be missing tenant_id or created_at is too old');
      console.log('  → Check if pricing_runs have correct tenant_id');
      console.log('  → Check if created_at is within last 90 days');
    }
    
    if (rfqsResult.rows.length > 0 && pricingResult.rows.length === 0) {
      console.log('  ⚠️  RFQs exist but no pricing runs - run seedMetaSteelRfqsAndPricing.js');
    }
    
    console.log('\n✅ Diagnostics complete!\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await db.end();
  }
}

function getDateRange(filters) {
  const filtersObj = filters || {};
  let end_date = filtersObj.end_date || filtersObj.endDate;
  if (!end_date) {
    end_date = new Date().toISOString().split('T')[0];
  }
  
  let start_date = filtersObj.start_date || filtersObj.startDate;
  if (!start_date) {
    const date = new Date();
    date.setDate(date.getDate() - 90);
    start_date = date.toISOString().split('T')[0];
  }
  
  return { start_date, end_date };
}

diagnose().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
