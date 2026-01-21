/**
 * Test Vertex AI Extraction with ALL RealSamples Documents
 *
 * This proves the extraction works across different document types:
 * - Purchase Requests (PR)
 * - Material Take-Offs (MTO)
 * - RFQs
 * - Different formats and layouts
 */

require('dotenv').config({ path: '.env.gcp' });
const fs = require('fs');
const path = require('path');
const { parseRFQDocument } = require('./src/services/gcp/documentAiService');

const SAMPLES_DIR = '../test_data/RealSamples';

async function testDocument(filePath) {
  const fileName = path.basename(filePath);

  console.log('\n' + '═'.repeat(100));
  console.log(`Testing: ${fileName}`);
  console.log('═'.repeat(100));

  try {
    const fileBuffer = fs.readFileSync(filePath);
    const startTime = Date.now();

    const result = await parseRFQDocument(fileBuffer, 'pdf');

    const duration = Date.now() - startTime;

    console.log(`✅ Extraction complete (${duration}ms)`);
    console.log(`   Items: ${result.items?.length || 0}`);
    console.log(`   Confidence: ${result.confidence || 'N/A'}`);

    if (result.items && result.items.length > 0) {
      console.log('\nFirst 3 items:');
      result.items.slice(0, 3).forEach((item, idx) => {
        console.log(`  ${idx + 1}. [${item.item_type || 'N/A'}] ${item.size || 'N/A'}`);
        console.log(`     ${item.description?.substring(0, 60) || 'N/A'}...`);
        console.log(`     Qty: ${item.quantity || '?'} ${item.unit || ''}`);
      });

      return {
        file: fileName,
        success: true,
        items: result.items.length,
        duration,
        confidence: result.confidence
      };
    } else {
      console.log('⚠️  No items extracted');
      return {
        file: fileName,
        success: false,
        items: 0,
        duration,
        error: 'No items extracted'
      };
    }

  } catch (error) {
    console.log(`❌ Extraction failed: ${error.message}`);
    return {
      file: fileName,
      success: false,
      items: 0,
      error: error.message
    };
  }
}

async function runAllTests() {
  console.log('🧪 Testing Vertex AI Extraction with ALL RealSamples Documents');
  console.log('Objective: Verify extraction works across different document types\n');

  const samplesPath = path.resolve(__dirname, SAMPLES_DIR);
  const files = fs.readdirSync(samplesPath)
    .filter(f => f.endsWith('.pdf'))
    .map(f => path.join(samplesPath, f));

  console.log(`Found ${files.length} PDF documents to test\n`);

  const results = [];

  for (const file of files) {
    const result = await testDocument(file);
    results.push(result);
  }

  // Summary
  console.log('\n' + '═'.repeat(100));
  console.log('TEST SUMMARY');
  console.log('═'.repeat(100));
  console.log();

  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log('Results:');
  results.forEach(r => {
    const status = r.success ? '✅' : '❌';
    const items = r.success ? `${r.items} items` : r.error;
    console.log(`  ${status} ${r.file.padEnd(70)} ${items}`);
  });

  console.log();
  console.log('═'.repeat(100));
  console.log(`Success Rate: ${successful.length}/${results.length} (${((successful.length/results.length)*100).toFixed(0)}%)`);
  console.log(`Total Items Extracted: ${successful.reduce((sum, r) => sum + r.items, 0)}`);
  console.log(`Average Extraction Time: ${(successful.reduce((sum, r) => sum + r.duration, 0) / successful.length / 1000).toFixed(1)}s`);
  console.log('═'.repeat(100));

  if (failed.length > 0) {
    console.log('\nFailed Documents:');
    failed.forEach(r => {
      console.log(`  ❌ ${r.file}: ${r.error}`);
    });
  }

  console.log();
  if (successful.length >= files.length * 0.8) {
    console.log('🎉 SUCCESS: 80%+ extraction coverage achieved (SOT Phase 1-2 success metric)');
  } else {
    console.log('⚠️  WARNING: Below 80% extraction coverage target');
  }

  process.exit(successful.length >= files.length * 0.8 ? 0 : 1);
}

runAllTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
