/**
 * RealSamples Extraction Benchmark Replay Harness
 *
 * Runs extraction N times per file from RealSamples folder.
 * Captures stability, correctness, and commercial failure metrics.
 *
 * Usage: node backend/scripts/replayExtractionSuite.js [runs_per_file]
 * Example: node backend/scripts/replayExtractionSuite.js 5
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env.gcp') });
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const documentIntelligenceService = require('../src/services/gcp/documentAiService');

const REAL_SAMPLES_DIR = path.join(__dirname, '../../test_data/RealSamples');
const OUTPUT_DIR = path.join(__dirname, '../../test_data/benchmark_results');
const RUNS_PER_FILE = parseInt(process.argv[2] || '5', 10);

/**
 * Hash a set of values to detect schema/content changes
 */
function hashContent(obj) {
  if (!obj) return 'null';
  const str = JSON.stringify(obj, Object.keys(obj).sort());
  return crypto.createHash('md5').update(str).digest('hex').substring(0, 8);
}

/**
 * Commercial sanity check
 */
function evaluateRun(extracted, runMeta) {
  const failures = [];
  const warnings = [];

  const items = extracted.items || [];
  const itemsCount = items.length;
  const metadata = extracted.metadata || {};

  // HARD FAILURES
  // 1. Table detected but no items extracted
  if (runMeta.table_detected && itemsCount === 0) {
    failures.push('FAIL: table_detected=true but items_count=0');
  }

  // 2. Metadata-only output (no items after retries)
  if (itemsCount === 0 && Object.keys(metadata).length > 0) {
    failures.push('FAIL: metadata-only output (no items extracted)');
  }

  // 3. Missing required top-level keys
  const hasItemsOrSections = extracted.items || extracted.sections || extracted.mto_structure;
  if (!hasItemsOrSections) {
    failures.push('FAIL: missing required keys (items, sections, or mto_structure)');
  }

  // WARNINGS
  // 1. High % of null quantities
  if (itemsCount > 0) {
    const nullQtyCount = items.filter(item => !item.quantity || item.quantity === null).length;
    const nullQtyPct = (nullQtyCount / itemsCount) * 100;
    if (nullQtyPct > 20) {
      warnings.push(`WARN: ${nullQtyPct.toFixed(1)}% items have null quantity`);
    }
  }

  // 2. Pipe-like rows with null unit
  const pipeDescriptions = items.filter(item => {
    const desc = (item.description || '').toLowerCase();
    return desc.includes('pipe') || desc.includes('tube') || desc.includes('elbow');
  });
  if (pipeDescriptions.length > 0) {
    const nullUnitCount = pipeDescriptions.filter(item => !item.unit || item.unit === null).length;
    if (nullUnitCount > 0) {
      warnings.push(`WARN: ${nullUnitCount} pipe-like items have null unit`);
    }
  }

  // 3. Duplicate item numbers (when present)
  const itemNumbers = items
    .map(item => item.line_number || item.item_number)
    .filter(num => num !== null && num !== undefined);

  const uniqueItemNumbers = new Set(itemNumbers);
  if (itemNumbers.length > 0 && uniqueItemNumbers.size < itemNumbers.length) {
    const duplicateCount = itemNumbers.length - uniqueItemNumbers.size;
    warnings.push(`WARN: ${duplicateCount} duplicate item numbers detected`);
  }

  return {
    pass: failures.length === 0,
    failures,
    warnings
  };
}

/**
 * Extract one file once
 */
