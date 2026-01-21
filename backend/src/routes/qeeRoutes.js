const express = require('express')
const router = express.Router()

const { authenticate } = require('../middleware/auth')
const { tenantMiddleware } = require('../middleware/tenant')
const { quickEstimate } = require('../services/qeeService')

router.post('/estimate', authenticate, tenantMiddleware, async (req, res) => {
  const { searchTerm, materialId, markupPercent, quantity, filters } = req.body || {}

  if (!searchTerm && !materialId) {
    return res.status(400).json({
      error: {
        code: 'INVALID_REQUEST',
        message: 'Provide either searchTerm or materialId to generate a quick estimate.',
      },
    })
  }

  try {
    const estimate = await quickEstimate({
      tenantId: req.tenantId,
      searchTerm,
      materialId,
      markupPercent,
      quantity,
      filters,
    })

    return res.json({ estimate })
  } catch (error) {
    if (error && error.code) {
      const payload = { code: error.code, message: error.message }
      if (error.matches) {
        payload.matches = error.matches
      }
      return res.status(400).json({ error: payload })
    }

    console.error('Quick Estimate error:', error)
    return res.status(500).json({
      error: {
        code: 'QEE_INTERNAL_ERROR',
        message: 'Quick Estimate Engine encountered an internal error.',
      },
    })
  }
})

module.exports = router

