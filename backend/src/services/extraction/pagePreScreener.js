/**
 * Intelligent Page Pre-Screening Service
 *
 * Mimics human behavior: quickly scan document and identify pages
 * that likely contain line items, before running expensive OCR.
 *
 * Strategy:
 * 1. Fast PDF text extraction (no OCR, <2 seconds)
 * 2. Score each page based on:
 *    - Keyword density (Item, Qty, Description, etc.)
 *    - Numeric density (tables have lots of numbers)
 *    - Tabular structure hints (aligned columns)
 *    - Negative signals (VDRL, specifications, etc.)
 * 3. Select high-scoring pages + buffer pages
 * 4. Return page list for targeted OCR
 *
 * Benefits:
 * - 70-90% reduction in OCR processing time
 * - 50-80% reduction in AI API costs
 * - Automatic (no manual page selection)
 */

const fs = require('fs');
const pdfParse = require('pdf-parse');

/**
 * Scoring configuration
 */
const SCORING_CONFIG = {
  // Positive signals (weights)
  KEYWORD_WEIGHT: 40,
  NUMERIC_DENSITY_WEIGHT: 30,
  TABULAR_STRUCTURE_WEIGHT: 20,
  ROW_COUNT_WEIGHT: 10,

  // Thresholds
  MIN_PAGE_SCORE: 75,      // INCREASED: Only select pages with strong NSC signals (was 50)
  MIN_KEYWORD_MATCHES: 5,  // Minimum keyword matches for bonus
  MIN_NUMERIC_DENSITY: 0.15, // 15% of text should be numbers

  // Buffer configuration
  BUFFER_PAGES_BEFORE: 1,  // Include N pages before high-scoring page
  BUFFER_PAGES_AFTER: 2,   // Include N pages after high-scoring page

  // Safety limits
  MAX_SELECTED_PAGES: 30,  // Maximum pages to select (cost control)
};

/**
 * NSC-SPECIFIC INTELLIGENCE: Keywords that NSC cares about
 * This teaches the system "what's important to NSC" before scanning
 * 
 * Enhanced with comprehensive patterns from NSC quotation analysis.
 * Source: backend/src/ai/intelligence/nscPatternIntelligence.js
 */
const nscPatternIntelligence = require('../../ai/intelligence/nscPatternIntelligence');

const NSC_BUSINESS_INTELLIGENCE = {
  // What NSC sells (CRITICAL - highest priority)
  // Enhanced with comprehensive item types from NSC quotations
  CORE_PRODUCTS: [
    // Pipes and Tubulars
    'pipe', 'pipa', 'tube', 'tubular',
    // Fittings
    'elbow', 'tee', 'reducer', 'coupling', 'cap', 'plug', 'nipple',
    // Flanges
    'flange', 'blind flange', 'welding neck', 'wn flange',
    // Valves
    'valve', 'ball valve', 'gate valve', 'check valve', 'butterfly valve',
    // Structural
    'beam', 'hea', 'heb', 'plate', 'sheet',
    // Fasteners
    'bolt', 'stud bolt', 'gasket', 'nut', 'stud',
  ],

  // How NSC describes items (CRITICAL - table headers)
  COLUMN_HEADERS: [
    'item', 'qty', 'quantity', 'description', 'material',
    'size', 'spec', 'specification', 'schedule', 'grade',
    'unit price', 'amount', 'line', 'pos', 'position',
  ],

  // NSC's material standards (HIGH priority)
  // Enhanced with materials from actual NSC quotations
  MATERIAL_STANDARDS: [
    // Standards organizations
    'asme', 'ansi', 'astm', 'api', 'mss', 'bs', 'din', 'iso', 'en',
    // Carbon steel grades (from quotations)
    'a105', 'a106', 'a234', 'a350', 'a694', 'a53', 'api 5l',
    'gr.b', 'gr.a', 'wpb', 'wpc', 'lf2',
    // Stainless steel grades
    'a182', 'a312', 'a403', 'a240', '316l', '304l', '316', '304',
    // Alloys (from quotations)
    'inconel', 'monel', 'monel 400', 'hastelloy',
    'incoloy', 'incoloy 825',
    'duplex', 'super duplex', 's32205', 's31803', 's32750',
    'a790', 'a815', 'uns s32205',
    // European standards (from quotations)
    'en10210', 'en10225', 's355', 's355 k2h', 's355 mlo',
  ],

  // NSC's unit language (MEDIUM priority)
  UNITS_OF_MEASURE: [
    'pcs', 'ea', 'each', 'set', 'lot', 'meter', 'metre', 'mtr',
    'kg', 'ton', 'tonne', 'length', 'm2', 'm²', 'sqm',
  ],

  // NSC's dimensional language (MEDIUM priority)
  DIMENSIONS: [
    'dn', 'nps', 'inch', 'mm', 'diameter', 'thickness', 'od', 'id',
    'sch', 'schedule', 'class', 'rating', 'pressure', 'temperature',
  ],
};

