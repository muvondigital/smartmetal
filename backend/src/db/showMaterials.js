// Load environment variables
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const { connectDb } = require('./supabaseClient');

async function showMaterials() {
  const db = await connectDb();

  console.log('');
  console.log('='.repeat(80));
  console.log('MATERIALS DATABASE OVERVIEW');
  console.log('='.repeat(80));
  console.log('');

  try {
    // 1. Overall statistics
    console.log('📊 OVERALL STATISTICS');
    console.log('-'.repeat(80));

    const totalResult = await db.query('SELECT COUNT(*) as count FROM materials');
    const total = totalResult.rows[0].count;
    console.log(`Total Materials: ${total}`);
    console.log('');

    // 2. Breakdown by Category
    console.log('📦 BREAKDOWN BY CATEGORY');
    console.log('-'.repeat(80));
    const categoryResult = await db.query(`
      SELECT
        category,
        COUNT(*) as count,
        ROUND(AVG(base_cost), 2) as avg_cost,
        MIN(base_cost) as min_cost,
        MAX(base_cost) as max_cost
      FROM materials
      GROUP BY category
      ORDER BY count DESC, category;
    `);

    console.log('Category'.padEnd(25) + 'Count'.padEnd(10) + 'Avg Cost'.padEnd(15) + 'Min Cost'.padEnd(15) + 'Max Cost');
    console.log('-'.repeat(80));
    categoryResult.rows.forEach(row => {
      console.log(
        row.category.padEnd(25) +
        row.count.toString().padEnd(10) +
        `$${row.avg_cost}`.padEnd(15) +
        `$${row.min_cost}`.padEnd(15) +
        `$${row.max_cost}`
      );
    });
    console.log('');

    // 3. Breakdown by Material Type
    console.log('🔧 BREAKDOWN BY MATERIAL TYPE');
    console.log('-'.repeat(80));
    const typeResult = await db.query(`
      SELECT
        material_type,
        COUNT(*) as count
      FROM materials
      GROUP BY material_type
      ORDER BY count DESC, material_type;
    `);

    console.log('Material Type'.padEnd(40) + 'Count');
    console.log('-'.repeat(80));
    typeResult.rows.forEach(row => {
      const materialType = row.material_type || 'NULL';
      console.log(materialType.padEnd(40) + row.count);
    });
    console.log('');

    // 4. Breakdown by Origin
    console.log('🌍 BREAKDOWN BY ORIGIN');
    console.log('-'.repeat(80));
    const originResult = await db.query(`
      SELECT
        origin_type,
        COUNT(*) as count
      FROM materials
      GROUP BY origin_type
      ORDER BY count DESC;
    `);

    console.log('Origin Type'.padEnd(20) + 'Count');
    console.log('-'.repeat(80));
    originResult.rows.forEach(row => {
      console.log(row.origin_type.padEnd(20) + row.count);
    });
    console.log('');

    // 5. KGSB Materials Breakdown
    console.log('🏭 KGSB MATERIALS BREAKDOWN');
    console.log('-'.repeat(80));
    const kgsbResult = await db.query(`
      SELECT
        category,
        COUNT(*) as count,
        ARRAY_AGG(material_code ORDER BY material_code) as codes
      FROM materials
      WHERE material_code LIKE 'KGSB%'
      GROUP BY category
      ORDER BY count DESC, category;
    `);

    if (kgsbResult.rows.length > 0) {
      kgsbResult.rows.forEach(row => {
        console.log(`${row.category} (${row.count} items):`);
        row.codes.slice(0, 5).forEach(code => {
          console.log(`  - ${code}`);
        });
        if (row.codes.length > 5) {
          console.log(`  ... and ${row.codes.length - 5} more`);
        }
        console.log('');
      });
    } else {
      console.log('No KGSB materials found');
      console.log('');
    }

    // 6. Sample materials from each category
    console.log('📋 SAMPLE MATERIALS BY CATEGORY (Top 3 per category)');
    console.log('-'.repeat(80));

    const categories = categoryResult.rows.map(r => r.category);
    for (const category of categories.slice(0, 10)) { // Limit to top 10 categories
      console.log(`\n${category}:`);
      const samplesResult = await db.query(`
        SELECT material_code, material_type, size_description, base_cost, spec_standard
        FROM materials
        WHERE category = $1
        ORDER BY base_cost
        LIMIT 3;
      `, [category]);

      samplesResult.rows.forEach(mat => {
        console.log(`  ${mat.material_code}`);
        console.log(`    Type: ${mat.material_type || 'N/A'}`);
        console.log(`    Size: ${mat.size_description || 'N/A'}`);
        console.log(`    Standard: ${mat.spec_standard || 'N/A'}`);
        console.log(`    Cost: $${mat.base_cost}`);
      });
    }
    console.log('');

    // 7. Price distribution
    console.log('💰 PRICE DISTRIBUTION');
    console.log('-'.repeat(80));
    const priceResult = await db.query(`
      SELECT
        CASE
          WHEN base_cost < 10 THEN '$0-10'
          WHEN base_cost < 50 THEN '$10-50'
          WHEN base_cost < 100 THEN '$50-100'
          WHEN base_cost < 200 THEN '$100-200'
          WHEN base_cost < 500 THEN '$200-500'
          ELSE '$500+'
        END as price_range,
        COUNT(*) as count
      FROM materials
      GROUP BY price_range
      ORDER BY MIN(base_cost);
    `);

    console.log('Price Range'.padEnd(20) + 'Count');
    console.log('-'.repeat(80));
    priceResult.rows.forEach(row => {
      console.log(row.price_range.padEnd(20) + row.count);
    });
    console.log('');

    // 8. Top 10 most expensive materials
    console.log('💎 TOP 10 MOST EXPENSIVE MATERIALS');
    console.log('-'.repeat(80));
    const expensiveResult = await db.query(`
      SELECT material_code, category, material_type, base_cost
      FROM materials
      ORDER BY base_cost DESC
      LIMIT 10;
    `);

    console.log('Rank'.padEnd(6) + 'Code'.padEnd(35) + 'Category'.padEnd(20) + 'Cost');
    console.log('-'.repeat(80));
    expensiveResult.rows.forEach((mat, idx) => {
      console.log(
        `${idx + 1}.`.padEnd(6) +
        mat.material_code.padEnd(35) +
        mat.category.padEnd(20) +
        `$${mat.base_cost}`
      );
    });
    console.log('');

    // 9. Top 10 cheapest materials
    console.log('💵 TOP 10 CHEAPEST MATERIALS');
    console.log('-'.repeat(80));
    const cheapResult = await db.query(`
      SELECT material_code, category, material_type, base_cost
      FROM materials
      ORDER BY base_cost ASC
      LIMIT 10;
    `);

    console.log('Rank'.padEnd(6) + 'Code'.padEnd(35) + 'Category'.padEnd(20) + 'Cost');
    console.log('-'.repeat(80));
    cheapResult.rows.forEach((mat, idx) => {
      console.log(
        `${idx + 1}.`.padEnd(6) +
        mat.material_code.padEnd(35) +
        mat.category.padEnd(20) +
        `$${mat.base_cost}`
      );
    });
    console.log('');

    console.log('='.repeat(80));
    console.log('END OF MATERIALS OVERVIEW');
    console.log('='.repeat(80));
    console.log('');

  } catch (error) {
    console.error('Error querying materials:', error);
    throw error;
  }
}

// Run
showMaterials()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('Failed:', error);
    process.exit(1);
  });
