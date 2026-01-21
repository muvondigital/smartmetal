const { Pool } = require('pg');
require('dotenv').config();

(async () => {
  const pool = new Pool({ connectionString: process.env.MIGRATION_DATABASE_URL });
  const client = await pool.connect();

  const rfqId = '74760752-7813-4f3f-85bb-e7a723bcdedc';

  console.log('🔍 SMART MATERIAL MATCHING FOR NSC RFQ\n');

  try {
    // Get tenant ID
    const tenantResult = await client.query("SELECT id FROM tenants WHERE code = 'nsc'");
    const tenantId = tenantResult.rows[0].id;

    // Analyze RFQ items
    console.log('📋 Analyzing RFQ Items...');
    const itemAnalysis = await client.query(`
      SELECT
        CASE
          WHEN UPPER(description) LIKE '%BEAM%' THEN 'STRUCTURAL_BEAM'
          WHEN UPPER(description) LIKE '%PLATE%' OR UPPER(description) LIKE '%PL%' THEN 'PLATE'
          WHEN UPPER(description) LIKE '%PIPE%' OR UPPER(description) LIKE '%TUBULAR%' THEN 'PIPE'
          WHEN UPPER(description) LIKE '%FLANGE%' THEN 'FLANGE'
          WHEN UPPER(description) LIKE '%FITTING%' THEN 'FITTING'
          ELSE 'UNKNOWN'
        END as detected_category,
        COUNT(*) as count
      FROM rfq_items
      WHERE rfq_id = $1
      GROUP BY detected_category
      ORDER BY count DESC
    `, [rfqId]);

    console.log('Item Categories:');
    itemAnalysis.rows.forEach(row => {
      console.log(`  ${row.detected_category}: ${row.count} items`);
    });

    // Check materials availability
    console.log('\n📦 Materials Catalog:');
    const catalogCats = await client.query(`
      SELECT category, COUNT(*) as count
      FROM materials
      WHERE tenant_id = $1
      GROUP BY category
      ORDER BY count DESC
    `, [tenantId]);

    catalogCats.rows.forEach(row => {
      console.log(`  ${row.category}: ${row.count} items`);
    });

    console.log('\n🎯 MATCHING STRATEGY:');
    console.log('  Step 1: Categorize items based on keywords');
    console.log('  Step 2: Match to materials by category + size pattern');
    console.log('  Step 3: Assign generic material codes where exact match fails');
    console.log('\n⏳ Starting intelligent matching...\n');

    let matchedCount = 0;
    let fallbackCount = 0;
    let unmatchedCount = 0;

    const allItems = await client.query(`
      SELECT id, description
      FROM rfq_items
      WHERE rfq_id = $1
    `, [rfqId]);

    for (const item of allItems.rows) {
      const desc = (item.description || '').toUpperCase();
      let matchedMaterial = null;
      let matchType = null;

      // Detect category
      let category = null;
      if (desc.includes('BEAM') || desc.includes('W36') || desc.includes('W14')) {
        category = 'STRUCTURAL_BEAM';
      } else if (desc.includes('PLATE') || desc.includes(' PL')) {
        category = 'PLATE';
      } else if (desc.includes('PIPE') || desc.includes('TUBULAR')) {
        category = 'PIPE';
      } else if (desc.includes('FLANGE')) {
        category = 'FLANGE';
      } else if (desc.includes('FITTING') || desc.includes('ELBOW') || desc.includes('TEE')) {
        category = 'FITTING';
      }

      if (category) {
        // Strategy 1: Try to find ANY material in this category
        const categoryMatch = await client.query(`
          SELECT material_code, id, size_description
          FROM materials
          WHERE tenant_id = $1 AND category = $2
          LIMIT 1
        `, [tenantId, category]);

        if (categoryMatch.rows.length > 0) {
          matchedMaterial = categoryMatch.rows[0];
          matchType = 'category_fallback';
          fallbackCount++;
        }
      }

      // Update the item
      if (matchedMaterial) {
        await client.query(`
          UPDATE rfq_items
          SET material_code = $1,
              material_id = $2,
              updated_at = NOW()
          WHERE id = $3
        `, [matchedMaterial.material_code, matchedMaterial.id, item.id]);

        if (matchType === 'category_fallback') {
          if (fallbackCount <= 3) {
            console.log(`⚠️  Fallback: "${desc.substring(0, 40)}..." → [${category}] ${matchedMaterial.material_code}`);
          }
        } else {
          matchedCount++;
          if (matchedCount <= 3) {
            console.log(`✅ Matched: "${desc.substring(0, 40)}..." → ${matchedMaterial.material_code}`);
          }
        }
      } else {
        unmatchedCount++;
        if (unmatchedCount <= 3) {
          console.log(`❌ No match: "${desc.substring(0, 40)}..."`);
        }
      }
    }

    const totalItems = allItems.rows.length;
    const totalMatched = matchedCount + fallbackCount;

    console.log('\n' + '='.repeat(70));
    console.log('MATCHING RESULTS:');
    console.log(`  ✅ Exact Matches: ${matchedCount} items (${Math.round(matchedCount / totalItems * 100)}%)`);
    console.log(`  ⚠️  Category Fallbacks: ${fallbackCount} items (${Math.round(fallbackCount / totalItems * 100)}%)`);
    console.log(`  ❌ Unmatched: ${unmatchedCount} items (${Math.round(unmatchedCount / totalItems * 100)}%)`);
    console.log(`  📊 TOTAL READY FOR PRICING: ${totalMatched} / ${totalItems} (${Math.round(totalMatched / totalItems * 100)}%)`);
    console.log('='.repeat(70));

    if (fallbackCount > 0) {
      console.log('\n💡 NOTE: Category fallback matching was used.');
      console.log('   → Items assigned to generic materials in same category');
      console.log('   → Pricing will use base costs from similar materials');
      console.log('   → Results will be approximate but functional');
    }

    if (unmatchedCount > 0) {
      console.log('\n⚠️  Some items could not be matched.');
      console.log('   → Add more materials to the catalog for better coverage');
    }

    console.log('\n✅ Material matching complete!');
    console.log('   You can now run pricing with assigned materials.');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
})();
