/**
 * Test script for chunked document extraction with Gemini 2.0 Flash
 *
 * Tests the new chunking functionality on sample documents
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { parseRFQDocument } = require('./src/services/gcp/documentAiService');

// Color codes for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

async function testChunkedExtraction() {
  console.log(`${colors.cyan}
╔════════════════════════════════════════════════════════════════╗
║     CHUNKED EXTRACTION TEST - Gemini 2.0 Flash                ║
╚════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  // Find test documents
  const testDataDir = path.join(__dirname, '..', 'test_data');

  if (!fs.existsSync(testDataDir)) {
    console.log(`${colors.yellow}⚠️  Test data directory not found: ${testDataDir}${colors.reset}`);
    console.log(`${colors.yellow}   Creating test with synthetic document...${colors.reset}\n`);
    await testSyntheticDocument();
    return;
  }

  // Look for PDF files in test_data directory
  const files = fs.readdirSync(testDataDir)
    .filter(f => f.toLowerCase().endsWith('.pdf'))
    .slice(0, 3); // Test first 3 PDFs

  if (files.length === 0) {
    console.log(`${colors.yellow}⚠️  No PDF files found in ${testDataDir}${colors.reset}`);
    console.log(`${colors.yellow}   Creating test with synthetic document...${colors.reset}\n`);
    await testSyntheticDocument();
    return;
  }

  console.log(`${colors.blue}📁 Found ${files.length} test document(s)${colors.reset}\n`);

  // Test each document
  for (let i = 0; i < files.length; i++) {
    const filename = files[i];
    const filepath = path.join(testDataDir, filename);

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

      console.log(`\n${colors.green}✅ Extraction successful (${duration}ms)${colors.reset}`);
      console.log(`
📊 EXTRACTION RESULTS:
   • Items extracted: ${result.items?.length || 0}
   • Confidence: ${result.confidence || 0}
   • Document type: ${result.document_type || 'RFQ'}
   ${result._chunking ? `• Chunking: ${colors.cyan}ENABLED${colors.reset} (${result._chunking.totalChunks} chunks)` : `• Chunking: ${colors.yellow}DISABLED${colors.reset}`}
   ${result._chunking ? `• Items per chunk: ${result._chunking.itemsPerChunk.join(', ')}` : ''}
   ${result._chunking ? `• Chunk ranges: ${result._chunking.chunkRanges.join(', ')}` : ''}
`);

      // Show sample items
      if (result.items && result.items.length > 0) {
        console.log(`📋 Sample items (first 3):`);
        result.items.slice(0, 3).forEach((item, idx) => {
          console.log(`   ${idx + 1}. Line ${item.line_number || 'N/A'}: ${item.description || 'N/A'}`);
          console.log(`      Qty: ${item.quantity || 'N/A'} ${item.unit || ''} | Spec: ${item.spec || 'N/A'}`);
        });
      }

      console.log(`\n${colors.green}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}\n`);

    } catch (error) {
      console.error(`${colors.red}❌ Extraction failed: ${error.message}${colors.reset}`);
      console.error(`${colors.red}   Stack: ${error.stack}${colors.reset}\n`);
    }
  }

  console.log(`${colors.cyan}
╔════════════════════════════════════════════════════════════════╗
║                    TEST COMPLETE                               ║
╚════════════════════════════════════════════════════════════════╝
${colors.reset}`);
}

/**
 * Test with a synthetic multi-page document
 */
async function testSyntheticDocument() {
  console.log(`${colors.blue}🧪 Testing with synthetic document (simulated 15 pages)...${colors.reset}\n`);

  // Create synthetic extracted data with long text (simulates large document)
  const syntheticText = generateSyntheticRFQText(15); // 15 pages

  const extractedData = {
    text: syntheticText,
    tables: [],
    pageCount: 15
  };

  console.log(`📄 Synthetic document: ${extractedData.pageCount} pages, ${syntheticText.length} characters`);
  console.log(`⏱️  Starting extraction...\n`);

  try {
    const { structureRFQWithGPT } = require('./src/services/gcp/documentAiService');

    const startTime = Date.now();
    const result = await structureRFQWithGPT(extractedData, extractedData.pageCount);
    const duration = Date.now() - startTime;

    console.log(`\n${colors.green}✅ Extraction successful (${duration}ms)${colors.reset}`);
    console.log(`
📊 EXTRACTION RESULTS:
   • Items extracted: ${result.items?.length || 0}
   • Confidence: ${result.confidence || 0}
   ${result._chunking ? `• Chunking: ${colors.cyan}ENABLED${colors.reset} (${result._chunking.totalChunks} chunks)` : `• Chunking: ${colors.yellow}DISABLED${colors.reset}`}
   ${result._chunking ? `• Items per chunk: ${result._chunking.itemsPerChunk.join(', ')}` : ''}
   ${result._chunking ? `• Chunk ranges: ${result._chunking.chunkRanges.join(', ')}` : ''}
`);

  } catch (error) {
    console.error(`${colors.red}❌ Extraction failed: ${error.message}${colors.reset}`);
    console.error(`${colors.red}   Stack: ${error.stack}${colors.reset}\n`);
  }
}

/**
 * Generate synthetic RFQ text for testing
 */
function generateSyntheticRFQText(pages) {
  let text = `
RFQ Number: TEST-2025-001
Customer: Test Corporation
Date: 2025-01-15
Project: Synthetic Test Project

ITEM LIST:
`;

  const itemsPerPage = 10;
  const totalItems = pages * itemsPerPage;

  for (let i = 1; i <= totalItems; i++) {
    text += `
${i}. Pipe ${i}" Schedule 40 ASTM A106 Grade B
   Quantity: ${Math.floor(Math.random() * 100) + 1} M
   Description: Carbon Steel Seamless Pipe
`;

    // Add page markers
    if (i % itemsPerPage === 0 && i < totalItems) {
      text += `\n--- PAGE ${Math.floor(i / itemsPerPage) + 1} ---\n\n`;
    }
  }

  return text;
}

// Run the test
testChunkedExtraction().catch(error => {
  console.error(`${colors.red}❌ Test failed: ${error.message}${colors.reset}`);
  process.exit(1);
});
