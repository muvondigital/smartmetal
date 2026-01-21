/**
 * AI Prompts Central Registry
 * 
 * Centralized prompt management with versioning and stable IDs.
 * All Azure OpenAI prompts are defined here with unique promptIds.
 * 
 * Phase 4: AI Prompt Centralization and Versioning
 */

const rfqExtractionPrompts = require('./rfqExtractionPrompts');
const enrichmentPrompts = require('./enrichmentPrompts');
const approvalPrompts = require('./approvalPrompts');
// const pricingPrompts = require('./pricingPrompts'); // REMOVED: AI pricing feature removed
const emailPrompts = require('./emailPrompts');
const mtoExtractionPrompts = require('./mtoExtractionPrompts');

/**
 * Registry of all prompts by promptId
 */
const promptRegistry = {
  // RFQ Extraction
  ...rfqExtractionPrompts,

  // Enrichment
  ...enrichmentPrompts,

  // Approval
  ...approvalPrompts,

  // Pricing - REMOVED
  // ...pricingPrompts,

  // Email
  ...emailPrompts,

  // MTO Extraction
  ...mtoExtractionPrompts,
};

/**
 * Get a prompt by its ID
 * @param {string} promptId - The prompt ID (e.g., "RFQ_EXTRACT_V1")
 * @returns {Object} Prompt object with { id, description, template }
 * @throws {Error} If promptId is not found
 */
function getPrompt(promptId) {
  const prompt = promptRegistry[promptId];
  if (!prompt) {
    throw new Error(`Unknown promptId: ${promptId}. Available prompts: ${Object.keys(promptRegistry).join(', ')}`);
  }
  return prompt;
}

/**
 * Get all prompts (for debugging/admin purposes)
 * @returns {Object} All prompts keyed by promptId
 */
function getAllPrompts() {
  return promptRegistry;
}

/**
 * List all available prompt IDs
 * @returns {Array<string>} Array of prompt IDs
 */
function listPromptIds() {
  return Object.keys(promptRegistry);
}

module.exports = {
  getPrompt,
  getAllPrompts,
  listPromptIds,
  // Re-export individual prompt modules for direct access if needed
  rfqExtractionPrompts,
  enrichmentPrompts,
  approvalPrompts,
  // pricingPrompts, // REMOVED: AI pricing feature removed
  emailPrompts,
  mtoExtractionPrompts,
};

