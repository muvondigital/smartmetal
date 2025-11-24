const express = require('express');
const router = express.Router();
const materialsService = require('../services/materialsService');

/**
 * GET /api/materials
 * Get all materials
 */
router.get('/', async (req, res) => {
  try {
    const materials = await materialsService.getAllMaterials();
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
 * GET /api/materials/:materialCode
 * Get a material by material_code
 */
router.get('/code/:materialCode', async (req, res) => {
  try {
    const material = await materialsService.getMaterialByCode(req.params.materialCode);
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
 * Get a material by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const material = await materialsService.getMaterialById(req.params.id);
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
 * Create a new material
 */
router.post('/', async (req, res) => {
  try {
    const payload = req.body;

    // Basic validation
    if (!payload.material_code || !payload.category || !payload.origin_type || payload.base_cost === undefined) {
      return res.status(400).json({
        error: 'Invalid payload',
        details: 'material_code, category, origin_type, and base_cost are required',
      });
    }

    const material = await materialsService.createMaterial(payload);
    res.status(201).json(material);
  } catch (error) {
    console.error('Error creating material:', error);
    if (error.message.includes('duplicate key') || error.message.includes('unique')) {
      return res.status(409).json({
        error: 'Material code already exists',
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
 * Update an existing material
 */
router.put('/:id', async (req, res) => {
  try {
    const material = await materialsService.updateMaterial(req.params.id, req.body);
    res.json(material);
  } catch (error) {
    console.error('Error updating material:', error);
    if (error.message === 'Material not found') {
      return res.status(404).json({
        error: 'Material not found',
        id: req.params.id,
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
 * Delete a material
 */
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await materialsService.deleteMaterial(req.params.id);
    if (!deleted) {
      return res.status(404).json({
        error: 'Material not found',
        id: req.params.id,
      });
    }
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting material:', error);
    res.status(500).json({
      error: 'Failed to delete material',
      details: error.message,
    });
  }
});

module.exports = router;

