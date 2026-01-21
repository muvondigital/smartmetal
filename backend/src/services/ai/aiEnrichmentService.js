const { callGPT4JSON } = require("../gcp/genaiClient");
const { getPrompt } = require("../../ai/prompts");
const { logInfo, logError } = require("../../utils/logger");

/**
 * AI Enrichment Service
 * Uses GPT-4o to enrich RFQ items with technical details, inferred specifications,
 * and validation based on context and industry knowledge
 */

/**
 * Enrich a single RFQ item with technical details
 * @param {Object} item - RFQ item to enrich
 * @param {Object} context - Additional context (customer, project, etc.)
 * @returns {Promise<Object>} - Enriched item with suggestions
 */
async function enrichRFQItem(item, context = {}) {
  try {
    console.log(`🔍 Enriching RFQ item: "${item.description.substring(0, 50)}..."`);

    const promptDef = getPrompt('ENRICHMENT_ITEM_V1');
    const prompt = [
      {
        role: 'system',
        content: promptDef.template.system
      },
      {
        role: 'user',
        content: typeof promptDef.template.user === 'function'
          ? promptDef.template.user(item, context)
          : promptDef.template.user
      }
    ];

    logInfo('rfq_item_enrichment_ai_call_start', {
      promptId: promptDef.id,
      itemDescription: item.description?.substring(0, 100)
    });

    const enriched = await callGPT4JSON(prompt, {
      temperature: 0.4, // Balance between creativity and accuracy
      maxTokens: 1500
    });

    logInfo('rfq_item_enrichment_ai_call_end', {
      promptId: promptDef.id,
      confidence: enriched.confidence
    });

    console.log(`✅ Enrichment completed (confidence: ${enriched.confidence})`);

    return {
      original_item: item,
      ...enriched,
      enriched_at: new Date().toISOString()
    };

  } catch (error) {
    logError('rfq_item_enrichment_ai_call_error', error, {
      promptId: 'ENRICHMENT_ITEM_V1',
      itemDescription: item.description?.substring(0, 100)
    });
    console.error('❌ Item enrichment failed:', error.message);
    return {
      original_item: item,
      enrichment: null,
      confidence: 0.0,
      error: error.message
    };
  }
}

/**
 * Enrich multiple RFQ items in batch
 * @param {Array} items - Array of RFQ items
 * @param {Object} context - Shared context
 * @returns {Promise<Array>} - Array of enriched items
 */
async function enrichRFQItemsBatch(items, context = {}) {
  console.log(`📦 Starting batch enrichment for ${items.length} items...`);
  const startTime = Date.now();

  const enrichedItems = [];

  // Process items sequentially to avoid rate limits
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    console.log(`   Processing item ${i + 1}/${items.length}...`);

    try {
      const enriched = await enrichRFQItem(item, context);
      enrichedItems.push(enriched);

      // Small delay to avoid rate limiting
      if (i < items.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (error) {
      console.error(`   Failed to enrich item ${i + 1}:`, error.message);
      enrichedItems.push({
        original_item: item,
        enrichment: null,
        confidence: 0.0,
        error: error.message
      });
    }
  }

  const duration = Date.now() - startTime;
  console.log(`✅ Batch enrichment completed in ${(duration / 1000).toFixed(1)}s`);

  return enrichedItems;
}

/**
 * Validate technical consistency across RFQ items
 * @param {Array} enrichedItems - Array of enriched items
 * @returns {Promise<Object>} - Validation results with inconsistencies
 */
async function validateTechnicalConsistency(enrichedItems) {
  try {
    console.log('🔍 Validating technical consistency across items...');

    // Prepare summary of all items for analysis
    const itemsSummary = enrichedItems.map((item, idx) => ({
      line_number: idx + 1,
      description: item.original_item.description,
      inferred_spec: item.enrichment?.inferred_material_spec,
      recommended_standard: item.enrichment?.recommended_standard,
      quantity: item.original_item.quantity
    }));

    const promptDef = getPrompt('ENRICHMENT_CONSISTENCY_V1');
    const prompt = [
      {
        role: 'system',
        content: promptDef.template.system
      },
      {
        role: 'user',
        content: typeof promptDef.template.user === 'function'
          ? promptDef.template.user(itemsSummary)
          : promptDef.template.user
      }
    ];

    logInfo('rfq_consistency_validation_ai_call_start', {
      promptId: promptDef.id,
      itemCount: itemsSummary.length
    });

    const validation = await callGPT4JSON(prompt, {
      temperature: 0.3,
      maxTokens: 1500
    });

    logInfo('rfq_consistency_validation_ai_call_end', {
      promptId: promptDef.id,
      issuesFound: validation.inconsistencies?.length || 0
    });

    console.log(`✅ Consistency validation completed`);
    console.log(`   Issues found: ${validation.inconsistencies?.length || 0}`);

    return validation;

  } catch (error) {
    console.error('❌ Consistency validation failed:', error.message);
    return {
      is_consistent: true, // Default to true on error
      inconsistencies: [],
      warnings: [`Validation failed: ${error.message}`],
      overall_assessment: 'Could not validate due to error'
    };
  }
}

/**
 * Suggest material specification based on application
 * @param {string} description - Item description or application
 * @param {Object} requirements - Specific requirements (pressure, temp, etc.)
 * @returns {Promise<Object>} - Material suggestions
 */
async function suggestMaterialSpec(description, requirements = {}) {
  try {
    const promptDef = getPrompt('ENRICHMENT_MATERIAL_SUGGEST_V1');
    const prompt = [
      {
        role: 'system',
        content: promptDef.template.system
      },
      {
        role: 'user',
        content: typeof promptDef.template.user === 'function'
          ? promptDef.template.user(description, requirements)
          : promptDef.template.user
      }
    ];

    logInfo('material_suggestion_ai_call_start', {
      promptId: promptDef.id
    });

    const suggestion = await callGPT4JSON(prompt, {
      temperature: 0.5,
      maxTokens: 1000
    });

    logInfo('material_suggestion_ai_call_end', {
      promptId: promptDef.id,
      confidence: suggestion.confidence
    });

    return suggestion;

  } catch (error) {
    console.error('❌ Material suggestion failed:', error.message);
    return {
      primary_recommendation: null,
      alternatives: [],
      considerations: [`Error: ${error.message}`],
      confidence: 0.0
    };
  }
}

/**
 * Extract technical attributes from free-text description
 * @param {string} description - Item description
 * @returns {Promise<Object>} - Extracted attributes
 */
async function extractTechnicalAttributes(description) {
  try {
    const promptDef = getPrompt('ENRICHMENT_ATTRIBUTE_EXTRACT_V1');
    const prompt = [
      {
        role: 'system',
        content: promptDef.template.system
      },
      {
        role: 'user',
        content: typeof promptDef.template.user === 'function'
          ? promptDef.template.user(description)
          : promptDef.template.user
      }
    ];

    logInfo('attribute_extraction_ai_call_start', {
      promptId: promptDef.id
    });

    const attributes = await callGPT4JSON(prompt, {
      temperature: 0.2, // Low temperature for accurate extraction
      maxTokens: 500
    });

    logInfo('attribute_extraction_ai_call_end', {
      promptId: promptDef.id,
      confidence: attributes.confidence
    });

    return attributes;

  } catch (error) {
    console.error('❌ Attribute extraction failed:', error.message);
    return {
      product_type: null,
      confidence: 0.0,
      error: error.message
    };
  }
}

module.exports = {
  enrichRFQItem,
  enrichRFQItemsBatch,
  validateTechnicalConsistency,
  suggestMaterialSpec,
  extractTechnicalAttributes
};
