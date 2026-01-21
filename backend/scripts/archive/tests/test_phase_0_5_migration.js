/**
 * Test script to verify Phase 0.5 migration
 * Verifies that mto_extractions table was created correctly
 * Run with: node scripts/test_phase_0_5_migration.js
 */

require('dotenv').config();
const { connectDb } = require('../src/db/supabaseClient');

async function testPhase05Migration() {
  console.log('');
  console.log('='.repeat(70));
  console.log('PHASE 0.5 MIGRATION VERIFICATION');
  console.log('Enhanced MTO Extraction - Database Setup Test');
  console.log('='.repeat(70));
  console.log('');

  const db = await connectDb();

  const tests = [
    {
      name: 'mto_extractions table exists',
      query: `SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'mto_extractions'`,
      expectedCount: 1
    },
    {
      name: 'mto_extractions has required columns',
      query: `
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'mto_extractions'
          AND column_name IN ('id', 'document_extraction_id', 'rfq_id', 'mto_structure', 'weight_verification', 'pricing_readiness', 'confidence_score', 'created_at')
        ORDER BY column_name
      `,
      minColumns: 8
    },
    {
      name: 'mto_extractions has id column as UUID',
      query: `SELECT data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'mto_extractions' AND column_name = 'id'`,
      expectedType: 'uuid'
    },
    {
      name: 'mto_extractions has mto_structure as JSONB',
      query: `SELECT data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'mto_extractions' AND column_name = 'mto_structure'`,
      expectedType: 'jsonb'
    },
    {
      name: 'idx_mto_extractions_document index exists',
      query: `SELECT COUNT(*) as count FROM pg_indexes WHERE tablename = 'mto_extractions' AND indexname = 'idx_mto_extractions_document'`,
      expectedCount: 1
    },
    {
      name: 'idx_mto_extractions_rfq index exists',
      query: `SELECT COUNT(*) as count FROM pg_indexes WHERE tablename = 'mto_extractions' AND indexname = 'idx_mto_extractions_rfq'`,
      expectedCount: 1
    },
    {
      name: 'idx_mto_extractions_confidence index exists',
      query: `SELECT COUNT(*) as count FROM pg_indexes WHERE tablename = 'mto_extractions' AND indexname = 'idx_mto_extractions_confidence'`,
      expectedCount: 1
    },
    {
      name: 'idx_mto_extractions_structure GIN index exists',
      query: `SELECT COUNT(*) as count FROM pg_indexes WHERE tablename = 'mto_extractions' AND indexname = 'idx_mto_extractions_structure'`,
      expectedCount: 1
    },
    {
      name: 'updated_at trigger exists',
      query: `SELECT COUNT(*) as count FROM pg_trigger WHERE tgname = 'trigger_update_mto_extractions_updated_at'`,
      expectedCount: 1
    }
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      const result = await db.query(test.query);
      
      let testPassed = false;
      
      if (test.expectedCount !== undefined) {
        testPassed = parseInt(result.rows[0].count) === test.expectedCount;
      } else if (test.expectedType !== undefined) {
        testPassed = result.rows[0]?.data_type === test.expectedType;
      } else if (test.minColumns !== undefined) {
        testPassed = result.rows.length >= test.minColumns;
      } else {
        testPassed = result.rows.length > 0;
      }

      if (testPassed) {
        console.log(`✅ ${test.name}`);
        passed++;
      } else {
        console.log(`❌ ${test.name}`);
        if (test.expectedCount !== undefined) {
          console.log(`   Expected count: ${test.expectedCount}, Got: ${result.rows[0].count}`);
        } else if (test.expectedType !== undefined) {
          console.log(`   Expected type: ${test.expectedType}, Got: ${result.rows[0]?.data_type}`);
        } else if (test.minColumns !== undefined) {
          console.log(`   Expected at least ${test.minColumns} columns, Got: ${result.rows.length}`);
        }
        failed++;
      }
    } catch (error) {
      console.log(`❌ ${test.name}`);
      console.log(`   Error: ${error.message}`);
      failed++;
    }
  }

  console.log('');
  console.log('-'.repeat(70));
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('-'.repeat(70));

  // Show table structure summary
  console.log('');
  console.log('Table Structure Summary:');
  console.log('-'.repeat(70));
  
  try {
    const columns = await db.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' 
        AND table_name = 'mto_extractions'
      ORDER BY ordinal_position
    `);
    
    columns.rows.forEach(col => {
      console.log(`  ${col.column_name.padEnd(30)} ${col.data_type.padEnd(20)} ${col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'}`);
    });
  } catch (error) {
    console.log(`  Error retrieving column info: ${error.message}`);
  }

  // Show indexes summary
  console.log('');
  console.log('Indexes Summary:');
  console.log('-'.repeat(70));
  
  try {
    const indexes = await db.query(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'mto_extractions'
      ORDER BY indexname
    `);
    
    indexes.rows.forEach(idx => {
      const shortDef = idx.indexdef.length > 60 ? idx.indexdef.substring(0, 60) + '...' : idx.indexdef;
      console.log(`  ${idx.indexname.padEnd(40)} ${shortDef}`);
    });
  } catch (error) {
    console.log(`  Error retrieving index info: ${error.message}`);
  }

  console.log('');
  console.log('='.repeat(70));
  if (failed === 0) {
    console.log('✅ PHASE 0.5 MIGRATION VERIFICATION PASSED');
    console.log('The mto_extractions table is ready for use!');
  } else {
    console.log('❌ PHASE 0.5 MIGRATION VERIFICATION FAILED');
    console.log('Please review the errors above and ensure migration completed successfully.');
  }
  console.log('='.repeat(70));
  console.log('');

  process.exit(failed === 0 ? 0 : 1);
}

testPhase05Migration().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

