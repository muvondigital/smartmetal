/**
 * Test script for RFQ parsing regression testing
 * 
 * This script tests the generic RFQ/MTO parsing logic on sample documents
 * to ensure all numeric item rows are extracted correctly.
 * 
 * Usage:
 *   node backend/scripts/test_rfq_parsing.js [path-to-structured-json]
 * 
 * Or provide structured data via stdin:
 *   echo '{"structured": {...}}' | node backend/scripts/test_rfq_parsing.js
 */

const fs = require('fs');
const path = require('path');
const { parseRfqWithAzureOpenAI } = require('../src/services/aiParseService');

/**
 * Sample structured OCR data for testing
 */
const SAMPLE_FGLNG_MTO = {
  structured: {
    rawPages: 1,
    text: `
FGLNG-S-60-PIP-MTO-0001
Material Take-Off
Project: FGLNG
Date: 2024-01-15

Item | Description | Qty | Unit | Spec | Notes
-----|------------|-----|------|------|------
1    | ASTM A106 GR.B SCH 40 2" SEAMLESS PIPE | 10 | LENGTH | SCH40 | 
2    | 2" SCH10 SS316L seamless pipe | 5 | LENGTH | SCH10 |
3    | 20" SCH80 API 5L X52 pipe | 100 | LENGTH | SCH80 |
    `,
    tables: [
      {
        rowCount: 7,
        columnCount: 6,
        rows: [
          ['Item', 'Description', 'Qty', 'Unit', 'Spec', 'Notes'],
          ['1', 'ASTM A106 GR.B SCH 40 2" SEAMLESS PIPE', '10', 'LENGTH', 'SCH40', ''],
          ['2', '2" SCH10 SS316L seamless pipe', '5', 'LENGTH', 'SCH10', ''],
          ['3', '20" SCH80 API 5L X52 pipe', '100', 'LENGTH', 'SCH80', ''],
          ['4', '6" SCH40 CS Elbow LR', '25', 'PCS', 'SCH40', ''],
          ['5', '8" Flange 150# RF', '15', 'PCS', '150#', ''],
        ],
      },
    ],
  },
};

const SAMPLE_SIMPLE_RFQ = {
  structured: {
    rawPages: 1,
    text: `
RFQ-2024-001
Client: ABC Energy
Date: 2024-02-01

No. | Material Description | Quantity | Unit
----|---------------------|----------|------
1   | CS Pipe 6" SCH40 ASTM A106 Gr.B | 120 | LENGTH
2   | CS Elbow 6" SCH40 LR ASTM A234 WPB | 80 | PCS
3   | CS Flange 6" 150# RF ASTM A105 | 50 | PCS
    `,
    tables: [
      {
        rowCount: 4,
        columnCount: 4,
        rows: [
          ['No.', 'Material Description', 'Quantity', 'Unit'],
          ['1', 'CS Pipe 6" SCH40 ASTM A106 Gr.B', '120', 'LENGTH'],
          ['2', 'CS Elbow 6" SCH40 LR ASTM A234 WPB', '80', 'PCS'],
          ['3', 'CS Flange 6" 150# RF ASTM A105', '50', 'PCS'],
        ],
      },
    ],
  },
};

/**
 * Test a structured OCR input
 */
