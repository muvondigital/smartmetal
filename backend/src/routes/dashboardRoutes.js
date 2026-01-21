/**
 * Dashboard Configuration Routes
 *
 * Provides endpoints for retrieving tenant-specific dashboard layouts.
 * Part of SmartMetal Dashboard Framework (Phase 7).
 */

const express = require('express');
const router = express.Router();
const { getDashboardConfig } = require('../config/tenantConfig');
const { authenticate, optionalAuth } = require('../middleware/auth');
const { tenantMiddleware } = require('../middleware/tenant');
const { asyncHandler } = require('../middleware/errorHandler');
const { log } = require('../utils/logger');

// Allow optional auth first so tenant middleware can use JWT tenant info
router.use(optionalAuth);
router.use(tenantMiddleware);

/**
 * GET /api/dashboard/config
 * Get dashboard layout configuration for the current tenant
 *
 * Returns the dashboard widget layout configuration.
 * Falls back to default Vendavo-style layout if not configured.
 *
 * @access Private - Authenticated users
 */
router.get(
  '/dashboard/config',
  authenticate,
  asyncHandler(async (req, res) => {
    const tenantId = req.tenantId;

    log('info', 'Fetching dashboard config', {
      tenantId,
      userId: req.user?.id,
    });

    const config = await getDashboardConfig(tenantId);

    res.json({
      success: true,
      data: config,
    });
  })
);

module.exports = router;
