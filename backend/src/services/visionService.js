const { DocumentAnalysisClient, AzureKeyCredential } = require('@azure/ai-form-recognizer');
const path = require('path');

// Initialize Azure Document Intelligence client
const endpoint = process.env.AZURE_DOC_INTELLIGENCE_ENDPOINT;
const key = process.env.AZURE_DOC_INTELLIGENCE_KEY;

if (!endpoint || !key) {
  console.warn('Warning: Azure Document Intelligence credentials not configured');
  console.warn('Please set AZURE_DOC_INTELLIGENCE_ENDPOINT and AZURE_DOC_INTELLIGENCE_KEY in .env');
}

const client = endpoint && key ? new DocumentAnalysisClient(endpoint, new AzureKeyCredential(key)) : null;

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
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.txt': 'text/plain',
    '.html': 'text/html',
  };

  return mimeMap[ext] || 'application/pdf';
}

/**
 * Analyze document using Azure Document Intelligence "prebuilt-layout" model
 * @param {Buffer} fileBuffer - The file buffer
 * @param {string} mimeType - MIME type of the file
 * @param {string} filename - Original filename for type detection
 * @returns {Promise<Object>} Azure Document Intelligence result
 */
async function analyzeWithAzureLayout(fileBuffer, mimeType, filename = 'document') {
  if (!client) {
    throw new Error('Azure Document Intelligence client not initialized. Check your environment variables.');
  }

  try {
    // Detect proper MIME type
    const detectedMimeType = detectMimeType(fileBuffer, mimeType, filename);

    console.log(`[Azure DI] Processing ${detectedMimeType} file: ${filename}`);
    console.log(`[Azure DI] File size: ${fileBuffer.length} bytes`);

    // Start the analysis using prebuilt-layout model
    const poller = await client.beginAnalyzeDocument('prebuilt-layout', fileBuffer, {
      contentType: detectedMimeType,
    });

    console.log('[Azure DI] Analysis started, polling for results...');

    // Wait for the operation to complete
    const result = await poller.pollUntilDone();

    console.log('[Azure DI] Analysis complete');
    console.log(`[Azure DI] Pages detected: ${result.pages?.length || 0}`);
    console.log(`[Azure DI] Tables detected: ${result.tables?.length || 0}`);

    // Extract text from all pages
    let fullText = '';
    if (result.content) {
      fullText = result.content;
    } else if (result.pages) {
      // Fallback: reconstruct text from pages
      fullText = result.pages
        .map(page =>
          page.lines
            .map(line => line.content)
            .join('\n')
        )
        .join('\n\n');
    }

    // Extract tables
    const tables = (result.tables || []).map(table => {
      const rowCount = table.rowCount;
      const columnCount = table.columnCount;

      // Initialize empty grid
      const rows = Array.from({ length: rowCount }, () => Array(columnCount).fill(''));

      // Fill grid with cell content
      for (const cell of table.cells) {
        const rowIndex = cell.rowIndex;
        const columnIndex = cell.columnIndex;
        rows[rowIndex][columnIndex] = cell.content || '';
      }

      return {
        rowCount,
        columnCount,
        rows,
      };
    });

    const structured = {
      rawPages: result.pages?.length || 0,
      text: fullText,
      tables,
    };

    console.log(`[Azure DI] Extracted text length: ${fullText.length} characters`);
    console.log(`[Azure DI] Extracted ${tables.length} table(s)`);

    return {
      structured,
      azureRaw: result,
    };
  } catch (error) {
    console.error('[Azure DI] Analysis error:', error);
    console.error('[Azure DI] Error message:', error.message);
    if (error.details) {
      console.error('[Azure DI] Error details:', JSON.stringify(error.details, null, 2));
    }
    throw new Error(`Azure Document Intelligence analysis failed: ${error.message}`);
  }
}

/**
 * Extract structured data from parsed content
 * This is a placeholder for future AI-based extraction
 * @param {Object} structured - Structured data from Azure DI
 * @returns {Promise<Object>}
 */
async function extractStructuredData(structured) {
  // For now, return the structured data as-is
  // In the future, this could use AI to extract specific entities like:
  // - Line items
  // - Quantities
  // - Prices
  // - Customer information
  // etc.

  return {
    rawPages: structured.rawPages,
    text: structured.text,
    tables: structured.tables,
    items: [], // Placeholder for future extraction
    metadata: {}, // Placeholder for future extraction
  };
}

module.exports = {
  analyzeWithAzureLayout,
  extractStructuredData,
};
