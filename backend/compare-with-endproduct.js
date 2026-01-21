/**
 * NSC EndProduct Format Validation with Chunked Extraction
 * Tests if Gemini 2.0 Flash extracts NSC quotations in the correct format
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { parseRFQDocument } = require('./src/services/gcp/documentAiService');

// Color codes
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

/**
 * NSC Quotation expected column structure (from screenshots)
 */
const NSC_EXPECTED_COLUMNS = [
  { field: 'line_number', nscName: 'NO/Part1/2', required: true },
  { field: 'description', nscName: 'DESCRIPTION/ITEM', required: true },
  { field: 'size', nscName: 'SIZE', required: false },
  { field: 'spec', nscName: 'MATERIAL/MATERIAL SPEC', required: false },
  { field: 'quantity', nscName: 'QUANTITY (UNIT)/QTY', required: true },
  { field: 'unit', nscName: 'UNIT', required: true },
  { field: 'size1', nscName: 'OD (MM)', required: false },
  { field: 'size2', nscName: 'TK (MM)', required: false },
  { field: 'notes', nscName: 'OFFER', required: false },
];

/**
 * Validate if extraction matches NSC format
 */
function validateNscFormat(extractedData) {
  const issues = [];
  const warnings = [];

  if (!extractedData.line_items || !Array.isArray(extractedData.line_items)) {
    issues.push('❌ No line_items array found in extraction');
    return { valid: false, issues, warnings, coverage: 0 };
  }

  if (extractedData.line_items.length === 0) {
    issues.push('❌ No items extracted from document');
    return { valid: false, issues, warnings, coverage: 0 };
  }

  // Analyze column coverage
  const sampleItem = extractedData.line_items[0];
  let requiredFieldsFound = 0;
  let optionalFieldsFound = 0;
  let totalRequired = 0;
  let totalOptional = 0;

  for (const col of NSC_EXPECTED_COLUMNS) {
    const hasField = sampleItem[col.field] !== undefined && sampleItem[col.field] !== null && sampleItem[col.field] !== '';

    if (col.required) {
      totalRequired++;
      if (hasField) {
        requiredFieldsFound++;
      } else {
        issues.push(`❌ Required field missing: ${col.nscName} (${col.field})`);
      }
    } else {
      totalOptional++;
      if (hasField) {
        optionalFieldsFound++;
      }
    }
  }

  const requiredCoverage = totalRequired > 0 ? (requiredFieldsFound / totalRequired) * 100 : 0;
  const optionalCoverage = totalOptional > 0 ? (optionalFieldsFound / totalOptional) * 100 : 0;
  const overallCoverage = ((requiredFieldsFound + optionalFieldsFound) / NSC_EXPECTED_COLUMNS.length) * 100;

  return {
    valid: issues.length === 0,
    issues,
    warnings,
    coverage: {
      required: requiredCoverage.toFixed(1),
      optional: optionalCoverage.toFixed(1),
      overall: overallCoverage.toFixed(1)
    },
    itemCount: extractedData.line_items.length,
    sampleItem
  };
}

/**
 * Format item for NSC display
 */
function formatItemForNscDisplay(item) {
  return {
    'NO': item.line_number || 'N/A',
    'ITEM/DESC': (item.description || 'N/A').substring(0, 60),
    'SIZE': item.size || item.size1 || 'N/A',
    'MATERIAL': item.spec || 'N/A',
    'QTY': item.quantity || 'N/A',
    'UNIT': item.unit || 'N/A',
    'OD(MM)': item.size1 || 'N/A',
    'TK(MM)': item.size2 || 'N/A',
  };
}

