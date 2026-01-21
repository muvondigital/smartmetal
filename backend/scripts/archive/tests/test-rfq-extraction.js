#!/usr/bin/env node

/**
 * Test RFQ extraction with sample data matching the uploaded document
 */

require('dotenv').config();
const { parseRfqWithAzureOpenAI } = require('../src/services/aiParseService');

// Sample data matching the document shown in the screenshots
const testData = {
  rawPages: 2,
  text: `MMHE
MALAYSIA MARINE AND HEAVY ENGINEERING SDN BHD PURCHASE REQUISITION (PR)
FORM NO: P6-01-P02 REV.1
REF:
PR NO:
CREATED:
11/08/2025
SUBMITTED: 11/08/2025
CHARGING TO: [H3.23M539F]-COST PLUS OF PIL OSS IJV ALPHA
REQUESTOR:
[276256]-Haydee De Ocampo De Leon
TITLE:
PR for PIL OSS IJV ALPHA - Tubular & Beam for Jacket & Piles Lower Grillage
Specification: PHE-EE-2GW_000000022_02_Structural Material Specifications
CS-0133567 (0) ~Submitted~`,
  tables: [
    {
      rowCount: 4,
      columnCount: 6,
      rows: [
        ['PR Line', 'Specification of Goods', 'Delivery Date', 'Tag No', 'Part No', 'Quantity', 'UOM'],
        [
          '00001',
          'PIPE, SEAMLESS, TYPE I PIPE, SEAMLESS, TYPE I PIPE,SEAMLESS,TYPE I,457 x 39.61 x 11800,EN10210 S355 K2H Remarks: For Jacket Roll & Pitch Braces',
          '01/11/2025',
          '',
          '10150-001001-00270',
          '5.0000',
          'PC'
        ],
        ['Mat Grp:', '[M10121000]~Pipe - Seamless', '', '', '', '', ''],
        ['GL Acct:', '[5070100200]~COS-MMHE Heavy Engineering Construc', '', '', '', '', ''],
        ['WBS:', '[H3.23M539F-3-01-03-11-06]~SEA-FASTENING & GRILLAGE', '', '', '', '', ''],
        [
          '00002',
          'PIPE, SEAMLESS, TYPE I PIPE, SEAMLESS, TYPE I PIPE,SEAMLESS,TYPE I,457 x 39.61 x 6000,EN10210 S355 K2H Remarks: For Jacket Roll & Pitch Braces',
          '01/11/2025',
          '',
          '10150-001001-00271',
          '1.0000',
          'PC'
        ]
      ]
    }
  ]
};

console.log('='.repeat(70));
console.log('RFQ Extraction Test');
console.log('='.repeat(70));
console.log('');
console.log('Test Data:');
console.log(`  Pages: ${testData.rawPages}`);
console.log(`  Text length: ${testData.text.length} chars`);
console.log(`  Tables: ${testData.tables.length}`);
console.log(`  Table 1: ${testData.tables[0].rowCount} rows x ${testData.tables[0].columnCount} cols`);
console.log('');
console.log('Sample table rows:');
testData.tables[0].rows.slice(0, 3).forEach((row, idx) => {
  console.log(`  Row ${idx}: ${JSON.stringify(row)}`);
});
console.log('');
console.log('-'.repeat(70));
console.log('Calling AI Parser...');
console.log('-'.repeat(70));
console.log('');

parseRfqWithAzureOpenAI(testData)
  .then((result) => {
    console.log('');
    console.log('='.repeat(70));
    console.log('AI Parsing Result');
    console.log('='.repeat(70));
    console.log('');
    console.log('RFQ Metadata:');
    console.log(JSON.stringify(result.rfq_metadata, null, 2));
    console.log('');
    console.log(`Line Items Extracted: ${result.line_items?.length || 0}`);
    console.log('');

    if (result.line_items && result.line_items.length > 0) {
      result.line_items.forEach((item, idx) => {
        console.log(`Item ${idx + 1}:`);
        console.log(`  Line: ${item.line_number}`);
        console.log(`  Description: ${item.item_description}`);
        console.log(`  Spec: ${item.specification || 'N/A'}`);
        console.log(`  Quantity: ${item.quantity} ${item.unit}`);
        console.log(`  Part No: ${item.part_number || 'N/A'}`);
        console.log(`  Material Grade: ${item.material_grade || 'N/A'}`);
        console.log('');
      });
    } else {
      console.log('⚠️  WARNING: No line items extracted!');
      console.log('');
      if (result.debug) {
        console.log('Debug Info:');
        console.log(JSON.stringify(result.debug, null, 2));
      }
    }

    console.log('='.repeat(70));
    process.exit(0);
  })
  .catch((error) => {
    console.error('');
    console.error('='.repeat(70));
    console.error('AI Parsing Failed');
    console.error('='.repeat(70));
    console.error('');
    console.error('Error:', error.message);
    console.error('');
    if (error.stack) {
      console.error('Stack trace:');
      console.error(error.stack);
    }
    console.error('');
    console.error('='.repeat(70));
    process.exit(1);
  });
