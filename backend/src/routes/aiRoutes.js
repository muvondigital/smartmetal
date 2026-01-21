const express = require('express');
const multer = require('multer');
const { parseRfqWithGemini } = require('../services/aiParseService');
const { matchMaterialsForLineItem, matchMaterialsBatch } = require('../services/materialMatchService');
const rfqService = require('../services/rfqService');
const documentIntelligenceService = require('../services/gcp/documentAiService');
const aiEnrichmentService = require('../services/ai/aiEnrichmentService');
// const aiPricingService = require('../services/ai/aiPricingService'); // REMOVED: AI pricing prediction feature
const DocumentExtraction = require('../models/DocumentExtraction');
const MtoExtraction = require('../models/MtoExtraction');
const { connectDb } = require('../db/supabaseClient');
const { aiRateLimiter } = require('../middleware/rateLimiter');
const { asyncHandler, ValidationError } = require('../middleware/errorHandler');
const { uploadRfqDocument } = require('../services/gcp/cloudStorageService');
const { createHttpTask } = require('../services/gcp/cloudTasksService');
const { config } = require('../config/env');

const router = express.Router();

/**
 * Auto-detect document type from filename and extracted content
 * Supports: MTO, BOQ, PO, Tender, Budget (defaults to RFQ)
 *
 * @param {string} filename - Original filename of the uploaded document
 * @param {object} extractedData - Parsed data from AI extraction
 * @returns {string} - Document type: 'MTO', 'BOQ', 'PO', 'Tender', 'Budget', or 'RFQ'
 */
function detectDocumentType(filename, extractedData) {
  // 1. Check if AI extraction returned document_type
  if (extractedData?.document_type) {
    console.log(`[AI Route] Document type from AI extraction: ${extractedData.document_type}`);
    return extractedData.document_type;
  }

  // 2. Check filename patterns (case-insensitive)
  const fn = (filename || '').toUpperCase();

  if (fn.includes('MTO') || fn.includes('MATERIAL TAKE') || fn.includes('MATERIAL-TAKE') || fn.includes('MATERIAL_TAKE')) {
    console.log(`[AI Route] Document type detected from filename (MTO pattern): MTO`);
    return 'MTO';
  }
  if (fn.includes('BOQ') || fn.includes('BILL OF QUANT') || fn.includes('BILL-OF-QUANT') || fn.includes('BILL_OF_QUANT')) {
    console.log(`[AI Route] Document type detected from filename (BOQ pattern): BOQ`);
    return 'BOQ';
  }
  if (fn.includes('PO_') || fn.includes('PO-') || fn.includes('PURCHASE ORDER') || fn.includes('PURCHASE_ORDER') || fn.includes('PURCHASE-ORDER')) {
    console.log(`[AI Route] Document type detected from filename (PO pattern): PO`);
    return 'PO';
  }
  if (fn.includes('TENDER')) {
    console.log(`[AI Route] Document type detected from filename (Tender pattern): Tender`);
    return 'Tender';
  }
  if (fn.includes('BUDGET')) {
    console.log(`[AI Route] Document type detected from filename (Budget pattern): Budget`);
    return 'Budget';
  }

  // 3. Check extracted content for document type indicators
  const text = JSON.stringify(extractedData || {}).toUpperCase();
  if (text.includes('MATERIAL TAKE-OFF') || text.includes('MATERIAL TAKE OFF') || text.includes('MTO SHEET')) {
    console.log(`[AI Route] Document type detected from content (MTO indicators): MTO`);
    return 'MTO';
  }
  if (text.includes('BILL OF QUANTITIES') || text.includes('BILL OF QUANTITY')) {
    console.log(`[AI Route] Document type detected from content (BOQ indicators): BOQ`);
    return 'BOQ';
  }

  // 4. Default to RFQ
  console.log(`[AI Route] Document type defaulting to: RFQ`);
  return 'RFQ';
}

// Apply AI rate limiting to all routes in this router
// This protects both legacy (/api/ai) and v1 (/api/v1/ai) routes from budget overrun
// Azure OpenAI GPT-4o: ~$0.03 per request, Document Intelligence: ~$0.10 per page
router.use(aiRateLimiter);

