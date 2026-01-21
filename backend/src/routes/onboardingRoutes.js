const express = require('express');
const router = express.Router();

const { authenticate, authorize, ROLES } = require('../middleware/auth');
const { asyncHandler, ValidationError } = require('../middleware/errorHandler');
const {
  getOrCreateTenantOnboardingStatus,
  updateTenantOnboardingStep,
  markTenantOnboardingComplete,
} = require('../services/onboardingService');

router.get(
  '/tenant/status',
  authenticate,
  asyncHandler(async (req, res) => {
    const status = await getOrCreateTenantOnboardingStatus(req.tenantId);
    res.json({ success: true, data: status });
  })
);

router.post(
  '/tenant/step',
  authenticate,
  authorize(ROLES.ADMIN, ROLES.MANAGER),
  asyncHandler(async (req, res) => {
    const { step, markCompleted } = req.body || {};

    if (!step || typeof step !== 'string') {
      throw new ValidationError('step is required');
    }
    if (markCompleted !== undefined && typeof markCompleted !== 'boolean') {
      throw new ValidationError('markCompleted must be a boolean');
    }

    const status = await updateTenantOnboardingStep(req.tenantId, { step, markCompleted });
    res.json({ success: true, data: status });
  })
);

router.post(
  '/tenant/complete',
  authenticate,
  authorize(ROLES.ADMIN, ROLES.MANAGER),
  asyncHandler(async (req, res) => {
    const status = await markTenantOnboardingComplete(req.tenantId);
    res.json({ success: true, data: status });
  })
);

module.exports = router;
