/**
 * Audit Script: Tenant Query Isolation Audit
 *
 * Purpose: Manually audit all service queries for proper tenant_id filtering.
 * This script documents findings from manual code review.
 *
 * Phase: 0 (Foundation & Validation)
 * Work Item: B-01, PHASE0-03
 *
 * NOTE: This is a documentation script, not an automated scanner.
 * Findings are manually recorded based on code review.
 */

const fs = require('fs');
const path = require('path');

/**
 * Manual audit findings from code review
 * Each entry represents a query pattern found in the services
 */
const auditFindings = [
  // ===== SAFE QUERIES (Proper tenant filtering) =====
  {
    file: 'rfqService.js',
    function: 'createRfqFromPayload',
    line: '44',
    query_summary: 'SELECT FROM projects p JOIN clients c WHERE p.id AND p.tenant_id',
    tenant_filter_present: 'YES',
    filter_type: 'DIRECT',
    notes: 'Direct tenant_id filter on projects table'
  },
  {
    file: 'rfqService.js',
    function: 'createRfqFromPayload',
    line: '82',
    query_summary: 'SELECT FROM clients WHERE name AND tenant_id',
    tenant_filter_present: 'YES',
    filter_type: 'DIRECT',
    notes: 'Direct tenant_id filter on clients table'
  },
  {
    file: 'pricingService.js',
    function: 'getPricingRunsByRfqId',
    line: '108',
    query_summary: 'SELECT FROM pricing_runs pr JOIN rfqs r WHERE pr.rfq_id AND r.tenant_id',
    tenant_filter_present: 'YES',
    filter_type: 'JOIN',
    notes: 'Tenant filtering via JOIN to rfqs table'
  },
  {
    file: 'pricingService.js',
    function: 'getPricingRunById',
    line: '144',
    query_summary: 'SELECT FROM pricing_runs pr JOIN rfqs r WHERE pr.id AND r.tenant_id',
    tenant_filter_present: 'YES',
    filter_type: 'JOIN',
    notes: 'Tenant filtering via JOIN to rfqs table'
  },
  {
    file: 'approvalService.js',
    function: 'submitForApproval',
    line: '61',
    query_summary: 'SELECT FROM pricing_runs pr JOIN rfqs r WHERE pr.id AND r.tenant_id',
    tenant_filter_present: 'YES',
    filter_type: 'JOIN',
    notes: 'Tenant filtering via JOIN to rfqs table'
  },
  {
    file: 'analyticsService.js',
    function: 'getAnalytics',
    line: '28',
    query_summary: 'SELECT COUNT FROM pricing_runs WHERE tenant_id',
    tenant_filter_present: 'YES',
    filter_type: 'DIRECT',
    notes: 'Direct tenant_id filter on pricing_runs'
  },
  {
    file: 'analyticsService.js',
    function: 'getAnalytics',
    line: '48',
    query_summary: 'SELECT FROM pricing_runs WHERE tenant_id AND created_at BETWEEN',
    tenant_filter_present: 'YES',
    filter_type: 'DIRECT',
    notes: 'Direct tenant_id filter on pricing_runs with date range'
  },
  {
    file: 'priceAgreementsService.js',
    function: 'checkOrCreateAgreementForApprovedRun',
    line: '381',
    query_summary: 'SELECT FROM price_agreements WHERE notes LIKE AND tenant_id',
    tenant_filter_present: 'YES',
    filter_type: 'DIRECT',
    notes: 'Direct tenant_id filter on price_agreements'
  },
  {
    file: 'assistantOrchestrator.js',
    function: 'handleMaterialSearchIntent',
    line: '1503',
    query_summary: 'SELECT FROM rfqs r JOIN pricing_runs pr WHERE r.tenant_id AND pr.approval_status',
    tenant_filter_present: 'YES',
    filter_type: 'DIRECT',
    notes: 'Direct tenant_id filter on rfqs table'
  },
  {
    file: 'assistantOrchestrator.js',
    function: 'handleMaterialSearchIntent',
    line: '1585',
    query_summary: 'SELECT FROM rfqs r1 JOIN rfq_items WHERE r1.tenant_id AND r2.tenant_id',
    tenant_filter_present: 'YES',
    filter_type: 'DIRECT',
    notes: 'Direct tenant_id filter on both rfqs instances'
  },

  // ===== QUERIES NEEDING REVIEW =====
  {
    file: 'approvalService.js',
    function: 'submitForApproval',
    line: '308',
    query_summary: 'SELECT project_type FROM rfqs WHERE id',
    tenant_filter_present: 'NO',
    filter_type: 'NONE',
    notes: 'TODO: Missing tenant_id filter. Query is within transaction after prior tenant check, but should add explicit filter for defense-in-depth.'
  },
  {
    file: 'pricingService.js',
    function: 'versionPricingRun',
    line: '1387',
    query_summary: 'SELECT parent_version_id FROM pricing_runs WHERE id',
    tenant_filter_present: 'NO',
    filter_type: 'NONE',
    notes: 'TODO: Missing tenant_id filter. Query reads parent_version_id without tenant scope. Low risk (UUID-based lookup), but should add tenant filter.'
  },
  {
    file: 'priceAgreementsService.js',
    function: 'getAllPriceAgreements',
    line: '463',
    query_summary: 'SELECT COUNT FROM price_agreements pa WHERE clause',
    tenant_filter_present: 'UNKNOWN',
    filter_type: 'DYNAMIC',
    notes: 'Query uses dynamic WHERE clause. Need to verify whereClause includes tenant_id. Likely safe (middleware ensures tenantId param), but worth audit.'
  },
  {
    file: 'priceAgreementsService.js',
    function: 'findActiveAgreement',
    line: '654',
    query_summary: 'SELECT FROM price_agreements WHERE material_code AND status AND valid_from/valid_to',
    tenant_filter_present: 'UNKNOWN',
    filter_type: 'UNKNOWN',
    notes: 'Query appears to lack explicit tenant_id filter. Need full query review. CRITICAL: This affects pricing logic.'
  },
  {
    file: 'priceAgreementsService.js',
    function: 'findActiveAgreementForCustomer',
    line: '667',
    query_summary: 'SELECT FROM price_agreements WHERE customer_name AND material_code AND status',
    tenant_filter_present: 'UNKNOWN',
    filter_type: 'UNKNOWN',
    notes: 'Query appears to lack explicit tenant_id filter. Need full query review. CRITICAL: This affects pricing logic.'
  }
];

