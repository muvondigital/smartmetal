// SmartMetal CPQ - A product from Muvon Digital, an innovation arm of Muvon Energy
// Developed by Muvon Digital, the innovation arm of Muvon Energy.
// Copyright (c) 2025 Muvon Energy. All rights reserved.
// Proprietary & Confidential — Not for distribution.

/**
 * AI to Pricing Timing Tracker
 * Tracks the time from AI detection start to pricing finish
 */

// In-memory store: rfqId -> { aiDetectionStartTime, timestamp }
const timingStore = new Map();

/**
 * Record AI detection start time for an RFQ
 * @param {string} rfqId - RFQ UUID
 * @returns {number} - Start timestamp in milliseconds
 */
function recordAiDetectionStart(rfqId) {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();
  timingStore.set(rfqId, {
    aiDetectionStartTime: startTime,
    timestamp,
  });
  return startTime;
}

/**
 * Calculate and log time from AI detection to pricing finish
 * @param {string} rfqId - RFQ UUID
 * @returns {Object|null} - Timing info or null if not found
 */
function calculateAiToPricingTime(rfqId) {
  const record = timingStore.get(rfqId);
  if (!record) {
    return null;
  }

  const pricingFinishTime = Date.now();
  const elapsedMs = pricingFinishTime - record.aiDetectionStartTime;
  const elapsedSeconds = (elapsedMs / 1000).toFixed(2);

  return {
    aiDetectionStartTime: record.aiDetectionStartTime,
    aiDetectionTimestamp: record.timestamp,
    pricingFinishTime,
    pricingFinishTimestamp: new Date().toISOString(),
    elapsedMs,
    elapsedSeconds,
  };
}

/**
 * Transfer timing record from one ID to another (e.g., from temp ID to RFQ ID)
 * @param {string} fromId - Source ID
 * @param {string} toId - Target ID
 * @returns {boolean} - True if transfer was successful
 */
function transferTiming(fromId, toId) {
  const record = timingStore.get(fromId);
  if (!record) {
    return false;
  }
  timingStore.set(toId, record);
  timingStore.delete(fromId);
  return true;
}

/**
 * Clear timing record for an RFQ (cleanup)
 * @param {string} rfqId - RFQ UUID
 */
function clearTiming(rfqId) {
  timingStore.delete(rfqId);
}

/**
 * Get all active timing records (for debugging)
 * @returns {Array} - Array of timing records
 */
function getAllTimings() {
  return Array.from(timingStore.entries()).map(([rfqId, record]) => ({
    rfqId,
    ...record,
  }));
}

module.exports = {
  recordAiDetectionStart,
  calculateAiToPricingTime,
  transferTiming,
  clearTiming,
  getAllTimings,
};