/**
 * Combined keywords (flatten for backward compatibility)
 */
const LINE_ITEM_KEYWORDS = [
  ...NSC_BUSINESS_INTELLIGENCE.COLUMN_HEADERS,
  ...NSC_BUSINESS_INTELLIGENCE.CORE_PRODUCTS,
  ...NSC_BUSINESS_INTELLIGENCE.MATERIAL_STANDARDS,
  ...NSC_BUSINESS_INTELLIGENCE.UNITS_OF_MEASURE,
  ...NSC_BUSINESS_INTELLIGENCE.DIMENSIONS,
];

/**
 * Negative keywords (pages to avoid)
 */
const NEGATIVE_KEYWORDS = [
  'vendor data requirement', 'vdrl', 'document list',
  'revision history', 'approval matrix', 'transmittal',
  'table of contents', 'reference documents',
];

/**
 * Page Pre-Screening Service
 */
class PagePreScreener {
  /**
   * Analyze PDF and identify pages likely to contain line items
   * Uses SMART SCANNING STRATEGIES (not sequential - optimized for 100+ page docs)
   * @param {string} pdfPath - Path to PDF file
   * @param {object} options - Configuration options
   * @returns {Promise<object>} Pre-screening results
   */
  async identifyLineItemPages(pdfPath, options = {}) {
    const startTime = Date.now();

    console.log('🔍 [PAGE_PRESCREENER] Starting intelligent page detection...');

    // Step 1: Extract text from PDF (fast, no OCR)
    // This is FAST: ~50-100ms per page, so 100 pages = 5-10 seconds total
    const pdfData = await this.extractPdfText(pdfPath);

    console.log(`📄 [PAGE_PRESCREENER] Extracted text from ${pdfData.numpages} pages (${Date.now() - startTime}ms)`);

    // OPTIMIZATION: For large documents (>50 pages), use smart sampling first
    let pageScores;
    if (pdfData.numpages > 50 && options.enableSmartSampling !== false) {
      console.log('📊 [PAGE_PRESCREENER] Large document detected, using smart sampling...');
      pageScores = this.smartSampleAndScore(pdfData);
    } else {
      // Step 2: Score each page (for smaller docs, score all pages)
      pageScores = this.scoreAllPages(pdfData);
    }

    // Step 3: Select candidate pages
    const candidatePages = this.selectCandidatePages(pageScores, options);

    // Step 4: Add buffer pages
    const bufferedPages = this.addBufferPages(candidatePages, pdfData.numpages);

    const timing = Date.now() - startTime;

    const result = {
      pages: bufferedPages,
      scores: pageScores,
      timing,
      totalPages: pdfData.numpages,
      selectedPages: bufferedPages.length,
      compressionRatio: (1 - bufferedPages.length / pdfData.numpages) * 100,
    };

    console.log(`✅ [PAGE_PRESCREENER] Pre-screening complete (${timing}ms)`);
    console.log(`   Selected ${result.selectedPages}/${result.totalPages} pages (${result.compressionRatio.toFixed(1)}% reduction)`);
    console.log(`   Pages: ${bufferedPages.join(', ')}`);

    return result;
  }

