// SmartMetal API v1 Router
// Provides versioned API endpoints to prevent breaking changes
// All v1 routes are mounted under /api/v1
//
// NOTE: API versioning is IMPLEMENTED and ACTIVE in the platform.
// Older architecture reports may incorrectly state it is missing.

const express = require('express');
const router = express.Router();

// Import all route modules
const rfqRoutes = require('../rfqRoutes');
const materialsRoutes = require('../materialsRoutes');
const pricingRoutes = require('../pricingRoutes');
const ocrRoutes = require('../ocrRoutes');
const aiRoutes = require('../aiRoutes');
const approvalRoutes = require('../approvalRoutes');
const analyticsRoutes = require('../analyticsRoutes');
const pipesRoutes = require('../pipesRoutes');
const pdfExportRoutes = require('../pdfExportRoutes');
const priceImportRoutes = require('../priceImportRoutes');
const adminRoutes = require('../adminRoutes');
const dashboardRoutes = require('../dashboardRoutes');
const authRoutes = require('../authRoutes');
const suppliersRoutes = require('../suppliersRoutes');

// Mount all v1 routes
router.use('/rfqs', rfqRoutes);
router.use('/materials', materialsRoutes);
router.use('/pricing-runs', pricingRoutes);
router.use('/ocr', ocrRoutes);
router.use('/ai', aiRoutes);
router.use('/approvals', approvalRoutes);
router.use('/pipes', pipesRoutes);
router.use('/', analyticsRoutes); // Analytics uses /api/v1/analytics directly
router.use('/pdf', pdfExportRoutes);
router.use('/price-import', priceImportRoutes);
router.use('/admin', adminRoutes);
router.use('/', dashboardRoutes); // Dashboard uses /api/v1/dashboard directly
router.use('/auth', authRoutes);
router.use('/suppliers', suppliersRoutes);

// API version info endpoint
router.get('/', (req, res) => {
  res.json({
    version: 'v1',
    status: 'stable',
    description: 'SmartMetal Core Platform API - Version 1',
    endpoints: {
      rfqs: '/api/v1/rfqs',
      materials: '/api/v1/materials',
      pricingRuns: '/api/v1/pricing-runs',
      ocr: '/api/v1/ocr',
      ai: '/api/v1/ai',
      approvals: '/api/v1/approvals',
      analytics: '/api/v1/analytics',
      pipes: '/api/v1/pipes',
      pdfExport: '/api/v1/pdf',
      priceImport: '/api/v1/price-import',
      renewals: '/api/v1/renewals',
      admin: '/api/v1/admin',
      dashboard: '/api/v1/dashboard',
      auth: '/api/v1/auth',
    },
  });
});

module.exports = router;
