const express = require('express');
const router = express.Router();
const pipesService = require('../services/pipesService');

/**
 * GET /api/pipes
 * Get pipes with optional filters
 *
 * Query params:
 * - npsInch: Filter by nominal pipe size (number)
 * - schedule: Filter by schedule (string)
 * - standard: Filter by standard (string)
 * - materialSpec: Filter by material specification (string)
 * - isStainless: Filter by stainless flag (boolean)
 * - isPreferred: Filter by preferred flag (boolean)
 * - limit: Maximum number of results (default: 50)
 *
 * Mode A: If npsInch AND schedule are provided, returns single pipe or 404
 * Mode B: Otherwise, returns array of pipes matching filters
 */
router.get('/', async (req, res) => {
  try {
    const {
      npsInch,
      schedule,
      standard,
      materialSpec,
      isStainless,
      isPreferred,
      limit,
    } = req.query;

    // Mode A: Specific pipe lookup by NPS and schedule
    if (npsInch !== undefined && schedule !== undefined) {
      const nps = parseFloat(npsInch);
      if (isNaN(nps)) {
        return res.status(400).json({
          error: 'Invalid npsInch parameter',
          details: 'npsInch must be a valid number',
        });
      }

      const pipe = await pipesService.getPipeByNpsSchedule(nps, schedule, standard || null);

      if (!pipe) {
        return res.status(404).json({
          error: 'Pipe not found',
          npsInch: nps,
          schedule: schedule,
          standard: standard || null,
        });
      }

      return res.json(pipe);
    }

    // Mode B: List pipes with filters
    const filters = {};

    if (npsInch !== undefined) {
      const nps = parseFloat(npsInch);
      if (isNaN(nps)) {
        return res.status(400).json({
          error: 'Invalid npsInch parameter',
          details: 'npsInch must be a valid number',
        });
      }
      filters.npsInch = nps;
    }

    if (schedule) filters.schedule = schedule;
    if (standard) filters.standard = standard;
    if (materialSpec) filters.materialSpec = materialSpec;

    if (isStainless !== undefined) {
      filters.isStainless = isStainless === 'true' || isStainless === true;
    }

    if (isPreferred !== undefined) {
      filters.isPreferred = isPreferred === 'true' || isPreferred === true;
    }

    if (limit !== undefined) {
      const limitNum = parseInt(limit, 10);
      if (isNaN(limitNum) || limitNum < 1 || limitNum > 500) {
        return res.status(400).json({
          error: 'Invalid limit parameter',
          details: 'limit must be a number between 1 and 500',
        });
      }
      filters.limit = limitNum;
    }

    const pipes = await pipesService.getAllPipes(filters);
    res.json(pipes);
  } catch (error) {
    console.error('Error fetching pipes:', error);
    res.status(500).json({
      error: 'Failed to fetch pipes',
      details: error.message,
    });
  }
});

/**
 * GET /api/pipes/standards
 * Get list of distinct pipe standards
 */
router.get('/standards', async (req, res) => {
  try {
    const standards = await pipesService.getPipeStandards();
    res.json(standards);
  } catch (error) {
    console.error('Error fetching pipe standards:', error);
    res.status(500).json({
      error: 'Failed to fetch pipe standards',
      details: error.message,
    });
  }
});

/**
 * GET /api/pipes/schedules
 * Get list of distinct pipe schedules
 */
router.get('/schedules', async (req, res) => {
  try {
    const schedules = await pipesService.getPipeSchedules();
    res.json(schedules);
  } catch (error) {
    console.error('Error fetching pipe schedules:', error);
    res.status(500).json({
      error: 'Failed to fetch pipe schedules',
      details: error.message,
    });
  }
});

/**
 * GET /api/pipes/lookup
 * Debug endpoint to lookup pipes by DN or NPS + schedule
 *
 * Query params:
 * - dn: DN size in millimeters (number)
 * - nps: NPS size in inches (number)
 * - schedule: Pipe schedule (required) (string)
 * - standard: Optional standard filter (string)
 *
 * Returns the matching pipe or 404 if not found
 */
router.get('/lookup', async (req, res) => {
  try {
    const { dn, nps, schedule, standard } = req.query;

    if (!schedule) {
      return res.status(400).json({
        error: 'Missing required parameter',
        details: 'schedule parameter is required',
      });
    }

    let pipe = null;

    // Try DN lookup first if provided
    if (dn !== undefined) {
      const dnMm = parseInt(dn, 10);
      if (isNaN(dnMm)) {
        return res.status(400).json({
          error: 'Invalid dn parameter',
          details: 'dn must be a valid integer',
        });
      }
      pipe = await pipesService.getPipeByDnAndSchedule(dnMm, schedule, standard || null);
    }

    // Fall back to NPS if DN didn't find a match
    if (!pipe && nps !== undefined) {
      const npsInch = parseFloat(nps);
      if (isNaN(npsInch)) {
        return res.status(400).json({
          error: 'Invalid nps parameter',
          details: 'nps must be a valid number',
        });
      }
      pipe = await pipesService.getPipeByNpsSchedule(npsInch, schedule, standard || null);
    }

    if (!pipe) {
      return res.status(404).json({
        error: 'Pipe not found',
        query: { dn, nps, schedule, standard: standard || null },
      });
    }

    res.json(pipe);
  } catch (error) {
    console.error('Error looking up pipe:', error);
    res.status(500).json({
      error: 'Failed to lookup pipe',
      details: error.message,
    });
  }
});

/**
 * GET /api/pipes/:id
 * Get a pipe by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const pipe = await pipesService.getPipeById(req.params.id);
    if (!pipe) {
      return res.status(404).json({
        error: 'Pipe not found',
        id: req.params.id,
      });
    }
    res.json(pipe);
  } catch (error) {
    console.error('Error fetching pipe:', error);
    res.status(500).json({
      error: 'Failed to fetch pipe',
      details: error.message,
    });
  }
});

/**
 * POST /api/pipes
 * Create a new pipe
 */
router.post('/', async (req, res) => {
  try {
    const payload = req.body;

    // Validate required fields
    if (!payload.standard || payload.nps_inch === undefined) {
      return res.status(400).json({
        error: 'Invalid payload',
        details: 'standard and nps_inch are required',
      });
    }

    const pipe = await pipesService.createPipe(payload);
    res.status(201).json(pipe);
  } catch (error) {
    console.error('Error creating pipe:', error);
    if (error.message.includes('duplicate key') || error.message.includes('unique')) {
      return res.status(409).json({
        error: 'Pipe already exists',
        details: error.message,
      });
    }
    res.status(500).json({
      error: 'Failed to create pipe',
      details: error.message,
    });
  }
});

/**
 * PUT /api/pipes/:id
 * Update an existing pipe
 */
router.put('/:id', async (req, res) => {
  try {
    const pipe = await pipesService.updatePipe(req.params.id, req.body);
    res.json(pipe);
  } catch (error) {
    console.error('Error updating pipe:', error);
    if (error.message === 'Pipe not found') {
      return res.status(404).json({
        error: 'Pipe not found',
        id: req.params.id,
      });
    }
    res.status(500).json({
      error: 'Failed to update pipe',
      details: error.message,
    });
  }
});

/**
 * DELETE /api/pipes/:id
 * Delete a pipe
 */
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await pipesService.deletePipe(req.params.id);
    if (!deleted) {
      return res.status(404).json({
        error: 'Pipe not found',
        id: req.params.id,
      });
    }
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting pipe:', error);
    res.status(500).json({
      error: 'Failed to delete pipe',
      details: error.message,
    });
  }
});

module.exports = router;
