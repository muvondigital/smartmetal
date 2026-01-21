const express = require('express');
const router = express.Router();
const {
  generatePricingRunPDF,
} = require('../services/pdfGenerationService');
// Price agreement document service removed (de-engineered)
const { asyncHandler, ValidationError } = require('../middleware/errorHandler');

/**
 * GET /api/pdf/pricing-runs/:id
 * Generate and download PDF for a pricing run
 */
router.get('/pricing-runs/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { download = 'true' } = req.query;
  const { tenantId } = req;

  // Validate tenantId is required
  if (!tenantId) {
    throw new ValidationError('Tenant ID is required. tenantId must be provided via tenant middleware.');
  }

  // Validate pricingRunId is not empty
  if (!id || id.trim() === '') {
    throw new ValidationError('Pricing run ID is required and cannot be empty.');
  }

  const pdfBuffer = await generatePricingRunPDF({ tenantId, pricingRunId: id });

    const filename = `NSC_Quote_${id.slice(0, 8).toUpperCase()}_${Date.now()}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');

    if (download === 'true') {
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    } else {
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    }

    res.send(pdfBuffer);
}));

module.exports = router;
