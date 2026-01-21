/**
 * Measure AI Extraction Accuracy Against Ground Truth
 *
 * This script:
 * 1. Loads ground truth JSON (manual extraction)
 * 2. Loads AI extraction results
 * 3. Compares field-by-field accuracy
 * 4. Generates detailed accuracy report
 *
 * Usage: node backend/scripts/measureExtractionAccuracy.js <ground_truth_file> <ai_extraction_file>
 * Example: node backend/scripts/measureExtractionAccuracy.js \
 *   test_data/ground_truth/FGLNG-S-60-PIP-MTO-0001_A_09-16_updated_ground_truth.json \
 *   test_data/ai_extraction_results/FGLNG-S-60-PIP-MTO-0001_A_09-16_updated_extraction.json
 */

const fs = require('fs').promises;
const path = require('path');

/**
 * Normalize string for comparison (case-insensitive, trim whitespace)
 */
function normalizeString(str) {
  if (!str) return '';
  return String(str).trim().toLowerCase();
}

function normalizeMatchString(str) {
  if (!str) return '';
  let normalized = String(str).toLowerCase().trim();
  normalized = normalized.replace(/\s+/g, ' ');
  normalized = normalized.replace(/[.,;:]+$/g, '');
  normalized = normalized.replace(/mm\s*\^\s*2/g, 'mm2');
  normalized = normalized.replace(/mm\s*\u00b2/g, 'mm2');
  normalized = normalized.replace(/mm\s+2/g, 'mm2');
  normalized = normalized.replace(/\b(o\.d)\b/g, 'od');
  normalized = normalized.replace(/\s*,\s*/g, ',');
  return normalized;
}

