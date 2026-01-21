/**
 * Quick test: Extract from hardest PR document
 */

require('dotenv').config({ path: '.env.gcp' });
const fs = require('fs');
const path = require('path');
const { parseRFQDocument } = require('./src/services/gcp/documentAiService');

const HARDEST_DOC = '../test_data/RealSamples/CS-0133567 - PR for IJV ALPHA Tubular & Beams for Jacket & Piles Lower Grillage (MMHE).pdf';

async function testPRDocument() {
  console.log('Testing: CS-0133567 - Purchase Request (Tubular & Beams)');
  console.log('Expected: Extract tubular/beam items with specifications\n');

  const docPath = path.resolve(__dirname, HARDEST_DOC);
  const fileBuffer = fs.readFileSync(docPath);

  const startTime = Date.now();
  const result = await parseRFQDocument(fileBuffer, 'pdf');
  const duration = Date.now() - startTime;

  console.log(`\n✅ Extraction complete (${duration}ms)\n`);
  console.log('═'.repeat(80));
  console.log('RESULTS');
  console.log('═'.repeat(80));
  console.log(`Items extracted: ${result.items?.length || 0}`);
  console.log(`Confidence: ${result.confidence || 'N/A'}`);
  console.log();

  if (result.items && result.items.length > 0) {
    console.log('Extracted Items (NSC Quotation Format):');
    console.log('─'.repeat(80));
    result.items.forEach((item, idx) => {
      console.log(`${idx + 1}. [${item.item_type || 'N/A'}] ${item.size || 'N/A'} - ${item.description || 'N/A'}`);
      console.log(`   Qty: ${item.quantity || '?'} ${item.unit || ''}`);
      console.log(`   Material Spec: ${item.material_spec || 'N/A'}`);
      console.log(`   Remarks: ${item.remarks || 'N/A'}`);
      console.log();
    });

    console.log('═'.repeat(80));
    console.log('✅ SUCCESS: Vertex AI SDK working with complex PR document');
    console.log('═'.repeat(80));
  } else {
    console.log('⚠️  No items extracted (might be fail-loud behavior)');
  }
}

testPRDocument().catch(error => {
  console.error('Error:', error.message);
  process.exit(1);
});
