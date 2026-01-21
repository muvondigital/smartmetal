const express = require('express');
const router = express.Router();
const { tenantMiddleware } = require('../middleware/tenant');
const { optionalAuth } = require('../middleware/auth');
const { withTenantContext } = require('../db/tenantContext');

// Apply optional auth middleware
router.use(optionalAuth);

// Apply tenant middleware to all routes
router.use(tenantMiddleware);

/**
 * GET /api/v1/suppliers
 * Get all suppliers for the current tenant
 */
router.get('/', async (req, res) => {
  try {
    const result = await withTenantContext(req.tenantId, async (client) => {
      return await client.query(
        `SELECT id, name, code, origin_type, country, status
         FROM suppliers
         WHERE tenant_id = $1 AND status = 'ACTIVE'
         ORDER BY name ASC`,
        [req.tenantId]
      );
    });

    res.json(result.rows);
  } catch (error) {
    console.error('Error loading suppliers:', error);
    res.status(500).json({
      error: 'Failed to fetch suppliers',
      details: error.message,
    });
  }
});

module.exports = router;
