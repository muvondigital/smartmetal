/**
 * Test Document AI-First Extraction
 *
 * Tests the new extraction flow that prioritizes Document AI tables
 * over Gemini LLM extraction
 */

require('dotenv').config({ path: require('path').join(__dirname, '.env.gcp') });
const fs = require('fs').promises;
const path = require('path');
const { parseRFQDocument } = require('./src/services/gcp/documentAiService');

async function testExtraction() {
  const testFile = path.join(__dirname, '../test_data/RealSamples/WHP-DHN-S-X-2001_0 (PetroVietnam).pdf');

  console.log('============================================');
  console.log('Testing Document AI-First Extraction');
  console.log('============================================');
  console.log(`Test file: ${testFile}\n`);

  try {
    // Read PDF
    const pdfBuffer = await fs.readFile(testFile);
    console.log(`✅ Loaded PDF (${pdfBuffer.length} bytes)\n`);

    // Extract using Document AI first
    console.log('🔍 Starting extraction...\n');
    const startTime = Date.now();

    const result = await parseRFQDocument(pdfBuffer, 'pdf', {
      // No options - let it use default Document AI-first approach
    });

    const duration = Date.now() - startTime;

    // Display results
    console.log('\n============================================');
    console.log('EXTRACTION RESULTS');
    console.log('============================================');
    console.log(`Duration: ${duration}ms (${(duration / 1000).toFixed(2)}s)`);
    console.log(`Document type: ${result.document_type || 'RFQ'}`);
    console.log(`Items extracted: ${result.items?.length || 0}`);
    console.log(`Confidence: ${result.confidence || 'N/A'}`);
    console.log(`Extraction method: ${result.extraction_notes || 'Not specified'}`);

    if (result.items && result.items.length > 0) {
      console.log('\n📋 First 5 items:');
      result.items.slice(0, 5).forEach((item, idx) => {
        console.log(`\n${idx + 1}. ${item.description || 'No description'}`);
        console.log(`   Quantity: ${item.quantity || 'N/A'} ${item.unit || ''}`);
        console.log(`   Material: ${item.material || 'N/A'}`);
      });
    }

    // Show if AI was used
    if (result.extraction_notes?.includes('Gemini') || result.extraction_notes?.includes('LLM')) {
      console.log('\n⚠️  WARNING: Gemini/LLM was used for extraction');
      console.log('   Expected: Document AI table extraction');
    } else if (result.extraction_notes?.includes('Document AI')) {
      console.log('\n✅ SUCCESS: Document AI table extraction was used');
      console.log('   This is faster, cheaper, and more reliable than LLM extraction');
    }

    console.log('\n============================================\n');

    // Write results to file for inspection
    const outputPath = path.join(__dirname, '../test_data/document_ai_test_result.json');
    await fs.writeFile(outputPath, JSON.stringify(result, null, 2));
    console.log(`✅ Full results saved to: ${outputPath}`);

  } catch (error) {
    console.error('\n❌ Extraction failed:');
    console.error(error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testExtraction();
