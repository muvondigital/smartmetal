/**
 * Validate NSC Pricing Readiness
 * 
 * Comprehensive validation script that checks ALL dependencies for NSC's pricing workflow.
 * This ensures pricing won't fail due to missing data or configuration.
 * 
 * Usage: node scripts/validateNscPricingReadiness.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { validatePricingWorkflow } = require('../src/services/pricingWorkflowValidator');
const { connectDb } = require('../src/db/supabaseClient');

async function validateNscPricingReadiness() {
  const db = await connectDb();

  console.log('='.repeat(80));
  console.log('NSC PRICING READINESS VALIDATION');
  console.log('='.repeat(80));
  console.log('');

  try {
    // Get NSC tenant
    const tenantResult = await db.query(
      `SELECT id, code, name FROM tenants WHERE code = 'nsc' LIMIT 1`
    );

    if (tenantResult.rows.length === 0) {
      throw new Error('NSC tenant not found');
    }

    const nscTenant = tenantResult.rows[0];
    console.log(`Tenant: ${nscTenant.code} (${nscTenant.name})`);
    console.log(`Tenant ID: ${nscTenant.id}\n`);

    // Get a sample RFQ for validation
    const rfqResult = await db.query(
      `SELECT id, rfq_name, status, document_type 
       FROM rfqs 
       WHERE tenant_id = $1 
       ORDER BY created_at DESC 
       LIMIT 1`,
      [nscTenant.id]
    );

    if (rfqResult.rows.length === 0) {
      console.log('⚠️  No RFQs found for NSC. Creating a test scenario...\n');
      console.log('To fully validate pricing readiness, you need at least one RFQ.');
      console.log('Run this script again after creating an RFQ.\n');
      return;
    }

    const sampleRfq = rfqResult.rows[0];
    console.log(`Sample RFQ: ${sampleRfq.rfq_name}`);
    console.log(`RFQ ID: ${sampleRfq.id}`);
    console.log(`Status: ${sampleRfq.status}`);
    console.log(`Document Type: ${sampleRfq.document_type || 'RFQ (default)'}`);
    console.log('');

    // Run validation (validatePricingWorkflow manages its own connection)
    console.log('Running comprehensive validation...\n');
    await db.end(); // Close our connection first
    const validation = await validatePricingWorkflow(sampleRfq.id, nscTenant.id);

    // Display results
    console.log('='.repeat(80));
    console.log('VALIDATION RESULTS');
    console.log('='.repeat(80));
    console.log('');

    // Show check results
    const checks = Object.entries(validation.checks);
    for (const [check, result] of checks) {
      const icon = result.status === 'success' ? '✓' : result.status === 'warning' ? '⚠' : '✗';
      const color = result.status === 'success' ? 'GREEN' : result.status === 'warning' ? 'YELLOW' : 'RED';
      console.log(`${icon} [${check.toUpperCase()}] ${result.message}`);
      if (result.details && Object.keys(result.details).length > 0) {
        console.log(`   Details: ${JSON.stringify(result.details, null, 2).replace(/\n/g, '\n   ')}`);
      }
    }

    console.log('');

    // Summary
    if (validation.isValid) {
      console.log('='.repeat(80));
      console.log('✅ VALIDATION PASSED');
      console.log('='.repeat(80));
      console.log('');
      console.log('All critical dependencies are in place.');
      console.log('Pricing workflow should function without errors.');
      if (validation.warnings.length > 0) {
        console.log('');
        console.log(`⚠️  ${validation.warnings.length} warning(s) found (non-critical):`);
        validation.warnings.forEach(w => {
          console.log(`   • ${w.check}: ${w.message}`);
        });
      }
    } else {
      console.log('='.repeat(80));
      console.log('❌ VALIDATION FAILED');
      console.log('='.repeat(80));
      console.log('');
      console.log(`${validation.errors.length} error(s) found that will cause pricing failures:`);
      validation.errors.forEach(e => {
        console.log(`   ✗ ${e.check}: ${e.message}`);
        if (e.details && Object.keys(e.details).length > 0) {
          console.log(`     ${JSON.stringify(e.details, null, 2).replace(/\n/g, '\n     ')}`);
        }
      });
      console.log('');
      if (validation.warnings.length > 0) {
        console.log(`⚠️  ${validation.warnings.length} additional warning(s):`);
        validation.warnings.forEach(w => {
          console.log(`   • ${w.check}: ${w.message}`);
        });
      }
      console.log('');
      console.log('ACTION REQUIRED:');
      console.log('Fix the errors above before running pricing workflows.');
    }

    console.log('');

  } catch (error) {
    console.error('\n❌ Validation failed:', error);
    console.error(error.stack);
    throw error;
  }
}

if (require.main === module) {
  validateNscPricingReadiness()
    .then(() => {
      console.log('✅ Validation script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Validation script failed:', error);
      process.exit(1);
    });
}

module.exports = { validateNscPricingReadiness };
