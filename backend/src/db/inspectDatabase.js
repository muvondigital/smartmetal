// Load environment variables
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const { connectDb } = require('./supabaseClient');

async function inspectDatabase() {
  const db = await connectDb();

  console.log('='.repeat(70));
  console.log('SUPABASE DATABASE INSPECTION');
  console.log('='.repeat(70));
  console.log('');

  try {
    // 1. List all tables
    console.log('📋 TABLES IN DATABASE:');
    console.log('-'.repeat(70));
    const tablesResult = await db.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);

    const tables = tablesResult.rows.map(r => r.table_name);
    tables.forEach((table, idx) => {
      console.log(`  ${idx + 1}. ${table}`);
    });
    console.log('');

    // 2. Check each table for row counts
    console.log('📊 ROW COUNTS:');
    console.log('-'.repeat(70));
    for (const table of tables) {
      const countResult = await db.query(`SELECT COUNT(*) as count FROM ${table}`);
      const count = countResult.rows[0].count;
      console.log(`  ${table.padEnd(30)} → ${count} rows`);
    }
    console.log('');

    // 3. Check materials table structure
    if (tables.includes('materials')) {
      console.log('🔍 MATERIALS TABLE STRUCTURE:');
      console.log('-'.repeat(70));
      const columnsResult = await db.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = 'materials'
        ORDER BY ordinal_position;
      `);
      columnsResult.rows.forEach(col => {
        console.log(`  ${col.column_name.padEnd(20)} ${col.data_type.padEnd(20)} ${col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'}`);
      });
      console.log('');

      // Sample materials
      console.log('📦 SAMPLE MATERIALS (first 5):');
      console.log('-'.repeat(70));
      const samplesResult = await db.query(`
        SELECT material_code, category, material_type, base_cost, size_description
        FROM materials
        LIMIT 5;
      `);
      samplesResult.rows.forEach(mat => {
        console.log(`  Code: ${mat.material_code}`);
        console.log(`    Category: ${mat.category}`);
        console.log(`    Type: ${mat.material_type}`);
        console.log(`    Size: ${mat.size_description}`);
        console.log(`    Cost: $${mat.base_cost}`);
        console.log('');
      });
    }

    // 4. Check for foreign keys
    console.log('🔗 FOREIGN KEY CONSTRAINTS:');
    console.log('-'.repeat(70));
    const fkResult = await db.query(`
      SELECT
        tc.table_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name,
        tc.constraint_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
      ORDER BY tc.table_name;
    `);

    if (fkResult.rows.length > 0) {
      fkResult.rows.forEach(fk => {
        console.log(`  ${fk.table_name}.${fk.column_name} → ${fk.foreign_table_name}.${fk.foreign_column_name}`);
      });
    } else {
      console.log('  No foreign key constraints found');
    }
    console.log('');

    // 5. Check for indexes
    console.log('📇 INDEXES:');
    console.log('-'.repeat(70));
    const indexResult = await db.query(`
      SELECT
        schemaname,
        tablename,
        indexname,
        indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
      ORDER BY tablename, indexname;
    `);

    const indexesByTable = {};
    indexResult.rows.forEach(idx => {
      if (!indexesByTable[idx.tablename]) {
        indexesByTable[idx.tablename] = [];
      }
      indexesByTable[idx.tablename].push(idx.indexname);
    });

    Object.keys(indexesByTable).sort().forEach(table => {
      console.log(`  ${table}:`);
      indexesByTable[table].forEach(idx => {
        console.log(`    - ${idx}`);
      });
    });
    console.log('');

    // 6. Check if our migration has been run
    console.log('🔧 MIGRATION STATUS:');
    console.log('-'.repeat(70));

    // Check for FK constraint on rfq_items
    const fkCheckResult = await db.query(`
      SELECT constraint_name
      FROM information_schema.table_constraints
      WHERE table_name = 'rfq_items'
        AND constraint_type = 'FOREIGN KEY'
        AND constraint_name = 'fk_rfq_items_material_code';
    `);

    if (fkCheckResult.rows.length > 0) {
      console.log('  ✅ FK constraint exists: rfq_items.material_code → materials.material_code');
    } else {
      console.log('  ❌ FK constraint MISSING: rfq_items.material_code → materials.material_code');
      console.log('     → Run: node src/db/setupKGSB.js to fix this');
    }

    // Check for critical indexes
    const criticalIndexes = [
      'idx_pricing_runs_approval_status_created',
      'idx_rfqs_status_created',
      'idx_materials_origin_category'
    ];

    criticalIndexes.forEach(idxName => {
      const exists = indexResult.rows.some(idx => idx.indexname === idxName);
      if (exists) {
        console.log(`  ✅ Index exists: ${idxName}`);
      } else {
        console.log(`  ❌ Index MISSING: ${idxName}`);
        console.log('     → Run: node src/db/setupKGSB.js to fix this');
      }
    });
    console.log('');

    // 7. Check for KGSB materials
    if (tables.includes('materials')) {
      console.log('🏭 KGSB CATALOG STATUS:');
      console.log('-'.repeat(70));
      const kgsbResult = await db.query(`
        SELECT COUNT(*) as count
        FROM materials
        WHERE material_code LIKE 'KGSB%';
      `);

      const kgsbCount = kgsbResult.rows[0].count;
      console.log(`  KGSB materials in database: ${kgsbCount}`);

      if (kgsbCount === 0) {
        console.log('  ❌ No KGSB materials found');
        console.log('     → Run: node src/db/setupKGSB.js to seed catalog');
      } else {
        console.log(`  ✅ KGSB catalog seeded with ${kgsbCount} items`);

        // Show breakdown by category
        const categoryResult = await db.query(`
          SELECT category, COUNT(*) as count
          FROM materials
          WHERE material_code LIKE 'KGSB%'
          GROUP BY category
          ORDER BY count DESC;
        `);

        console.log('');
        console.log('  Breakdown by category:');
        categoryResult.rows.forEach(cat => {
          console.log(`    ${cat.category.padEnd(20)} → ${cat.count} items`);
        });
      }
    }
    console.log('');

    console.log('='.repeat(70));
    console.log('INSPECTION COMPLETE');
    console.log('='.repeat(70));

  } catch (error) {
    console.error('Error inspecting database:', error);
    throw error;
  }
}

// Run inspection
inspectDatabase()
  .then(() => {
    console.log('');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Inspection failed:', error);
    process.exit(1);
  });
