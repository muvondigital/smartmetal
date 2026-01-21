/**
 * Commercial Page Selection Service
 *
 * Reduces DI API calls by pre-selecting likely line-item pages
 * based on cheap PDF text extraction and keyword/numeric density scoring.
 *
 * ALGORITHM:
 * 1. Extract raw text from each page (using pdf-lib + basic parsing)
 * 2. Score each page:
 *    - Keyword match score (ITEM, QTY, DESCRIPTION, etc.)
 *    - Numeric density (% of non-whitespace chars that are digits)
 *    - Tabular structure indicators (aligned columns, cell patterns)
 * 3. Select high-scoring pages + buffer pages around clusters
 * 4. Return page list for DI processing
 */

const { PDFDocument } = require('pdf-lib');

/**
 * Commercial keywords that indicate line-item tables
 */
const COMMERCIAL_KEYWORDS = [
  // Column headers
  'item', 'qty', 'quantity', 'description', 'material', 'size', 'schedule',
  'grade', 'spec', 'unit price', 'amount', 'line', 'pos', 'position',
  'part number', 'sku', 'product code', 'mto',
  // Common technical terms
  'pipe', 'valve', 'flange', 'fitting', 'bolt', 'gasket', 'stud', 'nut',
  'elbow', 'tee', 'reducer', 'coupling', 'cap', 'plug',
  // Standards
  'asme', 'ansi', 'astm', 'api', 'din', 'iso', 'en',
  // Units
  'pcs', 'ea', 'each', 'set', 'lot', 'meter', 'metre', 'kg', 'lb',
  // Dimensions
  'dn', 'nps', 'inch', 'mm', 'diameter', 'thickness', 'length',
];

/**
 * Page scoring weights
 */
const SCORING_WEIGHTS = {
  keywordMatch: 0.4,      // Weight for keyword density
  numericDensity: 0.3,    // Weight for numeric content
  tabularStructure: 0.3,  // Weight for table-like patterns
};

/**
 * Scoring thresholds
 */
const THRESHOLDS = {
  minScore: 0.70,           // Minimum score to consider a page commercial (conservative)
  bufferPages: 2,           // Pages to include before/after high-scoring clusters
  maxSelectedPages: 15,     // Maximum pages to select (cost control)
  minConfidence: 0.75,      // Minimum avg score to enable page selection (high bar)
};

/**
 * Extract text content from a single PDF page
 *
 * Note: pdf-lib doesn't have built-in text extraction, so we use a simple approach:
 * - Load the page
 * - Get the page content stream (if available)
 * - Extract basic text (this is limited, but sufficient for scoring)
 *
 * For production, consider using pdf-parse or pdfjs-dist for better text extraction.
 * For now, we'll use a simplified approach that works with pdf-lib.
 *
 * @param {PDFDocument} pdfDoc - Loaded PDF document
 * @param {number} pageIndex - Zero-based page index
 * @returns {Promise<string>} Extracted text (may be partial)
 */
async function extractPageText(pdfDoc, pageIndex) {
  try {
    const page = pdfDoc.getPage(pageIndex);

    // pdf-lib doesn't have native text extraction
    // We'll use a workaround: serialize the page and look for text operators
    // This is a simplified approach - in production, use pdf-parse or pdfjs-dist

    // For now, return empty string - we'll implement proper extraction next
    // TODO: Implement proper text extraction using pdf-parse
    return '';
  } catch (error) {
    console.error(`[PAGE_SELECTION] Failed to extract text from page ${pageIndex + 1}: ${error.message}`);
    return '';
  }
}

/**
 * Calculate keyword match score for page text
 * @param {string} text - Page text content (lowercased)
 * @returns {number} Score between 0 and 1
 */
function scoreKeywordMatch(text) {
  if (!text || text.length === 0) return 0;

  const lowerText = text.toLowerCase();
  let matchCount = 0;

  for (const keyword of COMMERCIAL_KEYWORDS) {
    if (lowerText.includes(keyword)) {
      matchCount++;
    }
  }

  // Normalize: cap at 15 keywords for 1.0 score
  const normalizedScore = Math.min(matchCount / 15, 1.0);
  return normalizedScore;
}

/**
 * Calculate numeric density score for page text
 * @param {string} text - Page text content
 * @returns {number} Score between 0 and 1
 */
function scoreNumericDensity(text) {
  if (!text || text.length === 0) return 0;

  // Remove whitespace for density calculation
  const nonWhitespace = text.replace(/\s/g, '');
  if (nonWhitespace.length === 0) return 0;

  // Count digits
  const digitCount = (nonWhitespace.match(/\d/g) || []).length;
  const density = digitCount / nonWhitespace.length;

  // Normalize: 20% digits = 1.0 score (line-item tables are usually 15-30% numeric)
  const normalizedScore = Math.min(density / 0.20, 1.0);
  return normalizedScore;
}

