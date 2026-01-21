/**
 * Direct AI Extraction Test (No Database, No API)
 *
 * This script:
 * 1. Reads PDF with pdf-parse
 * 2. Calls Gemini directly
 * 3. Compares to ground truth
 * 4. Shows accuracy %
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env.gcp') });
const fs = require('fs').promises;
const path = require('path');
const pdfParse = require('pdf-parse');
const { extractHierarchicalMto, flattenMtoToRfqItems } = require('../src/services/ai/mtoExtractionService');
const { measureAccuracy } = require('./measureExtractionAccuracy');

/**
 * Extract data from PDF directly
 */
async function extractDirectly(pdfPath) {
  console.log('📄 Reading PDF with pdf-parse...');

  // Read PDF
  const pdfBuffer = await fs.readFile(pdfPath);
  const pdfData = await pdfParse(pdfBuffer);

  console.log(`✅ Extracted ${pdfData.text.length} characters from ${pdfData.numpages} pages`);

  // Prepare data for Gemini
  const extractedData = {
    text: pdfData.text,
    tables: [] // No table extraction, just text
  };

  console.log('🤖 Calling Gemini for extraction...');

  // Call Gemini
  const mtoStructure = await extractHierarchicalMto(extractedData);

  // Flatten to items
  const items = flattenMtoToRfqItems(mtoStructure);

  console.log(`✅ Gemini extracted ${items.length} items`);

  return {
    success: true,
    extraction: {
      document_type: 'RFQ',
      extracted_data: {
        metadata: mtoStructure.metadata || {},
        items: items
      },
      confidence: mtoStructure.confidence || 0
    }
  };
}

/**
 * Main test function
 */
async function testDirectExtraction(groundTruthPath) {
  console.log('🧪 Direct AI Extraction Test');
  console.log('═'.repeat(80));
  console.log(`Ground Truth: ${path.basename(groundTruthPath)}`);
  console.log('');

  // Read ground truth
  const groundTruthData = JSON.parse(await fs.readFile(groundTruthPath, 'utf8'));
  const filename = groundTruthData.document_info?.filename;

  if (!filename) {
    throw new Error('Ground truth missing document_info.filename');
  }

  // Find PDF
  const samplesDir = path.join(__dirname, '../../test_data/RealSamples');
  const pdfPath = path.join(samplesDir, filename);

  console.log(`PDF: ${filename}`);
  console.log('');

  // Extract
  const result = await extractDirectly(pdfPath);

  // Save extraction result
  const outputDir = path.join(__dirname, '../../test_data/ai_extraction_results');
  await fs.mkdir(outputDir, { recursive: true });

  const extractionFilename = path.basename(groundTruthPath)
    .replace('_ground_truth.json', '_extraction.json');
  const extractionPath = path.join(outputDir, extractionFilename);

  await fs.writeFile(extractionPath, JSON.stringify(result, null, 2), 'utf8');
  console.log(`💾 Saved extraction: ${extractionFilename}`);
  console.log('');

  // Measure accuracy
  console.log('📊 Measuring accuracy...');
  const accuracyReport = await measureAccuracy(groundTruthPath, extractionPath);

  // Save report
  const reportPath = path.join(outputDir, extractionFilename.replace('.json', '_accuracy_report.json'));
  await fs.writeFile(reportPath, JSON.stringify(accuracyReport, null, 2), 'utf8');

  // Display results
  console.log('');
  console.log('═'.repeat(80));
  console.log('📊 ACCURACY RESULTS');
  console.log('═'.repeat(80));
  console.log(`Ground Truth Items: ${accuracyReport.summary.groundTruthItemCount}`);
  console.log(`AI Extracted Items: ${accuracyReport.summary.aiExtractedItemCount}`);
  console.log(`Recall: ${accuracyReport.summary.recall}%`);
  console.log(`Average Accuracy: ${accuracyReport.summary.averageItemAccuracy}%`);
  console.log('');

  console.log('Field-Level Accuracy:');
  Object.entries(accuracyReport.criticalFields).forEach(([field, data]) => {
    const status = data.accuracy >= 95 ? '✅' : data.accuracy >= 90 ? '⚠️' : '❌';
    console.log(`  ${status} ${field.padEnd(15)}: ${data.accuracy.toFixed(2)}%`);
  });

  console.log('');
  console.log('Files saved:');
  console.log(`  📄 ${extractionFilename}`);
  console.log(`  📊 ${path.basename(reportPath)}`);
  console.log('');

  const overallPass = accuracyReport.summary.averageItemAccuracy >= 95;
  if (overallPass) {
    console.log('✅ EXTRACTION PASSED - Ready for production!');
  } else {
    console.log('⚠️  EXTRACTION NEEDS IMPROVEMENT');
  }

  return {
    success: true,
    accuracyReport,
    passed: overallPass
  };
}

// Run if called directly
if (require.main === module) {
  const groundTruthPath = process.argv[2];

  if (!groundTruthPath) {
    console.error('Usage: node testExtractionDirect.js <ground_truth_file>');
    console.error('Example: node testExtractionDirect.js ../test_data/ground_truth/FGLNG-S-60-PIP-MTO-0001_A_09-16_updated_ground_truth.json');
    process.exit(1);
  }

  testDirectExtraction(groundTruthPath)
    .then(() => {
      console.log('✅ Test completed successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Test failed:', error.message);
      console.error(error.stack);
      process.exit(1);
    });
}

module.exports = { testDirectExtraction, extractDirectly };
