/**
 * Validate MetaSteel Environment
 * 
 * Verifies that:
 * 1. Backend and seed scripts use the same database
 * 2. MetaSteel RFQs, items, and pricing runs exist
 * 3. Dashboard metrics are correct
 * 
 * Usage: node scripts/validateMetaSteelEnvironment.js
 */

require('dotenv').config();
const { connectDb } = require('../src/db/supabaseClient');

// Color output helpers
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(60));
  log(title, 'cyan');
  console.log('='.repeat(60));
}

async function validateEnvironment() {
  logSection('🔍 SECTION 1: DATABASE CONNECTION VERIFICATION');
  
  // Check which database URL is being used
  const dbUrl = process.env.DATABASE_URL || 
                process.env.PG_CONNECTION_STRING || 
                process.env.SUPABASE_DB_URL;
  
  if (!dbUrl) {
    log('❌ ERROR: No database URL found!', 'red');
    log('   Please set one of: DATABASE_URL, PG_CONNECTION_STRING, SUPABASE_DB_URL', 'yellow');
    process.exit(1);
  }
  
  const source = process.env.DATABASE_URL ? 'DATABASE_URL' :
                 process.env.PG_CONNECTION_STRING ? 'PG_CONNECTION_STRING' :
                 'SUPABASE_DB_URL';
  const maskedUrl = dbUrl.replace(/:[^:@]+@/, ':***@');
  log(`✓ Database URL source: ${source}`, 'green');
  log(`✓ Connection string: ${maskedUrl}`, 'green');
  
  // Connect to database
  let db;
  try {
    db = await connectDb();
    log('✓ Database connection successful', 'green');
  } catch (error) {
    log(`❌ Database connection failed: ${error.message}`, 'red');
    process.exit(1);
  }
  
  logSection('🔍 SECTION 2: METASTEEL TENANT VERIFICATION');
  
  // Check MetaSteel tenant exists
  let tenantResult;
  try {
    tenantResult = await db.query(
      `SELECT id, code, name FROM tenants WHERE code = $1`,
      ['metasteel']
    );
    
    if (tenantResult.rows.length === 0) {
      log('❌ ERROR: MetaSteel tenant not found!', 'red');
      log('   Please run: node scripts/seedTenantsAndUsers.js', 'yellow');
      await db.end();
      process.exit(1);
    }
    
    const tenant = tenantResult.rows[0];
    log(`✓ MetaSteel tenant found: ${tenant.name} (ID: ${tenant.id})`, 'green');
  } catch (error) {
    log(`❌ Error checking tenant: ${error.message}`, 'red');
    await db.end();
    process.exit(1);
  }
  
  const tenantId = tenantResult.rows[0].id;
  
  logSection('🔍 SECTION 3: DATA VALIDATION');
  
  // Test 1: Count RFQs
  log('\n📊 Test 1: Counting RFQs...', 'blue');
  try {
    const rfqResult = await db.query(
      `SELECT COUNT(*) as count FROM rfqs WHERE tenant_id = $1`,
      [tenantId]
    );
    const rfqCount = parseInt(rfqResult.rows[0].count);
    log(`   Found ${rfqCount} RFQ(s)`, rfqCount >= 3 ? 'green' : 'yellow');
    
    if (rfqCount < 3) {
      log('   ⚠️  Expected: 3 RFQs', 'yellow');
      log('   Run: node scripts/seedMetaSteelRfqsAndPricing.js', 'yellow');
    }
    
    // Get RFQ details
    if (rfqCount > 0) {
      const rfqDetails = await db.query(
        `SELECT id, rfq_code, title, status FROM rfqs WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 5`,
        [tenantId]
      );
      log('   RFQ Details:', 'blue');
      rfqDetails.rows.forEach(rfq => {
        log(`     - ${rfq.rfq_code}: ${rfq.title} (${rfq.status})`, 'blue');
      });
    }
  } catch (error) {
    log(`   ❌ Error: ${error.message}`, 'red');
  }
  
  // Test 2: Count RFQ items
  log('\n📊 Test 2: Counting RFQ items...', 'blue');
  try {
    const itemsResult = await db.query(
      `SELECT COUNT(*) as count FROM rfq_items WHERE rfq_id IN (SELECT id FROM rfqs WHERE tenant_id = $1)`,
      [tenantId]
    );
    const itemsCount = parseInt(itemsResult.rows[0].count);
    log(`   Found ${itemsCount} RFQ item(s)`, itemsCount >= 18 ? 'green' : 'yellow');
    
    if (itemsCount < 18) {
      log('   ⚠️  Expected: 18 items', 'yellow');
      log('   Run: node scripts/seedMetaSteelRfqsAndPricing.js', 'yellow');
    }
  } catch (error) {
    log(`   ❌ Error: ${error.message}`, 'red');
  }
  
  // Test 3: Count pricing runs
  log('\n📊 Test 3: Counting pricing runs...', 'blue');
  try {
    const pricingResult = await db.query(
      `SELECT COUNT(*) as count FROM pricing_runs WHERE rfq_id IN (SELECT id FROM rfqs WHERE tenant_id = $1)`,
      [tenantId]
    );
    const pricingCount = parseInt(pricingResult.rows[0].count);
    log(`   Found ${pricingCount} pricing run(s)`, pricingCount > 0 ? 'green' : 'yellow');
    
    if (pricingCount === 0) {
      log('   ⚠️  Expected: > 0 pricing runs', 'yellow');
      log('   Run: node scripts/seedMetaSteelRfqsAndPricing.js', 'yellow');
    }
  } catch (error) {
    log(`   ❌ Error: ${error.message}`, 'red');
  }
  
  // Test 4: Count pricing run items
  log('\n📊 Test 4: Counting pricing run items...', 'blue');
  try {
    const pricingItemsResult = await db.query(
      `SELECT COUNT(*) as count FROM pricing_run_items WHERE pricing_run_id IN (
        SELECT id FROM pricing_runs WHERE rfq_id IN (SELECT id FROM rfqs WHERE tenant_id = $1)
      )`,
      [tenantId]
    );
    const pricingItemsCount = parseInt(pricingItemsResult.rows[0].count);
    log(`   Found ${pricingItemsCount} pricing run item(s)`, pricingItemsCount > 0 ? 'green' : 'yellow');
  } catch (error) {
    log(`   ❌ Error: ${error.message}`, 'red');
  }
  
  // Test 5: Dashboard metrics simulation
  log('\n📊 Test 5: Dashboard metrics...', 'blue');
  try {
    const dashboardResult = await db.query(
      `SELECT 
        COUNT(*) FILTER (WHERE status = 'approved') as approved_quotes,
        COUNT(*) FILTER (WHERE status = 'pending_approval') as pending_approval,
        COUNT(*) FILTER (WHERE status = 'draft') as draft_quotes,
        COUNT(*) as total_quotes
      FROM rfqs 
      WHERE tenant_id = $1 
        AND created_at >= NOW() - INTERVAL '30 days'`,
      [tenantId]
    );
    
    const metrics = dashboardResult.rows[0];
    log(`   Total quotes: ${metrics.total_quotes}`, metrics.total_quotes >= 3 ? 'green' : 'yellow');
    log(`   Approved: ${metrics.approved_quotes}`, metrics.approved_quotes >= 1 ? 'green' : 'yellow');
    log(`   Pending approval: ${metrics.pending_approval}`, metrics.pending_approval >= 1 ? 'green' : 'yellow');
    log(`   Draft: ${metrics.draft_quotes}`, 'blue');
  } catch (error) {
    log(`   ❌ Error: ${error.message}`, 'red');
  }
  
  // Test 6: Revenue check
  log('\n📊 Test 6: Revenue calculation...', 'blue');
  try {
    const revenueResult = await db.query(
      `SELECT COALESCE(SUM(total_price), 0) as revenue
      FROM pricing_run_items 
      WHERE pricing_run_id IN (
        SELECT id FROM pricing_runs WHERE rfq_id IN (SELECT id FROM rfqs WHERE tenant_id = $1)
      )`,
      [tenantId]
    );
    const revenue = parseFloat(revenueResult.rows[0].revenue);
    log(`   Total revenue: $${revenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, revenue > 0 ? 'green' : 'yellow');
  } catch (error) {
    log(`   ❌ Error: ${error.message}`, 'red');
  }
  
  logSection('✅ VALIDATION COMPLETE');
  
  log('\n📝 Summary:', 'cyan');
  log('   - Database connection: ✓', 'green');
  log('   - MetaSteel tenant: ✓', 'green');
  log('   - Run backend server and test API endpoints:', 'blue');
  log('     GET /api/rfqs (with X-Tenant-Code: metasteel header)', 'blue');
  log('     GET /api/analytics/dashboard (with X-Tenant-Code: metasteel header)', 'blue');
  
  await db.end();
  log('\n✅ Validation script completed', 'green');
}

// Run validation
validateEnvironment().catch(error => {
  log(`\n❌ Fatal error: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});