  /**
   * Smart sampling strategy for large documents (>50 pages)
   * Instead of scoring all pages, sample strategically and infer clusters
   *
   * Strategy:
   * 1. Skip first 5 pages (always specs/cover)
   * 2. Skip last 5 pages (often appendices)
   * 3. Sample every 5th page in the middle to find line-item clusters
   * 4. Once cluster found, score surrounding pages densely
   *
   * Example: 100-page doc
   * - Sample pages: 10, 15, 20, 25, 30, 35, ... 90, 95
   * - Find cluster at page 30 (high score)
   * - Then score pages 25-40 densely
   * - Return cluster pages
   *
   * This reduces scoring from 100 pages to ~30-40 pages = 70% faster
   *
   * @param {object} pdfData - PDF data from extractPdfText
   * @returns {Array<object>} Array of page scores (only scored pages)
   */
  smartSampleAndScore(pdfData) {
    const totalPages = pdfData.numpages;
    const scoredPages = [];

    // Step 1: Skip first/last 5 pages
    const skipFirst = 5;
    const skipLast = 5;
    const sampleInterval = 5;

    // Step 2: Sample every 5th page
    console.log(`   Sampling every ${sampleInterval}th page (skip first ${skipFirst}, last ${skipLast})...`);
    const samplePageNumbers = [];
    for (let pageNum = skipFirst + 1; pageNum <= totalPages - skipLast; pageNum += sampleInterval) {
      samplePageNumbers.push(pageNum);
    }

    // Step 3: Score sample pages
    for (const pageNum of samplePageNumbers) {
      const page = pdfData.pages[pageNum - 1]; // Zero-indexed
      if (page) {
        const score = this.scorePageForLineItems(page.text, pageNum);
        scoredPages.push({
          pageNumber: pageNum,
          score: score.total,
          reasons: score.reasons,
          signals: score.signals
        });
      }
    }

    // Step 4: Find high-scoring clusters
    const highScoringPages = scoredPages.filter(p => p.score >= SCORING_CONFIG.MIN_PAGE_SCORE);

    if (highScoringPages.length === 0) {
      console.log('   No high-scoring pages found in sample, scoring all pages...');
      return this.scoreAllPages(pdfData);
    }

    // Step 5: Identify cluster range (min to max high-scoring page)
    const clusterStart = Math.min(...highScoringPages.map(p => p.pageNumber));
    const clusterEnd = Math.max(...highScoringPages.map(p => p.pageNumber));

    console.log(`   Found line-item cluster: pages ${clusterStart}-${clusterEnd}`);

    // Step 6: Score cluster pages densely (all pages in cluster range)
    const clusterScores = [];
    for (let pageNum = clusterStart; pageNum <= clusterEnd; pageNum++) {
      // Skip if already scored
      if (scoredPages.some(p => p.pageNumber === pageNum)) {
        clusterScores.push(scoredPages.find(p => p.pageNumber === pageNum));
      } else {
        const page = pdfData.pages[pageNum - 1];
        if (page) {
          const score = this.scorePageForLineItems(page.text, pageNum);
          clusterScores.push({
            pageNumber: pageNum,
            score: score.total,
            reasons: score.reasons,
            signals: score.signals
          });
        }
      }
    }

    console.log(`   Scored ${clusterScores.length} pages in cluster (${((clusterScores.length / totalPages) * 100).toFixed(1)}% of document)`);

    return clusterScores;
  }

