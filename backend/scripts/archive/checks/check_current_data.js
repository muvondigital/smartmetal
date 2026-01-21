require('dotenv').config();
const { getDb } = require('../src/db/supabaseClient');

(async () => {
  const db = await getDb();

  console.log('='.repeat(80));
  console.log('NSC DATA AUDIT - Current State');
  console.log('='.repeat(80));
  console.log('');

  try {
    // 1. Materials Data
    console.log('1. MATERIALS DATA');
    console.log('-'.repeat(80));

    const materialsResult = await db.query(`
      SELECT
        category,
        origin_type,
        COUNT(*) as count,
        MIN(base_cost) as min_cost,
        MAX(base_cost) as max_cost,
        AVG(base_cost) as avg_cost
      FROM materials
      GROUP BY category, origin_type
      ORDER BY category, origin_type
    `);

    if (materialsResult.rows.length === 0) {
      console.log('⚠️  NO MATERIALS DATA FOUND');
    } else {
      console.log(`Total material records: ${materialsResult.rows.reduce((sum, r) => sum + parseInt(r.count), 0)}`);
      console.log('');
      console.log('Breakdown by Category & Origin:');
      materialsResult.rows.forEach(row => {
        console.log(`  ${row.category} (${row.origin_type || 'N/A'}): ${row.count} items`);
        console.log(`    Cost range: $${row.min_cost} - $${row.max_cost} (avg: $${Math.round(row.avg_cost)})`);
      });
    }

    // 2. Pricing Rules (from client_pricing_rules table if exists)
    console.log('');
    console.log('2. CLIENT PRICING RULES');
    console.log('-'.repeat(80));

    try {
      const rulesResult = await db.query(`
        SELECT
          client_segment,
          category,
          origin_type,
          markup_pct,
          logistics_pct,
          risk_pct
        FROM client_pricing_rules
        ORDER BY client_segment, category, origin_type
        LIMIT 20
      `);

      if (rulesResult.rows.length === 0) {
        console.log('⚠️  NO CLIENT PRICING RULES IN DATABASE');
        console.log('   Rules are defined in: backend/src/config/pricingRules.js');
      } else {
        console.log(`Found ${rulesResult.rows.length} pricing rules:`);
        rulesResult.rows.forEach(rule => {
          console.log(`  ${rule.client_segment} / ${rule.category} / ${rule.origin_type}:`);
          console.log(`    Markup: ${rule.markup_pct}%, Logistics: ${rule.logistics_pct}%, Risk: ${rule.risk_pct}%`);
        });
      }
    } catch (err) {
      console.log('⚠️  client_pricing_rules table does not exist or error:', err.message);
      console.log('   Rules are defined in: backend/src/config/pricingRules.js');
    }

    // 3. Check config file rules
    console.log('');
    console.log('3. CONFIG FILE PRICING RULES');
    console.log('-'.repeat(80));
    console.log('Location: backend/src/config/pricingRules.js');
    console.log('');

    const pricingRules = require('../src/config/pricingRules.js');
    console.log('✓ Quantity Breaks: ', Object.keys(pricingRules.quantityBreaks).join(', '));
    console.log('✓ Client Segments: ', Object.keys(pricingRules.clientSegmentMargins).join(', '));
    console.log('✓ Category Margins: ', Object.keys(pricingRules.categoryMarginOverrides).join(', '));
    console.log('✓ Regional Adjustments: ', Object.keys(pricingRules.regionalAdjustments).join(', '));
    console.log('✓ Industry Adjustments: ', Object.keys(pricingRules.industryAdjustments).join(', '));
    console.log('✓ Fixed Margin Clients: ', Object.keys(pricingRules.fixedMarginClients).length, 'clients');

    // 4. Check origin-specific data
    console.log('');
    console.log('4. ORIGIN-SPECIFIC PRICING DATA');
    console.log('-'.repeat(80));

    const originDataResult = await db.query(`
      SELECT
        origin_type,
        COUNT(*) as material_count
      FROM materials
      WHERE origin_type IS NOT NULL
      GROUP BY origin_type
    `);

    if (originDataResult.rows.length === 0) {
      console.log('⚠️  NO ORIGIN-SPECIFIC MATERIAL DATA');
      console.log('   All materials have NULL origin_type');
    } else {
      console.log('Materials by origin:');
      originDataResult.rows.forEach(row => {
        console.log(`  ${row.origin_type}: ${row.material_count} materials`);
      });
    }

    // 5. Check what's in pricing runs
    console.log('');
    console.log('5. RECENT PRICING RUNS DATA');
    console.log('-'.repeat(80));

    const pricingRunsResult = await db.query(`
      SELECT
        pr.id,
        pr.created_at,
        COUNT(pri.id) as item_count,
        pri.origin_type,
        pri.dual_pricing_data IS NOT NULL as has_dual_pricing
      FROM pricing_runs pr
      LEFT JOIN pricing_run_items pri ON pr.id = pri.pricing_run_id
      GROUP BY pr.id, pr.created_at, pri.origin_type, pri.dual_pricing_data
      ORDER BY pr.created_at DESC
      LIMIT 5
    `);

    if (pricingRunsResult.rows.length === 0) {
      console.log('⚠️  NO PRICING RUNS FOUND');
    } else {
      console.log(`Found ${pricingRunsResult.rows.length} recent pricing runs:`);
      pricingRunsResult.rows.forEach(run => {
        console.log(`  Run ${run.id.substring(0, 8)}...`);
        console.log(`    Created: ${new Date(run.created_at).toLocaleString()}`);
        console.log(`    Items: ${run.item_count}, Origin: ${run.origin_type || 'N/A'}`);
        console.log(`    Has Dual Pricing: ${run.has_dual_pricing ? 'Yes' : 'No'}`);
      });
    }

    // 6. NSC Data Checklist
    console.log('');
    console.log('6. NSC DATA CHECKLIST');
    console.log('-'.repeat(80));
    console.log('');
    console.log('✓ HAVE (from pricingRules.js):');
    console.log('  - Quantity break discounts (carbon steel, stainless, alloy)');
    console.log('  - Client segment margins (strategic, normal, distributor, project)');
    console.log('  - Category-specific margins (pipe, fittings, valves, structural)');
    console.log('  - Regional adjustments (Malaysia, Indonesia, Vietnam)');
    console.log('  - Industry adjustments (O&G, Power, Geothermal, Fabrication)');
    console.log('  - Fixed margin clients list');
    console.log('  - Approval triggers (margin 18%, discount 2%)');
    console.log('  - Rounding rules (materials, fabrication, services)');
    console.log('');
    console.log('❌ MISSING / NEED FROM NSC:');
    console.log('  - Origin-specific markup percentages (CHINA vs NON_CHINA)');
    console.log('  - Origin-specific logistics costs per category');
    console.log('  - Origin-specific risk buffer percentages');
    console.log('  - Base cost data by origin type in materials table');
    console.log('  - Complete client restriction list (only 4 hardcoded currently)');
    console.log('  - Operator-specific rules configuration');
    console.log('  - Certification requirement mappings');
    console.log('');
    console.log('⚠️  PLACEHOLDER DATA:');
    console.log('  - Materials base_cost: Default $100 (not real)');
    console.log('  - Markup/Logistics/Risk: All using same % for both origins');
    console.log('  - Origin selection rules: Partially implemented, awaiting NSC input');

    console.log('');
    console.log('='.repeat(80));
    console.log('AUDIT COMPLETE');
    console.log('='.repeat(80));

  } catch (error) {
    console.error('Fatal error during audit:', error);
    throw error;
  }

  process.exit(0);
})();