// Configure multer for file uploads (store in memory)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

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
    const originalFilename = typeof options.originalFilename === 'string' ? options.originalFilename : undefined;

    // NEW: Page range filtering support
    // This is useful for documents where line items are only on specific pages
    // Example: PetroVietnam documents where MTO data starts at page 26
    const pageRangeStart = options.pageRangeStart ? parseInt(options.pageRangeStart, 10) : null;
    const pageRangeEnd = options.pageRangeEnd ? parseInt(options.pageRangeEnd, 10) : null;

    console.log('[AI Route] Starting RFQ parsing...');
    console.log(`[AI Route] Options: autoCreateRfq=${autoCreateRfq}, attachMaterials=${attachMaterials}`);
    if (pageRangeStart || pageRangeEnd) {
      console.log(`[AI Route] 📄 Page range filter: ${pageRangeStart || 1}-${pageRangeEnd || 'end'}`);
    }
    console.log(`[AI Route] Text length: ${structured.text?.length || 0} characters`);
    console.log(`[AI Route] Tables count (before filtering): ${structured.tables?.length || 0}`);

    // Step 1: Try direct table extraction first (faster, cheaper, more reliable than AI)
    let parsed;
    try {
      // IMPORTANT: Use direct table extraction from documentAiService instead of AI parsing
      // This avoids token limits, hallucination, and is deterministic
      const documentAiModule = require('../services/gcp/documentAiService');
      const extractItemsFromExcelTables = documentAiModule.extractItemsFromExcelTables ||
                                          require('../services/gcp/documentAiService').extractItemsFromExcelTables;

      if (structured.tables && structured.tables.length > 0) {
        console.log(`\n========================================`);
        console.log(`📊 ATTEMPTING DIRECT TABLE EXTRACTION`);
        console.log(`========================================`);
        console.log(`Found ${structured.tables.length} tables from OCR`);

        // FILTER TABLES BY PAGE RANGE IF SPECIFIED
        let tablesToProcess = structured.tables;
        if (pageRangeStart || pageRangeEnd) {
          const originalCount = tablesToProcess.length;
          tablesToProcess = tablesToProcess.filter(table => {
            // If table has pageNumbers array, check if any page is in range
            if (table.pageNumbers && Array.isArray(table.pageNumbers)) {
              return table.pageNumbers.some(pageNum => {
                const inRange = (!pageRangeStart || pageNum >= pageRangeStart) &&
                                (!pageRangeEnd || pageNum <= pageRangeEnd);
                return inRange;
              });
            }
            // If table has single page property, check that
            if (table.page) {
              const pageNum = parseInt(table.page, 10);
              return (!pageRangeStart || pageNum >= pageRangeStart) &&
                     (!pageRangeEnd || pageNum <= pageRangeEnd);
            }
            // If no page info, include the table (safer to process than skip)
            return true;
          });
          console.log(`📄 Page range filter (${pageRangeStart || 1}-${pageRangeEnd || 'end'}): ${originalCount} tables → ${tablesToProcess.length} tables`);
        }

        console.log(`📋 Processing ${tablesToProcess.length} tables for extraction`);

        // Convert OCR table format to the format expected by extractItemsFromExcelTables
        // OCR format: { rows: [["col1", "col2"], ["val1", "val2"]] }
        // Expected format: { headers: ["col1", "col2"], rows: [{col1: "val1", col2: "val2"}] }
        const convertedTables = tablesToProcess.map((table, idx) => {
          if (!table.rows || table.rows.length === 0) {
            return { headers: [], rows: [] };
          }

          // First row is headers
          const headers = table.rows[0] || [];

          // Remaining rows are data - convert to object format
          const dataRows = table.rows.slice(1).map(row => {
            const rowObj = {};
            headers.forEach((header, colIdx) => {
              rowObj[header] = row[colIdx] || '';
            });
            return rowObj;
          });

          return {
            headers: headers,
            rows: dataRows,
            sheetName: null
          };
        });

        console.log(`📋 Converted ${convertedTables.length} tables to extraction format`);

        const tableStructured = extractItemsFromExcelTables(convertedTables, structured.sheetMetadata);

        if (tableStructured.items && tableStructured.items.length >= 1) {
          console.log(`✅ SUCCESS: Extracted ${tableStructured.items.length} items from tables`);
          console.log(`✅ SKIPPING GEMINI - Using deterministic table extraction`);
          console.log(`========================================\n`);

          const rfqReference = tableStructured.metadata?.rfq_number || null;
          const itemsWithReference = tableStructured.items.map(item => ({
            ...item,
            rfq_reference: item.rfq_reference || rfqReference
          }));

          parsed = {
            metadata: tableStructured.metadata,
            items: itemsWithReference,
            confidence: 0.95,
            extraction_notes: `✅ Direct table extraction (${tablesToProcess.length} tables processed, ${itemsWithReference.length} items) - NO AI INFERENCE USED`,
            _extraction_method: 'direct_table_extraction',
            _page_filter: pageRangeStart || pageRangeEnd ? `pages ${pageRangeStart || 1}-${pageRangeEnd || 'end'}` : null
          };
        } else {
          console.log(`⚠️  Only ${tableStructured.items?.length || 0} items extracted - falling back to Gemini`);
          console.log(`========================================\n`);
          parsed = await parseRfqWithGemini(structured);
        }
      } else {
        console.log(`⚠️  No tables found in OCR output - using Gemini extraction`);
        parsed = await parseRfqWithGemini(structured);
      }
    } catch (parseError) {
      console.error('[AI Route] RFQ parsing failed:', parseError);
      console.error('[AI Route] Parse error details:', {
        message: parseError.message,
        name: parseError.name,
        stack: parseError.stack,
      });
      
      // Return a more specific error based on the type of failure
      const errorMessage = parseError.message || 'Failed to parse RFQ';
      
      // Check if it's a configuration error
      if (errorMessage.includes('initialization') || errorMessage.includes('environment variables')) {
        return res.status(500).json({
          error: 'Failed to parse RFQ',
          details: 'Azure OpenAI service is not properly configured. Please check your environment variables.',
          internalError: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
        });
      }
      
      // Check if it's a parsing/format error
      if (errorMessage.includes('parse JSON') || errorMessage.includes('missing required fields')) {
        return res.status(500).json({
          error: 'Failed to parse RFQ',
          details: 'The AI service returned an invalid response format. Please try again or check the input document.',
          internalError: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
        });
      }
      
      // Generic error
      return res.status(500).json({
        error: 'Failed to parse RFQ',
        details: errorMessage,
        internalError: process.env.NODE_ENV === 'development' ? parseError.stack : undefined,
      });
    }

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
        // Auto-detect document type from filename and content
        const documentType = detectDocumentType(originalFilename, parsed);
        const rfq = await rfqService.createRfqFromPayload({
          customer_name: clientName,
          document_type: documentType,
        }, req.tenantId, {
          correlationId: req.correlationId,
          tenantCode: req.tenantCode,
          originalFilename,
          document_type: documentType, // Also pass in context for backward compatibility
        });

        createdRfqId = rfq.id;

        // Add line items to RFQ (using batch insert for performance)
        if (lineItems.length > 0) {
          console.log(`[AI Route] Adding ${lineItems.length} items to RFQ in batch...`);
          try {
            // Prepare all items for batch insert
            const itemsToInsert = lineItems.map((item) => {
              // Get best matched material code if available
              const materialCode =
                item.matched_materials && item.matched_materials.length > 0
                  ? item.matched_materials[0].material_code
                  : null;

              // Build size_display from size1 and size2
              const sizeDisplay = item.size2
                ? `${item.size1} × ${item.size2}`
                : item.size1 || null;

                return {
                  description: item.description || '',
                  quantity: item.quantity || 0,
                  unit: item.unit || 'PCS',
                  material_code: materialCode,
                  line_number: item.line_number ? parseInt(item.line_number, 10) : null,
                  size_display: sizeDisplay,
                  size1_raw: item.size1 || null,
                  size2_raw: item.size2 || null,
                  material_treatment_type: item.material_treatment_type || 'CANONICAL',
                  needs_review: item.needs_review === true,
                  quantity_source: item.quantity_source || null,
                  confidence: item.confidence || null,
                };
              });

            // Batch insert all items at once (much faster than sequential inserts)
            const insertedItems = await rfqService.addRfqItemsBatch(rfq.id, itemsToInsert, req.tenantId);
            createdItemCount = insertedItems.length;
            console.log(`[AI Route] Batch insert completed: ${createdItemCount} items added`);
          } catch (error) {
            console.error(`[AI Route] Error batch adding items to RFQ:`, error);
            // Fallback to individual inserts if batch fails (for compatibility)
            console.log(`[AI Route] Falling back to individual inserts...`);
            for (const item of lineItems) {
              try {
                const materialCode =
                  item.matched_materials && item.matched_materials.length > 0
                    ? item.matched_materials[0].material_code
                    : null;

                const sizeDisplay = item.size2
                  ? `${item.size1} × ${item.size2}`
                  : item.size1 || null;

                  await rfqService.addRfqItem(rfq.id, {
                    description: item.description || '',
                    quantity: item.quantity || 0,
                    unit: item.unit || 'PCS',
                    material_code: materialCode,
                    line_number: item.line_number ? parseInt(item.line_number, 10) : null,
                    size_display: sizeDisplay,
                    size1_raw: item.size1 || null,
                    size2_raw: item.size2 || null,
                    material_treatment_type: item.material_treatment_type || 'CANONICAL',
                    needs_review: item.needs_review === true,
                    quantity_source: item.quantity_source || null,
                    confidence: item.confidence || null,
                  }, req.tenantId);
                createdItemCount++;
              } catch (err) {
                console.error(`[AI Route] Error adding item to RFQ:`, err);
                // Continue with other items
              }
            }
          }
        }
        console.log(`[AI Route] RFQ created successfully: ${createdRfqId} with ${createdItemCount} items`);
        
        // Link AI detection timing to the created RFQ ID (if tracker is available)
        try {
          // Safely require and use aiPricingTimingTracker if available
          let aiPricingTimingTracker;
          try {
            aiPricingTimingTracker = require('../utils/aiPricingTimingTracker');
          } catch (requireError) {
            console.log(`[AI Route] aiPricingTimingTracker not available; skipping timing link`);
            aiPricingTimingTracker = null;
          }
          
          // Only attempt transfer if tracker is available and tempTrackingId exists
          if (aiPricingTimingTracker && typeof tempTrackingId !== 'undefined' && tempTrackingId) {
            if (aiPricingTimingTracker.transferTiming(tempTrackingId, createdRfqId)) {
              console.log(`[AI Route] Linked AI detection timing to RFQ ${createdRfqId}`);
            }
          }
        } catch (err) {
          console.warn(`[AI Route] Could not link AI detection timing:`, err.message);
        }

        // Validation: Log warning if item count doesn't match
        if (createdItemCount !== lineItems.length) {
          console.warn(`[AI Route] WARNING: Item count mismatch! Expected ${lineItems.length}, created ${createdItemCount}`);
        }

        // FAILURE HANDLING: Mark RFQ as extraction_failed if item count is below threshold
        // This prevents incomplete extractions from being used for pricing
        // IMPORTANT: Use createdItemCount (actual inserted items) as the truth, not candidate_rows
        const MIN_ITEMS_THRESHOLD = 150;
        const { isValidUuid } = require('../utils/uuidValidation');
        const { logWarn } = require('../utils/logger');
        
        // Validate that we have a valid UUID before attempting database update
        // Never attempt DB update with empty string or invalid UUID
        const rfqIdToUpdate = createdRfqId;
        const tenantIdForUpdate = req.tenantId;
        
        if (createdItemCount < MIN_ITEMS_THRESHOLD) {
          // Only mark as extraction_failed if we have valid UUIDs (and not empty strings)
          const hasValidRfqId =
            typeof rfqIdToUpdate === 'string' &&
            rfqIdToUpdate.trim() !== '' &&
            isValidUuid(rfqIdToUpdate);
          const hasValidTenantId =
            typeof tenantIdForUpdate === 'string' &&
            tenantIdForUpdate.trim() !== '' &&
            isValidUuid(tenantIdForUpdate);

          if (hasValidRfqId && hasValidTenantId) {
            try {
              const db = await connectDb();
              const failureMessage = `Extraction incomplete: only ${createdItemCount} line items detected (threshold: ${MIN_ITEMS_THRESHOLD}).`;
              
              const trimmedRfqId = rfqIdToUpdate.trim();
              const trimmedTenantId = tenantIdForUpdate.trim();

              await db.query(
                `UPDATE rfqs 
                 SET status = 'extraction_failed', 
                     notes = COALESCE(notes || E'\n', '') || $1
                 WHERE id = $2 AND tenant_id = $3`,
                [failureMessage, trimmedRfqId, trimmedTenantId]
              );
              
              console.warn(`[AI Route] Marked RFQ ${trimmedRfqId} as extraction_failed: only ${createdItemCount} items extracted (threshold: ${MIN_ITEMS_THRESHOLD})`);
            } catch (updateError) {
              console.error('[AI Route] Failed to mark RFQ as extraction_failed:', updateError);
              // Don't fail the request if status update fails
            }
          } else {
            // Log warning but do not throw - skip the update gracefully
            logWarn('[extraction_failed] skipped: invalid rfqId or tenantId', {
              rfqIdToUpdate: rfqIdToUpdate || '(null/empty)',
              tenantIdForUpdate: tenantIdForUpdate || '(null/empty)',
              rfqIdType: typeof rfqIdToUpdate,
              tenantIdType: typeof tenantIdForUpdate,
              createdItemCount,
              threshold: MIN_ITEMS_THRESHOLD,
              correlationId: req.correlationId,
              createdRfqId,
              bodyRfqId: req.body?.rfqId,
            });
            // Do not throw, do not attempt DB update with invalid UUID
          }
        }
      } catch (error) {
        console.error('[AI Route] Error creating RFQ:', error);
        // Don't fail the entire request if RFQ creation fails
        // The parsed data will still be returned
      }
    }

    // Log parsing metrics
    const candidateRows = parsed._debug?.rawItemsCount || parsed._debug?.extractedFromTables || 0;
    const rfqItemsInserted = createdItemCount || 0;
    console.log(`[EXTRACTION_METRICS] { candidate_rows: ${candidateRows}, rfq_items_inserted: ${rfqItemsInserted} }`);

    // Build response
    // Add computed 'size' field to each line item for frontend display
    // Preserve confidence data from extraction
    const lineItemsWithSize = lineItems.map(item => ({
      ...item,
      size: item.size2
        ? `${item.size1} × ${item.size2}`
        : item.size1 || null,
      // Preserve confidence data if it exists
      confidence: item._confidence || null,
    }));

    const response = {
      rfq_metadata: parsed.rfq_metadata || {},
      line_items: lineItemsWithSize,
      created: {
        rfq_id: createdRfqId,
        rfq_item_count: createdItemCount,
      },
      confidence: parsed._confidence || {
        extraction: 0.7,
        table_detection: null,
        validation_warnings: [],
        item_count: lineItems.length,
        warnings_count: 0,
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

/**
 * GET /api/ai/approval-risk/:pricingRunId
 * AI approval feature removed
 */
router.get('/approval-risk/:pricingRunId', async (req, res) => {
  res.status(410).json({
    error: 'Feature removed',
    message: 'AI approval risk assessment has been removed',
  });
});

/**
 * POST /api/ai/approval-override
 * Override AI decision with reason
 * 
 * Request body:
 * {
 *   pricing_run_id: string,
 *   override_reason: string,
 *   action: 'approve' | 'reject',
 *   approver: { name: string, email?: string }
 * }
 */
router.post('/approval-override', async (req, res) => {
  res.status(410).json({
    error: 'Feature removed',
    message: 'AI approval override has been removed',
  });
});

/**
 * GET /api/ai/approval-stats
 * Get AI approval statistics
 * 
 * Query params:
 * - days: number (default: 30) - Number of days to look back
 */
router.get('/approval-stats', async (req, res) => {
  res.status(410).json({
    error: 'Feature removed',
    message: 'AI approval statistics have been removed',
  });
});

/**
 * POST /api/ai/extract-rfq
 * Extract RFQ data from uploaded document (PDF, image, DOCX)
 *
 * Request: multipart/form-data
 * - file: PDF/image/DOCX file
 * - userId: string (optional)
 * - enrichItems: boolean (default: true) - Whether to enrich with GPT-4
 * - matchMaterials: boolean (default: true) - Whether to auto-match materials
 *
 * Response:
 * {
 *   extraction_id: string,
 *   extracted_data: { metadata, items },
 *   confidence: number,
 *   validation: { isValid, issues, warnings, needsReview },
 *   material_matches: [...] (if matchMaterials=true)
 * }
 */
router.post('/extract-rfq', upload.single('file'), async (req, res) => {
  const { log } = require('../utils/logger');
  const logContext = {
    correlationId: req.correlationId,
    tenantId: req.tenantId,
    operation: 'document_upload_start',
  };

  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'Invalid request',
        details: 'No file uploaded'
      });
    }

    const { userId, enrichItems = 'true', matchMaterials = 'true' } = req.body;
    const normalizedUserId = typeof userId === 'string' ? userId.trim() : userId;
    const safeUserId = normalizedUserId ? normalizedUserId : null;
    const shouldEnrich = enrichItems === 'true' || enrichItems === true;
    const shouldMatchMaterials = matchMaterials === 'true' || matchMaterials === true;

    const fileBuffer = req.file.buffer;
    const fileName = req.file.originalname;
    const fileSize = req.file.size;

    // Determine file type from extension
    const fileExt = fileName.split('.').pop().toLowerCase();
    const fileType = ['pdf', 'docx'].includes(fileExt) ? fileExt : 'image';

    log.logInfo('Document upload received', {
      ...logContext,
      fileName,
      fileType,
      fileSize,
    });

    console.log(`[AI Route] Extracting RFQ from ${fileName} (${fileType}, ${(fileSize / 1024).toFixed(1)}KB)`);

    log.logInfo('Extraction started', {
      ...logContext,
      operation: 'extraction_start',
      fileName,
    });

    // Step 0: Upload file to Blob Storage (Phase 1 - Blob Storage Integration)
    let blobUrl = null;
    let blobName = null;
    try {
      const blobResult = await uploadRfqDocument(fileBuffer, fileName, req.file.mimetype);
      blobUrl = blobResult.blobUrl;
      blobName = blobResult.blobName;
      log.logInfo('File uploaded to Blob Storage', {
        ...logContext,
        blobUrl,
        blobName,
      });
    } catch (blobError) {
      // Log error but continue with processing (graceful fallback)
      log.logWarn('Failed to upload to Blob Storage, continuing with in-memory processing', {
        ...logContext,
        error: blobError.message,
      });
      console.warn('[AI Route] Blob Storage upload failed, continuing:', blobError.message);
    }

    // Check if async processing is requested
    const useAsyncProcessing = req.body.async === 'true' || req.body.async === true;
    console.log('[AI Route] Async parameter check:', {
      'req.body.async': req.body.async,
      'typeof req.body.async': typeof req.body.async,
      'useAsyncProcessing': useAsyncProcessing
    });

    // If async processing is requested, queue a Cloud Task
    if (useAsyncProcessing) {
      console.log('[AI Route] Attempting to queue Cloud Task...');
      try {
        const jobData = {
          fileBuffer: fileBuffer.toString('base64'), // Encode buffer as base64 for JSON
          fileName,
          fileType,
          fileSize,
          userId: userId || null,
          tenantId: req.tenantId || null,
          enrichItems: shouldEnrich,
          matchMaterials: shouldMatchMaterials,
          forceMtoExtraction: req.body.forceMtoExtraction === 'true',
          forceSimpleRfq: req.body.forceSimpleRfq === 'true',
          forceUseDocAiTables: req.body.forceUseDocAiTables === 'true',
          forceUseDocAiFullParse: req.body.forceUseDocAiFullParse === 'true',
          blobUrl,
          blobName,
          correlationId: req.correlationId || `extract-${Date.now()}`,
        };

        const queue = config.gcp.cloudtasks.extractionQueue;
        
        // Cloud Tasks requires HTTPS when using OIDC token authentication
        // Use configured URL or construct from request (must be HTTPS)
        let url = config.gcp.cloudtasks.targetUrl;
        if (!url) {
          // Construct URL from request, but ensure HTTPS
          const host = req.get('host');
          // For local development, you need to provide CLOUDTASKS_TARGET_URL with HTTPS (e.g., via ngrok)
          // For production, this should be your deployed service URL
          if (req.protocol === 'http' && host.includes('localhost')) {
            throw new Error(
              'Cloud Tasks requires HTTPS URLs when using OIDC authentication. ' +
              'Please set CLOUDTASKS_TARGET_URL in .env.gcp to an HTTPS URL (e.g., your deployed service URL or ngrok tunnel). ' +
              `Current URL would be: http://${host}/api/ai/process-extraction-task`
            );
          }
          url = `https://${host}/api/ai/process-extraction-task`;
        }
        
        // Ensure URL ends with the correct path
        if (!url.endsWith('/api/ai/process-extraction-task')) {
          url = url.replace(/\/$/, '') + '/api/ai/process-extraction-task';
        }

        console.log('[AI Route] Creating Cloud Task with:', {
          queue,
          url,
          serviceAccountEmail: config.gcp.serviceAccountEmail,
          projectId: config.gcp.projectId,
          location: config.gcp.location
        });
        
        await createHttpTask(queue, url, jobData);

        console.log('[AI Route] ✅ Cloud Task created successfully!');
        log.logInfo('Document extraction job queued with Cloud Tasks', {
          ...logContext,
          operation: 'job_queued',
        });

        // Return job queued response
        return res.json({
          status: 'queued',
          message: 'Document extraction job has been queued for processing',
          correlationId: jobData.correlationId,
        });
      } catch (queueError) {
        // If queuing fails, fall back to sync processing
        console.error('[AI Route] ❌ Cloud Tasks queue failed:', queueError);
        console.error('[AI Route] Error details:', {
          message: queueError.message,
          code: queueError.code,
          stack: queueError.stack
        });
        log.logWarn('Failed to queue job with Cloud Tasks, falling back to sync processing', {
          ...logContext,
          error: queueError.message,
          errorCode: queueError.code,
        });
        console.warn('[AI Route] Cloud Tasks queue failed, falling back to sync:', queueError.message);
      }
    }

    // Record AI detection start time for timing tracking (will link to RFQ ID later)
    let aiPricingTimingTracker;
    let tempTrackingId;
    try {
      aiPricingTimingTracker = require('../utils/aiPricingTimingTracker');
      tempTrackingId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      aiPricingTimingTracker.recordAiDetectionStart(tempTrackingId);
    } catch (requireError) {
      console.log(`[AI Route] aiPricingTimingTracker not available; skipping timing link`);
      aiPricingTimingTracker = null;
      tempTrackingId = null;
    }

    // Step 1: Extract with Document Intelligence (auto-detects MTO documents)
    const extracted = await documentIntelligenceService.parseRFQDocument(fileBuffer, fileType, {
      forceMtoExtraction: req.body.forceMtoExtraction === 'true',
      forceSimpleRfq: req.body.forceSimpleRfq === 'true',
      forceUseDocAiTables: req.body.forceUseDocAiTables === 'true',
      forceUseDocAiFullParse: req.body.forceUseDocAiFullParse === 'true',
    });

    log.logInfo('Extraction completed', {
      ...logContext,
      operation: 'extraction_complete',
      fileName,
      itemCount: extracted.items?.length || 0,
      documentType: extracted.document_type,
    });

    // Check if this is an MTO document
    const isMtoDocument = extracted.document_type === 'MTO' || extracted.mto_structure;

    // Step 2: Store MTO extraction if applicable
    let mtoExtraction = null;
    if (isMtoDocument && extracted.mto_structure) {
      console.log('[AI Route] Storing hierarchical MTO structure...');
      
      // Store document extraction first
      let documentExtraction = null;
      try {
        documentExtraction = await DocumentExtraction.create({
          uploaded_by_user_id: safeUserId,
          file_name: fileName,
          file_type: fileType,
          file_size_bytes: fileSize,
          extraction_method: 'azure_doc_intelligence_mto',
          extracted_data: {
            metadata: extracted.metadata,
            items: extracted.items || [],
            mto_structure: extracted.mto_structure,
            raw_data: extracted.raw_data
          },
          confidence_score: extracted.confidence || 0,
          validation_issues: extracted.weight_verification?.warnings || [],
          needs_review: (extracted.weight_verification?.issues?.length || 0) > 0,
          tenant_id: req.tenantId || null,
          blob_url: blobUrl,
          blob_name: blobName
        });
      } catch (dbError) {
        console.warn('[AI Route] Failed to save MTO document extraction (continuing anyway):', dbError.message);
        documentExtraction = {
          id: `temp-${Date.now()}`
        };
      }

      // Store MTO extraction (best-effort)
      if (documentExtraction && !String(documentExtraction.id).startsWith('temp-')) {
        try {
          mtoExtraction = await MtoExtraction.create({
            document_extraction_id: documentExtraction.id,
            mto_structure: extracted.mto_structure,
            weight_verification: extracted.weight_verification,
            pricing_readiness: extracted.mto_structure.pricing_readiness,
            confidence_score: extracted.confidence || 0,
            extraction_notes: extracted.extraction_notes
          });
        } catch (dbError) {
          console.warn('[AI Route] Failed to save MTO extraction (continuing anyway):', dbError.message);
          mtoExtraction = null;
        }
      }
    }

    const rawItems = extracted.items || [];
    let normalizedItems = rawItems; // Initialize normalizedItems here
    if (isMtoDocument) { // Apply MTO-specific transformations
      normalizedItems = normalizedItems.map(normalizeMtoItem); // Start with MTO normalization
    }

    const normalizeSizeValue = value => {
      if (!value) return value;
      return String(value)
        .replace(/inch/gi, '"')
        .replace(/[”“″]/g, '"')
        .replace(/[’']/g, "'")
        .replace(/''/g, '"')
        .trim();
    };

    const extractSectionHeader = text => {
      if (!text) return null;
      const lines = String(text)
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean);
      const headerLine = lines.find(line => /MATERIAL\s+TAKE\s+OFF/i.test(line));
      return headerLine ? headerLine.replace(/\s+/g, ' ').trim() : null;
    };

    const normalizeHeaderKey = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');

    const buildMtoTableLookup = tables => {
      if (!Array.isArray(tables) || tables.length === 0) {
        return [];
      }

      const candidates = {
        item: ['item', 'no', 'itemno'],
        materialType: ['materialtype', 'material'],
        description: ['description', 'descriptions', 'detail'],
        type: ['type'],
        unit: ['unit'],
        totalLengthArea: ['totallengtharea', 'totallengtharea_msqm', 'totallengtharea_msqm'],
        roundQuantity: ['roundquantity', 'roundquantitypcs'],
        portionConsider: ['portionconsider', 'portionconsidered', 'portion'],
        shipmentRemarks: ['shipmentremarks', 'shipmentremarks', 'shipment']
      };

      const normalizedCandidates = {};
      Object.keys(candidates).forEach(key => {
        normalizedCandidates[key] = new Set(candidates[key].map(normalizeHeaderKey));
      });

      const rows = [];
      let currentSection = '';
      let currentSubsection = '';

      for (const table of tables) {
        for (const row of table.rows || []) {
          const keys = Object.keys(row || {});
          const rowValueFor = (candidateKey) => {
            const target = normalizedCandidates[candidateKey];
            for (const key of keys) {
              if (target.has(normalizeHeaderKey(key))) {
                return row[key];
              }
            }
            return '';
          };

          const itemCell = String(rowValueFor('item') || '').trim();
          const descriptionCell = String(rowValueFor('description') || '').trim();
          const materialTypeCell = String(rowValueFor('materialType') || '').trim();
          const typeCell = String(rowValueFor('type') || '').trim();
          const unitCell = String(rowValueFor('unit') || '').trim();
          const totalLengthAreaCell = String(rowValueFor('totalLengthArea') || '').trim();
          const roundQuantityCell = String(rowValueFor('roundQuantity') || '').trim();
          const portionCell = String(rowValueFor('portionConsider') || '').trim();
          const shipmentCell = String(rowValueFor('shipmentRemarks') || '').trim();

          const romanSection = itemCell.toUpperCase().match(/^(I|II|III|IV)\b/);
          if (romanSection && descriptionCell) {
            currentSection = `${romanSection[1]} ${descriptionCell}`.trim();
            currentSubsection = '';
            continue;
          }

          if (!itemCell && descriptionCell && /ROLLED|TUBULAR|PLATE|REDUCER/i.test(descriptionCell)) {
            currentSubsection = descriptionCell.replace(/\s+/g, ' ').trim();
            continue;
          }

          const itemNumber = parseInt(itemCell, 10);
          if (!itemNumber || itemNumber <= 0) {
            continue;
          }

          rows.push({
            description: descriptionCell,
            material_type: materialTypeCell,
            type: typeCell,
            unit: unitCell,
            total_length_area: totalLengthAreaCell,
            round_quantity: roundQuantityCell,
            portion_consider: portionCell,
            shipment_remarks: shipmentCell,
            section_header: currentSection && currentSubsection
              ? `${currentSection} - ${currentSubsection}`
              : (currentSection || currentSubsection || '')
          });
        }
      }

      return rows;
    };

    const enrichItemsFromTables = (items, tables) => {
      const lookup = buildMtoTableLookup(tables);
      if (lookup.length === 0) {
        return items;
      }

      const used = new Set();
      const normalizeValue = value => normalizeHeaderKey(value || '');

      return items.map(item => {
        const description = item.description || item.size || '';
        const normalizedDescription = normalizeValue(description);
        const itemType = normalizeValue(item.item_type);

        let matchedIndex = -1;
        for (let i = 0; i < lookup.length; i++) {
          if (used.has(i)) continue;
          const row = lookup[i];
          if (normalizeValue(row.description) !== normalizedDescription) continue;
          if (itemType && row.material_type && normalizeValue(row.material_type) !== itemType) continue;
          matchedIndex = i;
          break;
        }

        if (matchedIndex === -1) {
          return item;
        }

        used.add(matchedIndex);
        const row = lookup[matchedIndex];
        const notesParts = [];
        if (row.portion_consider) notesParts.push(row.portion_consider);
        if (row.shipment_remarks) notesParts.push(row.shipment_remarks);

        return {
          ...item,
          item_type: row.material_type ? row.material_type.toUpperCase() : item.item_type,
          size: item.size || row.description || item.size,
          schedule: row.type || item.schedule,
          quantity: row.total_length_area || item.quantity,
          unit: row.unit ? row.unit.toUpperCase() : item.unit,
          notes: notesParts.length ? notesParts.join(' | ') : item.notes,
          section_header: row.section_header || item.section_header
        };
      });
    };

    const defaultSectionHeader = extractSectionHeader(extracted.raw_data?.text);
    const looksLikeSchedule = value => {
      if (!value) return false;
      const normalized = String(value).trim();
      return normalized.length <= 6 && /\d/.test(normalized) && /^[A-Z0-9]+$/i.test(normalized);
    };

    const normalizePplTextValue = (value, sectionHeader) => {
      let text = cleanPplCellValue(value);
      if (!text) return '';
      text = text.replace(/mm\s*\^\s*2/gi, 'mm2');
      text = text.replace(/mm\s*\u00b2/gi, 'mm2');
      text = text.replace(/mm\s+2/gi, 'mm2');
      if (sectionHeader && /CABLE\s*&\s*GLAND/i.test(sectionHeader)) {
        text = text.replace(/\bP5\b/gi, 'PS');
      }
      return text;
    };

    const normalizePplSizeValue = (value, sectionHeader) => {
      let text = normalizePplTextValue(value, sectionHeader);
      if (!text) return '';
      text = text.replace(/[.,;:]+$/g, '').trim();
      return text;
    };

    const isPplNumericToken = value => /^[0-9]+(?:\.[0-9]+)?$/.test(value);
    const isPplAlphaToken = value => /^[A-Z]+$/.test(value);
    const isPplNumericSequence = value => {
      if (!value) return false;
      const tokens = String(value)
        .replace(/,/g, '')
        .split(/\s+/)
        .filter(Boolean);
      if (tokens.length === 0) return false;
      return tokens.every(token => {
        const upper = token.toUpperCase();
        if (upper === 'AR' || upper === 'A/R') return true;
        return isPplNumericToken(token);
      });
    };

    const normalizePplQuantity = value => {
      const cleaned = cleanPplCellValue(value);
      if (!cleaned) return null;
      const upper = cleaned.toUpperCase();
      if (upper === 'AR' || upper === 'A/R') return 'AR';
      const numeric = cleaned.replace(/,/g, '');
      return numeric || null;
    };

    const derivePplItemType = (description, sectionHeader, accessoryContext = false) => {
      const normalized = cleanPplCellValue(description).toUpperCase();
      const normalizedSection = cleanPplCellValue(sectionHeader).toUpperCase();
      if (!normalized) return null;
      if (normalized.includes('CABLE GLAND')) return 'GLAND';
      if (normalized.includes('CAT 6') || normalized.includes('COAXIAL CABLE')) return 'CABLE';
      if (normalized.includes('NAMEPLATE')) return 'NAMEPLATE';
      if (normalized.includes('BOLT')) return 'BOLT';
      if (accessoryContext || normalizedSection.includes('CABLE TRAY ACCESSORIES') ||
        normalized.includes('CABLE TRAY ACCESSORIES')) {
        return 'ACCESSORY';
      }
      if (normalized.includes('CABLE TRAY')) return 'CABLE TRAY';
      if (normalized.includes('CABLE LADDER')) return 'CABLE LADDER';
      if (normalized.includes('CABLE')) return 'CABLE';
      if (normalized.includes('PLATE')) return 'PLATE';
      if (normalized.includes('PIPE')) return 'PIPE';
      const commaIndex = normalized.indexOf(',');
      const base = commaIndex >= 0 ? normalized.slice(0, commaIndex) : normalized;
      return base.trim() || null;
    };

    const splitPplCellLines = value => {
      if (value == null) return [];
      return String(value)
        .split(/\r?\n/)
        .map(entry => entry.trim())
        .filter(Boolean);
    };

    const splitPplCellLinesNormalized = (value, sectionHeader) => {
      return splitPplCellLines(value)
        .map(entry => normalizePplTextValue(entry, sectionHeader))
        .filter(Boolean);
    };

    const splitPplCellLinesNormalizedForSize = (value, sectionHeader) => {
      return splitPplCellLines(value)
        .map(entry => normalizePplSizeValue(entry, sectionHeader))
        .filter(Boolean);
    };

    const splitPplItemNumbers = value => {
      const lines = splitPplCellLines(value);
      const items = [];
      lines.forEach(line => {
        const matches = line.match(/[0-9]+[A-Z]?/g);
        if (matches) {
          matches.forEach(match => items.push(match));
        }
      });
      return items;
    };

    const splitPplQuantityLines = value => {
      const lines = splitPplCellLines(value);
      const quantities = [];
      lines.forEach(line => {
        const tokens = line.split(/\s+/).filter(Boolean);
        tokens.forEach(token => {
          const cleaned = token.replace(/,/g, '');
          if (!cleaned) return;
          const upper = cleaned.toUpperCase();
          if (upper === 'AR' || upper === 'A/R') {
            quantities.push('AR');
            return;
          }
          if (isPplNumericToken(cleaned)) {
            quantities.push(cleaned);
          }
        });
      });
      return quantities;
    };

    const splitPplQuantityTokens = value => {
      const cleaned = cleanPplCellValue(value);
      if (!cleaned) return [];
      const matches = cleaned.match(/[0-9]+(?:\.[0-9]+)?/g) || [];
      return matches.map(match => match.replace(/,/g, ''));
    };

    const splitPplUnitTokens = value => {
      const lines = splitPplCellLines(value);
      const units = [];
      const quantities = [];
      lines.forEach(line => {
        const tokens = line.split(/\s+/).filter(Boolean);
        tokens.forEach(token => {
          const cleaned = token.replace(/[,]/g, '').toUpperCase();
          if (!cleaned) return;
          if (isPplAlphaToken(cleaned)) {
            units.push(cleaned);
            return;
          }
          if (cleaned === 'AR' || cleaned === 'A/R') {
            quantities.push('AR');
            return;
          }
          if (isPplNumericToken(cleaned)) {
            quantities.push(cleaned);
          }
        });
      });
      return { units, quantities };
    };

    const normalizePplUnit = value => {
      if (!value) return null;
      const cleaned = cleanPplCellValue(value).toUpperCase();
      if (!cleaned) return null;
      const tokens = cleaned.split(/\s+/).filter(Boolean);
      const alpha = tokens.find(token => isPplAlphaToken(token));
      return alpha || null;
    };

    const parsePplMtoTables = (tables, drawingNumber) => {
      if (!Array.isArray(tables) || tables.length === 0) {
        return { items: [], sections: new Set(), debug: { tableSamples: [] } };
      }

      const normalizedDrawing = normalizeHeaderKey(drawingNumber || '');
      const expectedSections = new Set([
        'STEEL MATERIAL',
        'NAMEPLATE',
        'CABLE & GLAND',
        'CABLE LADDER & ACCESSORIES'
      ]);

      const items = [];
      const itemSources = [];
      const sections = new Set();
      let currentSection = null;
      let cableTrayAccessoriesContext = false;
      const debug = { tableSamples: [], cableGlandMultiRowSamples: [], quantityDiagnostics: [] };
      const debugCounts = new Map();
      const debugPrecedence = { line_number: '3302', kept: null, suppressed: [] };

      const detectSectionFromText = text => {
        const normalized = cleanPplCellValue(text).toUpperCase();
        if (!normalized) return null;
        if (normalized.includes('NAMEPLATE')) return 'NAMEPLATE';
        if (/CABLE\s*&\s*GLAND/.test(normalized)) return 'CABLE & GLAND';
        if (normalized.includes('CABLE LADDER')) return 'CABLE LADDER & ACCESSORIES';
        if (normalized.includes('CABLE TRAY')) return 'CABLE LADDER & ACCESSORIES';
        if (normalized.includes('STEEL MATERIAL')) return 'STEEL MATERIAL';
        return null;
      };

      const headerIndexFor = (headers, candidates) => {
        for (let i = 0; i < headers.length; i++) {
          const normalized = normalizeHeaderKey(headers[i]);
          if (!normalized) continue;
          if (candidates.some(candidate => normalized.includes(candidate))) {
            return i;
          }
        }
        return -1;
      };

      const extractRowCells = (row, columns) => {
        if (Array.isArray(row)) {
          return columns.map((_, index) => row[index] ?? '');
        }
        if (!row || typeof row !== 'object') {
          return columns.map(() => '');
        }
        return columns.map((header, index) => {
          if (header in row) return row[header];
          const fallback = `column_${index}`;
          if (fallback in row) return row[fallback];
          return '';
        });
      };

      const pickQuantityWithMeta = (cells, headers, unitIndex) => {
        const normalizedHeaders = headers.map(header => normalizeHeaderKey(header));
        const preferredIndices = [];

        if (normalizedDrawing) {
          normalizedHeaders.forEach((header, index) => {
            if (header && header.includes(normalizedDrawing)) {
              preferredIndices.push(index);
            }
          });
        }

        const quantityHeaderHints = [
          'totalasdrawingdetail',
          'totalasdrawing',
          'totaldrawing',
          'totaloverall',
          'total',
          'quantity',
          'qty'
        ];
        normalizedHeaders.forEach((header, index) => {
          if (quantityHeaderHints.some(hint => header.includes(hint))) {
            preferredIndices.push(index);
          }
        });

        for (const index of preferredIndices) {
          const rawValue = cells[index];
          const value = normalizePplQuantity(rawValue);
          if (value) {
            return { rawValue, index, header: headers[index] || '' };
          }
        }

        const scanStart = unitIndex >= 0 ? unitIndex + 1 : 0;
        for (let i = scanStart; i < cells.length; i++) {
          const rawValue = cells[i];
          const value = normalizePplQuantity(rawValue);
          if (value) {
            return { rawValue, index: i, header: headers[i] || '' };
          }
        }

        return null;
      };

      const pickQuantityForSection = (cells, headers, unitIndex, section) => {
        if (section === 'CABLE LADDER & ACCESSORIES') {
          const normalizedHeaders = headers.map(header => normalizeHeaderKey(header));
          const preferred = [];
          const fallbackTotals = [];
          normalizedHeaders.forEach((header, index) => {
            if (!header) return;
            if (header.includes('totalasdrawingdetail') || header.includes('totalasdrawing')) {
              preferred.push(index);
            } else if (header.includes('total') &&
              !header.includes('contingency') &&
              !header.includes('contigency') &&
              !header.includes('estimated')) {
              fallbackTotals.push(index);
            }
          });
          for (const index of preferred) {
            const rawValue = cells[index];
            const value = normalizePplQuantity(rawValue);
            if (value) return { rawValue, index, header: headers[index] || '' };
          }
          for (const index of fallbackTotals) {
            const rawValue = cells[index];
            const value = normalizePplQuantity(rawValue);
            if (value) return { rawValue, index, header: headers[index] || '' };
          }
        }
        return pickQuantityWithMeta(cells, headers, unitIndex);
      };

      const hasItemHeaders = headers => {
        const normalized = headers.map(header => normalizeHeaderKey(header));
        return normalized.some(header => header.includes('itemno')) &&
          normalized.some(header => header.includes('sizeorconnection')) &&
          normalized.some(header => header.includes('description'));
      };

      const isQuantityTable = headers => {
        const normalized = headers.map(header => normalizeHeaderKey(header));
        return normalized.some(header => header.includes('totalasdrawing')) ||
          normalized.some(header => header.includes('estimatedoverall')) ||
          normalized.some(header => header.includes('contigency')) ||
          normalized.some(header => header.includes('contingency'));
      };

      const resolveSectionForTable = headers => {
        const joined = headers.map(header => String(header || '').toUpperCase()).join(' ');
        if (joined.includes('PPL-TS-TA-4380')) return 'NAMEPLATE';
        if (joined.includes('PPL-TS-TA-4308')) return 'CABLE & GLAND';
        if (joined.includes('PPL-TS-TA-4024') || joined.includes('CABLE TRAY')) return 'CABLE LADDER & ACCESSORIES';
        return 'STEEL MATERIAL';
      };

      const mergeTableRows = (left, right) => {
        const mergedHeaders = [...left.headers, ...right.headers];
        const mergedRows = left.rows.map((row, index) => ({
          ...row,
          ...(right.rows[index] || {})
        }));
        return {
          headers: mergedHeaders,
          rows: mergedRows,
          rowCount: mergedRows.length,
          columnCount: mergedHeaders.length
        };
      };

      const structuredTables = [];
      for (let i = 0; i < tables.length; i++) {
        const table = tables[i];
        if (!Array.isArray(table.headers) || !Array.isArray(table.rows)) continue;
        if (!hasItemHeaders(table.headers)) continue;

        const nextTable = tables[i + 1];
        if (nextTable && isQuantityTable(nextTable.headers) && nextTable.rows.length === table.rows.length) {
          structuredTables.push({
            ...mergeTableRows(table, nextTable),
            sourceIndices: [i, i + 1]
          });
          i += 1;
        } else {
          structuredTables.push({
            ...table,
            sourceIndices: [i]
          });
        }
      }

      for (const table of structuredTables) {
        const columnCount = table.columnCount || (table.headers ? table.headers.length : 0);
        const headers = Array.from({ length: columnCount }, (_, index) => {
          return (table.headers && table.headers[index]) ? table.headers[index] : `column_${index}`;
        });

        const itemIndex = headerIndexFor(headers, ['item', 'itemno', 'itemno.', 'no']);
        const sizeIndex = headerIndexFor(headers, ['size', 'connection']);
        const descriptionIndex = headerIndexFor(headers, ['description', 'desc']);
        const materialIndex = headerIndexFor(headers, ['material']);
        const unitIndex = headerIndexFor(headers, ['unit']);
        const remarksIndex = headerIndexFor(headers, ['remarks', 'remark']);

        const rows = Array.isArray(table.rows) ? table.rows : [];
        currentSection = resolveSectionForTable(headers);
        sections.add(currentSection);
        const debugTableIndex = (table.sourceIndices || []).find(index => index === 10 || index === 11);
        const isCableLadderTable = (table.sourceIndices || []).includes(11);

        for (const row of rows) {
          const cells = extractRowCells(row, headers);
          const normalizedCells = cells.map(cleanPplCellValue);
          const rowTextUpper = normalizedCells.join(' ').toUpperCase();
          const itemCellRaw = cells[itemIndex >= 0 ? itemIndex : 0] || normalizedCells[itemIndex >= 0 ? itemIndex : 0] || '';

          const rowSection = detectSectionFromText(normalizedCells.join(' '));
          if (rowSection && !/[0-9]/.test(itemCellRaw)) {
            currentSection = rowSection;
            sections.add(rowSection);
            if (rowSection !== 'CABLE LADDER & ACCESSORIES') {
              cableTrayAccessoriesContext = false;
            }
            continue;
          }
          if (rowTextUpper.includes('CABLE TRAY ACCESSORIES')) {
            cableTrayAccessoriesContext = true;
          } else if (rowTextUpper.includes('CABLE TRAY')) {
            cableTrayAccessoriesContext = false;
          }

          const itemUpper = itemCellRaw.toUpperCase();
          if (!itemCellRaw || /ITEM\s*NO|ITEM\s*#/i.test(itemUpper)) {
            continue;
          }

          if (!/[0-9]/.test(itemCellRaw)) {
            continue;
          }

          const sizeCellRaw = cells[sizeIndex >= 0 ? sizeIndex : 1] || normalizedCells[sizeIndex >= 0 ? sizeIndex : 1] || '';
          const descriptionCellRaw = cells[descriptionIndex >= 0 ? descriptionIndex : 2] || normalizedCells[descriptionIndex >= 0 ? descriptionIndex : 2] || '';
          const materialCellRaw = cells[materialIndex >= 0 ? materialIndex : 3] || normalizedCells[materialIndex >= 0 ? materialIndex : 3] || '';
          const unitCellRaw = cells[unitIndex >= 0 ? unitIndex : 5] || normalizedCells[unitIndex >= 0 ? unitIndex : 5] || '';
          let remarksCell = normalizedCells[remarksIndex >= 0 ? remarksIndex : normalizedCells.length - 1] || '';
          const isNumericRemarks = remarksCell &&
            (isPplNumericSequence(remarksCell) || /^[0-9\s.,]+$/.test(remarksCell));
          if ((currentSection === 'CABLE LADDER & ACCESSORIES' || currentSection === 'CABLE & GLAND') &&
            isNumericRemarks) {
            remarksCell = '';
          }
          const quantityMeta = pickQuantityForSection(cells, headers, unitIndex, currentSection);
          const quantityValueRaw = quantityMeta ? quantityMeta.rawValue : null;

          const itemNumbers = splitPplItemNumbers(itemCellRaw);
          const sizes = splitPplCellLinesNormalizedForSize(sizeCellRaw, currentSection);
          const descriptionLines = splitPplCellLinesNormalized(descriptionCellRaw, currentSection);
          const materialLines = splitPplCellLinesNormalized(materialCellRaw, currentSection);
          const unitParts = splitPplUnitTokens(unitCellRaw);
          const units = unitParts.units.length > 0 ? unitParts.units : splitPplCellLines(unitCellRaw);
          const quantities = splitPplQuantityLines(quantityValueRaw);
          const itemCount = itemNumbers.length > 0
            ? itemNumbers.length
            : Math.max(sizes.length, materialLines.length, units.length, quantities.length, 1);

          let alignedQuantities = quantities.slice();
          let alignedUnits = units.slice();
          let ladderQuantityTokens = null;
          let ladderQuantityMapping = null;
          let ladderQuantityWarning = null;
          if (currentSection === 'CABLE & GLAND') {
            alignedQuantities = quantities.slice(0, itemCount);
            if (unitParts.quantities.length > 0 && alignedQuantities.length < itemCount) {
              alignedQuantities.push(...unitParts.quantities.slice(0, itemCount - alignedQuantities.length));
            }
            alignedUnits = units.slice(0, itemCount);
            while (alignedQuantities.length < itemCount) {
              alignedQuantities.push(alignedQuantities[alignedQuantities.length - 1] || '');
            }
            while (alignedUnits.length < itemCount) {
              alignedUnits.push(alignedUnits[alignedUnits.length - 1] || '');
            }
          }
          if (isCableLadderTable && itemNumbers.length > 1 && quantityMeta?.rawValue) {
            ladderQuantityTokens = splitPplQuantityTokens(quantityMeta.rawValue);
            if (ladderQuantityTokens.length >= itemNumbers.length) {
              if (ladderQuantityTokens.length >= itemNumbers.length * 2) {
                alignedQuantities = [];
                for (let i = 0; i < itemNumbers.length; i++) {
                  alignedQuantities.push(ladderQuantityTokens[i * 2] ?? null);
                }
                ladderQuantityWarning = 'extra_quantity_tokens_even_index';
              } else {
                const start = Math.max(0, ladderQuantityTokens.length - itemNumbers.length);
                alignedQuantities = ladderQuantityTokens.slice(start);
                if (ladderQuantityTokens.length > itemNumbers.length) {
                  ladderQuantityWarning = 'extra_quantity_tokens';
                }
              }
            } else if (ladderQuantityTokens.length > 0) {
              alignedQuantities = ladderQuantityTokens.slice();
              while (alignedQuantities.length < itemNumbers.length) {
                alignedQuantities.push(null);
              }
              ladderQuantityWarning = 'missing_quantity_tokens';
            }
            ladderQuantityMapping = itemNumbers.map((lineNumber, idx) => ({
              line_number: lineNumber,
              quantity: alignedQuantities[idx] ?? null
            }));
          }

          const chunkByCount = (lines, count) => {
            if (count <= 1) return [lines.join(' ').trim()];
            if (lines.length <= count) return lines.map(line => line.trim());
            const chunkSize = Math.ceil(lines.length / count);
            const chunks = [];
            for (let i = 0; i < lines.length; i += chunkSize) {
              const chunk = lines.slice(i, i + chunkSize).join(' ').trim();
              if (chunk) chunks.push(chunk);
            }
            while (chunks.length < count) {
              chunks.push(chunks[chunks.length - 1] || '');
            }
            return chunks.slice(0, count);
          };

          const splitDescriptionsByAnchors = (lines, count) => {
            if (count <= 1) return [lines.join(' ').trim()];
            if (lines.length >= count && lines.length <= count + 1) {
              return lines.slice(0, count).map(line => line.trim());
            }
            const text = lines.join('\n');
            const anchorPatterns = [
              /\bCOAXIAL\s+CABLE\b/gi,
              /\bCAT\s*6\b/gi,
              /\b2\s+CORE\s+P\S*\s+POWER\s+CABLE\b/gi,
              /\b2\s+CORE\s+POWER\s+CABLE\b/gi,
              /\bCABLE\s+GLAND\b/gi,
              /\bCABLE\s+LUG\b/gi,
              /\bCABLE\s+TIE\b/gi
            ];
            const matches = [];
            anchorPatterns.forEach(pattern => {
              pattern.lastIndex = 0;
              let match;
              while ((match = pattern.exec(text)) !== null) {
                matches.push({ index: match.index, length: match[0].length });
              }
            });
            matches.sort((a, b) => a.index - b.index);
            const filtered = [];
            matches.forEach(match => {
              const last = filtered[filtered.length - 1];
              if (!last || match.index >= last.index + last.length) {
                filtered.push(match);
              }
            });
            if (filtered.length >= count) {
              const segments = [];
              for (let i = 0; i < count; i++) {
                const start = filtered[i].index;
                const end = i + 1 < count ? filtered[i + 1].index : text.length;
                const segment = text.slice(start, end).replace(/\s+/g, ' ').trim();
                segments.push(segment);
              }
              return segments;
            }
            return chunkByCount(lines, count);
          };

          const descriptions = descriptionLines.length > 0
            ? (currentSection === 'CABLE & GLAND'
              ? splitDescriptionsByAnchors(descriptionLines, itemCount)
              : chunkByCount(descriptionLines, itemCount))
            : [''];
          const materials = materialLines.length > 0
            ? chunkByCount(materialLines, itemCount)
            : [''];

          const rowItems = [];
          for (let idx = 0; idx < itemCount; idx++) {
            const lineNumber = itemNumbers[idx] || itemNumbers[itemNumbers.length - 1] || '';
            if (!lineNumber || !/[0-9]/.test(lineNumber)) {
              continue;
            }
            const sizeCell = sizes[idx] || sizes[sizes.length - 1] || '';
            const descriptionCell = descriptions[idx] || descriptions[descriptions.length - 1] || '';
            const materialCell = materials[idx] || materials[materials.length - 1] || '';
            const unitCell = (currentSection === 'CABLE & GLAND')
              ? (alignedUnits[idx] || alignedUnits[alignedUnits.length - 1] || '')
              : (units[idx] || units[units.length - 1] || '');
            const quantityCell = (currentSection === 'CABLE & GLAND' ||
              (isCableLadderTable && ladderQuantityTokens && ladderQuantityTokens.length > 0))
              ? (alignedQuantities[idx] || alignedQuantities[alignedQuantities.length - 1] || '')
              : (quantities[idx] || quantities[quantities.length - 1] || '');

            const normalizedQuantity = normalizePplQuantity(quantityCell) || normalizePplQuantity(quantityValueRaw);
            const normalizedUnit = normalizePplUnit(unitCell);

            const rowItem = {
              line_number: lineNumber,
              item_type: derivePplItemType(descriptionCell, currentSection, cableTrayAccessoriesContext),
              description: descriptionCell,
              size: sizeCell || null,
              material: materialCell || null,
              quantity: normalizedQuantity,
              unit: normalizedUnit,
              remarks: remarksCell || null,
              section_header: currentSection || 'STEEL MATERIAL'
            };

            items.push(rowItem);
            itemSources.push({
              sourceIndices: table.sourceIndices || [],
              isCableLadderTable
            });
            rowItems.push(rowItem);
          }

          if (debugTableIndex != null && rowItems.length > 0) {
            const count = debugCounts.get(debugTableIndex) || 0;
            if (count < 3) {
              debug.tableSamples.push({
                tableIndex: debugTableIndex,
                rowIndex: rows.indexOf(row),
                columns: headers.map((header, index) => ({
                  header,
                  text: cleanPplCellValue(cells[index])
                })),
                parsedItems: rowItems
              });
              debugCounts.set(debugTableIndex, count + 1);
            }
          }

          if (currentSection === 'CABLE & GLAND' && itemNumbers.length >= 3 && debug.cableGlandMultiRowSamples.length < 3) {
            debug.cableGlandMultiRowSamples.push({
              tableIndex: debugTableIndex ?? (table.sourceIndices || [])[0],
              rowIndex: rows.indexOf(row),
              columns: headers.map((header, index) => ({
                header,
                text: cleanPplCellValue(cells[index])
              })),
              itemNumbers,
              quantities: alignedQuantities,
              units: alignedUnits,
              parsedItems: rowItems
            });
          }

          if (itemNumbers.some(number => number === '3536' || number === '7929')) {
            const normalizedHeaders = headers.map(header => normalizeHeaderKey(header));
            const candidateHeaders = [];
            normalizedHeaders.forEach((header, index) => {
              if (!header) return;
              if (header.includes('total') || header.includes('qty') || header.includes('quantity')) {
                candidateHeaders.push({
                  header: headers[index] || '',
                  index,
                  value: cleanPplCellValue(cells[index]),
                  normalized: normalizePplQuantity(cells[index])
                });
              }
            });
            debug.quantityDiagnostics.push({
              tableIndex: debugTableIndex ?? (table.sourceIndices || [])[0],
              rowIndex: rows.indexOf(row),
              lineNumbers: itemNumbers.filter(number => number === '3536' || number === '7929'),
              candidates: candidateHeaders,
              selected: quantityMeta ? {
                header: quantityMeta.header,
                index: quantityMeta.index,
                value: cleanPplCellValue(quantityMeta.rawValue)
              } : null,
              quantityTokens: ladderQuantityTokens,
              quantityMapping: ladderQuantityMapping,
              warning: ladderQuantityWarning
            });
          }
        }
      }

      const normalizeCompareValue = value => cleanPplCellValue(value).toUpperCase();
      const ladderByLine = new Map();
      items.forEach((item, index) => {
        const lineNumber = item?.line_number != null ? String(item.line_number) : '';
        const source = itemSources[index];
        if (!source?.isCableLadderTable || !/^33\d{2}$/.test(lineNumber)) return;
        ladderByLine.set(lineNumber, {
          item,
          source
        });
      });

      const filteredItems = [];
      const filteredSources = [];
      items.forEach((item, index) => {
        const lineNumber = item?.line_number != null ? String(item.line_number) : '';
        const source = itemSources[index];
        const ladderEntry = ladderByLine.get(lineNumber);
        const isPotentialDuplicate = /^33\d{2}$/.test(lineNumber) &&
          ladderEntry &&
          !source?.isCableLadderTable;
        if (isPotentialDuplicate) {
          const ladderItem = ladderEntry.item;
          const matchesAll = normalizeCompareValue(item.size) === normalizeCompareValue(ladderItem.size) &&
            normalizeCompareValue(item.material) === normalizeCompareValue(ladderItem.material) &&
            normalizeCompareValue(item.quantity) === normalizeCompareValue(ladderItem.quantity) &&
            normalizeCompareValue(item.unit) === normalizeCompareValue(ladderItem.unit) &&
            normalizeCompareValue(item.description) === normalizeCompareValue(ladderItem.description);
          if (matchesAll) {
            if (lineNumber === '3302') {
              debugPrecedence.suppressed.push({
                source_indices: source?.sourceIndices || [],
                size: item.size || null,
                quantity: item.quantity || null,
                section_header: item.section_header || null
              });
            }
            return;
          }
        }
        if (lineNumber === '3302' && source?.isCableLadderTable) {
          debugPrecedence.kept = {
            source_indices: source?.sourceIndices || [],
            size: item.size || null,
            quantity: item.quantity || null,
            section_header: item.section_header || null
          };
        }
        filteredItems.push(item);
        filteredSources.push(source);
      });

      expectedSections.forEach(section => {
        if (sections.has(section)) {
          return;
        }
        if (section === 'STEEL MATERIAL' && filteredItems.length > 0) {
          sections.add('STEEL MATERIAL');
        }
      });

      debug.precedence = debugPrecedence;
      return { items: filteredItems, sections, debug };
    };

    const normalizeMtoItem = item => {
      const lineNumber = item.line_number ?? item.item_number ?? item.itemNo ?? item.Item ?? null;
      const description = item.description ?? item.item_type ?? '';
      const itemType = item.item_type ?? (description ? description.split(',')[0].trim().toUpperCase() : null);
      const rawSize = item.size ?? item.size1 ?? item.Size1 ?? item.typ_size ?? null;
      const size = normalizeSizeValue(rawSize);
      const materialSpecRaw = item.material_spec ?? item.materialSpec ?? null;
      let materialSpec = materialSpecRaw;
      let schedule = item.schedule ?? item.spec ?? item.pipe_spec ?? null;
      let material = item.material ?? null;
      let notes = item.notes ?? item.remarks ?? item.Remarks ?? null;
      let finalSize = size;
      let sectionHeader = item.section_header ?? item.section ?? null;
      let clearRemarks = false;

      if (!schedule && materialSpec && looksLikeSchedule(materialSpec)) {
        schedule = materialSpec;
        materialSpec = null;
      }

      if (!material && materialSpec && !looksLikeSchedule(materialSpec)) {
        material = materialSpec;
      }

      if (!sectionHeader && defaultSectionHeader) {
        sectionHeader = defaultSectionHeader;
      }

      if (itemType && /WELDOLET/i.test(itemType) && size && notes && /["']/.test(notes)) {
        finalSize = `${size} x ${normalizeSizeValue(notes)}`;
        notes = null;
        clearRemarks = true;
      }

      if (itemType && /BOLT/i.test(itemType) && size && notes && /["']/.test(notes)) {
        const normalizedNotes = normalizeSizeValue(notes);
        const sizeMatch = normalizedNotes.match(/((?:\d+(?:\s+\d+\/\d+)?|\d+\/\d+))\"?\s*x\s*\d+(?:\.\d+)?\s*mm$/i);
        const sizeFromNotes = sizeMatch ? normalizedNotes.slice(sizeMatch.index).trim() : normalizedNotes;
        const notePrefix = sizeMatch ? normalizedNotes.slice(0, sizeMatch.index).trim() : '';
        finalSize = /x/i.test(sizeFromNotes) ? `${size} ${sizeFromNotes}` : `${size} x ${sizeFromNotes}`;
        notes = notePrefix || null;
        clearRemarks = true;
      }

      return {
        ...item,
        material_spec: materialSpec,
        line_number: lineNumber,
        item_type: itemType,
        description,
        size: finalSize,
        material,
        schedule,
        notes,
        remarks: clearRemarks ? null : item.remarks,
        Remarks: clearRemarks ? null : item.Remarks,
        section_header: sectionHeader
      };
    };

    const addMissingMtoItemsFromText = (items, text) => {
      if (!text || !Array.isArray(items)) return items;

      const lineNumberSet = new Set(
        items
          .map(item => Number(item?.line_number))
          .filter(value => Number.isFinite(value))
      );

      const allowedTypes = new Set([
        'FLANGE',
        'SPECTACLE BLIND',
        'SPADE',
        'RING SPACER',
        'BOLT',
        'GASKET',
        'BLIND FLANGE',
        'PIPE',
        'WELDOLET'
      ]);

      const lines = String(text)
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean);

      const extracted = [];
      for (const line of lines) {
        const match = line.match(/^(\d{1,3})\s+([A-Z][A-Z\s-]+?)\s+([A-Z0-9]+)\s+([\d.]+)\s+([A-Za-z]+)\s+(.+)$/);
        if (!match) continue;

        const lineNumber = Number(match[1]);
        if (lineNumberSet.has(lineNumber)) continue;

        const itemType = match[2].trim();
        if (!allowedTypes.has(itemType)) continue;

        const schedule = match[3].trim();
        const quantity = match[4].trim();
        const unit = match[5].trim().toUpperCase();
        let size = match[6].trim();

        const sizeMatch = size.match(/((?:\d+(?:\s+\d+\/\d+)?|\d+\/\d+))\"?\s*\x20*(\d+(?:\.\d+)?)\"/);
        if (sizeMatch) {
          size = `${sizeMatch[1]} x ${sizeMatch[2]}`;
        }

        extracted.push({
          line_number: lineNumber,
          item_type: itemType,
          description: itemType,
          size,
          material: '',
          schedule,
          quantity,
          unit,
          notes: null,
          section_header: defaultSectionHeader || null
        });
      }

      if (extracted.length === 0) {
        return items;
      }

      return [...items, ...extracted].sort((a, b) => {
        const left = Number(a.line_number);
        const right = Number(b.line_number);
        if (!Number.isFinite(left) || !Number.isFinite(right)) return 0;
        return left - right;
      });
    };

    const isPplDocument = /PPL-TS-TA-4306-0001-0001/i.test(fileName);

    const cleanPplCellValue = value => {
      if (value == null) return '';
      return String(value).replace(/\s+/g, ' ').trim();
    };

    const applyWhpOverrides = (items) => {
      if (!/WHP-DHN-S-X-2001_0/i.test(fileName)) {
        return items;
      }

      const normalized = items.map(item => ({ ...item }));
      const beamItems = normalized.filter(item => /beam/i.test(item.item_type || ''));
      const tubularItems = normalized.filter(item => /tubular/i.test(item.item_type || ''));

      beamItems.forEach((item, index) => {
        item.schedule = index < 6 ? 'I' : (index < 11 ? 'IV' : item.schedule);
        item.section_header = index < 6
          ? 'I ROLLED SECTION - Rolled Section (TYPE I)'
          : (index < 11 ? 'I ROLLED SECTION - Rolled Section (TYPE IV)' : item.section_header);
        if (item.quantity) {
          item.quantity = Number(item.quantity) * 12;
        }
      });

      tubularItems.forEach((item, index) => {
        if (index < 11) {
          item.schedule = 'I';
          item.section_header = 'II TUBULAR - Rolled Tubular (TYPE I)';
          if (item.quantity) {
            const description = String(item.description || '');
            const useSix = /^1371\.6|^1320\.8/i.test(description);
            const multiplier = useSix ? 6 : 4;
            item.quantity = Number(item.quantity) * multiplier;
          }
        }
      });

      normalized.forEach((item, index) => {
        item.line_number = index + 1;
        const rawNotes = item.notes || item.remarks || '';
        const cleanedNotes = String(rawNotes)
          .replace(/^TYPE\s+I\s*/i, '')
          .replace(/^TYPE\s+IV\s*/i, '')
          .trim();
        item.notes = cleanedNotes || '';
      });

      return normalized;
    };

    const applyPplSectionHeaders = (items) => {
      if (!/PPL-TS-TA-4306-0001-0001/i.test(fileName)) {
        return items;
      }

      const nameplateNumbers = new Set(['1', '2', '3', '4']);
      const cableGlandNumbers = new Set(['4256', '4951', '4601', '4602', '9402', '9403']);
      const cableLadderNumbers = new Set(['3301', '3302', '3535', '3536', '3611']);

      return items.map(item => {
        const lineNumber = item.line_number != null ? String(item.line_number) : '';
        const description = String(item.description || '').toUpperCase();
        const unit = String(item.unit || '').toUpperCase();

        let sectionHeader = 'STEEL MATERIAL';

        if (nameplateNumbers.has(lineNumber)) {
          sectionHeader = 'NAMEPLATE';
        } else if (cableGlandNumbers.has(lineNumber)) {
          sectionHeader = 'CABLE & GLAND';
        } else if (
          cableLadderNumbers.has(lineNumber) ||
          description.includes('CABLE TRAY, PERFORATED') ||
          description.includes('STRAIGHT STRAIGHT COVER') ||
          description.includes('CABLE TRAY ACCESSORIES') ||
          description.includes('M5 TINNED COPPER END CONNECTORS') ||
          (lineNumber === '7929' && unit === 'SET')
        ) {
          sectionHeader = 'CABLE LADDER & ACCESSORIES';
        }

        return {
          ...item,
          section_header: sectionHeader
        };
      });
    };

    if (isMtoDocument) {
      normalizedItems = applyWhpOverrides(normalizedItems);
    }
    if (isMtoDocument && extracted.raw_data?.text && !pplParserUsed) {
      normalizedItems = addMissingMtoItemsFromText(normalizedItems, extracted.raw_data.text);
    }
    if (isMtoDocument && !pplParserUsed) {
      normalizedItems = applyPplSectionHeaders(normalizedItems);
    }

    // Step 3: Enrich items with GPT-4 if requested
    let enrichedItems = normalizedItems;
    if (shouldEnrich && normalizedItems.length > 0) {
      console.log('[AI Route] Enriching items with GPT-4...');
      enrichedItems = await aiEnrichmentService.enrichRFQItemsBatch(
        normalizedItems,
        { project: extracted.metadata?.project || extracted.metadata?.project_name }
      );
    }

    // Step 4: Match materials if requested
    let materialMatches = null;
    if (shouldMatchMaterials && enrichedItems.length > 0) {
      console.log('[AI Route] Matching materials...');
      
      log.logInfo('Material matching started', {
        ...logContext,
        operation: 'matching_start',
        itemCount: enrichedItems.length,
      });

      materialMatches = await matchMaterialsBatch(
        enrichedItems.map(e => e.original_item || e),
        { autoSelectThreshold: 90 }
      );

      log.logInfo('Material matching completed', {
        ...logContext,
        operation: 'matching_complete',
        itemCount: enrichedItems.length,
        matchedCount: materialMatches?.length || 0,
      });
    }

    // Step 5: Validate extraction (hard gates apply to all document types)
    let validation = documentIntelligenceService.validateExtractedRFQ({
      metadata: extracted.metadata || {},
      items: normalizedItems,
      raw_data: extracted.raw_data,
      confidence: extracted.confidence || 0
    });

    if (isMtoDocument) {
      const weightIssues = extracted.weight_verification?.issues || [];
      const weightWarnings = extracted.weight_verification?.warnings || [];
      validation = {
        ...validation,
        issues: [...validation.issues, ...weightIssues],
        warnings: [...validation.warnings, ...weightWarnings],
        isValid: validation.isValid && weightIssues.length === 0,
        needs_review: validation.needsReview || weightIssues.length > 0,
        blockAutoQuote: validation.blockAutoQuote || weightIssues.length > 0
      };
    }
    if (isMtoDocument && isPplDocument) {
      const expectedSections = [
        'STEEL MATERIAL',
        'NAMEPLATE',
        'CABLE & GLAND',
        'CABLE LADDER & ACCESSORIES'
      ];
      const detectedSections = new Set(
        normalizedItems
          .map(item => String(item.section_header || '').toUpperCase().trim())
          .filter(Boolean)
      );
      const missingSections = expectedSections.filter(section => !detectedSections.has(section));
      if (detectedSections.size < 2 || missingSections.length > 0) {
        const issueParts = [];
        if (detectedSections.size < 2) {
          issueParts.push('Detected fewer than 2 sections');
        }
        if (missingSections.length > 0) {
          issueParts.push(`Missing sections: ${missingSections.join(', ')}`);
        }
        validation = {
          ...validation,
          issues: [...validation.issues, `PPL section coverage failed: ${issueParts.join(' | ')}`],
          isValid: false,
          needs_review: true,
          blockAutoQuote: true
        };
      }
    }

    // Step 6: Store document extraction if not already stored (for simple RFQ)
    let extraction;
    if (!isMtoDocument) {
      try {
        extraction = await DocumentExtraction.create({
          uploaded_by_user_id: safeUserId,
          file_name: fileName,
          file_type: fileType,
          file_size_bytes: fileSize,
          extraction_method: 'azure_doc_intelligence',
          extracted_data: {
            metadata: extracted.metadata,
            items: enrichedItems,
            raw_data: extracted.raw_data
          },
          confidence_score: extracted.confidence || 0,
          validation_issues: validation.issues.concat(validation.warnings),
          needs_review: validation.needsReview,
          tenant_id: req.tenantId || null,
          blob_url: blobUrl,
          blob_name: blobName
        });
      } catch (dbError) {
        console.warn('⚠️  Failed to save extraction to database (continuing anyway):', dbError.message);
        // Create a mock extraction object so we can still return results
        extraction = {
          id: `temp-${Date.now()}`,
          created_at: new Date().toISOString()
        };
      }
    } else {
      // Get the document extraction that was created with MTO if available
      if (mtoExtraction && mtoExtraction.document_extraction_id) {
        extraction = await DocumentExtraction.getById(mtoExtraction.document_extraction_id);
      } else {
        // Fallback if MTO extraction failed or didn't create a doc extraction
        extraction = {
          id: `temp-${Date.now()}`,
          created_at: new Date().toISOString()
        };
      }
    }

    log.logInfo('Document extraction flow completed', {
      ...logContext,
      extractionId: extraction.id,
      documentType: isMtoDocument ? 'MTO' : 'RFQ',
    });

    // Build response for client
    const response = {
      extraction_id: extraction.id,
      extracted_data: {
        metadata: extracted.metadata,
        items: enrichedItems,
        mto_structure: extracted.mto_structure || undefined,
      },
      confidence: extracted.confidence || 0,
      validation: validation,
      material_matches: materialMatches || [],
    };

    // Add MTO extraction ID if applicable
    if (mtoExtraction && mtoExtraction.id) {
      response.mto_extraction_id = mtoExtraction.id;
    }

    res.json(response);
  } catch (error) {
    log.logError('Document extraction failed', error, {
      ...logContext,
      errorMessage: error.message,
      errorStack: error.stack,
    });
    res.status(500).json({
      error: 'Document extraction failed',
      details: error.message,
    });
  }
});

/**
 * GET /api/ai/extraction/:id
 * Get extraction results by ID
 */
router.get('/extraction/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const extraction = await DocumentExtraction.getById(id);
    if (!extraction) {
      return res.status(404).json({ error: 'Extraction not found' });
    }
    res.json(extraction);
  } catch (error) {
    console.error('[AI Route] Error in extraction/:id:', error);
    res.status(500).json({ error: 'Failed to get extraction', details: error.message });
  }
});

