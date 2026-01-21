/**
 * Test AI Extraction Against Ground Truth
 *
 * This script:
 * 1. Takes a ground truth file
 * 2. Extracts the corresponding PDF using AI
 * 3. Measures accuracy against ground truth
 * 4. Generates detailed report
 *
 * Usage: node backend/scripts/testAgainstGroundTruth.js <ground_truth_file>
 * Example: node backend/scripts/testAgainstGroundTruth.js \
 *   test_data/ground_truth/FGLNG-S-60-PIP-MTO-0001_A_09-16_updated_ground_truth.json
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env.gcp') });
const fs = require('fs').promises;
const path = require('path');
const { extractRfq } = require('./testAiExtraction');
const { measureAccuracy } = require('./measureExtractionAccuracy');

/**
 * Find PDF file corresponding to ground truth
 */
async function findPdfFile(groundTruthPath) {
  const groundTruthData = JSON.parse(await fs.readFile(groundTruthPath, 'utf8'));
  const filename = groundTruthData.document_info?.filename;

  if (!filename) {
    throw new Error('Ground truth file missing document_info.filename');
  }

  // Search in test_data/RealSamples
  const samplesDir = path.join(__dirname, '../../test_data/RealSamples');
  const pdfPath = path.join(samplesDir, filename);

  try {
    await fs.access(pdfPath);
    return pdfPath;
  } catch (error) {
    throw new Error(`PDF file not found: ${filename}\nLooked in: ${samplesDir}`);
  }
}

/**
 * Run full test cycle
 */
async function testAgainstGroundTruth(groundTruthPath) {
  console.log('🧪 AI Extraction Test Against Ground Truth');
  console.log('═'.repeat(80));
  console.log(`Ground Truth: ${path.basename(groundTruthPath)}`);
  console.log('');

  // Step 1: Find PDF
  console.log('Step 1: Finding PDF file...');
  const pdfPath = await findPdfFile(groundTruthPath);
  const pdfFilename = path.basename(pdfPath);
  console.log(`✅ Found: ${pdfFilename}`);
  console.log('');

  // Step 2: Extract using AI
  console.log('Step 2: Running AI extraction...');
  const extractionResult = await extractRfq(pdfPath, pdfFilename);

  if (!extractionResult.success) {
    console.error('❌ AI extraction failed!');
    console.error('Detailed Error:', JSON.stringify(extractionResult.error, null, 2));
    return {
      success: false,
      error: extractionResult.error
    };
  }

  console.log(`✅ Extracted ${extractionResult.stats?.itemCount || 0} items`);
  console.log('');

  // Step 3: Save AI extraction result
  const outputDir = path.join(__dirname, '../../test_data/ai_extraction_results');
  await fs.mkdir(outputDir, { recursive: true });

  const extractionFilename = path.basename(groundTruthPath)
    .replace('_ground_truth.json', '_extraction.json');
  const extractionPath = path.join(outputDir, extractionFilename);

  await fs.writeFile(extractionPath, JSON.stringify(extractionResult, null, 2), 'utf8');
  console.log(`💾 Saved AI extraction: ${extractionFilename}`);
  console.log('');

  // Step 4: Measure accuracy
  console.log('Step 3: Measuring accuracy...');
  console.log('');

  const accuracyReport = await measureAccuracy(groundTruthPath, extractionPath);

  // Step 5: Save accuracy report
  const reportPath = path.join(outputDir, extractionFilename.replace('.json', '_accuracy_report.json'));
  await fs.writeFile(reportPath, JSON.stringify(accuracyReport, null, 2), 'utf8');

  console.log('');
  console.log('═'.repeat(80));
  console.log('📊 TEST RESULTS');
  console.log('═'.repeat(80));
  console.log(`Ground Truth Items: ${accuracyReport.summary.groundTruthItemCount}`);
  console.log(`AI Extracted Items: ${accuracyReport.summary.aiExtractedItemCount}`);
  console.log(`Recall: ${accuracyReport.summary.recall}%`);
  console.log(`Average Accuracy: ${accuracyReport.summary.averageItemAccuracy}%`);
  console.log('');

  console.log('Critical Field Accuracy:');
  Object.entries(accuracyReport.criticalFields).forEach(([field, data]) => {
    const status = data.accuracy >= 95 ? '✅' : data.accuracy >= 90 ? '⚠️' : '❌';
    console.log(`  ${status} ${field.padEnd(15)}: ${data.accuracy.toFixed(2)}%`);
  });

  console.log('');
  console.log('Files generated:');
  console.log(`  📄 ${extractionFilename}`);
  console.log(`  📊 ${path.basename(reportPath)}`);

  return {
    success: true,
    accuracyReport,
    extractionPath,
    reportPath
  };
}

// Main execution
if (require.main === module) {
  const groundTruthPath = process.argv[2];

  if (!groundTruthPath) {
    console.error('Usage: node testAgainstGroundTruth.js <ground_truth_file>');
    console.error('');
    console.error('Example:');
    console.error('  node backend/scripts/testAgainstGroundTruth.js \\');
    console.error('    test_data/ground_truth/FGLNG-S-60-PIP-MTO-0001_A_09-16_updated_ground_truth.json');
    console.error('');
    console.error('Available ground truth files:');
    const gtDir = path.join(__dirname, '../../test_data/ground_truth');
    fs.readdir(gtDir)
      .then(files => {
        files.filter(f => f.endsWith('_ground_truth.json')).forEach(f => {
          console.error(`  - ${f}`);
        });
      })
      .catch(() => {});
    process.exit(1);
  }

  testAgainstGroundTruth(path.resolve(groundTruthPath))
    .then(result => {
      if (result.success) {
        const avgAccuracy = parseFloat(result.accuracyReport.summary.averageItemAccuracy);
        if (avgAccuracy >= 95) {
          console.log('');
          console.log('🎉 SUCCESS! AI extraction meets 95%+ accuracy target!');
          process.exit(0);
        } else if (avgAccuracy >= 90) {
          console.log('');
          console.log('⚠️  CLOSE! AI extraction is 90-95% accurate. Minor improvements needed.');
          process.exit(0);
        } else {
          console.log('');
          console.log('❌ FAIL! AI extraction below 90%. Significant improvements needed.');
          process.exit(1);
        }
      } else {
        console.error('');
        console.error('❌ Test failed due to extraction error');
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('');
      console.error('❌ Error:', error.message);
      console.error(error.stack);
      process.exit(1);
    });
}

module.exports = { testAgainstGroundTruth, findPdfFile };
