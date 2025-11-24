const express = require('express');
const { parseRfqWithAzureOpenAI } = require('../services/aiParseService');
const { matchMaterialsForLineItem } = require('../services/materialMatchService');
const rfqService = require('../services/rfqService');

const router = express.Router();

/**
 * POST /api/ai/parse-rfq-json
 * Parse RFQ data from structured OCR output using AI
 * 
 * Request body:
 * {
 *   structured: {
 *     rawPages: number,
 *     text: string,
 *     tables: Array<{rowCount, columnCount, rows: string[][]}>
 *   },
 *   options: {
 *     autoCreateRfq: boolean (default: true),
 *     attachMaterials: boolean (default: true)
 *   }
 * }
 * 
 * Response:
 * {
 *   rfq_metadata: {...},
 *   line_items: [...],
 *   created: { rfq_id: string | null, rfq_item_count: number },
 *   debug: {...}
 * }
 */
router.post('/parse-rfq-json', async (req, res) => {
  try {
    const { structured, options = {} } = req.body;

    // Validate input
    if (!structured || !structured.text) {
      return res.status(400).json({
        error: 'Invalid request',
        details: 'structured.text is required',
      });
    }

    const autoCreateRfq = options.autoCreateRfq !== false; // default true
    const attachMaterials = options.attachMaterials !== false; // default true

    console.log('[AI Route] Starting RFQ parsing...');
    console.log(`[AI Route] Options: autoCreateRfq=${autoCreateRfq}, attachMaterials=${attachMaterials}`);

    // Step 1: Parse RFQ with Azure OpenAI
    const parsed = await parseRfqWithAzureOpenAI(structured);

    let lineItems = parsed.line_items || [];

    // Step 2: Match materials for each line item if requested
    if (attachMaterials && lineItems.length > 0) {
      console.log('[AI Route] Matching materials for line items...');
      const itemsWithMaterials = await Promise.all(
        lineItems.map(async (item) => {
          try {
            const matches = await matchMaterialsForLineItem(item, {
              maxResults: 3,
              minScore: 40,
            });
            return {
              ...item,
              matched_materials: matches || [],
            };
          } catch (error) {
            console.error(`[AI Route] Error matching materials for item:`, error);
            return {
              ...item,
              matched_materials: [],
            };
          }
        })
      );
      lineItems = itemsWithMaterials;
    } else {
      // Ensure matched_materials array exists even if not matching
      lineItems = lineItems.map((item) => ({
        ...item,
        matched_materials: item.matched_materials || [],
      }));
    }

    // Step 3: Create RFQ if requested
    let createdRfqId = null;
    let createdItemCount = 0;

    if (autoCreateRfq && parsed.rfq_metadata) {
      try {
        console.log('[AI Route] Creating RFQ in database...');
        const clientName = parsed.rfq_metadata.client_name || 'Unknown Client';

        // Create RFQ (service will auto-generate title)
        const rfq = await rfqService.createRfqFromPayload({
          customer_name: clientName,
        });

        createdRfqId = rfq.id;

        // Add line items to RFQ
        if (lineItems.length > 0) {
          console.log(`[AI Route] Adding ${lineItems.length} items to RFQ...`);
          for (const item of lineItems) {
            try {
              // Get best matched material code if available
              const materialCode =
                item.matched_materials && item.matched_materials.length > 0
                  ? item.matched_materials[0].material_code
                  : null;

              await rfqService.addRfqItem(rfq.id, {
                description: item.description || '',
                quantity: item.quantity || 0,
                unit: item.unit || 'PCS',
                material_code: materialCode,
                line_number: item.line_number ? parseInt(item.line_number, 10) : null,
              });
              createdItemCount++;
            } catch (error) {
              console.error(`[AI Route] Error adding item to RFQ:`, error);
              // Continue with other items
            }
          }
        }
        console.log(`[AI Route] RFQ created successfully: ${createdRfqId} with ${createdItemCount} items`);
      } catch (error) {
        console.error('[AI Route] Error creating RFQ:', error);
        // Don't fail the entire request if RFQ creation fails
        // The parsed data will still be returned
      }
    }

    // Build response
    const response = {
      rfq_metadata: parsed.rfq_metadata || {},
      line_items: lineItems,
      created: {
        rfq_id: createdRfqId,
        rfq_item_count: createdItemCount,
      },
      debug: {
        azure_openai_model: parsed._debug?.model || null,
        prompt_tokens: parsed._debug?.promptTokens || null,
        completion_tokens: parsed._debug?.completionTokens || null,
      },
    };

    res.json(response);
  } catch (error) {
    console.error('[AI Route] Error in parse-rfq-json:', error);
    res.status(500).json({
      error: 'Failed to parse RFQ',
      details: error.message,
    });
  }
});

module.exports = router;