  /**
   * Extract text from PDF using pdf-parse (fast, no OCR)
   * @param {string} pdfPath - Path to PDF file
   * @returns {Promise<object>} PDF data with text per page
   */
  async extractPdfText(pdfPath) {
    const dataBuffer = fs.readFileSync(pdfPath);

    // Extract text with page-level granularity
    const data = await pdfParse(dataBuffer, {
      // We need page-level text, not just full document text
      // pdf-parse doesn't support this natively, so we'll use a workaround
      max: 0, // Parse all pages
    });

    // WORKAROUND: pdf-parse doesn't provide per-page text by default
    // We'll split the full text by page break markers (form feed)
    // This is approximate but sufficient for scoring
    const fullText = data.text;
    const pageTexts = fullText.split('\f'); // Form feed character = page break

    return {
      numpages: data.numpages,
      pages: pageTexts.map((text, idx) => ({
        pageNumber: idx + 1,
        text: text
      })),
      fullText: fullText
    };
  }

  /**
   * Score all pages for line-item likelihood
   * @param {object} pdfData - PDF data from extractPdfText
   * @returns {Array<object>} Array of page scores
   */
  scoreAllPages(pdfData) {
    return pdfData.pages.map(page => {
      const score = this.scorePageForLineItems(page.text, page.pageNumber);
      return {
        pageNumber: page.pageNumber,
        score: score.total,
        reasons: score.reasons,
        signals: score.signals
      };
    });
  }

  /**
   * Score a single page for line-item likelihood
   * @param {string} pageText - Text content of page
   * @param {number} pageNumber - Page number (for context)
   * @returns {object} Score breakdown
   */
  scorePageForLineItems(pageText, pageNumber) {
    const signals = {};
    const reasons = [];
    let score = 0;

    if (!pageText || pageText.trim().length === 0) {
      return { total: 0, reasons: ['empty_page'], signals };
    }

    const lowerText = pageText.toLowerCase();

    // ENHANCED: Use NSC pattern intelligence for better scoring
    const nscRelevance = nscPatternIntelligence.scoreNscRelevance(pageText);
    if (nscRelevance.isRelevant) {
      score += nscRelevance.score * 0.5; // Boost score with NSC intelligence
      reasons.push(`nsc_relevance: ${nscRelevance.score} (+${(nscRelevance.score * 0.5).toFixed(1)})`);
      signals.nscItemTypes = nscRelevance.signals.itemTypes;
      signals.nscMaterials = nscRelevance.signals.materials;
      if (nscRelevance.signals.negative.length > 0) {
        signals.nscNegative = nscRelevance.signals.negative;
      }
    }

    // SIGNAL 1: Keyword Density (40%)
    const keywordMatches = LINE_ITEM_KEYWORDS.filter(keyword =>
      lowerText.includes(keyword)
    ).length;

    signals.keywordMatches = keywordMatches;

    if (keywordMatches >= SCORING_CONFIG.MIN_KEYWORD_MATCHES) {
      const keywordScore = Math.min(SCORING_CONFIG.KEYWORD_WEIGHT, keywordMatches * 3);
      score += keywordScore;
      reasons.push(`keyword_density: ${keywordMatches} matches (+${keywordScore})`);
    }

    // SIGNAL 2: Numeric Density (30%)
    const numbers = pageText.match(/\d+/g) || [];
    const numericDensity = numbers.length / (pageText.length || 1);
    signals.numericDensity = numericDensity;

    if (numericDensity >= SCORING_CONFIG.MIN_NUMERIC_DENSITY) {
      const numericScore = SCORING_CONFIG.NUMERIC_DENSITY_WEIGHT;
      score += numericScore;
      reasons.push(`numeric_density: ${(numericDensity * 100).toFixed(1)}% (+${numericScore})`);
    }

    // SIGNAL 3: Tabular Structure (20%)
    const hasTabular = this.detectTabularStructure(pageText);
    signals.hasTabularStructure = hasTabular;

    if (hasTabular) {
      score += SCORING_CONFIG.TABULAR_STRUCTURE_WEIGHT;
      reasons.push(`tabular_structure (+${SCORING_CONFIG.TABULAR_STRUCTURE_WEIGHT})`);
    }

    // SIGNAL 4: Row Count (10%)
    const lines = pageText.split('\n').filter(line => line.trim().length > 0);
    signals.lineCount = lines.length;

    if (lines.length > 30) {
      score += SCORING_CONFIG.ROW_COUNT_WEIGHT;
      reasons.push(`high_row_count: ${lines.length} lines (+${SCORING_CONFIG.ROW_COUNT_WEIGHT})`);
    }

    // NEGATIVE SIGNALS: Reduce score for pages to avoid
    for (const negKeyword of NEGATIVE_KEYWORDS) {
      if (lowerText.includes(negKeyword)) {
        score -= 50;
        reasons.push(`negative_keyword: "${negKeyword}" (-50)`);
        signals.hasNegativeKeyword = true;
        break;
      }
    }

    // CONTEXT: First few pages are usually specs/cover
    if (pageNumber <= 3) {
      score -= 10;
      reasons.push('early_page_penalty (-10)');
    }

    return {
      total: Math.max(0, score), // Never negative
      reasons,
      signals
    };
  }

