const { PDFDocument } = require('pdf-lib');

/**
 * Extract text from all pages of a PDF using pdf-lib
 * This is a fallback when Azure DI returns partial results
 * Note: pdf-lib has limited text extraction capabilities
 * For better results, consider using pdf-parse or pdfjs-dist
 * @param {Buffer} pdfBuffer - The PDF file buffer
 * @param {string} fileName - The original filename for logging
 * @returns {Promise<Object>} Extracted text and page information
 */
async function extractPdfText(pdfBuffer, fileName = 'unknown') {
  try {
    const pdfDoc = await PDFDocument.load(pdfBuffer, {
      ignoreEncryption: true,
      updateMetadata: false
    });
    const pageCount = pdfDoc.getPageCount();

    console.log(`[PDF_TEXT_EXTRACT] Starting local text extraction for "${fileName}" (${pageCount} pages)`);

    // pdf-lib does not support direct text extraction
    // We need to use a different library or approach
    // For now, return metadata that can help guide chunked extraction
    const pages = [];
    for (let i = 0; i < pageCount; i++) {
      const page = pdfDoc.getPage(i);
      pages.push({
        pageNumber: i + 1,
        width: page.getWidth(),
        height: page.getHeight(),
        rotation: page.getRotation().angle
      });
    }

    console.log(`[PDF_TEXT_EXTRACT] Completed metadata extraction for ${pageCount} pages`);

    return {
      pageCount,
      pages,
      text: null, // pdf-lib cannot extract text directly
      metadata: {
        title: pdfDoc.getTitle() || null,
        author: pdfDoc.getAuthor() || null,
        subject: pdfDoc.getSubject() || null,
        creator: pdfDoc.getCreator() || null,
        producer: pdfDoc.getProducer() || null
      }
    };
  } catch (error) {
    console.error(`[PDF_TEXT_EXTRACT] Failed to extract text from "${fileName}": ${error.message}`);
    throw error;
  }
}

/**
 * Detect if a PDF likely contains appendix or MTO content by analyzing page count
 * and metadata. This helps determine if we need full-document processing.
 * @param {Buffer} pdfBuffer - The PDF file buffer
 * @param {string} fileName - The original filename for logging
 * @returns {Promise<Object>} Analysis result
 */
async function analyzePdfStructure(pdfBuffer, fileName = 'unknown') {
  try {
    const extracted = await extractPdfText(pdfBuffer, fileName);
    const { pageCount, metadata } = extracted;

    // Heuristics for detecting complex documents
    const likelyHasAppendix = pageCount > 20;
    const likelyMtoDocument = fileName.toLowerCase().includes('mto') ||
                               fileName.toLowerCase().includes('material') ||
                               metadata.title?.toLowerCase().includes('mto');

    console.log(`[PDF_STRUCTURE_ANALYSIS] { fileName: "${fileName}", pageCount: ${pageCount}, likelyHasAppendix: ${likelyHasAppendix}, likelyMtoDocument: ${likelyMtoDocument} }`);

    return {
      pageCount,
      likelyHasAppendix,
      likelyMtoDocument,
      metadata,
      recommendChunking: pageCount > 30,
      recommendedChunkSize: pageCount > 50 ? 10 : 15
    };
  } catch (error) {
    console.error(`[PDF_STRUCTURE_ANALYSIS] Failed to analyze PDF structure: ${error.message}`);
    return {
      pageCount: 0,
      likelyHasAppendix: false,
      likelyMtoDocument: false,
      metadata: {},
      recommendChunking: false,
      recommendedChunkSize: 10
    };
  }
}

module.exports = {
  extractPdfText,
  analyzePdfStructure
};