/**
 * Calculate tabular structure score for page text
 * Looks for patterns that indicate table-like layout
 * @param {string} text - Page text content
 * @returns {number} Score between 0 and 1
 */
function scoreTabularStructure(text) {
  if (!text || text.length === 0) return 0;

  const lines = text.split('\n').filter(line => line.trim().length > 0);
  if (lines.length < 3) return 0;

  let score = 0;

  // Indicator 1: Multiple aligned columns (repeated tab/space patterns)
  const tabLines = lines.filter(line => line.includes('\t') || /\s{3,}/.test(line)).length;
  const alignmentScore = tabLines / lines.length;
  score += alignmentScore * 0.4;

  // Indicator 2: Lines with similar structure (similar character counts)
  const lineLengths = lines.map(l => l.length);
  const avgLength = lineLengths.reduce((a, b) => a + b, 0) / lineLengths.length;
  const similarLengthLines = lineLengths.filter(len => Math.abs(len - avgLength) < avgLength * 0.3).length;
  const consistencyScore = similarLengthLines / lineLengths.length;
  score += consistencyScore * 0.3;

  // Indicator 3: Presence of cell separators (|, multiple spaces, tabs)
  const separatorLines = lines.filter(line =>
    line.includes('|') || /\s{4,}/.test(line) || line.split('\t').length > 2
  ).length;
  const separatorScore = separatorLines / lines.length;
  score += separatorScore * 0.3;

  return Math.min(score, 1.0);
}

/**
 * Score a single page for commercial content
 * @param {string} pageText - Extracted page text
 * @param {number} pageNumber - 1-based page number (for logging)
 * @returns {Object} Score breakdown and total
 */
function scorePage(pageText, pageNumber) {
  const keywordScore = scoreKeywordMatch(pageText);
  const numericScore = scoreNumericDensity(pageText);
  const tabularScore = scoreTabularStructure(pageText);

  const totalScore =
    keywordScore * SCORING_WEIGHTS.keywordMatch +
    numericScore * SCORING_WEIGHTS.numericDensity +
    tabularScore * SCORING_WEIGHTS.tabularStructure;

  return {
    pageNumber,
    keywordScore,
    numericScore,
    tabularScore,
    totalScore,
    selected: false, // Will be set during selection phase
  };
}

/**
 * Identify page clusters and add buffer pages
 * @param {Array<Object>} scoredPages - Pages with scores
 * @param {number} bufferSize - Pages to include before/after clusters
 * @returns {Set<number>} Set of page numbers to include
 */
function selectPagesWithClusters(scoredPages, bufferSize = THRESHOLDS.bufferPages) {
  const selectedPages = new Set();

  // First pass: select high-scoring pages
  const highScoringPages = scoredPages
    .filter(p => p.totalScore >= THRESHOLDS.minScore)
    .sort((a, b) => b.totalScore - a.totalScore);

  for (const page of highScoringPages) {
    selectedPages.add(page.pageNumber);
  }

  // Second pass: add buffer pages around clusters
  const sortedPageNumbers = Array.from(selectedPages).sort((a, b) => a - b);
  const bufferedPages = new Set(selectedPages);

  for (const pageNum of sortedPageNumbers) {
    // Add buffer pages before and after
    for (let offset = -bufferSize; offset <= bufferSize; offset++) {
      const bufferPage = pageNum + offset;
      if (bufferPage >= 1 && bufferPage <= scoredPages.length) {
        bufferedPages.add(bufferPage);
      }
    }
  }

  return bufferedPages;
}

/**
 * Select likely commercial pages from a PDF
 *
 * @param {Buffer} pdfBuffer - PDF file buffer
 * @param {number} totalPages - Total page count (from getPdfPageCount)
 * @returns {Promise<Object>} Selection result
 *   - selectedPages: Array<number> - 1-based page numbers to process
 *   - confidence: number - Average score of selected pages (0-1)
 *   - enabled: boolean - Whether page selection was enabled
 *   - allScores: Array<Object> - Detailed scores for all pages (for debugging)
 */
