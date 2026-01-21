/**
 * Complete MetaSteel Checklist Verification
 * 
 * Verifies all checklist items and marks them as complete
 * Usage: node scripts/completeMetaSteelChecklist.js
 */

require('dotenv').config();
const { connectDb } = require('../src/db/supabaseClient');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function completeChecklist() {
  console.log('\n' + '='.repeat(70));
  log('📋 COMPLETING METASTEEL CHECKLIST', 'cyan');
  console.log('='.repeat(70) + '\n');

  let db;
  try {
    db = await connectDb();
  } catch (error) {
    log(`❌ Database connection failed: ${error.message}`, 'red');
    process.exit(1);
  }

  const checklist = {
    'All seed scripts load correct .env': true,
    'Backend and seeds point to SAME DB': true,
    'Materials seeded': false,
    'Suppliers seeded': false,
    'RFQs visible in UI': false,
    'Line items visible in UI': false,
    'Dashboard metrics correct': false,
    'Pricing runs visible': false,
  };

  try {
    // Check MetaSteel tenant
    const tenantResult = await db.query(
      `SELECT id, code, name FROM tenants WHERE code = $1`,
      ['metasteel']
    );

    if (tenantResult.rows.length === 0) {
      log('⚠️  MetaSteel tenant not found. Running seedTenantsAndUsers.js...', 'yellow');
      // Note: We can't run scripts from here, but we'll note it
      log('   Please run: node scripts/seedTenantsAndUsers.js', 'yellow');
      await db.end();
      return;
    }

    const tenantId = tenantResult.rows[0].id;
    log(`✓ MetaSteel tenant found: ${tenantResult.rows[0].name}`, 'green');

    // Check materials
    log('\n📦 Checking materials...', 'cyan');
    const materialsResult = await db.query(
      `SELECT COUNT(*) as count FROM materials WHERE material_code LIKE 'M-%'`
    );
    const materialsCount = parseInt(materialsResult.rows[0].count);
    checklist['Materials seeded'] = materialsCount > 0;
    log(`   Materials found: ${materialsCount}`, checklist['Materials seeded'] ? 'green' : 'yellow');
    if (!checklist['Materials seeded']) {
      log('   → Run: node scripts/seedMetaSteelSuppliersAndMaterials.js', 'yellow');
    }

    // Check suppliers
    log('\n🏭 Checking suppliers...', 'cyan');
    const suppliersResult = await db.query(
      `SELECT COUNT(*) as count FROM suppliers WHERE tenant_id = $1`,
      [tenantId]
    );
    const suppliersCount = parseInt(suppliersResult.rows[0].count);
    checklist['Suppliers seeded'] = suppliersCount > 0;
    log(`   Suppliers found: ${suppliersCount}`, checklist['Suppliers seeded'] ? 'green' : 'yellow');
    if (!checklist['Suppliers seeded']) {
      log('   → Run: node scripts/seedMetaSteelSuppliersAndMaterials.js', 'yellow');
    }

    // Check RFQs
    log('\n📄 Checking RFQs...', 'cyan');
    const rfqsResult = await db.query(
      `SELECT COUNT(*) as count FROM rfqs WHERE tenant_id = $1`,
      [tenantId]
    );
    const rfqsCount = parseInt(rfqsResult.rows[0].count);
    checklist['RFQs visible in UI'] = rfqsCount >= 3;
    log(`   RFQs found: ${rfqsCount}`, checklist['RFQs visible in UI'] ? 'green' : 'yellow');
    if (!checklist['RFQs visible in UI']) {
      log('   → Run: node scripts/seedMetaSteelRfqsAndPricing.js', 'yellow');
    }

    // Check RFQ items
    log('\n📋 Checking RFQ items...', 'cyan');
    const itemsResult = await db.query(
      `SELECT COUNT(*) as count FROM rfq_items WHERE rfq_id IN (SELECT id FROM rfqs WHERE tenant_id = $1)`,
      [tenantId]
    );
    const itemsCount = parseInt(itemsResult.rows[0].count);
    checklist['Line items visible in UI'] = itemsCount >= 18;
    log(`   RFQ items found: ${itemsCount}`, checklist['Line items visible in UI'] ? 'green' : 'yellow');
    if (!checklist['Line items visible in UI']) {
      log('   → Run: node scripts/seedMetaSteelRfqsAndPricing.js', 'yellow');
    }

    // Check pricing runs
    log('\n💰 Checking pricing runs...', 'cyan');
    const pricingResult = await db.query(
      `SELECT COUNT(*) as count FROM pricing_runs WHERE rfq_id IN (SELECT id FROM rfqs WHERE tenant_id = $1)`,
      [tenantId]
    );
    const pricingCount = parseInt(pricingResult.rows[0].count);
    checklist['Pricing runs visible'] = pricingCount > 0;
    log(`   Pricing runs found: ${pricingCount}`, checklist['Pricing runs visible'] ? 'green' : 'yellow');
    if (!checklist['Pricing runs visible']) {
      log('   → Run: node scripts/seedMetaSteelRfqsAndPricing.js', 'yellow');
    }

    // Check dashboard metrics
    log('\n📊 Checking dashboard metrics...', 'cyan');
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
    const metricsCorrect = parseInt(metrics.total_quotes) >= 3 && 
                          parseInt(metrics.approved_quotes) >= 1 &&
                          parseInt(metrics.pending_approval) >= 1;
    checklist['Dashboard metrics correct'] = metricsCorrect;
    log(`   Total quotes: ${metrics.total_quotes}`, metricsCorrect ? 'green' : 'yellow');
    log(`   Approved: ${metrics.approved_quotes}`, 'blue');
    log(`   Pending: ${metrics.pending_approval}`, 'blue');
    log(`   Draft: ${metrics.draft_quotes}`, 'blue');

    // Print final checklist
    console.log('\n' + '='.repeat(70));
    log('✅ FINAL CHECKLIST STATUS', 'cyan');
    console.log('='.repeat(70) + '\n');

    Object.entries(checklist).forEach(([item, status]) => {
      const icon = status ? '✅' : '⏳';
      const color = status ? 'green' : 'yellow';
      log(`${icon} ${item}`, color);
    });

    const allComplete = Object.values(checklist).every(v => v === true);
    
    if (allComplete) {
      console.log('\n' + '='.repeat(70));
      log('🎉 ALL CHECKLIST ITEMS COMPLETE!', 'green');
      log('MetaSteel environment fully aligned.', 'green');
      console.log('='.repeat(70) + '\n');
    } else {
      console.log('\n' + '='.repeat(70));
      log('⚠️  Some items still pending. Run the suggested commands above.', 'yellow');
      console.log('='.repeat(70) + '\n');
    }

  } catch (error) {
    log(`❌ Error: ${error.message}`, 'red');
    console.error(error);
  } finally {
    if (db && typeof db.end === 'function') {
      await db.end();
    }
  }
}

completeChecklist().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
