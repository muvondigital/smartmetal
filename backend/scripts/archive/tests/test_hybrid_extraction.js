/**
 * Test script for Hybrid Extraction (Option C)
 *
 * This script tests the enhanced RFQ parsing with table merging and hybrid extraction.
 * It simulates a multi-table MTO document like FGLNG.
 */

const { parseRfqWithAzureOpenAI } = require('../src/services/aiParseService');

/**
 * Simulate a multi-table MTO document (like FGLNG)
 * Document Intelligence detected 3 tables that are actually one logical MTO
 */
const mockStructured = {
  text: `FGLNG PROJECT
Material Take-Off (MTO)
Client: FGLNG Consortium
Reference: MTO-2025-001
Date: 2025-01-15

This MTO contains multiple material categories across multiple pages.`,

  tables: [
    // Table 1: FLANGE, SPECTACLE BLIND, SPADE items (1-17)
    {
      rowCount: 18,
      columnCount: 5,
      rows: [
        ['Item', 'Detail', 'Qty', 'Unit', 'Notes'],
        ['1', 'FLANGE WN 2" CL150 A105', '10', 'EA', 'Carbon steel'],
        ['2', 'FLANGE WN 4" CL150 A105', '15', 'EA', 'Carbon steel'],
        ['3', 'FLANGE WN 6" CL150 A105', '8', 'EA', 'Carbon steel'],
        ['4', 'SPECTACLE BLIND 2" CL150 A105', '5', 'EA', 'Carbon steel'],
        ['5', 'SPECTACLE BLIND 4" CL150 A105', '8', 'EA', 'Carbon steel'],
        ['6', 'SPECTACLE BLIND 6" CL150 A105', '4', 'EA', 'Carbon steel'],
        ['7', 'SPADE 2" CL150 A105', '10', 'EA', 'Carbon steel'],
        ['8', 'SPADE 4" CL150 A105', '12', 'EA', 'Carbon steel'],
        ['9', 'SPADE 6" CL150 A105', '6', 'EA', 'Carbon steel'],
        ['10', 'RING SPACER 2" CL150 A105', '10', 'EA', 'Carbon steel'],
        ['11', 'RING SPACER 4" CL150 A105', '12', 'EA', 'Carbon steel'],
        ['12', 'RING SPACER 6" CL150 A105', '6', 'EA', 'Carbon steel'],
        ['13', 'BOLT A193 GR.B7 1/2"x2"', '200', 'EA', 'Studs'],
        ['14', 'BOLT A193 GR.B7 5/8"x2.5"', '300', 'EA', 'Studs'],
        ['15', 'BOLT A193 GR.B7 3/4"x3"', '250', 'EA', 'Studs'],
        ['16', 'GASKET SPIRAL WOUND 2" CL150', '20', 'EA', '304/GRAPHITE'],
        ['17', 'GASKET SPIRAL WOUND 4" CL150', '30', 'EA', '304/GRAPHITE'],
      ]
    },

    // Table 2: Continuation - GASKET, PIPE items (18-30)
    {
      rowCount: 13,
      columnCount: 5,
      rows: [
        ['Item', 'Detail', 'Qty', 'Unit', 'Notes'],
        ['18', 'GASKET SPIRAL WOUND 6" CL150', '16', 'EA', '304/GRAPHITE'],
        ['19', 'PIPE 2" SCH40 SMLS A106 GR.B', '100', 'LENGTH', '6m lengths'],
        ['20', 'PIPE 4" SCH40 SMLS A106 GR.B', '80', 'LENGTH', '6m lengths'],
        ['21', 'PIPE 6" SCH40 SMLS A106 GR.B', '60', 'LENGTH', '6m lengths'],
        ['22', 'PIPE 2" SCH80 SMLS A106 GR.B', '50', 'LENGTH', '6m lengths'],
        ['23', 'PIPE 4" SCH80 SMLS A106 GR.B', '40', 'LENGTH', '6m lengths'],
        ['24', 'PIPE 6" SCH80 SMLS A106 GR.B', '30', 'LENGTH', '6m lengths'],
        ['25', 'PIPE 2" SCH160 SMLS A106 GR.B', '20', 'LENGTH', '6m lengths'],
        ['26', 'PIPE 4" SCH160 SMLS A106 GR.B', '15', 'LENGTH', '6m lengths'],
        ['27', 'PIPE 6" SCH160 SMLS A106 GR.B', '10', 'LENGTH', '6m lengths'],
        ['28', 'WELDOLET 2" X 1" SCH40 A105', '30', 'EA', 'Branch connection'],
        ['29', 'WELDOLET 4" X 2" SCH40 A105', '25', 'EA', 'Branch connection'],
        ['30', 'WELDOLET 6" X 3" SCH40 A105', '20', 'EA', 'Branch connection'],
      ]
    },

    // Table 3: Continuation - ELBOW, TEE, REDUCER items (31-45)
    {
      rowCount: 16,
      columnCount: 5,
      rows: [
        ['Item', 'Detail', 'Qty', 'Unit', 'Notes'],
        ['31', 'ELBOW 90D LR 2" SCH40 SMLS A234 WPB', '50', 'EA', 'Seamless'],
        ['32', 'ELBOW 90D LR 4" SCH40 SMLS A234 WPB', '40', 'EA', 'Seamless'],
        ['33', 'ELBOW 90D LR 6" SCH40 SMLS A234 WPB', '30', 'EA', 'Seamless'],
        ['34', 'ELBOW 45D LR 2" SCH40 SMLS A234 WPB', '20', 'EA', 'Seamless'],
        ['35', 'ELBOW 45D LR 4" SCH40 SMLS A234 WPB', '15', 'EA', 'Seamless'],
        ['36', 'ELBOW 45D LR 6" SCH40 SMLS A234 WPB', '10', 'EA', 'Seamless'],
        ['37', 'TEE EQUAL 2" SCH40 SMLS A234 WPB', '25', 'EA', 'Seamless'],
        ['38', 'TEE EQUAL 4" SCH40 SMLS A234 WPB', '20', 'EA', 'Seamless'],
        ['39', 'TEE EQUAL 6" SCH40 SMLS A234 WPB', '15', 'EA', 'Seamless'],
        ['40', 'TEE REDUCING 4" X 2" SCH40 SMLS A234 WPB', '10', 'EA', 'Seamless'],
        ['41', 'TEE REDUCING 6" X 4" SCH40 SMLS A234 WPB', '8', 'EA', 'Seamless'],
        ['42', 'REDUCER CONC 4" X 2" SCH40 SMLS A234 WPB', '15', 'EA', 'Seamless'],
        ['43', 'REDUCER CONC 6" X 4" SCH40 SMLS A234 WPB', '12', 'EA', 'Seamless'],
        ['44', 'REDUCER ECC 4" X 2" SCH40 SMLS A234 WPB', '10', 'EA', 'Seamless'],
        ['45', 'REDUCER ECC 6" X 4" SCH40 SMLS A234 WPB', '8', 'EA', 'Seamless'],
      ]
    }
  ],
  rawPages: 3
};

