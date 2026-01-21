/**
 * Diagnose HS Codes Data Loss
 * 
 * This script checks:
 * 1. Current count in hs_codes table
 * 2. Table creation/modification dates
 * 3. Any records in tariff_keyword_groups that might have HS code examples
 * 4. Check if migration was rolled back recently
 */

require('dotenv').config();
const { connectDb } = require('../src/db/supabaseClient');

async function diagnose() {
  const db = await connectDb();

  console.log('='.repeat(70));
  console.log('HS CODES DATA DIAGNOSIS');
  console.log('='.repeat(70));
  console.log('');

  try {
    // 1. Check current count
    const countResult = await db.query('SELECT COUNT(*) AS count FROM hs_codes');
    const count = parseInt(countResult.rows[0]?.count || 0, 10);
    console.log(`📊 Current HS Codes in database: ${count}`);
    console.log('');

    // 2. Check table metadata (PostgreSQL)
    try {
      const tableInfo = await db.query(`
        SELECT 
          schemaname,
          tablename,
          tableowner
        FROM pg_tables 
        WHERE tablename = 'hs_codes'
      `);
      
      if (tableInfo.rows.length > 0) {
        console.log('📋 Table exists in schema:', tableInfo.rows[0].schemaname);
      }
    } catch (e) {
      console.log('⚠️  Could not check table metadata');
    }

    // 3. Check creation dates of existing records
    if (count > 0) {
      const dateRange = await db.query(`
        SELECT 
          MIN(created_at) as oldest,
          MAX(created_at) as newest,
          COUNT(*) FILTER (WHERE source = 'DEMO') as demo_count,
          COUNT(*) FILTER (WHERE source = 'NSC') as nsc_count,
          COUNT(*) FILTER (WHERE source = 'SYSTEM') as system_count
        FROM hs_codes
      `);
      
      const dr = dateRange.rows[0];
      console.log('📅 Date Range:');
      console.log(`   Oldest record: ${dr.oldest || 'N/A'}`);
      console.log(`   Newest record: ${dr.newest || 'N/A'}`);
      console.log(`   By source: DEMO=${dr.demo_count}, NSC=${dr.nsc_count}, SYSTEM=${dr.system_count}`);
      console.log('');
    }

    // 4. Check tariff_keyword_groups for example HS codes
    console.log('🔍 Checking tariff_keyword_groups for HS code examples...');
    try {
      const tariffResult = await db.query(`
        SELECT 
          keyword,
          example_hs_codes,
          COUNT(*) as keyword_count
        FROM tariff_keyword_groups
        WHERE example_hs_codes IS NOT NULL
        GROUP BY keyword, example_hs_codes
        LIMIT 10
      `);
      
      if (tariffResult.rows.length > 0) {
        console.log(`   Found ${tariffResult.rows.length} tariff keywords with example HS codes`);
        console.log('   These are just examples/references, not actual HS codes in hs_codes table');
        let totalExamples = 0;
        tariffResult.rows.forEach(row => {
          const examples = Array.isArray(row.example_hs_codes) 
            ? row.example_hs_codes 
            : (typeof row.example_hs_codes === 'string' ? JSON.parse(row.example_hs_codes) : []);
          totalExamples += examples.length;
        });
        console.log(`   Total example HS codes referenced: ${totalExamples}`);
      } else {
        console.log('   No tariff keywords found with example HS codes');
      }
    } catch (e) {
      console.log('   ⚠️  Could not check tariff_keyword_groups:', e.message);
    }
    console.log('');

    // 5. List all current HS codes
    if (count > 0) {
      console.log('📋 Current HS Codes:');
      console.log('-'.repeat(70));
      const codes = await db.query(`
        SELECT hs_code, description, category, material_group, source, created_at
        FROM hs_codes
        ORDER BY created_at DESC
      `);
      
      codes.rows.forEach((row, idx) => {
        console.log(`${(idx + 1).toString().padStart(3)}. ${row.hs_code.padEnd(10)} | ${row.category.padEnd(10)} | ${row.material_group.padEnd(15)} | ${row.source} | ${row.created_at}`);
      });
      console.log('');
    } else {
      console.log('⚠️  NO HS CODES FOUND IN DATABASE');
      console.log('');
      console.log('Possible causes:');
      console.log('  1. Migration 022 was rolled back (down) and re-run, dropping the table');
      console.log('  2. Data was manually deleted');
      console.log('  3. Database was reset/recreated');
      console.log('  4. Seeding script was never run');
      console.log('');
      console.log('To restore demo data, run:');
      console.log('  node scripts/seedDemoRegulatoryData.js');
      console.log('');
    }

    // 6. Check if there are any foreign key references (duty_rules)
    try {
      const dutyRulesCount = await db.query('SELECT COUNT(*) AS count FROM duty_rules');
      const drCount = parseInt(dutyRulesCount.rows[0]?.count || 0, 10);
      console.log(`🔗 Duty Rules referencing HS codes: ${drCount}`);
      
      if (drCount > 0 && count === 0) {
        console.log('   ⚠️  WARNING: Duty rules exist but no HS codes! This suggests data loss.');
      }
    } catch (e) {
      // Table might not exist
    }

    console.log('');
    console.log('='.repeat(70));
    console.log('✅ Diagnosis complete');
    console.log('='.repeat(70));

  } catch (error) {
    console.error('❌ Error during diagnosis:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

diagnose().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
