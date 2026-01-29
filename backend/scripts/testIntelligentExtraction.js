/**
 * Test Intelligent Extraction Service
 *
 * Usage:
 *   node scripts/testIntelligentExtraction.js [path/to/pdf]
 *
 * Environment:
 *   INTELLIGENT_EXTRACTION=true  (required)
 *   GEMINI_API_KEY=xxx           (or GOOGLE_APPLICATION_CREDENTIALS)
 */

require('dotenv').config();

// Enable intelligent extraction for this test
process.env.INTELLIGENT_EXTRACTION = 'true';
process.env.INTELLIGENT_EXTRACTION_MULTIMODAL = 'false'; // Start without multimodal
process.env.INTELLIGENT_EXTRACTION_TWO_PHASE = 'true';
process.env.INTELLIGENT_EXTRACTION_VALIDATION = 'true';

const fs = require('fs');
const path = require('path');

async function testIntelligentExtraction(pdfPath) {
  console.log(`
================================================================================
🧠 INTELLIGENT EXTRACTION TEST
================================================================================
`);

  // Load the PDF
  if (!pdfPath) {
    // Default test file
    pdfPath = path.join(__dirname, '../test_data/RealSamples/WHP-DHN-S-X-2001_0 (PetroVietnam).pdf');
  }

  if (!fs.existsSync(pdfPath)) {
    console.error(`❌ File not found: ${pdfPath}`);
    console.log(`\nUsage: node scripts/testIntelligentExtraction.js [path/to/pdf]\n`);
    process.exit(1);
  }

  console.log(`📄 Test file: ${pdfPath}`);
  const pdfBuffer = fs.readFileSync(pdfPath);
  console.log(`📏 File size: ${(pdfBuffer.length / 1024).toFixed(2)} KB\n`);

  // Check prerequisites
  console.log('🔧 Configuration:');
  console.log(`   INTELLIGENT_EXTRACTION: ${process.env.INTELLIGENT_EXTRACTION}`);
  console.log(`   INTELLIGENT_EXTRACTION_MULTIMODAL: ${process.env.INTELLIGENT_EXTRACTION_MULTIMODAL}`);
  console.log(`   INTELLIGENT_EXTRACTION_TWO_PHASE: ${process.env.INTELLIGENT_EXTRACTION_TWO_PHASE}`);
  console.log(`   INTELLIGENT_EXTRACTION_VALIDATION: ${process.env.INTELLIGENT_EXTRACTION_VALIDATION}`);
  console.log(`   GEMINI_API_KEY: ${process.env.GEMINI_API_KEY ? '✅ Set' : '❌ Not set'}`);
  console.log(`   GCP_PROJECT_ID: ${process.env.GCP_PROJECT_ID || 'Not set'}`);
  console.log('');

  try {
    // Test 1: Check availability
    console.log('📋 Test 1: Checking intelligent extraction availability...');
    const { isIntelligentExtractionAvailable } = require('../src/services/ai/intelligentExtractionService');
    const availability = isIntelligentExtractionAvailable();

    if (!availability.available) {
      console.error(`❌ Intelligent extraction not available: ${availability.reason}`);
      process.exit(1);
    }
    console.log('✅ Intelligent extraction is available\n');

    // Test 2: Extract with Document AI first to get table data
    console.log('📋 Test 2: Getting base data from Document AI...');
    const { extractTablesFromPDF } = require('../src/services/gcp/documentAiService');

    let extractedData = { tables: [], text: '', pageCount: 1 };
    try {
      const docAiResult = await extractTablesFromPDF(pdfBuffer);
      extractedData.tables = docAiResult.tables || [];
      extractedData.text = docAiResult.text || '';
      extractedData.pageCount = docAiResult.pageCount || 1;
      console.log(`✅ Document AI extracted:`);
      console.log(`   Tables: ${extractedData.tables.length}`);
      console.log(`   Text: ${extractedData.text.length} characters`);
      console.log(`   Pages: ${extractedData.pageCount}\n`);
    } catch (error) {
      console.warn(`⚠️  Document AI failed: ${error.message}`);
      console.log('   Proceeding with empty base data...\n');
    }

    // Test 3: Run intelligent extraction
    console.log('📋 Test 3: Running intelligent extraction...');
    const { intelligentExtract } = require('../src/services/ai/intelligentExtractionService');

    const startTime = Date.now();
    const result = await intelligentExtract(extractedData, {
      pdfBuffer: pdfBuffer
    });
    const duration = Date.now() - startTime;

    console.log(`\n✅ Intelligent extraction completed in ${duration}ms`);
    console.log(`
================================================================================
📊 EXTRACTION RESULTS
================================================================================
`);

    console.log(`Document Type: ${result.document_type}`);
    console.log(`Confidence: ${result.confidence}`);
    console.log(`Total Items: ${result.items?.length || 0}`);

    if (result.document_analysis) {
      console.log(`\n📝 Document Analysis:`);
      console.log(`   Language: ${result.document_analysis.language?.primary || 'Unknown'}`);
      console.log(`   Number Format: ${result.document_analysis.number_format?.detected || 'Unknown'}`);
      console.log(`   Structure: ${result.document_analysis.structure?.type || 'Unknown'}`);
      if (result.document_analysis.structure?.groups?.length > 0) {
        console.log(`   Groups: ${result.document_analysis.structure.groups.join(', ')}`);
      }
    }

    if (result.validation_report) {
      console.log(`\n✅ Validation Report:`);
      if (result.validation_report.issues_found?.length > 0) {
        console.log(`   Issues Found: ${result.validation_report.issues_found.length}`);
        result.validation_report.issues_found.forEach(issue => {
          console.log(`     - ${issue}`);
        });
      }
      if (result.validation_report.corrections_made?.length > 0) {
        console.log(`   Corrections Made: ${result.validation_report.corrections_made.length}`);
      }
    }

    if (result.extraction_notes) {
      console.log(`\n📝 Extraction Notes: ${result.extraction_notes}`);
    }

    // Show sample items
    if (result.items && result.items.length > 0) {
      console.log(`\n📦 Sample Items (first 5):`);
      console.log('─'.repeat(80));

      result.items.slice(0, 5).forEach((item, i) => {
        console.log(`\n[${i + 1}] Line ${item.line_number || i + 1}`);
        console.log(`    Type: ${item.item_type || 'N/A'}`);
        console.log(`    Description: ${(item.description || '').substring(0, 60)}...`);
        console.log(`    Size: ${item.size || 'N/A'}`);
        console.log(`    Quantity: ${item.quantity} ${item.unit || 'EA'}`);
        if (item.weight_kg) console.log(`    Weight: ${item.weight_kg} kg`);
        if (item.material_code) console.log(`    Material Code: ${item.material_code}`);
      });

      if (result.items.length > 5) {
        console.log(`\n    ... and ${result.items.length - 5} more items`);
      }
    }

    // Save full result to file
    const outputPath = pdfPath.replace('.pdf', '_intelligent_extraction.json');
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
    console.log(`\n📁 Full results saved to: ${outputPath}`);

    console.log(`
================================================================================
✅ TEST COMPLETE
================================================================================
`);

  } catch (error) {
    console.error(`\n❌ Test failed: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the test
const pdfPath = process.argv[2];
testIntelligentExtraction(pdfPath)
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