async function extractOnce(filePath, fileName, runIndex) {
  const fileBuffer = await fs.readFile(filePath);
  const fileExt = fileName.split('.').pop().toLowerCase();
  const fileType = ['pdf', 'xlsx', 'xls'].includes(fileExt) ? fileExt : 'pdf';

  const startTime = Date.now();

  try {
    const extracted = await documentIntelligenceService.parseRFQDocument(fileBuffer, fileType, {
      forceMtoExtraction: false,
      forceSimpleRfq: false
    });

    const endTime = Date.now();
    const timeMs = endTime - startTime;

    const items = extracted.items || [];
    const itemsCount = items.length;

    // Detect if table was found
    const tableDetected = extracted.raw_data?.tables?.length > 0 || false;
    const tableRowCount = tableDetected
      ? extracted.raw_data.tables.reduce((sum, t) => sum + (t.rows?.length || t.rowCount || 0), 0)
      : 0;

    // Schema signature (top-level + item keys)
    const topLevelKeys = Object.keys(extracted).sort();
    const itemKeys = itemsCount > 0 ? Object.keys(items[0]).sort() : [];
    const schemaSignatureHash = hashContent({ topLevelKeys, itemKeys });

    // Item identity hash (stable identifier set)
    const itemIdentifiers = items.map(item => ({
      line: item.line_number || item.item_number,
      desc: (item.description || '').substring(0, 50),
      qty: item.quantity,
      unit: item.unit
    }));
    const itemIdentityHash = hashContent(itemIdentifiers);

    // Retries/validation metadata
    const retriesUsed = extracted._debug?.retries || 0;
    const validationFailures = extracted.validation_issues?.length || 0;

    const evaluation = evaluateRun(extracted, { table_detected: tableDetected });

    return {
      filename: fileName,
      run_index: runIndex,
      doc_type: extracted.document_type || 'UNKNOWN',
      table_detected: tableDetected,
      table_row_count: tableRowCount,
      items_count: itemsCount,
      retries_used: retriesUsed,
      validation_failures_count: validationFailures,
      warnings_count: evaluation.warnings.length,
      time_ms: timeMs,
      schema_signature_hash: schemaSignatureHash,
      item_identity_hash: itemIdentityHash,
      pass: evaluation.pass,
      failures: evaluation.failures,
      warnings: evaluation.warnings,
      error: null
    };
  } catch (error) {
    const endTime = Date.now();
    const timeMs = endTime - startTime;

    return {
      filename: fileName,
      run_index: runIndex,
      doc_type: 'ERROR',
      table_detected: false,
      table_row_count: 0,
      items_count: 0,
      retries_used: 0,
      validation_failures_count: 0,
      warnings_count: 0,
      time_ms: timeMs,
      schema_signature_hash: 'error',
      item_identity_hash: 'error',
      pass: false,
      failures: [`EXCEPTION: ${error.message}`],
      warnings: [],
      error: error.message
    };
  }
}

/**
 * Run benchmark on all files
 */