async function testNscEndProductExtraction() {
  console.log(`${colors.cyan}
╔════════════════════════════════════════════════════════════════╗
║   NSC ENDPRODUCT FORMAT VALIDATION - Chunked Extraction       ║
╚════════════════════════════════════════════════════════════════╝
${colors.reset}\n`);

  const endproductDir = path.join(__dirname, '..', 'test_data', 'EndProduct');

  if (!fs.existsSync(endproductDir)) {
    console.error(`${colors.red}❌ EndProduct directory not found: ${endproductDir}${colors.reset}`);
    return;
  }

  const files = fs.readdirSync(endproductDir)
    .filter(f => f.toLowerCase().endsWith('.pdf'));

  if (files.length === 0) {
    console.error(`${colors.red}❌ No PDF files found in EndProduct directory${colors.reset}`);
    return;
  }

  console.log(`${colors.blue}📁 Found ${files.length} NSC quotation document(s)\n${colors.reset}`);

  // Test each document
  for (let i = 0; i < files.length; i++) {
    const filename = files[i];
    const filepath = path.join(endproductDir, filename);

    console.log(`${colors.magenta}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Test ${i + 1}/${files.length}: ${filename}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${colors.reset}`);

    try {
      const fileBuffer = fs.readFileSync(filepath);
      const fileStats = fs.statSync(filepath);

      console.log(`📄 File size: ${(fileStats.size / 1024).toFixed(2)} KB`);
      console.log(`⏱️  Starting extraction...\n`);

      const startTime = Date.now();
      const result = await parseRFQDocument(fileBuffer, 'pdf');
      const duration = Date.now() - startTime;

      console.log(`\n${colors.green}✅ Extraction completed (${duration}ms)${colors.reset}\n`);

      // Validate against NSC format
      console.log(`${colors.cyan}📋 VALIDATING NSC FORMAT...${colors.reset}\n`);
      const validation = validateNscFormat(result);

      // Display validation results
      console.log(`${colors.cyan}═══════════════════════════════════════════════════════════════${colors.reset}`);
      console.log(`${colors.cyan}VALIDATION RESULTS${colors.reset}`);
      console.log(`${colors.cyan}═══════════════════════════════════════════════════════════════${colors.reset}\n`);

      if (validation.valid) {
        console.log(`${colors.green}✅ FORMAT VALIDATION: PASSED${colors.reset}\n`);
      } else {
        console.log(`${colors.red}❌ FORMAT VALIDATION: FAILED${colors.reset}\n`);
      }

      console.log(`📊 Coverage:`);
      console.log(`   • Required fields: ${validation.coverage.required}% ${validation.coverage.required === '100.0' ? colors.green + '✅ PASS' : colors.red + '❌ FAIL'}${colors.reset}`);
      console.log(`   • Optional fields: ${validation.coverage.optional}%`);
      console.log(`   • Overall coverage: ${validation.coverage.overall}%\n`);

      console.log(`📦 Items extracted: ${validation.itemCount}\n`);

      // Show issues
      if (validation.issues.length > 0) {
        console.log(`${colors.red}ISSUES:${colors.reset}`);
        validation.issues.forEach(issue => console.log(`   ${issue}`));
        console.log('');
      }

      // Show sample items in NSC format
      console.log(`${colors.cyan}SAMPLE ITEMS (NSC Format - First 5):${colors.reset}\n`);
      result.line_items.slice(0, 5).forEach((item, idx) => {
        console.log(`${colors.yellow}Item ${idx + 1}:${colors.reset}`);
        const formatted = formatItemForNscDisplay(item);
        Object.entries(formatted).forEach(([key, value]) => {
          console.log(`   ${key.padEnd(15)}: ${value}`);
        });
        console.log('');
      });

      // Show chunking info if used
      if (result._chunking && result._chunking.enabled) {
        console.log(`${colors.cyan}CHUNKING INFO:${colors.reset}`);
        console.log(`   • Chunks used: ${result._chunking.totalChunks}`);
        console.log(`   • Items per chunk: ${result._chunking.itemsPerChunk.join(', ')}`);
        console.log(`   • Page ranges: ${result._chunking.chunkRanges.join(', ')}`);
        console.log(`   • Deduplicates: ${result._chunking.deduplicatedItems || 0}\n`);
      }

      console.log(`${colors.green}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}\n`);

      // Save extraction result
      const outputPath = path.join(endproductDir, `${filename}.extraction.json`);
      fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
      console.log(`${colors.blue}💾 Extraction saved: ${outputPath}${colors.reset}\n`);

    } catch (error) {
      console.error(`${colors.red}❌ Extraction failed: ${error.message}${colors.reset}`);
      console.error(`${colors.red}   Stack: ${error.stack.substring(0, 500)}...${colors.reset}\n`);
    }
  }

  console.log(`${colors.cyan}
╔════════════════════════════════════════════════════════════════╗
║                  VALIDATION COMPLETE                           ║
╚════════════════════════════════════════════════════════════════╝
${colors.reset}`);
}

testNscEndProductExtraction().catch(error => {
  console.error(`${colors.red}❌ Test failed: ${error.message}${colors.reset}`);
  process.exit(1);
});
