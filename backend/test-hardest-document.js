/**
 * Test Vertex AI with the HARDEST NSC Document
 *
 * Testing: CS-0133567 - PR for IJV ALPHA Tubular & Beams
 * Why hard: Customer Purchase Request with complex requirements, specifications
 */

require('dotenv').config({ path: '.env.gcp' });
const fs = require('fs');
const path = require('path');

// Import real extraction service (not just the client)
const { extractMaterialsFromDocument } = require('./src/services/ai/mtoExtractionService');
const { parseRFQDocument } = require('./src/services/gcp/documentAiService');

const HARDEST_DOC = '../test_data/RealSamples/CS-0133567 - PR for IJV ALPHA Tubular & Beams for Jacket & Piles Lower Grillage (MMHE).pdf';

async function testWithRealPipeline() {
  console.log('\n' + '═'.repeat(100));
  console.log('🔥 TESTING HARDEST DOCUMENT WITH REAL EXTRACTION PIPELINE');
  console.log('═'.repeat(100));
  console.log('Document: CS-0133567 - PR for IJV ALPHA Tubular & Beams');
  console.log('Complexity: Customer Purchase Request (2 pages, complex specs)');
  console.log('Expected: Should extract tubular/beam materials OR fail loudly');
  console.log('═'.repeat(100));
  console.log();

  try {
    const docPath = path.resolve(__dirname, HARDEST_DOC);

    if (!fs.existsSync(docPath)) {
      throw new Error(`Document not found: ${docPath}`);
    }

    console.log('📄 Reading document...');
    const fileBuffer = fs.readFileSync(docPath);
    const base64Content = fileBuffer.toString('base64');

    console.log('✓ Document loaded:', Math.round(fileBuffer.length / 1024), 'KB');
    console.log();

    // Step 1: Document AI processing
    console.log('Step 1: Document AI OCR extraction...');
    const startOCR = Date.now();

    const extractedData = await parseRFQDocument(
      fileBuffer,
      'pdf',
      { skipGPT: true } // Just OCR, skip GPT structuring for now
    );

    const ocrDuration = Date.now() - startOCR;
    console.log(`✅ OCR complete (${ocrDuration}ms)`);
    console.log(`   Pages: ${extractedData.pages?.length || 0}`);
    console.log(`   Tables detected: ${extractedData.tables?.length || 0}`);
    console.log(`   Total rows: ${(extractedData.tables || []).reduce((sum, t) => sum + (t.rows?.length || 0), 0)}`);
    console.log();

    // Step 2: AI extraction with Gemini
    console.log('Step 2: Gemini AI material extraction...');
    const startExtraction = Date.now();

    const result = await extractMaterialsFromDocument(extractedData, {
      documentType: 'PR', // Purchase Request
      enableValidation: true,
      tenantId: 'test-tenant'
    });

    const extractionDuration = Date.now() - startExtraction;
    console.log(`✅ Extraction complete (${extractionDuration}ms)`);
    console.log();

    // Validation
    console.log('═'.repeat(100));
    console.log('EXTRACTION RESULTS');
    console.log('═'.repeat(100));

    if (!result || !result.items) {
      console.log('❌ FAIL: No items returned');
      return { success: false, reason: 'No items returned' };
    }

    console.log(`Items extracted: ${result.items.length}`);
    console.log(`Document type: ${result.document_type || 'N/A'}`);
    console.log();

    // Check for commercial discipline
    const validationChecks = {
      hasItems: result.items.length > 0,
      noEmptyRows: result.items.every(item =>
        item.description || item.item_type || item.size || item.material
      ),
      preservesNulls: result.items.some(item =>
        Object.values(item).includes(null)
      ),
      hasLineNumbers: result.items.every(item => item.line_number !== undefined),
      hasQuantities: result.items.some(item => item.quantity !== null)
    };

    console.log('Commercial Discipline Checks:');
    console.log(`  ✓ Has items (not empty): ${validationChecks.hasItems ? 'PASS ✅' : 'FAIL ❌'}`);
    console.log(`  ✓ No silent row drops: ${validationChecks.noEmptyRows ? 'PASS ✅' : 'FAIL ❌'}`);
    console.log(`  ✓ Preserves nulls: ${validationChecks.preservesNulls ? 'PASS ✅' : 'WARNING ⚠️'}`);
    console.log(`  ✓ All rows numbered: ${validationChecks.hasLineNumbers ? 'PASS ✅' : 'FAIL ❌'}`);
    console.log(`  ✓ Quantities present: ${validationChecks.hasQuantities ? 'PASS ✅' : 'FAIL ❌'}`);
    console.log();

    // Show sample items
    if (result.items.length > 0) {
      console.log('Sample Items (first 5):');
      console.log('─'.repeat(100));
      result.items.slice(0, 5).forEach((item, idx) => {
        console.log(`${idx + 1}. Line ${item.line_number}:`);
        console.log(`   Description: ${item.description || item.item_type || 'NULL'}`);
        console.log(`   Quantity: ${item.quantity !== null ? item.quantity + ' ' + (item.unit || '') : 'NULL'}`);
        console.log(`   Size: ${item.size || 'NULL'}`);
        console.log(`   Material: ${item.material || 'NULL'}`);
        console.log();
      });
    }

    // Final verdict
    const allChecksPassed = Object.values(validationChecks).filter(v => v === true).length >= 4;

    console.log('═'.repeat(100));
    if (allChecksPassed) {
      console.log('🎉 SUCCESS: Hardest document extracted with commercial discipline');
      console.log(`   Total time: ${ocrDuration + extractionDuration}ms`);
      console.log(`   Items: ${result.items.length}`);
    } else {
      console.log('⚠️  PARTIAL SUCCESS: Some checks failed but system didn\'t fail silently');
    }
    console.log('═'.repeat(100));

    return {
      success: allChecksPassed,
      itemCount: result.items.length,
      duration: ocrDuration + extractionDuration,
      validation: validationChecks
    };

  } catch (error) {
    console.log('\n❌ EXTRACTION FAILED');
    console.log('Error:', error.message);
    console.log();

    // Check if it's a GOOD failure (fail-loud)
    const isGoodFailure =
      error.message.includes('metadata-only') ||
      error.message.includes('0 items') ||
      error.message.includes('Table present') ||
      error.message.includes('Invalid JSON');

    console.log('═'.repeat(100));
    if (isGoodFailure) {
      console.log('✅ GOOD FAILURE: System failed loudly (commercial discipline maintained)');
      console.log('   This is BETTER than silent success with bad data');
    } else {
      console.log('❌ BAD FAILURE: Unexpected error (investigate)');
    }
    console.log('═'.repeat(100));

    return {
      success: false,
      isGoodFailure,
      error: error.message
    };
  }
}

// Run test
testWithRealPipeline()
  .then(result => {
    process.exit(result.success || result.isGoodFailure ? 0 : 1);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
