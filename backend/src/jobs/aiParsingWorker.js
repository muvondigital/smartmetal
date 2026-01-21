/**
 * AI Parsing Worker
 * Processes AI parsing jobs from Azure Service Bus
 * 
 * Part of: Azure Phase 1 - Service Bus Integration
 * Developed by Muvon Digital (Muvon Energy)
 */

const { receiveMessages } = require('../services/gcp/pubsubService');
const { config } = require('../config/env');
const { log } = require('../utils/logger');
const { parseRfqWithGemini } = require('../services/aiParseService');
const { matchMaterialsBatch } = require('../services/materialMatchService');
const rfqService = require('../services/rfqService');

/**
 * Process an AI parsing job
 * @param {Object} jobData - Job data from Service Bus
 * @param {Object} messageMetadata - Message metadata (correlationId, etc.)
 */
async function processAiParsing(jobData, messageMetadata) {
  const correlationId = messageMetadata.correlationId || `worker-${Date.now()}`;
  const logContext = {
    correlationId,
    tenantId: jobData.tenantId || null,
    operation: 'ai_parsing_worker',
  };

  try {
    log.logInfo('Processing AI parsing job', {
      ...logContext,
      structuredData: !!jobData.structured,
    });

    const { structured, options = {} } = jobData;
    const autoCreateRfq = options.autoCreateRfq !== false; // default true
    const attachMaterials = options.attachMaterials !== false; // default true

    // Step 1: Parse RFQ with Vertex AI (Gemini)
    let parsed;
    try {
      parsed = await parseRfqWithGemini(structured);
    } catch (parseError) {
      log.logError('AI parsing failed', parseError, logContext);
      throw new Error(`AI parsing failed: ${parseError.message}`);
    }

    log.logInfo('AI parsing completed', {
      ...logContext,
      itemCount: parsed.line_items?.length || 0,
    });

    // Step 2: Match materials if requested
    let materialMatches = null;
    if (attachMaterials && parsed.line_items && parsed.line_items.length > 0) {
      log.logInfo('Matching materials', {
        ...logContext,
        itemCount: parsed.line_items.length,
      });

      materialMatches = await matchMaterialsBatch(
        parsed.line_items,
        { autoSelectThreshold: 90 }
      );
    }

    // Step 3: Create RFQ if requested
    let rfqId = null;
    let rfqItemCount = 0;
    if (autoCreateRfq && parsed.rfq_metadata) {
      log.logInfo('Creating RFQ from parsed data', logContext);

      try {
        const rfqData = {
          customer_name: parsed.rfq_metadata.customer_name || 'Unknown',
          project_name: parsed.rfq_metadata.project_name,
          project_code: parsed.rfq_metadata.project_code,
          due_date: parsed.rfq_metadata.due_date,
          status: 'reviewing',
          tenant_id: jobData.tenantId || null,
        };

        const rfq = await rfqService.createRFQ(rfqData, jobData.tenantId || null);

        // Add line items
        if (parsed.line_items && parsed.line_items.length > 0) {
          for (const item of parsed.line_items) {
            const materialCode = materialMatches?.find(
              m => m.original_item === item || m.original_item?.description === item.description
            )?.material_code;

            await rfqService.addRFQItem(rfq.id, {
              description: item.description,
              quantity: item.quantity,
              unit: item.unit,
              size: item.size,
              grade: item.grade,
              specification: item.specification,
              material_code: materialCode,
              tenant_id: jobData.tenantId || null,
            });
          }
          rfqItemCount = parsed.line_items.length;
        }

        rfqId = rfq.id;
        log.logInfo('RFQ created successfully', {
          ...logContext,
          rfqId,
          itemCount: rfqItemCount,
        });
      } catch (rfqError) {
        log.logError('RFQ creation failed', rfqError, logContext);
        // Don't throw - parsing succeeded, RFQ creation is optional
      }
    }

    log.logInfo('AI parsing job completed', {
      ...logContext,
      rfqId,
      itemCount: rfqItemCount,
    });

    return {
      success: true,
      rfq_metadata: parsed.rfq_metadata,
      line_items: parsed.line_items,
      created: {
        rfq_id: rfqId,
        rfq_item_count: rfqItemCount,
      },
      material_matches: materialMatches,
    };
  } catch (error) {
    log.logError('AI parsing job failed', error, logContext);
    throw error; // Re-throw to trigger Service Bus retry
  }
}

/**
 * Start the AI parsing worker
 */
async function startAiParsingWorker() {
  const queueName = config.gcp.pubsub.parsingTopic;

  if (!queueName) {
    log.warn('AI parsing queue not configured, worker not started');
    return;
  }

  log.info('Starting AI parsing worker', { queueName });

  try {
    await receiveMessages(queueName, processAiParsing, {
      maxConcurrentCalls: 1, // Process one message at a time
    });
  } catch (error) {
    log.error('AI parsing worker failed to start', error);
    throw error;
  }
}

module.exports = {
  startAiParsingWorker,
  processAiParsing,
};