function normalizeMatchSize(str) {
  if (!str) return '';
  const quotePattern = /[\u201C\u201D\u2033]/g; // curly quotes, double-prime
  const apostrophePattern = /[\u2019']/g;
  return normalizeMatchString(str)
    .replace(/inch/g, '"')
    .replace(quotePattern, '"')
    .replace(apostrophePattern, "'")
    .replace(/''/g, '"')
    .replace(/\s+/g, '');
}

function normalizeGroundTruthItem(item, index, documentInfo) {
  const itemNo = item.item_no ?? item.line_number ?? item.lineNo ?? item.itemNo ?? item.item ?? item.Item ?? (index + 1);
  const rfqReference = item.rfq_reference ?? documentInfo?.rfq_reference ?? documentInfo?.rfq ?? null;
  const description = item.description ?? item.desc ?? item.detail ?? item.Detail ?? item.item_type ?? null;
  const quantity = item.quantity ?? item.qty ?? item.Qty ?? null;
  const unit = item.unit ?? item.Unit ?? null;
  const material = item.material ?? null;
  const odMm = item.od_mm ?? null;
  const tkMm = item.tk_mm ?? null;
  const unitWeightKg = item.unit_weight_kg ?? null;
  const totalWeightKg = item.total_weight_kg ?? null;
  const pageNumber = item.page_number ?? item.page ?? null;
  const notes = item.notes ?? item.remarks ?? item.Remarks ?? item.Notes ?? null;

  return {
    item_no: itemNo,
    rfq_reference: rfqReference,
    description,
    material,
    od_mm: odMm,
    tk_mm: tkMm,
    quantity,
    unit,
    unit_weight_kg: unitWeightKg,
    total_weight_kg: totalWeightKg,
    page_number: pageNumber,
    notes
  };
}

function normalizeAiItem(item, index, documentInfo) {
  const itemNo = item.item_no ?? item.line_number ?? item.item_number ?? item.itemNo ?? item.Item ?? (index + 1);
  const rfqReference = item.rfq_reference ?? documentInfo?.rfq_reference ?? documentInfo?.rfq ?? null;
  const description = item.description ?? item.desc ?? item.detail ?? item.Detail ?? item.item_type ?? null;
  const quantity = item.quantity ?? item.qty ?? item.Qty ?? null;
  const unit = item.unit ?? item.Unit ?? null;
  const material = item.material ?? item.material_spec ?? null;
  const odMm = item.od_mm ?? null;
  const tkMm = item.tk_mm ?? null;
  const unitWeightKg = item.unit_weight_kg ?? null;
  const totalWeightKg = item.total_weight_kg ?? null;
  const pageNumber = item.page_number ?? item.page ?? null;
  const notes = item.notes ?? item.remarks ?? item.Remarks ?? item.Notes ?? null;

  return {
    item_no: itemNo,
    rfq_reference: rfqReference,
    description,
    material,
    od_mm: odMm,
    tk_mm: tkMm,
    quantity,
    unit,
    unit_weight_kg: unitWeightKg,
    total_weight_kg: totalWeightKg,
    page_number: pageNumber,
    notes
  };
}

/**
 * Check if two strings are semantically equivalent
 */
function areEquivalent(groundTruth, aiExtracted, field) {
  const gt = normalizeMatchString(groundTruth);
  const ai = normalizeMatchString(aiExtracted);

  // Exact match
  if (gt === ai) return true;

  // Empty/null equivalence
  if (!gt && !ai) return true;

  // Field-specific equivalence rules
  switch (field) {
    case 'unit':
      // Normalize common unit variants for comparison
      const normalizeUnit = (value) => {
        const normalized = normalizeMatchString(value);
        if (!normalized) return '';
        if (['pcs', 'pc', 'each', 'ea'].includes(normalized)) return 'ea';
        if (['lg', 'length', 'm', 'meter', 'metre'].includes(normalized)) return 'm';
        return normalized;
      };
      return normalizeUnit(gt) === normalizeUnit(ai);

    case 'size':
      return normalizeMatchSize(groundTruth) === normalizeMatchSize(aiExtracted);

    case 'quantity':
      // Numeric comparison
      const gtNum = parseFloat(groundTruth);
      const aiNum = parseFloat(aiExtracted);
      if (!isNaN(gtNum) && !isNaN(aiNum)) {
        return Math.abs(gtNum - aiNum) < 0.01; // Allow 0.01 tolerance
      }
      return gt === ai;

    case 'od_mm':
    case 'tk_mm':
    case 'unit_weight_kg':
    case 'total_weight_kg': {
      const gtFloat = parseFloat(groundTruth);
      const aiFloat = parseFloat(aiExtracted);
      if (!isNaN(gtFloat) && !isNaN(aiFloat)) {
        return Math.abs(gtFloat - aiFloat) < 0.01;
      }
      return gt === ai;
    }

    default:
      return gt === ai;
  }
}

/**
 * Compare two items field by field
 */
function compareItems(groundTruthItem, aiItem) {
  const requiredFields = [
    'item_no',
    'rfq_reference',
    'description',
    'material',
    'quantity',
    'unit'
  ];
  const conditionalFields = ['od_mm', 'tk_mm'];
  const optionalFields = ['unit_weight_kg', 'total_weight_kg', 'page_number', 'notes'];
  const fields = [...requiredFields, ...conditionalFields, ...optionalFields];

  const comparison = {
    matches: 0,
    mismatches: 0,
    totalCounted: 0,
    details: {}
  };

  if (!aiItem) {
    fields.forEach(field => {
      const shouldCount = requiredFields.includes(field);
      if (shouldCount) {
        comparison.totalCounted++;
      }
      comparison.details[field] = {
        groundTruth: groundTruthItem[field],
        aiExtracted: null,
        match: false,
        counted: shouldCount
      };
      if (shouldCount) {
        comparison.mismatches++;
      }
    });
    comparison.accuracy = comparison.totalCounted ? 0 : 0;
    return comparison;
  }

  fields.forEach(field => {
    const gtValue = groundTruthItem[field];
    const aiValue = aiItem ? aiItem[field] : undefined;
    const isMatch = areEquivalent(gtValue, aiValue, field);
    const shouldCount = requiredFields.includes(field) || (gtValue !== null && gtValue !== undefined && `${gtValue}`.trim() !== '');

    comparison.details[field] = {
      groundTruth: gtValue,
      aiExtracted: aiValue,
      match: isMatch,
      counted: shouldCount
    };

    if (shouldCount) {
      comparison.totalCounted++;
      if (isMatch) {
        comparison.matches++;
      } else {
        comparison.mismatches++;
      }
    }
  });

  comparison.accuracy = comparison.totalCounted
    ? (comparison.matches / comparison.totalCounted) * 100
    : 0;

  return comparison;
}

/**
 * Find matching AI item for ground truth item
 */
function findMatchingItem(gtItem, aiItems) {
  const gtItemNo = normalizeMatchString(gtItem.item_no);

  // Prefer item number matching when available
  const itemNoMatches = aiItems.filter(ai =>
    normalizeMatchString(ai.item_no) === gtItemNo
  );
  if (itemNoMatches.length === 1) return itemNoMatches[0];
  if (itemNoMatches.length > 1) {
    const byContentInItemNo = itemNoMatches.find(ai =>
      normalizeMatchString(ai.description) === normalizeMatchString(gtItem.description) &&
      normalizeMatchString(ai.material) === normalizeMatchString(gtItem.material) &&
      normalizeMatchString(ai.quantity) === normalizeMatchString(gtItem.quantity) &&
      normalizeMatchString(ai.unit) === normalizeMatchString(gtItem.unit)
    );
    if (byContentInItemNo) return byContentInItemNo;
    return itemNoMatches[0];
  }

  // Fallback to content match
  const byContent = aiItems.find(ai =>
    normalizeMatchString(ai.description) === normalizeMatchString(gtItem.description) &&
    normalizeMatchString(ai.material) === normalizeMatchString(gtItem.material) &&
    normalizeMatchString(ai.quantity) === normalizeMatchString(gtItem.quantity) &&
    normalizeMatchString(ai.unit) === normalizeMatchString(gtItem.unit) &&
    normalizeMatchString(ai.od_mm) === normalizeMatchString(gtItem.od_mm) &&
    normalizeMatchString(ai.tk_mm) === normalizeMatchString(gtItem.tk_mm)
  );
  if (byContent) return byContent;

  return null;
}

/**
 * Calculate overall accuracy metrics
 */
async function measureAccuracy(groundTruthPath, aiExtractionPath) {
  console.log('📊 AI Extraction Accuracy Measurement');
  console.log('═'.repeat(80));
  console.log(`Ground Truth: ${path.basename(groundTruthPath)}`);
  console.log(`AI Extraction: ${path.basename(aiExtractionPath)}`);
  console.log('');

  // Load files
  const groundTruthData = JSON.parse(await fs.readFile(groundTruthPath, 'utf8'));
  const aiExtractionData = JSON.parse(await fs.readFile(aiExtractionPath, 'utf8'));

  const documentInfo = groundTruthData.document_info || null;
  const groundTruthItems = (groundTruthData.items || []).map((item, index) =>
    normalizeGroundTruthItem(item, index, documentInfo)
  );
  const aiItemsRaw = aiExtractionData.extraction?.extracted_data?.items ||
                  aiExtractionData.items || [];
  const aiItems = aiItemsRaw.map((item, index) =>
    normalizeAiItem(item, index, documentInfo)
  );

  console.log(`📋 Ground Truth Items: ${groundTruthItems.length}`);
  console.log(`🤖 AI Extracted Items: ${aiItems.length}`);
  console.log('');

  // Item-level comparison
  const itemComparisons = [];
  const criticalFieldAccuracy = {
    item_no: { correct: 0, total: 0 },
    rfq_reference: { correct: 0, total: 0 },
    description: { correct: 0, total: 0 },
    material: { correct: 0, total: 0 },
    quantity: { correct: 0, total: 0 },
    unit: { correct: 0, total: 0 },
    od_mm: { correct: 0, total: 0 },
    tk_mm: { correct: 0, total: 0 }
  };

  for (const gtItem of groundTruthItems) {
    const aiItem = findMatchingItem(gtItem, aiItems);
    const comparison = compareItems(gtItem, aiItem);

    itemComparisons.push({
      groundTruthLineNumber: gtItem.item_no,
      aiLineNumber: aiItem ? aiItem.item_no : 'NOT FOUND',
      accuracy: comparison.accuracy,
      details: comparison.details
    });

    // Track critical fields
    Object.keys(criticalFieldAccuracy).forEach(field => {
      const detail = comparison.details[field];
      if (detail && detail.counted) {
        criticalFieldAccuracy[field].total++;
        if (detail.match) {
          criticalFieldAccuracy[field].correct++;
        }
      }
    });
  }

  // Calculate metrics
  const matchedCount = itemComparisons.filter(c => c.aiLineNumber !== "NOT FOUND").length;
  const recall = groundTruthItems.length ? (matchedCount / groundTruthItems.length) * 100 : 0;
  const precision = aiItems.length ? (matchedCount / aiItems.length) * 100 : 0;
  const avgItemAccuracy = itemComparisons.reduce((sum, c) => sum + c.accuracy, 0) / itemComparisons.length;

  // Field-level accuracy
  const fieldAccuracyReport = {};
  Object.keys(criticalFieldAccuracy).forEach(field => {
    const data = criticalFieldAccuracy[field];
    fieldAccuracyReport[field] = {
      correct: data.correct,
      total: data.total,
      accuracy: data.total > 0 ? (data.correct / data.total) * 100 : 0
    };
  });

  // Generate report
  const report = {
    timestamp: new Date().toISOString(),
    groundTruthFile: path.basename(groundTruthPath),
    aiExtractionFile: path.basename(aiExtractionPath),
    summary: {
      groundTruthItemCount: groundTruthItems.length,
      aiExtractedItemCount: aiItems.length,
      recall: recall.toFixed(2),
      precision: precision.toFixed(2),
      averageItemAccuracy: avgItemAccuracy.toFixed(2)
    },
    criticalFields: fieldAccuracyReport,
    itemComparisons: itemComparisons,
    mismatches: itemComparisons.filter(c => c.accuracy < 100).map(c => ({
      lineNumber: c.groundTruthLineNumber,
      accuracy: c.accuracy.toFixed(2),
      issues: Object.entries(c.details)
        .filter(([_, v]) => !v.match)
        .map(([field, v]) => ({
          field,
          expected: v.groundTruth,
          actual: v.aiExtracted
        }))
    }))
  };

  // Print summary
  console.log('═'.repeat(80));
  console.log('📈 ACCURACY SUMMARY');
  console.log('═'.repeat(80));
  console.log(`Recall (items found): ${recall.toFixed(2)}%`);
  console.log(`Precision (items matched): ${precision.toFixed(2)}%`);
  console.log(`Average item accuracy: ${avgItemAccuracy.toFixed(2)}%`);
  console.log('');

  console.log('Critical Field Accuracy:');
  Object.entries(fieldAccuracyReport).forEach(([field, data]) => {
    const status = data.accuracy >= 95 ? '✅' : data.accuracy >= 90 ? '⚠️' : '❌';
    console.log(`  ${status} ${field.padEnd(15)}: ${data.accuracy.toFixed(2)}% (${data.correct}/${data.total})`);
  });
  console.log('');

  // Show mismatches
  if (report.mismatches.length > 0) {
    console.log('═'.repeat(80));
    console.log(`❌ MISMATCHES (${report.mismatches.length} items with errors)`);
    console.log('═'.repeat(80));

    report.mismatches.slice(0, 10).forEach(mismatch => {
      console.log(`\nLine ${mismatch.lineNumber} (${mismatch.accuracy}% accurate):`);
      mismatch.issues.forEach(issue => {
        console.log(`  • ${issue.field}:`);
        console.log(`    Expected: "${issue.expected}"`);
        console.log(`    Got:      "${issue.actual}"`);
      });
    });

    if (report.mismatches.length > 10) {
      console.log(`\n... and ${report.mismatches.length - 10} more mismatches`);
    }
  }

  // Overall assessment
  console.log('');
  console.log('═'.repeat(80));
  console.log('🎯 OVERALL ASSESSMENT');
  console.log('═'.repeat(80));

  const passesThreshold = avgItemAccuracy >= 95;
  if (passesThreshold) {
    console.log('✅ PASS - AI extraction meets 95%+ accuracy target!');
    console.log('   Ready for production use with manual review of flagged items.');
  } else if (avgItemAccuracy >= 90) {
    console.log('⚠️  CLOSE - AI extraction is 90-95% accurate.');
    console.log('   Needs minor prompt improvements before production.');
  } else {
    console.log('❌ FAIL - AI extraction below 90% accuracy.');
    console.log('   Requires significant prompt engineering or alternative approach.');
  }

  return report;
}

/**
 * Save report to file
 */
async function saveReport(report, outputPath) {
  await fs.writeFile(outputPath, JSON.stringify(report, null, 2), 'utf8');
  console.log('');
  console.log(`📄 Detailed report saved to: ${outputPath}`);
}

// Main execution
if (require.main === module) {
  const groundTruthPath = process.argv[2];
  const aiExtractionPath = process.argv[3];

  if (!groundTruthPath || !aiExtractionPath) {
    console.error('Usage: node measureExtractionAccuracy.js <ground_truth_file> <ai_extraction_file>');
    console.error('');
    console.error('Example:');
    console.error('  node backend/scripts/measureExtractionAccuracy.js \\');
    console.error('    test_data/ground_truth/FGLNG-S-60-PIP-MTO-0001_A_09-16_updated_ground_truth.json \\');
    console.error('    test_data/ai_extraction_results/FGLNG-S-60-PIP-MTO-0001_A_09-16_updated_extraction.json');
    process.exit(1);
  }

  measureAccuracy(
    path.resolve(groundTruthPath),
    path.resolve(aiExtractionPath)
  )
    .then(report => {
      const outputPath = path.join(
        path.dirname(aiExtractionPath),
        `${path.basename(aiExtractionPath, '.json')}_accuracy_report.json`
      );
      return saveReport(report, outputPath);
    })
    .then(() => {
      console.log('');
      console.log('✅ Accuracy measurement complete!');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Error:', error.message);
      console.error(error.stack);
      process.exit(1);
    });
}

module.exports = { measureAccuracy, compareItems, areEquivalent };
