const express = require('express');
const router = express.Router();
const {
  getDashboardMetrics,
  getWinLossAnalysis,
  getMarginAnalysis,
  getAgreementUtilization,
} = require('../services/analyticsService');
const { authenticate, authorize, ROLES } = require('../middleware/auth');
const { asyncHandler, ValidationError } = require('../middleware/errorHandler');
const { validations, handleValidationErrors, query } = require('../middleware/validation');

/**
 * Analytics Routes
 * Provides endpoints for business intelligence and metrics
 */

/**
 * GET /api/analytics/dashboard
 * Get high-level dashboard metrics
 * Query params: start_date, end_date (optional)
 * @access  Private - Authenticated users
 */
router.get(
  '/analytics/dashboard',
  authenticate,
  validations.dateRange,
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const { start_date, end_date } = req.query;

    const metrics = await getDashboardMetrics({ start_date, end_date });

    res.json({
      success: true,
      data: metrics,
    });
  })
);

/**
 * GET /api/analytics/win-loss
 * Get win/loss analysis
 * Query params: start_date, end_date, client_id, group_by (month|quarter)
 * @access  Private - Authenticated users
 */
router.get(
  '/analytics/win-loss',
  authenticate,
  [
    ...validations.dateRange,
    query('client_id').optional().isUUID().withMessage('client_id must be a valid UUID'),
    query('group_by').optional().isIn(['month', 'quarter']).withMessage('group_by must be "month" or "quarter"'),
  ],
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const { start_date, end_date, client_id, group_by } = req.query;

    const analysis = await getWinLossAnalysis({
      start_date,
      end_date,
      client_id,
      group_by,
    });

    res.json({
      success: true,
      data: analysis,
    });
  })
);

/**
 * GET /api/analytics/margins
 * Get margin analysis
 * Query params: start_date, end_date, client_id, material_id, category
 * @access  Private - Authenticated users
 */
router.get(
  '/analytics/margins',
  authenticate,
  [
    ...validations.dateRange,
    query('client_id').optional().isUUID().withMessage('client_id must be a valid UUID'),
    query('material_id').optional().isUUID().withMessage('material_id must be a valid UUID'),
    query('category').optional().isString().trim().withMessage('category must be a string'),
  ],
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const { start_date, end_date, client_id, material_id, category } = req.query;

    const analysis = await getMarginAnalysis({
      start_date,
      end_date,
      client_id,
      material_id,
      category,
    });

    res.json({
      success: true,
      data: analysis,
    });
  })
);

/**
 * GET /api/analytics/agreement-utilization
 * Get price agreement utilization metrics
 * Query params: start_date, end_date, client_id
 * @access  Private - Authenticated users
 */
router.get(
  '/analytics/agreement-utilization',
  authenticate,
  [
    ...validations.dateRange,
    query('client_id').optional().isUUID().withMessage('client_id must be a valid UUID'),
  ],
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const { start_date, end_date, client_id } = req.query;

    const utilization = await getAgreementUtilization({
      start_date,
      end_date,
      client_id,
    });

    res.json({
      success: true,
      data: utilization,
    });
  })
);

/**
 * GET /api/analytics/export
 * Export analytics data to CSV
 * Query params: report_type (dashboard|win-loss|margins|agreement-utilization), ...other filters
 * @access  Private - Authenticated users
 */
router.get(
  '/analytics/export',
  authenticate,
  [
    query('report_type').isIn(['dashboard', 'win-loss', 'margins', 'agreement-utilization']).withMessage('report_type must be one of: dashboard, win-loss, margins, agreement-utilization'),
    ...validations.dateRange,
    query('client_id').optional().isUUID().withMessage('client_id must be a valid UUID'),
    query('group_by').optional().isIn(['month', 'quarter']).withMessage('group_by must be "month" or "quarter"'),
  ],
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const { report_type, ...filters } = req.query;

    let data;
    let filename;

    switch (report_type) {
      case 'dashboard':
        data = await getDashboardMetrics(filters);
        filename = `dashboard_${new Date().toISOString().split('T')[0]}.csv`;
        break;
      case 'win-loss':
        data = await getWinLossAnalysis(filters);
        filename = `win_loss_${new Date().toISOString().split('T')[0]}.csv`;
        break;
      case 'margins':
        data = await getMarginAnalysis(filters);
        filename = `margins_${new Date().toISOString().split('T')[0]}.csv`;
        break;
      case 'agreement-utilization':
        data = await getAgreementUtilization(filters);
        filename = `agreement_utilization_${new Date().toISOString().split('T')[0]}.csv`;
        break;
      default:
        throw new ValidationError(`Invalid report_type: ${report_type}`);
    }

    // Simple CSV conversion - flatten the object
    const csv = convertToCSV(data);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  })
);

/**
 * Helper: Convert object to CSV format
 */
function convertToCSV(data) {
  // Simple CSV conversion for nested objects
  // This is a basic implementation - can be enhanced
  const lines = [];

  function flattenObject(obj, prefix = '') {
    const result = {};
    for (const key in obj) {
      const value = obj[key];
      const newKey = prefix ? `${prefix}_${key}` : key;

      if (value === null || value === undefined) {
        result[newKey] = '';
      } else if (typeof value === 'object' && !Array.isArray(value)) {
        Object.assign(result, flattenObject(value, newKey));
      } else if (Array.isArray(value)) {
        result[newKey] = JSON.stringify(value);
      } else {
        result[newKey] = value;
      }
    }
    return result;
  }

  const flattened = flattenObject(data);
  const headers = Object.keys(flattened);
  const values = Object.values(flattened);

  lines.push(headers.join(','));
  lines.push(values.map(v => `"${v}"`).join(','));

  return lines.join('\n');
}

module.exports = router;