async function testParsing(name, structured) {
  console.log('\n' + '='.repeat(80));
  console.log(`Testing: ${name}`);
  console.log('='.repeat(80));

  try {
    // Count expected items from tables
    const tables = structured.tables || [];
    let expectedCount = 0;
    for (const table of tables) {
      if (table.rows && table.rows.length > 1) {
        // Count rows with numeric item numbers (skip header row)
        for (let i = 1; i < table.rows.length; i++) {
          const row = table.rows[i] || [];
          const itemCell = row[0] || '';
          const itemNum = parseInt(itemCell.trim(), 10);
          if (!isNaN(itemNum) && itemNum > 0) {
            expectedCount++;
          }
        }
      }
    }

    console.log(`\nExpected line items (from table analysis): ${expectedCount}`);

    // Parse with AI
    const result = await parseRfqWithAzureOpenAI(structured);

    const actualCount = result.line_items?.length || 0;
    console.log(`\nActual line items returned: ${actualCount}`);

    // Compare
    if (actualCount < expectedCount) {
      console.warn(`\n⚠️  WARNING: Missing ${expectedCount - actualCount} items!`);
    } else if (actualCount === expectedCount) {
      console.log(`\n✅ SUCCESS: All ${expectedCount} items extracted correctly!`);
    } else {
      console.log(`\nℹ️  INFO: More items returned than expected (${actualCount} vs ${expectedCount})`);
    }

    // Show sample entries
    if (result.line_items && result.line_items.length > 0) {
      console.log('\n--- Sample Entries (first 3) ---');
      result.line_items.slice(0, 3).forEach((item, idx) => {
        console.log(`\n${idx + 1}. Line ${item.line_number}:`);
        console.log(`   Description: ${item.description || '(null)'}`);
        console.log(`   Quantity: ${item.quantity || '(null)'} ${item.unit || ''}`);
        console.log(`   Spec: ${item.spec || '(null)'}`);
      });

      if (result.line_items.length > 3) {
        console.log('\n--- Sample Entries (last 3) ---');
        result.line_items.slice(-3).forEach((item, idx) => {
          const actualIdx = result.line_items.length - 3 + idx;
          console.log(`\n${actualIdx + 1}. Line ${item.line_number}:`);
          console.log(`   Description: ${item.description || '(null)'}`);
          console.log(`   Quantity: ${item.quantity || '(null)'} ${item.unit || ''}`);
          console.log(`   Spec: ${item.spec || '(null)'}`);
        });
      }
    }

    // Show metadata
    if (result.rfq_metadata) {
      console.log('\n--- RFQ Metadata ---');
      console.log(`Client: ${result.rfq_metadata.client_name || '(null)'}`);
      console.log(`Reference: ${result.rfq_metadata.rfq_reference || '(null)'}`);
      console.log(`Date: ${result.rfq_metadata.rfq_date || '(null)'}`);
    }

    // Show debug info
    if (result._debug) {
      console.log('\n--- Debug Info ---');
      console.log(`Model: ${result._debug.model || '(null)'}`);
      if (result._debug.tableAnalysis) {
        console.log(`Table candidates: ${result._debug.tableAnalysis.candidatesCount || 0}`);
        console.log(`Extracted from tables: ${result._debug.tableAnalysis.extractedFromTables || 0}`);
      }
    }

    return {
      success: true,
      expectedCount,
      actualCount,
      result,
    };
  } catch (error) {
    console.error(`\n❌ ERROR: ${error.message}`);
    console.error(error.stack);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Main function
 */
async function main() {
  console.log('RFQ Parsing Regression Test');
  console.log('==========================\n');

  // Check if structured data is provided via command line argument
  const args = process.argv.slice(2);
  let customStructured = null;

  if (args.length > 0) {
    const filePath = args[0];
    if (fs.existsSync(filePath)) {
      console.log(`Loading structured data from: ${filePath}`);
      const fileContent = fs.readFileSync(filePath, 'utf8');
      customStructured = JSON.parse(fileContent);
    } else {
      console.error(`File not found: ${filePath}`);
      process.exit(1);
    }
  }

  // Check if data is provided via stdin
  if (!customStructured && !process.stdin.isTTY) {
    let stdinData = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      stdinData += chunk;
    });
    process.stdin.on('end', async () => {
      try {
        customStructured = JSON.parse(stdinData);
        await testParsing('Custom Input (stdin)', customStructured.structured || customStructured);
      } catch (error) {
        console.error('Failed to parse stdin:', error.message);
        process.exit(1);
      }
    });
    return; // Wait for stdin
  }

  // Run tests
  const results = [];

  if (customStructured) {
    const result = await testParsing('Custom Input', customStructured.structured || customStructured);
    results.push(result);
  } else {
    // Run sample tests
    console.log('Running sample tests...\n');
    console.log('Note: These tests require Azure OpenAI to be configured.');
    console.log('Set AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_KEY, and AZURE_OPENAI_DEPLOYMENT_NAME\n');

    const result1 = await testParsing('Sample FGLNG MTO', SAMPLE_FGLNG_MTO.structured);
    results.push(result1);

    const result2 = await testParsing('Sample Simple RFQ', SAMPLE_SIMPLE_RFQ.structured);
    results.push(result2);
  }

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('Test Summary');
  console.log('='.repeat(80));

  let allPassed = true;
  for (const result of results) {
    if (result.success) {
      if (result.actualCount >= result.expectedCount) {
        console.log(`✅ PASS: Expected ${result.expectedCount}, got ${result.actualCount}`);
      } else {
        console.log(`⚠️  PARTIAL: Expected ${result.expectedCount}, got ${result.actualCount} (missing ${result.expectedCount - result.actualCount})`);
        allPassed = false;
      }
    } else {
      console.log(`❌ FAIL: ${result.error}`);
      allPassed = false;
    }
  }

  console.log('\n' + '='.repeat(80));
  if (allPassed) {
    console.log('✅ All tests passed!');
    process.exit(0);
  } else {
    console.log('❌ Some tests failed or had warnings.');
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { testParsing };

