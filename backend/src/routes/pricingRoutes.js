const express = require('express');
const router = express.Router();
const pricingService = require('../services/pricingService');

/**
 * GET /api/pricing-runs/rfq/:rfqId
 * Get all pricing runs for an RFQ
 */
router.get('/rfq/:rfqId', async (req, res) => {
  try {
    const pricingRuns = await pricingService.getPricingRunsByRfqId(req.params.rfqId);
    res.json(pricingRuns);
  } catch (error) {
    console.error('Error fetching pricing runs:', error);
    res.status(500).json({
      error: 'Failed to fetch pricing runs',
      details: error.message,
    });
  }
});

/**
 * GET /api/pricing-runs/:id
 * Get a pricing run by ID with its items
 */
router.get('/:id', async (req, res) => {
  try {
    const pricingRun = await pricingService.getPricingRunById(req.params.id);
    res.json(pricingRun);
  } catch (error) {
    console.error('Error fetching pricing run:', error);
    if (error.message === 'Pricing run not found') {
      return res.status(404).json({
        error: 'Pricing run not found',
        id: req.params.id,
      });
    }
    res.status(500).json({
      error: 'Failed to fetch pricing run',
      details: error.message,
    });
  }
});

/**
 * POST /api/pricing-runs/rfq/:rfqId
 * Create a new pricing run for an RFQ
 */
router.post('/rfq/:rfqId', async (req, res) => {
  try {
    const pricingRun = await pricingService.createPriceRunForRfq(req.params.rfqId);
    res.status(201).json(pricingRun);
  } catch (error) {
    console.error('Error creating pricing run:', error);
    if (error.message === 'RFQ not found') {
      return res.status(404).json({
        error: 'RFQ not found',
        rfq_id: req.params.rfqId,
      });
    }
    if (error.message === 'RFQ has no items to price') {
      return res.status(400).json({
        error: 'RFQ has no items to price',
        details: error.message,
      });
    }
    res.status(500).json({
      error: 'Failed to create pricing run',
      details: error.message,
    });
  }
});

/**
 * PUT /api/pricing-runs/:id/outcome
 * Update pricing run outcome (won/lost)
 * Body: { outcome: 'won' | 'lost', notes?: string }
 */
router.put('/:id/outcome', async (req, res) => {
  try {
    const { outcome, notes } = req.body;

    if (!outcome) {
      return res.status(400).json({
        error: 'outcome is required',
        details: 'outcome must be "won" or "lost"',
      });
    }

    const pricingRun = await pricingService.updatePricingRunOutcome(
      req.params.id,
      outcome,
      notes
    );

    res.json({
      success: true,
      message: `Pricing run marked as ${outcome}`,
      pricing_run: pricingRun,
    });
  } catch (error) {
    console.error('Error updating pricing run outcome:', error);
    if (error.message === 'Pricing run not found') {
      return res.status(404).json({
        error: 'Pricing run not found',
        id: req.params.id,
      });
    }
    if (error.message === 'Outcome must be "won" or "lost"') {
      return res.status(400).json({
        error: 'Invalid outcome',
        details: error.message,
      });
    }
    res.status(500).json({
      error: 'Failed to update pricing run outcome',
      details: error.message,
    });
  }
});

/**
 * POST /api/pricing-runs/:id/revisions
 * Create a revision of a pricing run
 * Body: { reason: string, created_by?: string }
 */
router.post('/:id/revisions', async (req, res) => {
  try {
    const { reason, created_by } = req.body;

    if (!reason) {
      return res.status(400).json({
        error: 'reason is required',
        details: 'Please provide a reason for creating this revision',
      });
    }

    const newPricingRun = await pricingService.createPricingRunRevision(
      req.params.id,
      reason,
      created_by
    );

    res.status(201).json({
      success: true,
      message: 'Pricing run revision created',
      pricing_run: newPricingRun,
    });
  } catch (error) {
    console.error('Error creating pricing run revision:', error);
    if (error.message === 'Original pricing run not found') {
      return res.status(404).json({
        error: 'Pricing run not found',
        id: req.params.id,
      });
    }
    res.status(500).json({
      error: 'Failed to create pricing run revision',
      details: error.message,
    });
  }
});

/**
 * GET /api/pricing-runs/:id/versions
 * Get all versions (revisions) of a pricing run
 */
router.get('/:id/versions', async (req, res) => {
  try {
    const versions = await pricingService.getPricingRunVersions(req.params.id);

    res.json({
      success: true,
      count: versions.length,
      versions,
    });
  } catch (error) {
    console.error('Error fetching pricing run versions:', error);
    if (error.message === 'Pricing run not found') {
      return res.status(404).json({
        error: 'Pricing run not found',
        id: req.params.id,
      });
    }
    res.status(500).json({
      error: 'Failed to fetch pricing run versions',
      details: error.message,
    });
  }
});

/**
 * GET /api/pricing-runs/:id/version-snapshots
 * Get all version snapshots for a pricing run
 */
router.get('/:id/version-snapshots', async (req, res) => {
  try {
    const snapshots = await pricingService.getVersionSnapshots(req.params.id);

    res.json({
      success: true,
      count: snapshots.length,
      snapshots,
    });
  } catch (error) {
    console.error('Error fetching version snapshots:', error);
    res.status(500).json({
      error: 'Failed to fetch version snapshots',
      details: error.message,
    });
  }
});

/**
 * GET /api/pricing-runs/:id/compare-versions
 * Compare two versions of a pricing run
 * Query params: version1 (required), version2 (optional, defaults to current)
 */
router.get('/:id/compare-versions', async (req, res) => {
  try {
    const { version1, version2 } = req.query;

    if (!version1) {
      return res.status(400).json({
        error: 'version1 is required',
        details: 'Please provide version1 as a query parameter',
      });
    }

    const version1Num = parseInt(version1);
    const version2Num = version2 ? parseInt(version2) : null;

    if (isNaN(version1Num) || (version2 !== null && version2 !== undefined && isNaN(version2Num))) {
      return res.status(400).json({
        error: 'Invalid version number',
        details: 'Version numbers must be integers',
      });
    }

    const comparison = await pricingService.compareVersions(
      req.params.id,
      version1Num,
      version2Num
    );

    res.json({
      success: true,
      comparison,
    });
  } catch (error) {
    console.error('Error comparing versions:', error);
    if (error.message.includes('not found')) {
      return res.status(404).json({
        error: 'Version not found',
        details: error.message,
      });
    }
    res.status(500).json({
      error: 'Failed to compare versions',
      details: error.message,
    });
  }
});

module.exports = router;