async function testHybridExtraction() {
  console.log('='.repeat(80));
  console.log('HYBRID EXTRACTION TEST - Multi-Table MTO Document');
  console.log('='.repeat(80));
  console.log('\n📋 Test Scenario:');
  console.log('   Document Intelligence detected: 3 tables');
  console.log('   Expected items: 45 (items 1-45 across all tables)');
  console.log('   Expected behavior: Merge all 3 tables, extract all 45 rows\n');

  try {
    console.log('🚀 Starting hybrid extraction...\n');

    const result = await parseRfqWithAzureOpenAI(mockStructured);

    console.log('\n' + '='.repeat(80));
    console.log('✅ EXTRACTION RESULTS');
    console.log('='.repeat(80));

    // Metadata
    console.log('\n📄 RFQ Metadata:');
    console.log(`   Client: ${result.rfq_metadata.client_name || 'N/A'}`);
    console.log(`   Reference: ${result.rfq_metadata.rfq_reference || 'N/A'}`);
    console.log(`   Date: ${result.rfq_metadata.rfq_date || 'N/A'}`);

    // Line items
    console.log(`\n📦 Line Items: ${result.line_items.length} items extracted`);

    // Validation
    console.log('\n🔍 Validation:');
    const expectedCount = 45;
    const actualCount = result.line_items.length;

    if (actualCount === expectedCount) {
      console.log(`   ✅ SUCCESS: Extracted ${actualCount}/${expectedCount} items (100%)`);
    } else if (actualCount > expectedCount) {
      console.log(`   ⚠️  WARNING: Extracted ${actualCount} items (expected ${expectedCount})`);
      console.log(`   AI may have hallucinated ${actualCount - expectedCount} extra items`);
    } else {
      console.log(`   ❌ FAILURE: Only extracted ${actualCount}/${expectedCount} items (${((actualCount/expectedCount)*100).toFixed(1)}%)`);
      console.log(`   Missing ${expectedCount - actualCount} items!`);
    }

    // Check line number coverage
    const lineNumbers = result.line_items.map(item => item.line_number).sort((a, b) => a - b);
    const minLine = Math.min(...lineNumbers);
    const maxLine = Math.max(...lineNumbers);

    console.log(`\n📊 Line Number Coverage:`);
    console.log(`   Range: ${minLine} - ${maxLine}`);
    console.log(`   Expected: 1 - 45`);

    // Check for gaps
    const missingNumbers = [];
    for (let i = 1; i <= 45; i++) {
      if (!lineNumbers.includes(i)) {
        missingNumbers.push(i);
      }
    }

    if (missingNumbers.length > 0) {
      console.log(`   ⚠️  Missing line numbers: ${missingNumbers.join(', ')}`);
    } else {
      console.log(`   ✅ No gaps detected`);
    }

    // Sample items
    console.log(`\n📋 Sample Items:`);
    [1, 17, 18, 30, 31, 45].forEach(lineNum => {
      const item = result.line_items.find(i => i.line_number === lineNum);
      if (item) {
        console.log(`   Item ${lineNum}: ${item.description?.substring(0, 50) || 'N/A'}...`);
      } else {
        console.log(`   Item ${lineNum}: ❌ MISSING`);
      }
    });

    // Debug info
    if (result._debug) {
      console.log(`\n🔧 Debug Info:`);
      console.log(`   Model: ${result._debug.model || 'N/A'}`);
      console.log(`   Candidates: ${result._debug.tableAnalysis?.candidatesCount || 'N/A'}`);
      console.log(`   Merged tables: ${result._debug.tableAnalysis?.mergedTablesCount || 'N/A'}`);
      console.log(`   Extracted from tables: ${result._debug.tableAnalysis?.extractedFromTables || 'N/A'}`);
    }

    console.log('\n' + '='.repeat(80));

    // Final verdict
    if (actualCount === expectedCount && missingNumbers.length === 0) {
      console.log('🎉 TEST PASSED: All 45 items extracted successfully!');
    } else {
      console.log('⚠️  TEST INCOMPLETE: Some items missing or extra items present');
    }

    console.log('='.repeat(80) + '\n');

  } catch (error) {
    console.error('\n❌ TEST FAILED with error:');
    console.error(`   ${error.message}`);
    console.error('\nStack trace:');
    console.error(error.stack);
  }
}

// Run the test
testHybridExtraction()
  .then(() => {
    console.log('Test completed.');
    process.exit(0);
  })
  .catch(error => {
    console.error('Test failed with unhandled error:', error);
    process.exit(1);
  });
