/**
 * Price Import Routes
 * 
 * API endpoints for bulk price imports from CSV files
 * Part of Phase 2: Manufacturer Price Management System
 */

const express = require('express');
const multer = require('multer');
const {
  parsePriceCSV,
  previewPriceChanges,
  applyPriceChanges,
  getPriceHistory,
  getRecentPriceChanges,
  getPriceChangeStats
} = require('../services/priceImportService');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

// Configure multer for CSV file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit for CSV files
  },
  fileFilter: (req, file, cb) => {
    // Accept CSV files
    if (file.mimetype === 'text/csv' || 
        file.mimetype === 'application/vnd.ms-excel' ||
        file.originalname.toLowerCase().endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'), false);
    }
  }
});

/**
 * POST /api/price-import/preview
 * Preview price changes from uploaded CSV without applying them
 * 
 * Request: multipart/form-data
 * - file: CSV file with columns: material_code, base_cost, currency (optional), effective_date (optional), notes (optional)
 * - effective_date: YYYY-MM-DD (optional, defaults to today)
 * - source: 'manufacturer_feed' | 'manual_update' | 'lme_adjustment' (optional, defaults to 'manufacturer_feed')
 * 
 * Response:
 * {
 *   preview: {
 *     totalRecords: number,
 *     materialsFound: Array,
 *     materialsNotFound: Array,
 *     priceChanges: Array,
 *     unchanged: Array,
 *     errors: Array
 *   }
 * }
 */
router.post('/preview', upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: 'No file uploaded',
      details: 'Please upload a CSV file'
    });
  }

  const { effective_date, source = 'manufacturer_feed' } = req.body;
  const uploadedBy = req.user?.id || req.user?.name || 'system';

  try {
    // Parse CSV
    const csvRecords = await parsePriceCSV(req.file.buffer);

    // Generate preview
    const preview = await previewPriceChanges(csvRecords, effective_date, source);

    res.json({
      success: true,
      preview: preview,
      summary: {
        total: preview.totalRecords,
        found: preview.materialsFound.length,
        notFound: preview.materialsNotFound.length,
        willUpdate: preview.priceChanges.length,
        unchanged: preview.unchanged.length,
        errors: preview.errors.length
      }
    });
  } catch (error) {
    console.error('[Price Import] Preview error:', error);
    res.status(400).json({
      success: false,
      error: 'Failed to process CSV file',
      details: error.message
    });
  }
}));

/**
 * POST /api/price-import/apply
 * Apply price changes from preview data
 * 
 * Request body:
 * {
 *   priceChanges: Array<{
 *     material_id: string,
 *     material_code: string,
 *     new_base_cost: number,
 *     effective_date: string,
 *     source: string,
 *     notes: string,
 *     currency: string
 *   }>,
 *   effective_date: string (optional),
 *   source: string (optional)
 * }
 * 
 * Response:
 * {
 *   success: boolean,
 *   results: {
 *     updated: number,
 *     historyEntries: number,
 *     errors: Array
 *   }
 * }
 */
router.post('/apply', asyncHandler(async (req, res) => {
  const { priceChanges, effective_date, source } = req.body;
  const uploadedBy = req.user?.id || req.user?.name || 'system';

  if (!priceChanges || !Array.isArray(priceChanges) || priceChanges.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Invalid request',
      details: 'priceChanges array is required and must not be empty'
    });
  }

  try {
    // Apply defaults if not provided
    const changesWithDefaults = priceChanges.map(change => ({
      ...change,
      effective_date: change.effective_date || effective_date || new Date().toISOString().split('T')[0],
      source: change.source || source || 'manufacturer_feed',
      currency: change.currency || 'USD'
    }));

    const results = await applyPriceChanges(changesWithDefaults, uploadedBy);

    res.json({
      success: true,
      results: results,
      summary: {
        updated: results.updated,
        historyEntries: results.historyEntries,
        errors: results.errors.length
      }
    });
  } catch (error) {
    console.error('[Price Import] Apply error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to apply price changes',
      details: error.message
    });
  }
}));

