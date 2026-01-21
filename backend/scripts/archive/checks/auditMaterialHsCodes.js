/**
 * Audit Script: Material HS Code Gap Report
 *
 * Purpose: Identify materials missing HS code mappings and generate a CSV report.
 *
 * This script:
 * 1. Queries all materials in the catalog
 * 2. Checks if each material has HS code coverage via regulatory_material_mapping
 * 3. Checks if RFQ items using this material have HS codes assigned
 * 4. Generates a CSV report with gap analysis
 *
 * Usage:
 *   node backend/scripts/auditMaterialHsCodes.js
 *
 * Output:
 *   docs/MATERIAL_HS_CODE_GAP_REPORT.csv
 *
 * Phase: 0 (Foundation & Validation)
 * Work Item: A-02, PHASE0-06
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { connectDb } = require('../src/db/supabaseClient');
const fs = require('fs');
const path = require('path');

async function auditMaterialHsCodes() {
  const db = await connectDb();

  console.log('=================================================');
  console.log('SmartMetal HS Code Gap Audit');
  console.log('=================================================\n');

  try {
    // Step 1: Get all materials
    console.log('Step 1: Fetching all materials from catalog...');
    const materialsResult = await db.query(`
      SELECT
        id,
        material_code,
        category,
        spec_standard,
        grade,
        material_type,
        origin_type,
        tenant_id
      FROM materials
      ORDER BY category, material_code
    `);

    const materials = materialsResult.rows;
    console.log(`✓ Found ${materials.length} materials in catalog\n`);

    if (materials.length === 0) {
      console.log('⚠️  No materials found in catalog. Ensure materials are seeded.');
      return;
    }

    // Step 2: Check HS code coverage for each material
    console.log('Step 2: Checking HS code coverage for each material...');

    const results = [];

    for (const material of materials) {
      const { material_code, category, spec_standard, grade, material_type, origin_type, tenant_id } = material;

      // Check if material has keyword mapping to HS code
      const mappingResult = await db.query(`
        SELECT DISTINCT
          rhc.hs_code,
          rhc.description as hs_description,
          rmm.keyword,
          rmm.priority
        FROM regulatory_material_mapping rmm
        JOIN regulatory_hs_codes rhc ON rmm.hs_code_id = rhc.id
        WHERE LOWER(rmm.keyword) IN (
          LOWER($1),
          LOWER($2),
          LOWER($3),
          LOWER($4)
        )
        ORDER BY rmm.priority ASC
        LIMIT 1
      `, [
        material_code,
        category || '',
        spec_standard || '',
        (spec_standard && grade) ? `${spec_standard} ${grade}` : ''
      ]);

      const hasKeywordMapping = mappingResult.rows.length > 0;
      const mappedHsCode = hasKeywordMapping ? mappingResult.rows[0].hs_code : null;
      const mappedKeyword = hasKeywordMapping ? mappingResult.rows[0].keyword : null;

      // Check if RFQ items using this material have HS codes
      const rfqItemsResult = await db.query(`
        SELECT
          COUNT(*) as total_items,
          COUNT(hs_code) as items_with_hs_code,
          MAX(hs_code) as sample_hs_code,
          MAX(hs_match_source) as sample_match_source
        FROM rfq_items
        WHERE material_code = $1
      `, [material_code]);

      const rfqStats = rfqItemsResult.rows[0];
      const totalRfqItems = parseInt(rfqStats.total_items, 10);
      const itemsWithHsCode = parseInt(rfqStats.items_with_hs_code, 10);
      const sampleHsCode = rfqStats.sample_hs_code;
      const sampleMatchSource = rfqStats.sample_match_source;

      // Determine HS code presence
      const hsCodePresent = hasKeywordMapping || (itemsWithHsCode > 0);
      const hsCodeSource = hasKeywordMapping ? 'KEYWORD_MAPPING' : (itemsWithHsCode > 0 ? 'RFQ_ITEMS' : 'NONE');
      const effectiveHsCode = mappedHsCode || sampleHsCode || 'N/A';

      results.push({
        material_code,
        category: category || 'N/A',
        spec_standard: spec_standard || 'N/A',
        grade: grade || 'N/A',
        material_type: material_type || 'N/A',
        origin_type: origin_type || 'N/A',
        hs_code_present: hsCodePresent ? 'YES' : 'NO',
        hs_code_source: hsCodeSource,
        effective_hs_code: effectiveHsCode,
        mapped_keyword: mappedKeyword || 'N/A',
        rfq_items_total: totalRfqItems,
        rfq_items_with_hs: itemsWithHsCode,
        sample_hs_code: sampleHsCode || 'N/A',
        sample_match_source: sampleMatchSource || 'N/A',
        tenant_id: tenant_id || 'GLOBAL'
      });
    }

    console.log('✓ HS code coverage analysis complete\n');

    // Step 3: Generate summary statistics
    console.log('Step 3: Generating summary statistics...');

    const totalMaterials = results.length;
    const materialsWithHsCode = results.filter(r => r.hs_code_present === 'YES').length;
    const materialsWithoutHsCode = totalMaterials - materialsWithHsCode;
    const coveragePercentage = ((materialsWithHsCode / totalMaterials) * 100).toFixed(2);

    const gapsByCategory = results
      .filter(r => r.hs_code_present === 'NO')
      .reduce((acc, r) => {
        acc[r.category] = (acc[r.category] || 0) + 1;
        return acc;
      }, {});

    console.log('\n=================================================');
    console.log('SUMMARY STATISTICS');
    console.log('=================================================');
    console.log(`Total Materials:               ${totalMaterials}`);
    console.log(`Materials WITH HS Code:        ${materialsWithHsCode} (${coveragePercentage}%)`);
    console.log(`Materials WITHOUT HS Code:     ${materialsWithoutHsCode} (${(100 - coveragePercentage).toFixed(2)}%)`);
    console.log('\nGaps by Category:');
    Object.entries(gapsByCategory)
      .sort((a, b) => b[1] - a[1])
      .forEach(([category, count]) => {
        console.log(`  - ${category}: ${count} gaps`);
      });
    console.log('=================================================\n');

    // Step 4: Write CSV report
    console.log('Step 4: Writing CSV report...');

    const csvHeader = [
      'material_code',
      'category',
      'spec_standard',
      'grade',
      'material_type',
      'origin_type',
      'hs_code_present',
      'hs_code_source',
      'effective_hs_code',
      'mapped_keyword',
      'rfq_items_total',
      'rfq_items_with_hs',
      'sample_hs_code',
      'sample_match_source',
      'tenant_id'
    ].join(',');

    const csvRows = results.map(r =>
      [
        `"${r.material_code}"`,
        `"${r.category}"`,
        `"${r.spec_standard}"`,
        `"${r.grade}"`,
        `"${r.material_type}"`,
        `"${r.origin_type}"`,
        r.hs_code_present,
        r.hs_code_source,
        `"${r.effective_hs_code}"`,
        `"${r.mapped_keyword}"`,
        r.rfq_items_total,
        r.rfq_items_with_hs,
        `"${r.sample_hs_code}"`,
        `"${r.sample_match_source}"`,
        `"${r.tenant_id}"`
      ].join(',')
    );

    const csvContent = [csvHeader, ...csvRows].join('\n');

    const outputPath = path.join(__dirname, '../../docs/MATERIAL_HS_CODE_GAP_REPORT.csv');
    fs.writeFileSync(outputPath, csvContent, 'utf8');

    console.log(`✓ CSV report written to: ${outputPath}\n`);

    // Step 5: Generate markdown summary
    console.log('Step 5: Writing markdown summary...');

    const markdownContent = `# SmartMetal HS Code Gap Report

**Generated:** ${new Date().toISOString()}
**Total Materials Analyzed:** ${totalMaterials}

## Summary

| Metric                          | Value                  |
|---------------------------------|------------------------|
| **Total Materials**             | ${totalMaterials}      |
| **Materials WITH HS Code**      | ${materialsWithHsCode} (${coveragePercentage}%) |
| **Materials WITHOUT HS Code**   | ${materialsWithoutHsCode} (${(100 - coveragePercentage).toFixed(2)}%) |

## Gaps by Category

| Category | Gap Count |
|----------|-----------|
${Object.entries(gapsByCategory)
  .sort((a, b) => b[1] - a[1])
  .map(([category, count]) => `| ${category} | ${count} |`)
  .join('\n')}

## Top 10 Materials Missing HS Codes

| Material Code | Category | Spec Standard | Grade |
|---------------|----------|---------------|-------|
${results
  .filter(r => r.hs_code_present === 'NO')
  .slice(0, 10)
  .map(r => `| ${r.material_code} | ${r.category} | ${r.spec_standard} | ${r.grade} |`)
  .join('\n')}

## Recommendations

1. **Immediate Action (Phase 0):**
   - Document these gaps in [KNOWN_GAPS_2025.md](KNOWN_GAPS_2025.md)
   - No code changes required in Phase 0

2. **Phase 1 Actions (30-60 days):**
   - Seed missing HS codes for high-priority categories
   - Add keyword mappings for common material descriptions

3. **Phase 2 Actions (60-90 days):**
   - Implement AI-based HS code prediction for unmapped materials
   - Build human review workflow for low-confidence predictions

## Data Export

Full gap analysis available in:
- CSV: [MATERIAL_HS_CODE_GAP_REPORT.csv](MATERIAL_HS_CODE_GAP_REPORT.csv)

---

**Script:** backend/scripts/auditMaterialHsCodes.js
**Work Item:** A-02, PHASE0-06
`;

    const markdownPath = path.join(__dirname, '../../docs/MATERIAL_HS_CODE_GAP_REPORT.md');
    fs.writeFileSync(markdownPath, markdownContent, 'utf8');

    console.log(`✓ Markdown summary written to: ${markdownPath}\n`);

    console.log('=================================================');
    console.log('✅ HS Code Gap Audit Complete');
    console.log('=================================================');
    console.log(`\nNext Steps:`);
    console.log(`1. Review CSV report: docs/MATERIAL_HS_CODE_GAP_REPORT.csv`);
    console.log(`2. Review markdown summary: docs/MATERIAL_HS_CODE_GAP_REPORT.md`);
    console.log(`3. Document gaps in docs/KNOWN_GAPS_2025.md`);
    console.log(`4. No code changes required in Phase 0\n`);

  } catch (error) {
    console.error('❌ HS Code Gap Audit failed:', error);
    console.error('Error details:', error.message);
    throw error;
  }
}

// Run audit if called directly
if (require.main === module) {
  auditMaterialHsCodes()
    .then(() => {
      console.log('Audit script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Audit script failed:', error);
      process.exit(1);
    });
}

module.exports = {
  auditMaterialHsCodes
};
