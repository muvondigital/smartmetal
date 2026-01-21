/**
 * Analyze RealSamples documents to identify the hardest one
 */

const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('pdf-lib');

const SAMPLES_DIR = path.join(__dirname, '../test_data/RealSamples');

async function analyzeDocument(filePath) {
  const fileName = path.basename(filePath);
  const stats = fs.statSync(filePath);

  try {
    if (filePath.endsWith('.xlsx')) {
      return {
        fileName,
        type: 'Excel',
        sizeKB: Math.round(stats.size / 1024),
        pages: 'N/A',
        complexity: 'HIGH (Multi-sheet Excel)',
        reason: 'Excel MTOs are complex - multiple sheets, formulas, merged cells'
      };
    }

    const fileBuffer = fs.readFileSync(filePath);
    const pdfDoc = await PDFDocument.load(fileBuffer);
    const pageCount = pdfDoc.getPageCount();

    // Heuristic for complexity
    let complexity = 'LOW';
    let reason = '';

    if (pageCount > 20) {
      complexity = 'HIGH';
      reason = `${pageCount} pages - likely multi-section document`;
    } else if (pageCount > 10) {
      complexity = 'MEDIUM';
      reason = `${pageCount} pages - moderate document`;
    } else if (fileName.includes('PO_')) {
      complexity = 'HIGH';
      reason = 'Purchase Order - complex commercial terms, pricing tables';
    } else if (fileName.includes('CS-') || fileName.includes('PR')) {
      complexity = 'HIGH';
      reason = 'Customer spec or PR - complex requirements, multiple sections';
    } else if (fileName.includes('WHP-DHN') || fileName.includes('MTO')) {
      complexity = 'MEDIUM';
      reason = 'Material Take-Off - structured tables but can have complex layouts';
    }

    return {
      fileName,
      type: 'PDF',
      sizeKB: Math.round(stats.size / 1024),
      pages: pageCount,
      complexity,
      reason
    };

  } catch (error) {
    return {
      fileName,
      type: 'Unknown',
      sizeKB: Math.round(stats.size / 1024),
      pages: 'Error',
      complexity: 'UNKNOWN',
      reason: error.message
    };
  }
}

async function main() {
  console.log('Analyzing NSC RealSamples documents...\n');

  const files = fs.readdirSync(SAMPLES_DIR)
    .filter(f => f.endsWith('.pdf') || f.endsWith('.xlsx'))
    .map(f => path.join(SAMPLES_DIR, f));

  const analyses = [];

  for (const file of files) {
    const analysis = await analyzeDocument(file);
    analyses.push(analysis);
  }

  // Sort by complexity and size
  const complexityOrder = { 'HIGH': 3, 'MEDIUM': 2, 'LOW': 1, 'UNKNOWN': 0 };
  analyses.sort((a, b) => {
    const complexityDiff = complexityOrder[b.complexity] - complexityOrder[a.complexity];
    if (complexityDiff !== 0) return complexityDiff;
    return b.sizeKB - a.sizeKB;
  });

  // Display results
  console.log('═'.repeat(100));
  console.log('DOCUMENT COMPLEXITY ANALYSIS');
  console.log('═'.repeat(100));
  console.log();

  analyses.forEach((doc, idx) => {
    const rank = idx === 0 ? '🔥 HARDEST' : idx === 1 ? '⚡ HARD' : '  ';
    console.log(`${rank} ${doc.complexity.padEnd(8)} │ ${doc.pages.toString().padEnd(6)} │ ${doc.sizeKB.toString().padStart(5)}KB │ ${doc.fileName}`);
    console.log(`${''.padEnd(10)} └─ ${doc.reason}`);
    console.log();
  });

  // Identify the hardest
  const hardest = analyses[0];
  console.log('═'.repeat(100));
  console.log('🎯 RECOMMENDATION: Test with', hardest.fileName);
  console.log('   Complexity:', hardest.complexity);
  console.log('   Reason:', hardest.reason);
  console.log('═'.repeat(100));

  return hardest.fileName;
}

main().catch(console.error);