async function selectCommercialPages(pdfBuffer, totalPages) {
  const startTime = Date.now();

  console.log(`[PAGE_SELECTION] Starting page selection for ${totalPages} pages`);

  try {
    // Load PDF document
    const pdfDoc = await PDFDocument.load(pdfBuffer, {
      ignoreEncryption: true,
      updateMetadata: false
    });

    const pageCount = pdfDoc.getPageCount();

    if (pageCount !== totalPages) {
      console.warn(`[PAGE_SELECTION] Page count mismatch: expected ${totalPages}, got ${pageCount}`);
    }

    // TEMPORARY: Since pdf-lib doesn't have text extraction,
    // we'll use a fallback approach - just score based on page position heuristics
    // In the next iteration, we'll add pdf-parse for proper text extraction

    const scoredPages = [];

    // Heuristic: Appendix/MTO pages are usually in the second half of the document
    // and commercial pages tend to cluster together
    for (let i = 0; i < pageCount; i++) {
      const pageNumber = i + 1;

      // Extract text (currently returns empty string - will implement properly)
      const pageText = await extractPageText(pdfDoc, i);

      // Score the page
      // Since we don't have text yet, use position heuristics
      // TODO: Replace with actual text-based scoring once we add pdf-parse
      const positionScore = calculatePositionHeuristic(pageNumber, pageCount);

      scoredPages.push({
        pageNumber,
        keywordScore: 0,
        numericScore: 0,
        tabularScore: 0,
        totalScore: positionScore,
        selected: false,
      });
    }

    // Select pages based on scores
    const selectedPageSet = selectPagesWithClusters(scoredPages, THRESHOLDS.bufferPages);

    // Mark selected pages
    scoredPages.forEach(page => {
      page.selected = selectedPageSet.has(page.pageNumber);
    });

    const selectedPages = Array.from(selectedPageSet).sort((a, b) => a - b);
    const selectedScores = scoredPages.filter(p => p.selected);
    const avgScore = selectedScores.length > 0
      ? selectedScores.reduce((sum, p) => sum + p.totalScore, 0) / selectedScores.length
      : 0;

    // Limit to max pages for cost control
    const finalSelectedPages = selectedPages.slice(0, THRESHOLDS.maxSelectedPages);
    const confidence = avgScore;

    // TEMPORARY: Disable page selection until we have proper text extraction
    // Currently using position heuristics which are not reliable enough
    // TODO: Enable once we add pdf-parse or pdfjs-dist for text extraction
    const enabled = false; // Was: confidence >= THRESHOLDS.minConfidence && finalSelectedPages.length <= THRESHOLDS.maxSelectedPages

    const elapsedMs = Date.now() - startTime;

    console.log(`[PAGE_SELECTION] { totalPages: ${totalPages}, scoredPages: ${scoredPages.length}, selectedPages: ${finalSelectedPages.length}, confidence: ${confidence.toFixed(3)}, enabled: ${enabled}, elapsed_ms: ${elapsedMs} }`);
    console.log(`[PAGE_SELECTION] Selected pages: [${finalSelectedPages.join(', ')}]`);

    return {
      selectedPages: finalSelectedPages,
      confidence,
      enabled,
      allScores: scoredPages,
      elapsedMs,
    };

  } catch (error) {
    console.error(`[PAGE_SELECTION] Failed to select pages: ${error.message}`);

    // Fallback: return all pages
    const allPages = Array.from({ length: totalPages }, (_, i) => i + 1);
    return {
      selectedPages: allPages,
      confidence: 0,
      enabled: false,
      allScores: [],
      elapsedMs: Date.now() - startTime,
      error: error.message,
    };
  }
}

/**
 * Calculate position-based heuristic score
 * Temporary scoring method until we implement proper text extraction
 *
 * @param {number} pageNumber - 1-based page number
 * @param {number} totalPages - Total page count
 * @returns {number} Score between 0 and 1
 */
function calculatePositionHeuristic(pageNumber, totalPages) {
  // Heuristic assumptions:
  // 1. Cover pages (first 3-5 pages) are usually low-value
  // 2. Appendix/MTO sections are usually in the second half
  // 3. Commercial tables tend to cluster together

  if (totalPages <= 5) {
    // For short PDFs, process everything
    return 0.8;
  }

  // Score based on position
  let score = 0;

  // Skip first 2 pages (likely cover/TOC)
  if (pageNumber <= 2) {
    score = 0.2;
  }
  // Middle section (pages 3 to 70%)
  else if (pageNumber <= Math.floor(totalPages * 0.7)) {
    score = 0.5;
  }
  // Second half (70% onwards) - likely appendix/MTO
  else {
    score = 0.9;
  }

  return score;
}

module.exports = {
  selectCommercialPages,
  scorePage,
  scoreKeywordMatch,
  scoreNumericDensity,
  scoreTabularStructure,
};