/**
 * POST /api/price-import/upload-and-apply
 * Upload CSV and apply changes in one step (convenience endpoint)
 * 
 * Request: multipart/form-data
 * - file: CSV file
 * - effective_date: YYYY-MM-DD (optional)
 * - source: string (optional)
 * - auto_apply: boolean (optional, defaults to false) - If true, applies without preview
 * 
 * Response:
 * {
 *   success: boolean,
 *   preview?: Object (if auto_apply=false),
 *   results?: Object (if auto_apply=true)
 * }
 */
router.post('/upload-and-apply', upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: 'No file uploaded'
    });
  }

  const { 
    effective_date, 
    source = 'manufacturer_feed',
    auto_apply = 'false'
  } = req.body;

  const uploadedBy = req.user?.id || req.user?.name || 'system';
  const shouldAutoApply = auto_apply === 'true' || auto_apply === true;

  try {
    // Parse CSV
    const csvRecords = await parsePriceCSV(req.file.buffer);

    // Generate preview
    const preview = await previewPriceChanges(csvRecords, effective_date, source);

    if (shouldAutoApply && preview.priceChanges.length > 0) {
      // Apply changes directly
      const results = await applyPriceChanges(preview.priceChanges, uploadedBy);

      res.json({
        success: true,
        preview: preview,
        results: results,
        summary: {
          updated: results.updated,
          errors: results.errors.length,
          notFound: preview.materialsNotFound.length
        }
      });
    } else {
      // Return preview only
      res.json({
        success: true,
        preview: preview,
        summary: {
          total: preview.totalRecords,
          found: preview.materialsFound.length,
          willUpdate: preview.priceChanges.length,
          errors: preview.errors.length
        },
        message: 'Use POST /api/price-import/apply with priceChanges array to apply changes'
      });
    }
  } catch (error) {
    console.error('[Price Import] Upload and apply error:', error);
    res.status(400).json({
      success: false,
      error: 'Failed to process CSV file',
      details: error.message
    });
  }
}));

/**
 * GET /api/price-import/history/:materialId
 * Get price history for a specific material
 * 
 * Query params:
 * - limit: number (optional, defaults to 50)
 * 
 * Response:
 * {
 *   success: boolean,
 *   history: Array<PriceHistoryRecord>
 * }
 */
router.get('/history/:materialId', asyncHandler(async (req, res) => {
  const { materialId } = req.params;
  const limit = parseInt(req.query.limit) || 50;

  try {
    const history = await getPriceHistory(materialId, limit);

    res.json({
      success: true,
      history: history,
      count: history.length
    });
  } catch (error) {
    console.error('[Price Import] Get history error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve price history',
      details: error.message
    });
  }
}));

/**
 * GET /api/price-import/recent-changes
 * Get recent price changes for dashboard notifications
 * 
 * Query params:
 * - days: number (optional, defaults to 7)
 * - limit: number (optional, defaults to 50)
 * 
 * Response:
 * {
 *   success: boolean,
 *   changes: Array<PriceChangeRecord>
 * }
 */
router.get('/recent-changes', asyncHandler(async (req, res) => {
  const days = parseInt(req.query.days) || 7;
  const limit = parseInt(req.query.limit) || 50;

  try {
    const changes = await getRecentPriceChanges(days, limit);

    res.json({
      success: true,
      changes: changes,
      count: changes.length,
      days: days
    });
  } catch (error) {
    console.error('[Price Import] Get recent changes error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve recent changes',
      details: error.message
    });
  }
}));

/**
 * GET /api/price-import/stats
 * Get price change statistics for dashboard
 * 
 * Query params:
 * - days: number (optional, defaults to 7)
 * 
 * Response:
 * {
 *   success: boolean,
 *   stats: {
 *     total_changes: number,
 *     materials_affected: number,
 *     price_increases: number,
 *     price_decreases: number,
 *     unchanged: number,
 *     avg_change_pct: number,
 *     max_increase_pct: number,
 *     max_decrease_pct: number
 *   }
 * }
 */
router.get('/stats', asyncHandler(async (req, res) => {
  const days = parseInt(req.query.days) || 7;

  try {
    const stats = await getPriceChangeStats(days);

    res.json({
      success: true,
      stats: stats,
      days: days
    });
  } catch (error) {
    console.error('[Price Import] Get stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve statistics',
      details: error.message
    });
  }
}));

module.exports = router;

