/**
 * Unit test for table merging and extraction logic
 *
 * This tests the core table detection, grouping, merging, and extraction
 * without requiring Azure OpenAI API calls.
 */

// Mock the Azure client to avoid API calls
const mockAzureClient = {
  initializeClient: () => {
    throw new Error('Azure client should not be called in this test');
  }
};

// Load the service but intercept the Azure client
const Module = require('module');
const originalRequire = Module.prototype.require;

Module.prototype.require = function(id) {
  if (id === './ai/azureClient') {
    return mockAzureClient;
  }
  return originalRequire.apply(this, arguments);
};

const aiParseService = require('../src/services/aiParseService');

// Restore original require
Module.prototype.require = originalRequire;

/**
 * Import the internal functions we need to test
 * Since they're not exported, we'll need to access them via the module internals
 */
const fs = require('fs');
const path = require('path');
const serviceCode = fs.readFileSync(
  path.join(__dirname, '../src/services/aiParseService.js'),
  'utf-8'
);

// Extract and evaluate the helper functions
const vm = require('vm');
const sandbox = {
  console,
  module: { exports: {} },
  require: originalRequire.bind(this),
  __dirname: path.join(__dirname, '../src/services'),
  __filename: path.join(__dirname, '../src/services/aiParseService.js'),
};

vm.createContext(sandbox);
vm.runInContext(serviceCode, sandbox);

const detectLineItemTables = sandbox.module.exports.detectLineItemTables || eval(`(${serviceCode.match(/function detectLineItemTables\([^)]*\)\s*{[\s\S]*?^}/m)?.[0] || ''})`);
const groupRelatedLineItemTables = eval(`(${serviceCode.match(/function groupRelatedLineItemTables\([^)]*\)\s*{[\s\S]*?^}/m)?.[0] || ''})`);
const mergeLineItemTables = eval(`(${serviceCode.match(/function mergeLineItemTables\([^)]*\)\s*{[\s\S]*?^}/m)?.[0] || ''})`);
const extractLineItemsFromTable = eval(`(${serviceCode.match(/function extractLineItemsFromTable\([^)]*\)\s*{[\s\S]*?^}/m)?.[0] || ''})`);
const computeTableSignature = eval(`(${serviceCode.match(/function computeTableSignature\([^)]*\)\s*{[\s\S]*?^}/m)?.[0] || ''})`);
const areTablesRelated = eval(`(${serviceCode.match(/function areTablesRelated\([^)]*\)\s*{[\s\S]*?^}/m)?.[0] || ''})`);

// Helper functions for column detection
const isItemNumberColumn = eval(`(${serviceCode.match(/function isItemNumberColumn\([^)]*\)\s*{[\s\S]*?^}/m)?.[0] || ''})`);
const isDescriptionColumn = eval(`(${serviceCode.match(/function isDescriptionColumn\([^)]*\)\s*{[\s\S]*?^}/m)?.[0] || ''})`);
const isQuantityColumn = eval(`(${serviceCode.match(/function isQuantityColumn\([^)]*\)\s*{[\s\S]*?^}/m)?.[0] || ''})`);
const isUnitColumn = eval(`(${serviceCode.match(/function isUnitColumn\([^)]*\)\s*{[\s\S]*?^}/m)?.[0] || ''})`);
const isSpecColumn = eval(`(${serviceCode.match(/function isSpecColumn\([^)]*\)\s*{[\s\S]*?^}/m)?.[0] || ''})`);
const isNotesColumn = eval(`(${serviceCode.match(/function isNotesColumn\([^)]*\)\s*{[\s\S]*?^}/m)?.[0] || ''})`);
const isRevisionColumn = eval(`(${serviceCode.match(/function isRevisionColumn\([^)]*\)\s*{[\s\S]*?^}/m)?.[0] || ''})`);

/**
 * Simulate a multi-table MTO document (like FGLNG)
 */
const mockTables = [
  // Table 1: Items 1-17
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

  // Table 2: Items 18-30
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

  // Table 3: Items 31-45
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
];

