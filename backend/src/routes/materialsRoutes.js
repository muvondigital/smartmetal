const express = require('express');
const router = express.Router();
const materialsService = require('../services/materialsService');

/**
 * GET /api/materials
 * Get all materials for the current tenant
 */
router.get('/', async (req, res) => {
  try {
    // Extract tenantId from request context (set by tenant middleware)
    const tenantId = req.tenantId;
    
    if (!tenantId) {
      return res.status(400).json({
        error: 'Tenant context required',
        details: 'tenantId is required. Ensure tenant middleware is configured.',
      });
    }

    const materials = await materialsService.getAllMaterials(tenantId);
    res.json(materials);
  } catch (error) {
    console.error('Error fetching materials:', error);
    res.status(500).json({
      error: 'Failed to fetch materials',
      details: error.message,
    });
  }
});

/**
 * GET /api/materials/code/:materialCode
 * Get a material by material_code for the current tenant
 */
router.get('/code/:materialCode', async (req, res) => {
  try {
    // Extract tenantId from request context
    const tenantId = req.tenantId;
    
    if (!tenantId) {
      return res.status(400).json({
        error: 'Tenant context required',
        details: 'tenantId is required. Ensure tenant middleware is configured.',
      });
    }

    const material = await materialsService.getMaterialByCode(req.params.materialCode, tenantId);
    if (!material) {
      return res.status(404).json({
        error: 'Material not found',
        material_code: req.params.materialCode,
      });
    }
    res.json(material);
  } catch (error) {
    console.error('Error fetching material:', error);
    res.status(500).json({
      error: 'Failed to fetch material',
      details: error.message,
    });
  }
});

/**
 * GET /api/materials/:id
 * Get a material by ID for the current tenant
 */
router.get('/:id', async (req, res) => {
  try {
    // Extract tenantId from request context
    const tenantId = req.tenantId;
    
    if (!tenantId) {
      return res.status(400).json({
        error: 'Tenant context required',
        details: 'tenantId is required. Ensure tenant middleware is configured.',
      });
    }

    const material = await materialsService.getMaterialById(req.params.id, tenantId);
    if (!material) {
      return res.status(404).json({
        error: 'Material not found',
        id: req.params.id,
      });
    }
    res.json(material);
  } catch (error) {
    console.error('Error fetching material:', error);
    res.status(500).json({
      error: 'Failed to fetch material',
      details: error.message,
    });
  }
});

/**
 * POST /api/materials
 * Create a new material for the current tenant
 *
 * Materials are tenant-scoped (migration 058+).
 * tenantId is required.
 */
router.post('/', async (req, res) => {
  try {
    const payload = req.body;
    const tenantId = req.tenantId;

    if (!tenantId) {
      return res.status(400).json({
        error: 'Tenant context required',
        details: 'tenantId is required. Ensure tenant middleware is configured.',
      });
    }

    // Basic validation
    if (!payload.material_code || !payload.category || !payload.origin_type || payload.base_cost === undefined) {
      return res.status(400).json({
        error: 'Invalid payload',
        details: 'material_code, category, origin_type, and base_cost are required',
      });
    }

    // Use createMaterialSafe by default (catalog write-safety)
    // This prevents accidental overwrite of existing catalog data
    const material = await materialsService.createMaterialSafe(payload, tenantId);
    res.status(201).json(material);
  } catch (error) {
    console.error('Error creating material:', error);
    if (error.message.includes('duplicate key') || error.message.includes('unique')) {
      return res.status(409).json({
        error: 'Material code already exists',
        details: error.message,
      });
    }
    if (error.message.includes('tenantId is required')) {
      return res.status(400).json({
        error: 'Tenant context required',
        details: error.message,
      });
    }
    res.status(500).json({
      error: 'Failed to create material',
      details: error.message,
    });
  }
});

/**
 * PUT /api/materials/:id
 * Update an existing material for the current tenant
 *
 * Materials are tenant-scoped (migration 058+).
 * tenantId is required.
 */
router.put('/:id', async (req, res) => {
  try {
    const tenantId = req.tenantId;

    if (!tenantId) {
      return res.status(400).json({
        error: 'Tenant context required',
        details: 'tenantId is required. Ensure tenant middleware is configured.',
      });
    }

    const material = await materialsService.updateMaterial(req.params.id, req.body, tenantId);
    res.json(material);
  } catch (error) {
    console.error('Error updating material:', error);
    if (error.message === 'Material not found' || error.message === 'Material not found or access denied') {
      return res.status(404).json({
        error: 'Material not found',
        id: req.params.id,
      });
    }
    if (error.message.includes('tenantId is required')) {
      return res.status(400).json({
        error: 'Tenant context required',
        details: error.message,
      });
    }
    res.status(500).json({
      error: 'Failed to update material',
      details: error.message,
    });
  }
});

/**
 * DELETE /api/materials/:id
 * Delete a material for the current tenant
 *
 * Materials are tenant-scoped (migration 058+).
 * tenantId is required.
 */
router.delete('/:id', async (req, res) => {
  try {
    const tenantId = req.tenantId;

    if (!tenantId) {
      return res.status(400).json({
        error: 'Tenant context required',
        details: 'tenantId is required. Ensure tenant middleware is configured.',
      });
    }

    const deleted = await materialsService.deleteMaterial(req.params.id, tenantId);
    if (!deleted) {
      return res.status(404).json({
        error: 'Material not found',
        id: req.params.id,
      });
    }
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting material:', error);
    if (error.message.includes('tenantId is required')) {
      return res.status(400).json({
        error: 'Tenant context required',
        details: error.message,
      });
    }
    res.status(500).json({
      error: 'Failed to delete material',
      details: error.message,
    });
  }
});

module.exports = router;