  /**
   * Detect tabular structure in text (aligned columns, repeated patterns)
   * @param {string} text - Page text
   * @returns {boolean} True if tabular structure detected
   */
  detectTabularStructure(text) {
    const lines = text.split('\n');

    // Heuristic: If many lines have similar spacing patterns, it's likely a table
    // Count lines with multiple consecutive spaces (column separators)
    const linesWithSpacing = lines.filter(line =>
      /\s{2,}/.test(line) // 2+ consecutive spaces
    ).length;

    const spacingRatio = linesWithSpacing / (lines.length || 1);

    // If >30% of lines have spacing patterns, likely a table
    return spacingRatio > 0.3;
  }

  /**
   * Select candidate pages based on scores
   * @param {Array<object>} pageScores - Array of page scores
   * @param {object} options - Configuration options
   * @returns {Array<number>} Selected page numbers
   */
  selectCandidatePages(pageScores, options = {}) {
    const minScore = options.minScore || SCORING_CONFIG.MIN_PAGE_SCORE;
    const maxPages = options.maxPages || SCORING_CONFIG.MAX_SELECTED_PAGES;

    // Filter by score threshold and sort by score descending
    const candidates = pageScores
      .filter(p => p.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxPages)
      .map(p => p.pageNumber);

    return candidates.sort((a, b) => a - b); // Return in page order
  }

  /**
   * Add buffer pages around selected pages (catch table overflow)
   * @param {Array<number>} selectedPages - Selected page numbers
   * @param {number} totalPages - Total number of pages in document
   * @returns {Array<number>} Selected pages + buffer pages
   */
  addBufferPages(selectedPages, totalPages) {
    if (selectedPages.length === 0) {
      return [];
    }

    const pageSet = new Set(selectedPages);

    // Add buffer pages before and after each selected page
    for (const pageNum of selectedPages) {
      // Add pages before
      for (let i = 1; i <= SCORING_CONFIG.BUFFER_PAGES_BEFORE; i++) {
        const bufferPage = pageNum - i;
        if (bufferPage >= 1) {
          pageSet.add(bufferPage);
        }
      }

      // Add pages after
      for (let i = 1; i <= SCORING_CONFIG.BUFFER_PAGES_AFTER; i++) {
        const bufferPage = pageNum + i;
        if (bufferPage <= totalPages) {
          pageSet.add(bufferPage);
        }
      }
    }

    // Convert set to sorted array
    return Array.from(pageSet).sort((a, b) => a - b);
  }
}

module.exports = {
  PagePreScreener,
  SCORING_CONFIG,
  LINE_ITEM_KEYWORDS,
  NEGATIVE_KEYWORDS,
};
