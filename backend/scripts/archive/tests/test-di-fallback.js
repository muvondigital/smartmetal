/**
 * Test Azure Document Intelligence Fallback Strategy
 * Tests the chunked DI processing for large PDFs
 *
 * Usage:
 *   node scripts/test-di-fallback.js <path-to-pdf>
 *
 * Example:
 *   node scripts/test-di-fallback.js ./data/petrovietnam-32pages.pdf
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { analyzeWithAzureLayout } = require('../src/services/visionService');

async function testDiFallback() {
  const pdfPath = process.argv[2];

  if (!pdfPath) {
    console.error('Usage: node scripts/test-di-fallback.js <path-to-pdf>');
    process.exit(1);
  }

  const resolvedPath = path.resolve(pdfPath);

  if (!fs.existsSync(resolvedPath)) {
    console.error(`File not found: ${resolvedPath}`);
    process.exit(1);
  }

  console.log('='.repeat(80));
  console.log('AZURE DOCUMENT INTELLIGENCE FALLBACK TEST');
  console.log('='.repeat(80));
  console.log(`PDF Path: ${resolvedPath}`);
  console.log(`File Size: ${fs.statSync(resolvedPath).size} bytes`);
  console.log('');

  try {
    const fileBuffer = fs.readFileSync(resolvedPath);
    const fileName = path.basename(resolvedPath);

    console.log('Starting DI analysis...\n');
    const startTime = Date.now();

    const result = await analyzeWithAzureLayout(
      fileBuffer,
      'application/pdf',
      fileName,
      {} // No page restrictions - process full document
    );

    const duration = Date.now() - startTime;

    console.log('\n' + '='.repeat(80));
    console.log('TEST RESULTS SUMMARY');
    console.log('='.repeat(80));
    console.log(`Duration: ${duration}ms (${(duration / 1000).toFixed(2)}s)`);
    console.log(`Pages Returned: ${result.structured.rawPages}`);
    console.log(`Tables Found: ${result.structured.tables.length}`);
    console.log(`Text Length: ${result.structured.text.length} characters`);
    console.log(`Chunked Processing: ${result.chunked ? 'YES' : 'NO'}`);

    if (result.chunked) {
      console.log(`Chunk Count: ${result.chunkCount}`);
      console.log('\nChunk Details:');
      result.chunkDetails.forEach((chunk, idx) => {
        console.log(`  Chunk ${idx + 1}: pages ${chunk.range}, returned ${chunk.pagesReturned} pages, ${chunk.tablesReturned} tables, success: ${chunk.success}`);
      });
    }

    // Analyze table distribution across pages
    if (result.structured.tables.length > 0) {
      console.log('\nTable Distribution:');
      const tablePagesSet = new Set();
      result.structured.tables.forEach((table, idx) => {
        const pages = table.pageNumbers.join(', ');
        console.log(`  Table ${idx + 1}: pages [${pages}], ${table.rowCount}x${table.columnCount}`);
        table.pageNumbers.forEach(p => tablePagesSet.add(p));
      });
      const uniqueTablePages = Array.from(tablePagesSet).sort((a, b) => a - b);
      console.log(`  Tables found on pages: [${uniqueTablePages.join(', ')}]`);
    }

    // Check for appendix content
    const textLower = result.structured.text.toLowerCase();
    const hasAppendix = textLower.includes('appendix') || textLower.includes('attachment');
    const hasMto = textLower.includes('mto') || textLower.includes('material take');
    const hasShipment = textLower.includes('shipment') || textLower.includes('shipping');

    console.log('\nContent Analysis:');
    console.log(`  Contains "Appendix": ${hasAppendix ? 'YES' : 'NO'}`);
    console.log(`  Contains "MTO": ${hasMto ? 'YES' : 'NO'}`);
    console.log(`  Contains "Shipment": ${hasShipment ? 'YES' : 'NO'}`);

    // Text preview from different sections
    const textLen = result.structured.text.length;
    console.log('\nText Previews:');
    console.log('  First 200 chars:');
    console.log('    ' + result.structured.text.substring(0, 200).replace(/\n/g, '\n    '));

    if (textLen > 5000) {
      console.log('\n  Middle section (around 50%):');
      const midStart = Math.floor(textLen / 2);
      console.log('    ' + result.structured.text.substring(midStart, midStart + 200).replace(/\n/g, '\n    '));
    }

    if (textLen > 1000) {
      console.log('\n  Last 200 chars:');
      const lastStart = Math.max(0, textLen - 200);
      console.log('    ' + result.structured.text.substring(lastStart).replace(/\n/g, '\n    '));
    }

    console.log('\n' + '='.repeat(80));
    console.log('TEST COMPLETE');
    console.log('='.repeat(80));

    // Success criteria
    const success = result.structured.rawPages > 2;
    if (success) {
      console.log('✅ SUCCESS: DI returned more than 2 pages');
      process.exit(0);
    } else {
      console.log('❌ PARTIAL RESULT: DI only returned 2 pages or less');
      console.log('Check DI diagnostics above for warnings/errors');
      process.exit(1);
    }

  } catch (error) {
    console.error('\n' + '='.repeat(80));
    console.error('TEST FAILED');
    console.error('='.repeat(80));
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

testDiFallback();
