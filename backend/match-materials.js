const { Pool } = require('pg');
require('dotenv').config();

(async () => {
  const pool = new Pool({ connectionString: process.env.MIGRATION_DATABASE_URL });
  const client = await pool.connect();

  const rfqId = '74760752-7813-4f3f-85bb-e7a723bcdedc';

  console.log('🔍 MATERIAL MATCHING FOR NSC RFQ\n');

  try {
    // Get tenant ID
    const tenantResult = await client.query("SELECT id FROM tenants WHERE code = 'nsc'");
    const tenantId = tenantResult.rows[0].id;

    // Get sample items to understand the data
    console.log('📋 Sample RFQ Items:');
    const sampleItems = await client.query(`
      SELECT id, description
      FROM rfq_items
      WHERE rfq_id = $1
      LIMIT 10
    `, [rfqId]);

    sampleItems.rows.forEach((item, i) => {
      console.log(`${i + 1}. ${item.description.substring(0, 80)}`);
    });

    // Get materials catalog summary
    console.log('\n📦 Materials Catalog:');
    const materialStats = await client.query(`
      SELECT category, COUNT(*) as count
      FROM materials
      WHERE tenant_id = $1
      GROUP BY category
      ORDER BY count DESC
    `, [tenantId]);

    materialStats.rows.forEach(row => {
      console.log(`  ${row.category}: ${row.count} items`);
    });

    // Sample materials for matching logic
    console.log('\n🔧 Sample Materials from Catalog:');
    const sampleMaterials = await client.query(`
      SELECT material_code, description, category, base_cost
      FROM materials
      WHERE tenant_id = $1
      LIMIT 5
    `, [tenantId]);

    sampleMaterials.rows.forEach((mat, i) => {
      console.log(`${i + 1}. [${mat.category}] ${mat.material_code} - ${mat.description?.substring(0, 60)} - $${mat.base_cost}`);
    });

    console.log('\n🎯 MATCHING STRATEGY:');
    console.log('Will match RFQ items to materials catalog based on:');
    console.log('  1. Category keywords (PIPE, FLANGE, FITTING, etc.)');
    console.log('  2. Size/dimension matching');
    console.log('  3. Material grade/spec matching');
    console.log('  4. Fuzzy text matching on descriptions');

    console.log('\n⏳ Starting material matching...\n');

    // Execute material matching
    let matchedCount = 0;
    let unmatchedCount = 0;

    const allItems = await client.query(`
      SELECT id, description
      FROM rfq_items
      WHERE rfq_id = $1
    `, [rfqId]);

    for (const item of allItems.rows) {
      const desc = item.description?.toUpperCase() || '';

      // Try to find matching material
      let matchedMaterial = null;

      // Strategy 1: Exact description match
      const exactMatch = await client.query(`
        SELECT material_code, id
        FROM materials
        WHERE tenant_id = $1
          AND UPPER(description) = $2
        LIMIT 1
      `, [tenantId, desc]);

      if (exactMatch.rows.length > 0) {
        matchedMaterial = exactMatch.rows[0];
      } else {
        // Strategy 2: Partial description match (contains)
        const partialMatch = await client.query(`
          SELECT material_code, id, description,
                 similarity(UPPER(description), $2) as sim
          FROM materials
          WHERE tenant_id = $1
            AND UPPER(description) LIKE $3
          ORDER BY sim DESC
          LIMIT 1
        `, [tenantId, desc, `%${desc.substring(0, 20)}%`]);

        if (partialMatch.rows.length > 0 && partialMatch.rows[0].sim > 0.3) {
          matchedMaterial = partialMatch.rows[0];
        }
      }

      // Update the item with matched material
      if (matchedMaterial) {
        await client.query(`
          UPDATE rfq_items
          SET material_code = $1,
              material_id = $2,
              updated_at = NOW()
          WHERE id = $3
        `, [matchedMaterial.material_code, matchedMaterial.id, item.id]);
        matchedCount++;
        if (matchedCount <= 5) {
          console.log(`✅ Matched: ${item.description.substring(0, 50)}... → ${matchedMaterial.material_code}`);
        }
      } else {
        unmatchedCount++;
        if (unmatchedCount <= 5) {
          console.log(`❌ No match: ${item.description.substring(0, 50)}...`);
        }
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('MATCHING RESULTS:');
    console.log(`  ✅ Matched: ${matchedCount} items (${Math.round(matchedCount / allItems.rows.length * 100)}%)`);
    console.log(`  ❌ Unmatched: ${unmatchedCount} items (${Math.round(unmatchedCount / allItems.rows.length * 100)}%)`);
    console.log('='.repeat(60));

    if (unmatchedCount > 0) {
      console.log('\n⚠️  Some items could not be matched automatically.');
      console.log('   → These will use fallback pricing or $0');
      console.log('   → For better results, add more materials to the catalog');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
})();