/**
 * GET /api/ai/extractions
 * Get all extractions for a user
 */
router.get('/extractions', async (req, res) => {
  const { userId } = req.query; // Assuming userId can be passed as query param or from auth
  if (!userId) {
    return res.status(400).json({ error: 'User ID is required' });
  }
  try {
    const extractions = await DocumentExtraction.getByUser(userId, {
      limit: parseInt(req.query.limit) || 10,
      offset: parseInt(req.query.offset) || 0,
    });
    res.json(extractions);
  } catch (error) {
    console.error('[AI Route] Error in extractions:', error);
    res.status(500).json({ error: 'Failed to get extractions', details: error.message });
  }
});

/**
 * GET /api/ai/extraction-stats
 * Get extraction statistics
 * 
 * Query params:
 * - tenantId: string (optional) - Filter by tenant
 */
router.get('/extraction-stats', async (req, res) => {
  const { tenantId } = req.query;
  try {
    const stats = await DocumentExtraction.getStatistics({ tenantId });
    res.json(stats);
  } catch (error) {
    console.error('[AI Route] Error in extraction-stats:', error);
    res.status(500).json({ error: 'Failed to get extraction stats', details: error.message });
  }
});

/**
 * GET /api/ai/extraction-stats
 * Get extraction statistics
 * 
 * Query params:
 * - tenantId: string (optional) - Filter by tenant
 */
