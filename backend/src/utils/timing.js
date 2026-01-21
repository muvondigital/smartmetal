// SmartMetal CPQ - A product from Muvon Digital, an innovation arm of Muvon Energy
// Developed by Muvon Digital, the innovation arm of Muvon Energy.
// Copyright (c) 2025 Muvon Energy. All rights reserved.
// Proprietary & Confidential — Not for distribution.

const { log } = require('./logger');

/**
 * Service-level timing utilities
 *
 * Provides reusable helpers for timing expensive operations inside services.
 * Controlled by ENABLE_TIMING_LOGS environment variable.
 *
 * Usage:
 *
 * 1. Time a single async operation:
 *
 *    const result = await timeAsync(
 *      'AI Risk Assessment',
 *      () => aiApprovalService.assessQuoteRisk(pricingRunId),
 *      { correlationId, tenantId, pricingRunId }
 *    );
 *
 * 2. Time a multi-phase operation:
 *
 *    const timing = createTimingContext('Pricing Run Creation', { correlationId, tenantId, rfqId });
 *
 *    timing.phase('fetch_rfq_and_materials');
 *    // ... fetch logic ...
 *
 *    timing.phase('pricing_loop');
 *    // ... loop ...
 *
 *    timing.phase('tax_calculation');
 *    // ... tax logic ...
 *
 *    timing.complete();
 */

/**
 * Time an async operation
 * @param {string} operationName - Name of operation (e.g., "AI Risk Assessment")
 * @param {Function} fn - Async function to time
 * @param {Object} context - Logging context (correlationId, tenantId, etc.)
 * @returns {Promise<any>} Result of fn
 */
async function timeAsync(operationName, fn, context = {}) {
  const enabled = process.env.ENABLE_TIMING_LOGS === 'true';

  if (!enabled) {
    return await fn();
  }

  const startMs = Date.now();
  const startHr = process.hrtime();

  try {
    const result = await fn();
    const elapsedMs = Date.now() - startMs;
    const elapsedHr = process.hrtime(startHr);
    const elapsedHrMs = elapsedHr[0] * 1000 + elapsedHr[1] / 1e6;

    log.logInfo(`✓ ${operationName}`, {
      ...context,
      operation: operationName,
      durationMs: Math.round(elapsedMs),
      durationHrMs: parseFloat(elapsedHrMs.toFixed(2)),
      type: 'timing',
      status: 'success',
    });

    return result;
  } catch (error) {
    const elapsedMs = Date.now() - startMs;
    log.logError(`✗ ${operationName} failed`, error, {
      ...context,
      operation: operationName,
      durationMs: Math.round(elapsedMs),
      type: 'timing',
      status: 'error',
    });
    throw error;
  }
}

/**
 * Create a timing context for complex operations with multiple phases
 * @param {string} operationName - Name of overall operation
 * @param {Object} context - Logging context (correlationId, tenantId, etc.)
 * @returns {Object} Timing context with phase() and complete() methods
 */
function createTimingContext(operationName, context = {}) {
  const enabled = process.env.ENABLE_TIMING_LOGS === 'true';
  const startMs = Date.now();
  const phases = {};
  let lastPhaseMs = startMs;

  return {
    /**
     * Mark the start of a new phase
     * Records elapsed time since last phase (or start)
     * @param {string} phaseName - Name of the phase
     */
    phase(phaseName) {
      if (!enabled) return;
      const now = Date.now();
      const phaseElapsed = now - lastPhaseMs;
      phases[phaseName] = phaseElapsed;
      lastPhaseMs = now;
    },

    /**
     * Mark operation complete and log results
     */
    complete() {
      if (!enabled) return;
      const totalMs = Date.now() - startMs;
      log.logInfo(`✓ ${operationName} completed`, {
        ...context,
        operation: operationName,
        totalMs,
        phases,
        type: 'timing',
        status: 'success',
      });
    },

    /**
     * Mark operation failed and log results
     * @param {Error} error - Error that occurred
     */
    fail(error) {
      if (!enabled) return;
      const totalMs = Date.now() - startMs;
      log.logError(`✗ ${operationName} failed`, error, {
        ...context,
        operation: operationName,
        totalMs,
        phases,
        type: 'timing',
        status: 'error',
      });
    },
  };
}

/**
 * Simple timing helper for synchronous operations or manual timing
 * @returns {Object} Timer with start() and end() methods
 */
function createTimer() {
  let startMs = null;

  return {
    start() {
      startMs = Date.now();
    },
    end() {
      if (startMs === null) {
        throw new Error('Timer not started');
      }
      const elapsedMs = Date.now() - startMs;
      startMs = null;
      return elapsedMs;
    },
    elapsed() {
      if (startMs === null) {
        return null;
      }
      return Date.now() - startMs;
    },
  };
}

module.exports = {
  timeAsync,
  createTimingContext,
  createTimer,
};
