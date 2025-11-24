const express = require('express');
const multer = require('multer');
const { analyzeWithAzureLayout, extractStructuredData } = require('../services/visionService');

const router = express.Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB limit for Azure Document Intelligence
  },
  fileFilter: (req, file, cb) => {
    // Accept all supported file types for Azure Document Intelligence
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
    provider: 'azure-document-intelligence',
    message: 'Azure Document Intelligence OCR service is ready',
  });
});

/**
 * POST /api/ocr/extract
 * Extract structured data from uploaded document
 */
router.post('/extract', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    console.log(`[OCR Route] Processing file: ${req.file.originalname}`);
    console.log(`[OCR Route] MIME type: ${req.file.mimetype}`);
    console.log(`[OCR Route] Size: ${req.file.size} bytes`);

    // Analyze document with Azure Document Intelligence
    const { structured, azureRaw } = await analyzeWithAzureLayout(
      req.file.buffer,
      req.file.mimetype,
      req.file.originalname
    );

    // Extract structured data (placeholder for future AI extraction)
    const extractedData = await extractStructuredData(structured);

    res.json({
      provider: 'azure-document-intelligence',
      structured: extractedData,
      azureRaw: azureRaw,
    });
  } catch (error) {
    console.error('[OCR Route] Extraction error:', error);
    res.status(500).json({
      error: 'Failed to extract data from document',
      details: error.message,
    });
  }
});

module.exports = router;