async function runBenchmark() {
  console.log('═'.repeat(80));
  console.log('RealSamples Extraction Benchmark');
  console.log('═'.repeat(80));
  console.log(`Samples Directory: ${REAL_SAMPLES_DIR}`);
  console.log(`Runs per file: ${RUNS_PER_FILE}`);
  console.log('');

  // Create output directory
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  // Get all files
  const allFiles = await fs.readdir(REAL_SAMPLES_DIR);
  const testFiles = allFiles.filter(f =>
    f.endsWith('.pdf') || f.endsWith('.xlsx') || f.endsWith('.xls')
  );

  console.log(`Found ${testFiles.length} files to test\n`);

  // Run extractions
  const allRuns = [];

  for (const fileName of testFiles) {
    console.log(`\n📄 ${fileName}`);
    console.log('─'.repeat(80));

    const filePath = path.join(REAL_SAMPLES_DIR, fileName);

    for (let runIndex = 0; runIndex < RUNS_PER_FILE; runIndex++) {
      process.stdout.write(`  Run ${runIndex + 1}/${RUNS_PER_FILE}... `);

      const result = await extractOnce(filePath, fileName, runIndex);
      allRuns.push(result);

      const statusIcon = result.pass ? '✅' : '❌';
      console.log(`${statusIcon} ${result.items_count} items (${result.time_ms}ms)`);

      if (result.failures.length > 0) {
        result.failures.forEach(f => console.log(`    ${f}`));
      }
      if (result.warnings.length > 0) {
        result.warnings.forEach(w => console.log(`    ${w}`));
      }
    }
  }

  // Save raw results
  const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
  const rawOutputPath = path.join(OUTPUT_DIR, `benchmark_raw_${timestamp}.jsonl`);

  await fs.writeFile(
    rawOutputPath,
    allRuns.map(r => JSON.stringify(r)).join('\n'),
    'utf8'
  );

  console.log(`\n\n💾 Raw results saved: ${rawOutputPath}\n`);

  // Generate summary statistics
  const fileStats = {};

  for (const run of allRuns) {
    if (!fileStats[run.filename]) {
      fileStats[run.filename] = {
        runs: [],
        pass_count: 0,
        fail_count: 0
      };
    }

    fileStats[run.filename].runs.push(run);
    if (run.pass) {
      fileStats[run.filename].pass_count++;
    } else {
      fileStats[run.filename].fail_count++;
    }
  }

  // Calculate stability metrics
  const summary = {
    total_files: testFiles.length,
    total_runs: allRuns.length,
    runs_per_file: RUNS_PER_FILE,
    overall_pass_count: allRuns.filter(r => r.pass).length,
    overall_fail_count: allRuns.filter(r => !r.pass).length,
    files_stable: 0,
    files_unstable: 0,
    files_failing: 0,
    file_details: []
  };

  for (const [fileName, stats] of Object.entries(fileStats)) {
    const itemCounts = stats.runs.map(r => r.items_count);
    const minItems = Math.min(...itemCounts);
    const maxItems = Math.max(...itemCounts);
    const avgItems = itemCounts.reduce((a, b) => a + b, 0) / itemCounts.length;
    const itemCountVariance = maxItems - minItems;

    const schemaHashes = new Set(stats.runs.map(r => r.schema_signature_hash));
    const identityHashes = new Set(stats.runs.map(r => r.item_identity_hash));

    const isStable = itemCountVariance <= 2 && schemaHashes.size === 1;
    const isFailing = stats.fail_count === RUNS_PER_FILE;
    const isUnstable = !isStable && !isFailing;

    if (isStable) summary.files_stable++;
    if (isUnstable) summary.files_unstable++;
    if (isFailing) summary.files_failing++;

    const allFailures = stats.runs.flatMap(r => r.failures);
    const allWarnings = stats.runs.flatMap(r => r.warnings);
    const uniqueFailures = [...new Set(allFailures)];
    const uniqueWarnings = [...new Set(allWarnings)];

    summary.file_details.push({
      filename: fileName,
      pass_count: stats.pass_count,
      fail_count: stats.fail_count,
      min_items: minItems,
      max_items: maxItems,
      avg_items: avgItems.toFixed(1),
      item_count_variance: itemCountVariance,
      schema_variants: schemaHashes.size,
      identity_variants: identityHashes.size,
      status: isFailing ? 'FAILING' : isUnstable ? 'UNSTABLE' : 'STABLE',
      unique_failures: uniqueFailures,
      unique_warnings: uniqueWarnings
    });
  }

  // Sort by status (FAILING first, then UNSTABLE, then STABLE)
  summary.file_details.sort((a, b) => {
    const statusOrder = { FAILING: 0, UNSTABLE: 1, STABLE: 2 };
    return statusOrder[a.status] - statusOrder[b.status];
  });

  // Generate markdown report
  const reportLines = [];
  reportLines.push('# RealSamples Extraction Benchmark Report');
  reportLines.push('');
  reportLines.push(`**Generated:** ${new Date().toISOString()}`);
  reportLines.push(`**Runs per file:** ${RUNS_PER_FILE}`);
  reportLines.push('');

  reportLines.push('## Summary');
  reportLines.push('');
  reportLines.push(`- **Total files tested:** ${summary.total_files}`);
  reportLines.push(`- **Total runs:** ${summary.total_runs}`);
  reportLines.push(`- **Overall pass rate:** ${summary.overall_pass_count}/${summary.total_runs} (${((summary.overall_pass_count / summary.total_runs) * 100).toFixed(1)}%)`);
  reportLines.push('');
  reportLines.push('### File Stability');
  reportLines.push('');
  reportLines.push(`- ✅ **Stable files:** ${summary.files_stable} (consistent items count, no failures)`);
  reportLines.push(`- ⚠️  **Unstable files:** ${summary.files_unstable} (varying items count or occasional failures)`);
  reportLines.push(`- ❌ **Failing files:** ${summary.files_failing} (all runs failed)`);
  reportLines.push('');

  reportLines.push('## Per-File Results');
  reportLines.push('');

  for (const detail of summary.file_details) {
    const statusIcon = detail.status === 'STABLE' ? '✅' : detail.status === 'UNSTABLE' ? '⚠️' : '❌';

    reportLines.push(`### ${statusIcon} ${detail.filename}`);
    reportLines.push('');
    reportLines.push(`**Status:** ${detail.status}`);
    reportLines.push(`**Pass rate:** ${detail.pass_count}/${RUNS_PER_FILE}`);
    reportLines.push(`**Items extracted:** min=${detail.min_items}, max=${detail.max_items}, avg=${detail.avg_items}, variance=${detail.item_count_variance}`);
    reportLines.push(`**Schema variants:** ${detail.schema_variants} (should be 1 for stability)`);
    reportLines.push(`**Identity variants:** ${detail.identity_variants} (should be 1 for stability)`);
    reportLines.push('');

    if (detail.unique_failures.length > 0) {
      reportLines.push('**Failures:**');
      detail.unique_failures.forEach(f => reportLines.push(`- ${f}`));
      reportLines.push('');
    }

    if (detail.unique_warnings.length > 0) {
      reportLines.push('**Warnings:**');
      detail.unique_warnings.forEach(w => reportLines.push(`- ${w}`));
      reportLines.push('');
    }
  }

  reportLines.push('## Top Failure Patterns');
  reportLines.push('');

  const allFailures = allRuns.flatMap(r => r.failures);
  const failureCounts = {};
  allFailures.forEach(f => {
    failureCounts[f] = (failureCounts[f] || 0) + 1;
  });

  const topFailures = Object.entries(failureCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  if (topFailures.length > 0) {
    topFailures.forEach(([failure, count]) => {
      reportLines.push(`- **${count}x** ${failure}`);
    });
  } else {
    reportLines.push('No failures detected! 🎉');
  }
  reportLines.push('');

  reportLines.push('## Top Warning Patterns');
  reportLines.push('');

  const allWarnings = allRuns.flatMap(r => r.warnings);
  const warningCounts = {};
  allWarnings.forEach(w => {
    warningCounts[w] = (warningCounts[w] || 0) + 1;
  });

  const topWarnings = Object.entries(warningCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  if (topWarnings.length > 0) {
    topWarnings.forEach(([warning, count]) => {
      reportLines.push(`- **${count}x** ${warning}`);
    });
  } else {
    reportLines.push('No warnings detected! 🎉');
  }
  reportLines.push('');

  reportLines.push('## Example Output Shape');
  reportLines.push('');

  // Find first successful run
  const successfulRun = allRuns.find(r => r.pass && r.items_count > 0);
  if (successfulRun) {
    const exampleFilePath = path.join(REAL_SAMPLES_DIR, successfulRun.filename);
    const exampleBuffer = await fs.readFile(exampleFilePath);
    const fileExt = successfulRun.filename.split('.').pop().toLowerCase();
    const fileType = ['pdf', 'xlsx', 'xls'].includes(fileExt) ? fileExt : 'pdf';

    const exampleExtraction = await documentIntelligenceService.parseRFQDocument(exampleBuffer, fileType, {});

    reportLines.push(`**File:** ${successfulRun.filename}`);
    reportLines.push('');
    reportLines.push('**Top-level keys:**');
    reportLines.push('```json');
    reportLines.push(JSON.stringify(Object.keys(exampleExtraction).sort(), null, 2));
    reportLines.push('```');
    reportLines.push('');

    if (exampleExtraction.items && exampleExtraction.items.length > 0) {
      reportLines.push('**Item keys (first item):**');
      reportLines.push('```json');
      reportLines.push(JSON.stringify(Object.keys(exampleExtraction.items[0]).sort(), null, 2));
      reportLines.push('```');
      reportLines.push('');
    }
  }

  reportLines.push('---');
  reportLines.push('');
  reportLines.push(`**Raw data:** ${path.basename(rawOutputPath)}`);

  const reportPath = path.join(OUTPUT_DIR, 'RealSamples_Extraction_Benchmark.md');
  await fs.writeFile(reportPath, reportLines.join('\n'), 'utf8');

  console.log(`📊 Benchmark report: ${reportPath}\n`);

  // Print summary to console
  console.log('═'.repeat(80));
  console.log('BENCHMARK SUMMARY');
  console.log('═'.repeat(80));
  console.log(`Files tested: ${summary.total_files}`);
  console.log(`Total runs: ${summary.total_runs}`);
  console.log(`Pass rate: ${summary.overall_pass_count}/${summary.total_runs} (${((summary.overall_pass_count / summary.total_runs) * 100).toFixed(1)}%)`);
  console.log('');
  console.log(`✅ Stable files: ${summary.files_stable}`);
  console.log(`⚠️  Unstable files: ${summary.files_unstable}`);
  console.log(`❌ Failing files: ${summary.files_failing}`);
  console.log('');

  if (summary.files_failing > 0) {
    console.log('Top failing files:');
    summary.file_details
      .filter(d => d.status === 'FAILING')
      .slice(0, 5)
      .forEach(d => {
        console.log(`  ❌ ${d.filename}`);
        d.unique_failures.forEach(f => console.log(`     ${f}`));
      });
    console.log('');
  }

  return summary;
}

// Main execution
if (require.main === module) {
  runBenchmark()
    .then((summary) => {
      const exitCode = summary.files_failing > 0 ? 1 : 0;
      process.exit(exitCode);
    })
    .catch((error) => {
      console.error('\n❌ Benchmark failed:', error);
      console.error(error.stack);
      process.exit(1);
    });
}

module.exports = { runBenchmark, extractOnce };
