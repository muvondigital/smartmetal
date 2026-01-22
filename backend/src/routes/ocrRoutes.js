const express = require('express');
const multer = require('multer');
const { analyzeDocument, extractStructuredData } = require('../services/visionService');

const router = express.Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB limit for GCP Document AI
  },
  fileFilter: (req, file, cb) => {
    // Accept all supported file types for GCP Document AI
    const allowedMimes = [
      'application/pdf',
      'image/png',
      'image/jpeg',
      'image/jpg',
      'image/gif',
      'image/bmp',
      'image/webp',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
      'text/plain',
      'text/html',
    ];

    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      // Check file extension as fallback
      const filename = file.originalname.toLowerCase();
      if (
        filename.endsWith('.pdf') ||
        filename.endsWith('.png') ||
        filename.endsWith('.jpg') ||
        filename.endsWith('.jpeg') ||
        filename.endsWith('.gif') ||
        filename.endsWith('.bmp') ||
        filename.endsWith('.webp') ||
        filename.endsWith('.docx') ||
        filename.endsWith('.xlsx') ||
        filename.endsWith('.pptx') ||
        filename.endsWith('.txt') ||
        filename.endsWith('.html')
      ) {
        cb(null, true);
      } else {
        cb(
          new Error(
            'Unsupported file type. Supported: PDF, images (PNG, JPEG, GIF, BMP, WebP), Office docs (DOCX, XLSX, PPTX), text files'
          ),
          false
        );
      }
    }
  },
});

/**
 * GET /api/ocr/test
 * Test endpoint to verify OCR service is running
 */
router.get('/test', (req, res) => {
  res.json({
    ok: true,
    provider: 'gcp-document-ai',
    message: 'GCP Document AI service is ready',
  });
});

/**
 * POST /api/ocr/extract
 * Extract structured data from uploaded document
 * 
 * Request body (optional):
 * - pages: Page range string (e.g., "26-32") or array of page numbers
 *   If not provided, heuristic detection will attempt to find APPENDIX/MTO pages
 */
router.post('/extract', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    console.log(`[OCR Route] Processing file: ${req.file.originalname}`);
    console.log(`[OCR Route] MIME type: ${req.file.mimetype}`);
    console.log(`[OCR Route] Size: ${req.file.size} bytes`);

    // Get pages parameter from request body
    let pagesOption = req.body.pages || null;
    const options = {};

    if (pagesOption) {
      options.pages = pagesOption;
      console.log(`[OCR Route] Using explicit page range: ${pagesOption} (type: ${typeof pagesOption})`);
    } else {
      console.log(`[OCR Route] No page range specified - processing all pages (up to MAX_PDF_PAGES_TO_PROCESS limit)`);
    }

    // Analyze document with GCP Document AI
    const extractionStartTime = Date.now();
    const { structured, gcpRaw, metrics: diMetrics } = await analyzeDocument(
      req.file.buffer,
      req.file.mimetype,
      req.file.originalname,
      options
    );
    const extractionEndTime = Date.now();
    const extractionWallTime = extractionEndTime - extractionStartTime;

    console.log(`[OCR Route] Extraction complete: ${structured.rawPages || 0} pages processed, ${structured.tables?.length || 0} tables found`);

    // Extract structured data (placeholder for future AI extraction)
    const extractedData = await extractStructuredData(structured);

    // Log extraction metrics
    const extractionMetrics = {
      pdf_pages: structured.rawPages || 0,
      pages_sent_to_DI: diMetrics?.pages_sent_to_DI || structured.rawPages || 0,
      di_calls: diMetrics?.di_calls || 1,
      di_wall_time_ms: diMetrics?.di_wall_time_ms || extractionWallTime,
      tables_found: structured.tables?.length || 0,
      page_selection_enabled: diMetrics?.page_selection_enabled || false,
      page_selection_confidence: diMetrics?.page_selection_confidence || 0,
      page_selection_count: diMetrics?.page_selection_count || 0
    };

    // Build log message with page selection info
    let metricsLog = `[EXTRACTION_METRICS] { pdf_pages: ${extractionMetrics.pdf_pages}, pages_sent_to_DI: ${extractionMetrics.pages_sent_to_DI}, di_calls: ${extractionMetrics.di_calls}, di_wall_time_ms: ${extractionMetrics.di_wall_time_ms}, tables_found: ${extractionMetrics.tables_found}`;

    if (extractionMetrics.page_selection_enabled) {
      const selectedPagesPreview = diMetrics?.page_selection_pages ? `[${diMetrics.page_selection_pages.join(', ')}${diMetrics.page_selection_count > 10 ? '...' : ''}]` : '[]';
      metricsLog += `, page_selection_enabled: true, page_selection_confidence: ${extractionMetrics.page_selection_confidence.toFixed(3)}, page_selection_count: ${extractionMetrics.page_selection_count}, selected_pages_preview: ${selectedPagesPreview}`;
    } else {
      metricsLog += `, page_selection_enabled: false`;
    }

    metricsLog += ' }';
    console.log(metricsLog);

    res.json({
      provider: 'gcp-document-ai',
      structured: extractedData,
      gcpRaw: gcpRaw,
    });
  } catch (error) {
    console.error('[OCR Route] Extraction error:', error);
    console.error('[OCR Route] Error name:', error.name);
    console.error('[OCR Route] Error message:', error.message);
    console.error('[OCR Route] Error stack:', error.stack);
    if (error.cause) {
      console.error('[OCR Route] Error cause:', error.cause);
    }

    // Handle quota exceeded errors with appropriate status code and message
    if (error.code === 'AZURE_DI_QUOTA_EXCEEDED') {
      return res.status(error.statusCode || 429).json({
        error: 'Azure Document Intelligence quota exceeded',
        code: error.code,
        details: error.details || {
          message: error.message,
          suggestion: 'The free tier quota has been exhausted. Please wait 21 days for quota reset, or upgrade to a paid tier.',
        },
      });
    }
    
    // Handle authentication errors
    if (error.code === 'AZURE_DI_AUTH_FAILED') {
      return res.status(error.statusCode || 401).json({
        error: 'Azure Document Intelligence authentication failed',
        code: error.code,
        details: error.details || {
          message: error.message,
          suggestion: 'Please check your Azure Document Intelligence credentials.',
        },
      });
    }
    
    // Generic error handling
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      error: 'Failed to extract data from document',
      details: error.message,
      ...(error.code && { code: error.code }),
    });
  }
});

module.exports = router;