/**
 * Generate CSV report from audit findings
 */
function generateCsvReport() {
  const csvHeader = [
    'file',
    'function',
    'line',
    'query_summary',
    'tenant_filter_present',
    'filter_type',
    'notes'
  ].join(',');

  const csvRows = auditFindings.map(finding =>
    [
      `"${finding.file}"`,
      `"${finding.function}"`,
      finding.line,
      `"${finding.query_summary}"`,
      finding.tenant_filter_present,
      finding.filter_type,
      `"${finding.notes}"`
    ].join(',')
  );

  const csvContent = [csvHeader, ...csvRows].join('\n');

  const outputPath = path.join(__dirname, '../../docs/TENANT_QUERY_AUDIT.csv');
  fs.writeFileSync(outputPath, csvContent, 'utf8');

  console.log(`✓ CSV audit report written to: ${outputPath}`);
}

/**
 * Generate summary statistics
 */
function generateSummary() {
  const total = auditFindings.length;
  const safeQueries = auditFindings.filter(f => f.tenant_filter_present === 'YES').length;
  const unsafeQueries = auditFindings.filter(f => f.tenant_filter_present === 'NO').length;
  const unknownQueries = auditFindings.filter(f => f.tenant_filter_present === 'UNKNOWN').length;

  const filterTypes = auditFindings.reduce((acc, f) => {
    if (f.tenant_filter_present === 'YES') {
      acc[f.filter_type] = (acc[f.filter_type] || 0) + 1;
    }
    return acc;
  }, {});

  console.log('\n=================================================');
  console.log('TENANT QUERY AUDIT SUMMARY');
  console.log('=================================================');
  console.log(`Total Queries Audited:        ${total}`);
  console.log(`Safe Queries (tenant_id):     ${safeQueries} (${((safeQueries/total)*100).toFixed(1)}%)`);
  console.log(`Unsafe Queries (no filter):   ${unsafeQueries} (${((unsafeQueries/total)*100).toFixed(1)}%)`);
  console.log(`Unknown Status:               ${unknownQueries} (${((unknownQueries/total)*100).toFixed(1)}%)`);
  console.log('\nFilter Types (Safe Queries):');
  Object.entries(filterTypes).forEach(([type, count]) => {
    console.log(`  - ${type}: ${count}`);
  });
  console.log('=================================================\n');

  return {
    total,
    safeQueries,
    unsafeQueries,
    unknownQueries,
    filterTypes
  };
}

/**
 * Main execution
 */
function main() {
  console.log('=================================================');
  console.log('SmartMetal Tenant Query Isolation Audit');
  console.log('=================================================\n');

  console.log('Generating audit report from manual code review...\n');

  generateCsvReport();
  const summary = generateSummary();

  console.log('Next Steps:');
  console.log('1. Review CSV report: docs/TENANT_QUERY_AUDIT.csv');
  console.log('2. Investigate queries marked as "NO" or "UNKNOWN"');
  console.log('3. Add TODO comments to code for Phase 1 RLS implementation');
  console.log('4. Document findings in docs/TENANT_ISOLATION_STRATEGY.md\n');

  return summary;
}

// Run audit if called directly
if (require.main === module) {
  main();
  process.exit(0);
}

module.exports = {
  auditFindings,
  generateCsvReport,
  generateSummary,
  main
};