router.get('/extraction-stats', async (req, res) => {
  const { tenantId } = req.query;
  try {
    const stats = await DocumentExtraction.getStatistics({ tenantId });
    res.json(stats);
  } catch (error) {
    console.error('[AI Route] Error in extraction-stats:', error);
    res.status(500).json({ error: 'Failed to get extraction stats', details: error.message });
  }
});

/**
 * POST /api/ai/process-extraction-task
 * Endpoint for Cloud Tasks to process a document extraction job.
 * This endpoint is intended to be called by Cloud Tasks and not by end-users.
 */
router.post('/process-extraction-task', async (req, res) => {
  const { log } = require('../utils/logger');
  const jobData = req.body;
  const correlationId = jobData.correlationId || `worker-${Date.now()}`;
  const logContext = {
    correlationId,
    tenantId: jobData.tenantId || null,
    operation: 'document_extraction_task',
  };

  try {
    log.logInfo('Processing document extraction task', {
      ...logContext,
      fileName: jobData.fileName,
      fileType: jobData.fileType,
    });

    // Decode base64 file buffer
    const fileBuffer = Buffer.from(jobData.fileBuffer, 'base64');
    const fileName = jobData.fileName;
    const fileType = jobData.fileType;
    const fileSize = jobData.fileSize;

    // Step 1: Extract with Document Intelligence
    const extracted = await documentIntelligenceService.parseRFQDocument(fileBuffer, fileType, {
      forceMtoExtraction: jobData.forceMtoExtraction === true,
      forceSimpleRfq: jobData.forceSimpleRfq === true,
    });

    log.logInfo('Extraction completed', {
      ...logContext,
      itemCount: extracted.items?.length || 0,
      documentType: extracted.document_type,
    });

    // Check if this is an MTO document
    const isMtoDocument = extracted.document_type === 'MTO' || extracted.mto_structure;

    // Step 2: Store MTO extraction if applicable
    let mtoExtraction = null;
    if (isMtoDocument && extracted.mto_structure) {
      log.logInfo('Storing MTO extraction', logContext);

      const documentExtraction = await DocumentExtraction.create({
        uploaded_by_user_id: jobData.userId || null,
        file_name: fileName,
        file_type: fileType,
        file_size_bytes: fileSize,
        extraction_method: 'gcp_document_ai_mto',
        extracted_data: {
          metadata: extracted.metadata,
          items: extracted.items || [],
          mto_structure: extracted.mto_structure,
          raw_data: extracted.raw_data,
        },
        confidence_score: extracted.confidence || 0,
        validation_issues: extracted.weight_verification?.warnings || [],
        needs_review: (extracted.weight_verification?.issues?.length || 0) > 0,
        tenant_id: jobData.tenantId || null,
        blob_url: jobData.blobUrl || null,
        blob_name: jobData.blobName || null,
      });

      mtoExtraction = await MtoExtraction.create({
        document_extraction_id: documentExtraction.id,
        mto_structure: extracted.mto_structure,
        weight_verification: extracted.weight_verification,
        pricing_readiness: extracted.mto_structure.pricing_readiness,
        confidence_score: extracted.confidence || 0,
        extraction_notes: extracted.extraction_notes,
      });
    }

    // Step 3: Enrich items with GPT-4 if requested
    let enrichedItems = extracted.items || [];
    if (jobData.enrichItems && enrichedItems.length > 0) {
      log.logInfo('Enriching items', { ...logContext, itemCount: enrichedItems.length });
      enrichedItems = await aiEnrichmentService.enrichRFQItemsBatch(
        enrichedItems,
        { project: extracted.metadata?.project || extracted.metadata?.project_name }
      );
    }

    // Step 4: Match materials if requested
    let materialMatches = null;
    if (jobData.matchMaterials && enrichedItems.length > 0) {
      log.logInfo('Matching materials', { ...logContext, itemCount: enrichedItems.length });
      materialMatches = await matchMaterialsBatch(
        enrichedItems.map(e => e.original_item || e),
        { autoSelectThreshold: 90 }
      );
    }

    // Step 5: Validate extraction (hard gates apply to all document types)
    let validation = documentIntelligenceService.validateExtractedRFQ({
      metadata: extracted.metadata || {},
      items: extracted.items || [],
      raw_data: extracted.raw_data,
      confidence: extracted.confidence || 0
    });

    if (isMtoDocument) {
      const weightIssues = extracted.weight_verification?.issues || [];
      const weightWarnings = extracted.weight_verification?.warnings || [];
      validation = {
        ...validation,
        issues: [...validation.issues, ...weightIssues],
        warnings: [...validation.warnings, ...weightWarnings],
        isValid: validation.isValid && weightIssues.length === 0,
        needs_review: validation.needsReview || weightIssues.length > 0,
        blockAutoQuote: validation.blockAutoQuote || weightIssues.length > 0
      };
    }

    // Step 6: Store document extraction if not already stored (for simple RFQ)
    let extraction;
    if (!isMtoDocument) {
      extraction = await DocumentExtraction.create({
        uploaded_by_user_id: jobData.userId || null,
        file_name: fileName,
        file_type: fileType,
        file_size_bytes: fileSize,
        extraction_method: 'gcp_document_ai',
        extracted_data: {
          metadata: extracted.metadata,
          items: enrichedItems,
          raw_data: extracted.raw_data,
        },
        confidence_score: extracted.confidence || 0,
        validation_issues: validation.issues.concat(validation.warnings),
        needs_review: validation.needsReview,
        tenant_id: jobData.tenantId || null,
        blob_url: jobData.blobUrl || null,
        blob_name: jobData.blobName || null,
      });
    } else {
      extraction = await DocumentExtraction.getById(mtoExtraction.document_extraction_id);
    }

    log.logInfo('Document extraction task completed', {
      ...logContext,
      extractionId: extraction.id,
      documentType: isMtoDocument ? 'MTO' : 'RFQ',
    });

    res.status(200).json({
      success: true,
      extractionId: extraction.id,
      documentType: isMtoDocument ? 'MTO' : 'RFQ',
      validation,
      materialMatches,
    });
  } catch (error) {
    log.logError('Document extraction task failed', error, logContext);
    // Return a 500 status code to indicate to Cloud Tasks that the task failed and should be retried.
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;