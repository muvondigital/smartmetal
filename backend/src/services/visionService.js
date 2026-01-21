const path = require('path');
const { getPdfPageCount } = require('../utils/pdfPageCount');
const { config } = require('../config/env');
const documentAiService = require('./gcp/documentAiService');

// Initialize Google Document AI client
const projectId = process.env.GCP_PROJECT_ID;
const processorId = process.env.DOCUMENT_AI_PROCESSOR_ID;
const location = process.env.DOCUMENT_AI_LOCATION || 'us';

if (!projectId || !processorId) {
  console.warn('[GCP Document AI] Warning: Credentials not configured');
  console.warn('[GCP Document AI] Please set GCP_PROJECT_ID and DOCUMENT_AI_PROCESSOR_ID in .env');
}

// Log client configuration once at startup
if (projectId && processorId) {
  console.log(`[GCP Document AI] Configured: projectId="${projectId}", processorId="${processorId}", location="${location}"`);
}

/**
 * Detect MIME type from file buffer or filename
 * @param {Buffer} fileBuffer - The file buffer
 * @param {string} mimeType - Provided MIME type
 * @param {string} filename - Original filename
 * @returns {string} MIME type
 */
function detectMimeType(fileBuffer, mimeType, filename) {
  if (mimeType && mimeType !== 'application/octet-stream') {
    return mimeType;
  }

  // Infer from file extension
  const ext = path.extname(filename).toLowerCase();
  const mimeMap = {
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.tiff': 'image/tiff',
    '.tif': 'image/tiff',
    '.gif': 'image/gif',
    '.bmp': 'image/bmp',
    '.webp': 'image/webp',
  };

  return mimeMap[ext] || 'application/pdf';
}

/**
 * Analyze document using GCP Document AI
 * @param {Buffer} fileBuffer - The file buffer
 * @param {string} mimeType - MIME type of the file
 * @param {string} filename - Original filename for type detection
 * @param {Object} options - Analysis options
 * @param {string|Array<string>} options.pages - Page range to analyze (optional)
 * @returns {Promise<Object>} GCP Document AI result
 */
async function analyzeDocument(fileBuffer, mimeType, filename = 'document', options = {}) {
  if (!projectId || !processorId) {
    throw new Error('GCP Document AI not configured. Set GCP_PROJECT_ID and DOCUMENT_AI_PROCESSOR_ID in .env');
  }

  try {
    const detectedMimeType = detectMimeType(fileBuffer, mimeType, filename);

    console.log(`[GCP Document AI] Processing ${detectedMimeType} file: ${filename}`);
    console.log(`[GCP Document AI] File size: ${fileBuffer.length} bytes`);

    // Get page count for PDFs
    let actualPageCount = 0;
    if (detectedMimeType === 'application/pdf') {
      actualPageCount = await getPdfPageCount(fileBuffer, filename);
      if (actualPageCount > 0) {
        console.log(`[GCP Document AI] PDF has ${actualPageCount} pages`);
      }
    }

    // Process document with GCP Document AI
    const startTime = Date.now();
    const result = await documentAiService.processDocument(fileBuffer, detectedMimeType);
    const endTime = Date.now();
    const processingTime = endTime - startTime;

    if (!result || !result.document) {
      throw new Error('GCP Document AI returned empty result');
    }

    const document = result.document;

    // Extract text
    const fullText = document.text || '';
    console.log(`[GCP Document AI] Extracted text length: ${fullText.length} characters`);

    // Extract pages
    const pages = document.pages || [];
    console.log(`[GCP Document AI] Processed ${pages.length} page(s)`);

    // Extract tables
    const tables = extractTables(document);
    console.log(`[GCP Document AI] Extracted ${tables.length} table(s)`);

    const structured = {
      rawPages: actualPageCount || pages.length,
      processedPages: pages.length,
      text: fullText,
      tables,
      pages: pages.map((page, idx) => ({
        pageNumber: idx + 1,
        width: page.dimension?.width || 0,
        height: page.dimension?.height || 0,
        lines: extractLines(page),
      })),
    };

    return {
      structured,
      gcpRaw: document,
      metrics: {
        processing_time_ms: processingTime,
        pages_processed: pages.length,
        total_pages: actualPageCount || pages.length,
      },
    };
  } catch (error) {
    console.error('[GCP Document AI] Error:', error.message);
    throw new Error(`GCP Document AI failed: ${error.message}`);
  }
}

/**
 * Extract tables from GCP Document AI document
 * @param {Object} document - GCP Document AI document
 * @returns {Array} Tables with rows and columns
 */
function extractTables(document) {
  const tables = [];

  if (!document.pages) return tables;

  document.pages.forEach((page, pageIdx) => {
    if (!page.tables) return;

    page.tables.forEach((table, tableIdx) => {
      const headerRows = table.headerRows || [];
      const bodyRows = table.bodyRows || [];
      const allRows = [...headerRows, ...bodyRows];

      // Build 2D grid
      const rows = allRows.map(row => {
        return (row.cells || []).map(cell => {
          return extractCellText(cell, document.text);
        });
      });

      tables.push({
        rowCount: rows.length,
        columnCount: rows[0]?.length || 0,
        rows,
        pageNumbers: [pageIdx + 1],
        tableIndex: tableIdx,
      });
    });
  });

  return tables;
}

/**
 * Extract text from a table cell
 * @param {Object} cell - Table cell from GCP Document AI
 * @param {string} documentText - Full document text
 * @returns {string} Cell text
 */
function extractCellText(cell, documentText) {
  if (!cell.layout || !cell.layout.textAnchor) return '';

  const textSegments = cell.layout.textAnchor.textSegments || [];
  let cellText = '';

  textSegments.forEach(segment => {
    const startIndex = parseInt(segment.startIndex || 0);
    const endIndex = parseInt(segment.endIndex || 0);
    if (endIndex > startIndex) {
      cellText += documentText.substring(startIndex, endIndex);
    }
  });

  return cellText.trim();
}

/**
 * Extract lines from a page
 * @param {Object} page - Page from GCP Document AI
 * @returns {Array} Lines with text
 */
function extractLines(page) {
  const lines = [];

  if (!page.lines) return lines;

  page.lines.forEach(line => {
    if (!line.layout || !line.layout.textAnchor) return;

    const textSegments = line.layout.textAnchor.textSegments || [];
    let lineText = '';

    textSegments.forEach(segment => {
      const startIndex = parseInt(segment.startIndex || 0);
      const endIndex = parseInt(segment.endIndex || 0);
      // Note: We'd need the full document text passed in to extract this
      // For now, just use the line's own text if available
    });

    lines.push({
      content: lineText || '',
    });
  });

  return lines;
}

/**
 * Extract structured data from parsed content
 * @param {Object} structured - Structured data from Document AI
 * @returns {Promise<Object>}
 */
async function extractStructuredData(structured) {
  return {
    rawPages: structured.rawPages,
    text: structured.text,
    tables: structured.tables,
    items: [],
    metadata: {},
  };
}

module.exports = {
  analyzeDocument,
  extractStructuredData,
};
