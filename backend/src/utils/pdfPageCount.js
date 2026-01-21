const { PDFDocument } = require('pdf-lib');

/**
 * Get the actual page count from a PDF buffer
 * @param {Buffer} pdfBuffer - The PDF file buffer
 * @param {string} fileName - The original filename for logging
 * @returns {Promise<number>} The number of pages in the PDF
 */
async function getPdfPageCount(pdfBuffer, fileName = 'unknown') {
  try {
    const pdfDoc = await PDFDocument.load(pdfBuffer, {
      ignoreEncryption: true,
      updateMetadata: false
    });
    const pageCount = pdfDoc.getPageCount();

    console.log(`[PDF_PAGECOUNT] { detectedPageCount: ${pageCount}, fileName: "${fileName}", fileSize: ${pdfBuffer.length} }`);

    return pageCount;
  } catch (error) {
    console.error(`[PDF_PAGECOUNT] Failed to read page count for "${fileName}": ${error.message}`);
    // Return 0 if we cannot read the PDF, caller should handle
    return 0;
  }
}

module.exports = {
  getPdfPageCount,
};