function runTests() {
  console.log('='.repeat(80));
  console.log('TABLE MERGING UNIT TESTS');
  console.log('='.repeat(80));

  let testsRun = 0;
  let testsPassed = 0;

  function assert(condition, message) {
    testsRun++;
    if (condition) {
      console.log(`  ✅ ${message}`);
      testsPassed++;
    } else {
      console.log(`  ❌ ${message}`);
    }
  }

  // Test 1: Detect candidates
  console.log('\n📋 Test 1: Detect Line Item Tables');
  console.log('   Input: 3 tables with items 1-17, 18-30, 31-45');

  try {
    const candidates = detectLineItemTables(mockTables);

    assert(candidates.length === 3, `Detected 3 candidates (got ${candidates.length})`);
    assert(candidates[0].numericItemRowCount === 17, `Table 1 has 17 numeric rows (got ${candidates[0].numericItemRowCount})`);
    assert(candidates[1].numericItemRowCount === 12, `Table 2 has 12 numeric rows (got ${candidates[1].numericItemRowCount})`);
    assert(candidates[2].numericItemRowCount === 15, `Table 3 has 15 numeric rows (got ${candidates[2].numericItemRowCount})`);

    console.log('\n   Candidates detected:');
    candidates.forEach((c, i) => {
      console.log(`     Table ${i + 1}: ${c.numericItemRowCount} numeric rows, score ${c.score}`);
    });

    // Test 2: Group related tables
    console.log('\n📋 Test 2: Group Related Tables');
    const groups = groupRelatedLineItemTables(candidates, mockTables);

    assert(groups.length === 1, `All tables grouped into 1 group (got ${groups.length})`);
    assert(groups[0].length === 3, `Group contains all 3 tables (got ${groups[0].length})`);

    console.log(`   Groups: ${groups.length}`);
    groups.forEach((g, i) => {
      console.log(`     Group ${i + 1}: ${g.length} tables`);
    });

    // Test 3: Merge tables
    console.log('\n📋 Test 3: Merge Tables');
    const mergedTable = mergeLineItemTables(groups[0], candidates, mockTables);

    assert(mergedTable !== null, 'Merged table created successfully');
    assert(mergedTable.numericItemRowCount === 44, `Merged table has 44 items (got ${mergedTable.numericItemRowCount})`);
    assert(mergedTable.sourceTableIndices.length === 3, `Merged from 3 source tables (got ${mergedTable.sourceTableIndices.length})`);

    console.log(`   Merged table:${mergedTable.numericItemRowCount} numeric item rows`);
    console.log(`     Source tables: ${mergedTable.sourceTableIndices.map(t => t + 1).join(', ')}`);

    // Test 4: Extract line items
    console.log('\n📋 Test 4: Extract Line Items');
    const mergedCandidate = {
      headerRowIndex: mergedTable.headerRowIndex,
      dataStartRowIndex: mergedTable.dataStartRowIndex,
      columnMap: mergedTable.columnMap,
    };
    const extractedItems = extractLineItemsFromTable(mergedTable, mergedCandidate);

    assert(extractedItems.length === 44, `Extracted 44 items (got ${extractedItems.length})`);

    const lineNumbers = extractedItems.map(item => item.line_number).sort((a, b) => a - b);
    const minLine = Math.min(...lineNumbers);
    const maxLine = Math.max(...lineNumbers);

    assert(minLine === 1, `First item is line 1 (got ${minLine})`);
    assert(maxLine === 45, `Last item is line 45 (got ${maxLine})`);

    console.log(`   Extracted items: ${extractedItems.length}`);
    console.log(`     Line number range: ${minLine} - ${maxLine}`);

    // Check for gaps
    const missingNumbers = [];
    for (let i = 1; i <= 45; i++) {
      if (!lineNumbers.includes(i)) {
        missingNumbers.push(i);
      }
    }

    assert(missingNumbers.length === 0, `No missing line numbers (missing: ${missingNumbers.join(', ') || 'none'})`);

    // Test 5: Verify item details
    console.log('\n📋 Test 5: Verify Item Details');

    const item1 = extractedItems.find(item => item.line_number === 1);
    const item18 = extractedItems.find(item => item.line_number === 18);
    const item31 = extractedItems.find(item => item.line_number === 31);
    const item45 = extractedItems.find(item => item.line_number === 45);

    assert(item1 !== undefined, 'Item 1 exists (from Table 1)');
    assert(item18 !== undefined, 'Item 18 exists (from Table 2)');
    assert(item31 !== undefined, 'Item 31 exists (from Table 3)');
    assert(item45 !== undefined, 'Item 45 exists (from Table 3)');

    if (item1) {
      assert(item1.description.includes('FLANGE'), `Item 1 is a FLANGE (got: ${item1.description?.substring(0, 30)}...)`);
      assert(item1.quantity === 10, `Item 1 qty is 10 (got ${item1.quantity})`);
    }

    if (item18) {
      assert(item18.description.includes('GASKET'), `Item 18 is a GASKET (got: ${item18.description?.substring(0, 30)}...)`);
      assert(item18.quantity === 16, `Item 18 qty is 16 (got ${item18.quantity})`);
    }

    if (item31) {
      assert(item31.description.includes('ELBOW'), `Item 31 is an ELBOW (got: ${item31.description?.substring(0, 30)}...)`);
      assert(item31.quantity === 50, `Item 31 qty is 50 (got ${item31.quantity})`);
    }

    if (item45) {
      assert(item45.description.includes('REDUCER'), `Item 45 is a REDUCER (got: ${item45.description?.substring(0, 30)}...)`);
      assert(item45.quantity === 8, `Item 45 qty is 8 (got ${item45.quantity})`);
    }

    console.log('   Sample items verified:');
    console.log(`     Item 1:  ${item1?.description?.substring(0, 50)}`);
    console.log(`     Item 18: ${item18?.description?.substring(0, 50)}`);
    console.log(`     Item 31: ${item31?.description?.substring(0, 50)}`);
    console.log(`     Item 45: ${item45?.description?.substring(0, 50)}`);

  } catch (error) {
    console.error('\n❌ Test execution failed:', error.message);
    console.error(error.stack);
  }

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log(`TEST SUMMARY: ${testsPassed}/${testsRun} tests passed`);

  if (testsPassed === testsRun) {
    console.log('🎉 ALL TESTS PASSED!');
  } else {
    console.log(`⚠️  ${testsRun - testsPassed} test(s) failed`);
  }
  console.log('='.repeat(80));

  return testsPassed === testsRun;
}

// Run tests
const success = runTests();
process.exit(success ? 0 : 1);
