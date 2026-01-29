/**
 * Intelligent Extraction Service
 *
 * This service uses Gemini's full capabilities to UNDERSTAND documents
 * rather than relying on brittle pattern matching.
 *
 * Key features:
 * 1. Multimodal support - can analyze page images alongside text
 * 2. Flexible prompts - no hardcoded column names or patterns
 * 3. Two-phase extraction - analyze structure first, then extract
 * 4. Validation pass - catch and fix common extraction errors
 *
 * This is designed to handle ANY document format without code changes.
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const { VertexAI } = require('@google-cloud/vertexai');
const { PDFDocument } = require('pdf-lib');
const {
  INTELLIGENT_EXTRACTION_V1,
  DOCUMENT_ANALYSIS_V1,
  MULTIMODAL_EXTRACTION_V1,
  EXTRACTION_VALIDATION_V1
} = require('../../ai/prompts/intelligentExtractionPrompts');

// Configuration
const INTELLIGENT_EXTRACTION_ENABLED = process.env.INTELLIGENT_EXTRACTION === 'true';
const USE_MULTIMODAL = process.env.INTELLIGENT_EXTRACTION_MULTIMODAL === 'true';
const USE_TWO_PHASE = process.env.INTELLIGENT_EXTRACTION_TWO_PHASE !== 'false'; // Default true
const USE_VALIDATION = process.env.INTELLIGENT_EXTRACTION_VALIDATION !== 'false'; // Default true

let genAI = null;
let vertexAI = null;
let modelName = null;

/**
 * Initialize the Gemini client
 */
function initializeClient() {
  if (genAI || vertexAI) {
    return { genAI, vertexAI };
  }

  modelName = process.env.VERTEX_AI_MODEL || 'gemini-2.5-pro';

  // Try Vertex AI first (preferred for multimodal)
  const projectId = process.env.GCP_PROJECT_ID;
  const location = process.env.VERTEX_AI_LOCATION || 'us-central1';

  if (projectId) {
    try {
      vertexAI = new VertexAI({
        project: projectId,
        location: location,
      });
      console.log(`✅ Intelligent Extraction: Vertex AI initialized (${modelName})`);
      return { vertexAI };
    } catch (error) {
      console.warn(`⚠️ Vertex AI init failed: ${error.message}, trying Gemini API`);
    }
  }

  // Fallback to Gemini API
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey) {
    genAI = new GoogleGenerativeAI(apiKey);
    console.log(`✅ Intelligent Extraction: Gemini API initialized (${modelName})`);
    return { genAI };
  }

  throw new Error('No Gemini/Vertex AI credentials available for intelligent extraction');
}

/**
 * Convert PDF buffer to base64 images for multimodal analysis
 * @param {Buffer} pdfBuffer - PDF file buffer
 * @param {number} maxPages - Maximum pages to convert
 * @returns {Promise<Array<{mimeType: string, data: string}>>}
 */
async function pdfToBase64Images(pdfBuffer, maxPages = 10) {
  // For now, we'll send the PDF directly to Gemini (it supports PDF input)
  // In future, we could convert to images using pdf-poppler or similar

  try {
    const pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
    const pageCount = pdfDoc.getPageCount();

    console.log(`📄 PDF has ${pageCount} pages (processing up to ${maxPages})`);

    // Gemini 1.5+ can process PDFs directly
    // Return the PDF as a single "image" part
    return [{
      mimeType: 'application/pdf',
      data: pdfBuffer.toString('base64'),
      pageCount: Math.min(pageCount, maxPages)
    }];
  } catch (error) {
    console.error(`❌ Failed to process PDF: ${error.message}`);
    return [];
  }
}

/**
 * Call Gemini with multimodal content (images + text)
 * @param {Object} prompt - Prompt configuration
 * @param {Array} parts - Array of content parts (text and images)
 * @param {Object} options - Call options
 * @returns {Promise<Object>} - Parsed JSON response
 */
async function callGeminiMultimodal(prompt, parts, options = {}) {
  const { genAI: client, vertexAI: vClient } = initializeClient();

  const {
    temperature = 0,
    maxTokens = 32000,
    retries = 3
  } = options;

  const systemInstruction = prompt.system;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const startTime = Date.now();
      let result;

      if (vClient) {
        // Use Vertex AI
        const model = vClient.getGenerativeModel({
          model: modelName,
          systemInstruction: systemInstruction,
        });

        result = await model.generateContent({
          contents: [{ role: 'user', parts }],
          generationConfig: {
            temperature,
            maxOutputTokens: maxTokens,
            responseMimeType: 'application/json',
          },
        });
      } else {
        // Use Gemini API
        const model = client.getGenerativeModel({
          model: modelName,
          systemInstruction: systemInstruction,
          generationConfig: {
            temperature,
            maxOutputTokens: maxTokens,
            responseMimeType: 'application/json',
          },
        });

        result = await model.generateContent({
          contents: [{ role: 'user', parts }],
        });
      }

      const response = result.response;
      const text = vClient
        ? response.candidates[0].content.parts[0].text
        : response.text();

      const duration = Date.now() - startTime;
      console.log(`✅ Intelligent extraction call successful (${duration}ms, attempt ${attempt})`);

      // Parse JSON response
      try {
        return JSON.parse(text);
      } catch (parseError) {
        // Try to extract JSON from response
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]);
        }
        throw parseError;
      }

    } catch (error) {
      console.error(`❌ Intelligent extraction failed (attempt ${attempt}/${retries}):`, error.message);

      if (attempt < retries) {
        const delay = 2000 * attempt;
        console.log(`   Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw error;
      }
    }
  }
}

/**
 * Phase 1: Analyze document structure
 * @param {Object} extractedData - Data from Document AI
 * @returns {Promise<Object>} - Document analysis
 */
async function analyzeDocumentStructure(extractedData) {
  console.log('🔍 Phase 1: Analyzing document structure...');

  const prompt = DOCUMENT_ANALYSIS_V1.template;
  const context = {
    text: extractedData.text,
    tables: extractedData.tables
  };

  const userPrompt = prompt.user(context);
  const parts = [{ text: userPrompt }];

  try {
    const analysis = await callGeminiMultimodal(prompt, parts, { temperature: 0 });
    console.log(`📊 Document analysis complete:`, {
      type: analysis.document_type,
      language: analysis.language?.primary,
      numberFormat: analysis.number_format?.detected,
      structure: analysis.structure?.type,
      columnsDetected: analysis.columns_detected?.length || 0
    });
    return analysis;
  } catch (error) {
    console.error('⚠️ Document analysis failed, proceeding without:', error.message);
    return null;
  }
}

/**
 * Phase 2: Extract items using document understanding
 * @param {Object} extractedData - Data from Document AI
 * @param {Object} analysis - Document analysis from Phase 1
 * @param {Buffer} pdfBuffer - Original PDF buffer (optional, for multimodal)
 * @returns {Promise<Object>} - Extracted items
 */
async function extractWithUnderstanding(extractedData, analysis, pdfBuffer = null) {
  console.log('📝 Phase 2: Extracting items with document understanding...');

  // Choose prompt based on whether we have images
  const useMultimodal = USE_MULTIMODAL && pdfBuffer;
  const prompt = useMultimodal
    ? MULTIMODAL_EXTRACTION_V1.template
    : INTELLIGENT_EXTRACTION_V1.template;

  // Build context with analysis hints
  const context = {
    text: extractedData.text,
    tables: extractedData.tables,
    hasImages: useMultimodal,
    hints: analysis ? buildHintsFromAnalysis(analysis) : null
  };

  const userPrompt = prompt.user(context);
  const parts = [{ text: userPrompt }];

  // Add PDF as multimodal content if available
  if (useMultimodal && pdfBuffer) {
    try {
      const pdfImages = await pdfToBase64Images(pdfBuffer, 15);
      if (pdfImages.length > 0) {
        // Add PDF as inline data
        parts.unshift({
          inlineData: {
            mimeType: pdfImages[0].mimeType,
            data: pdfImages[0].data
          }
        });
        context.pageCount = pdfImages[0].pageCount;
        console.log(`📷 Added PDF (${pdfImages[0].pageCount} pages) for multimodal analysis`);
      }
    } catch (error) {
      console.warn('⚠️ Could not add PDF for multimodal:', error.message);
    }
  }

  const result = await callGeminiMultimodal(prompt, parts, {
    temperature: 0,
    maxTokens: 64000 // Use full capacity for large documents
  });

  const itemCount = result.items?.length || 0;
  console.log(`📦 Extraction complete: ${itemCount} items extracted`);

  return result;
}

/**
 * Build hints string from document analysis
 */
function buildHintsFromAnalysis(analysis) {
  const hints = [];

  if (analysis.number_format?.detected) {
    hints.push(`Number format: ${analysis.number_format.detected} (${analysis.number_format.evidence || 'detected from values'})`);
  }

  if (analysis.language?.primary) {
    hints.push(`Primary language: ${analysis.language.primary}`);
  }

  if (analysis.structure?.groups?.length > 0) {
    hints.push(`Groups/Sections: ${analysis.structure.groups.join(', ')}`);
  }

  if (analysis.special_patterns?.material_codes) {
    hints.push(`Material code pattern: ${analysis.special_patterns.material_codes}`);
  }

  if (analysis.columns_detected?.length > 0) {
    const qtyCol = analysis.columns_detected.find(c =>
      c.semantic_meaning?.toLowerCase().includes('quantity') ||
      c.semantic_meaning?.toLowerCase().includes('count')
    );
    if (qtyCol) {
      hints.push(`Quantity column: "${qtyCol.name}" contains piece counts`);
    }
  }

  if (analysis.extraction_recommendations?.length > 0) {
    hints.push(`Recommendations: ${analysis.extraction_recommendations.join('; ')}`);
  }

  return hints.join('\n');
}

/**
 * Phase 3: Validate and correct extraction
 * @param {Object} extractedData - Extracted items
 * @param {string} originalText - Original document text
 * @returns {Promise<Object>} - Validated and corrected items
 */
async function validateExtraction(extractedData, originalText) {
  if (!USE_VALIDATION) {
    return extractedData;
  }

  console.log('✅ Phase 3: Validating extraction...');

  const prompt = EXTRACTION_VALIDATION_V1.template;
  const context = {
    extractedData,
    originalText
  };

  const userPrompt = prompt.user(context);
  const parts = [{ text: userPrompt }];

  try {
    const validated = await callGeminiMultimodal(prompt, parts, { temperature: 0 });

    if (validated.validation_report) {
      const report = validated.validation_report;
      if (report.issues_found?.length > 0) {
        console.log(`⚠️ Validation found ${report.issues_found.length} issues:`);
        report.issues_found.forEach(issue => console.log(`   - ${issue}`));
      }
      if (report.corrections_made?.length > 0) {
        console.log(`✅ Applied ${report.corrections_made.length} corrections`);
      }
    }

    return validated;
  } catch (error) {
    console.error('⚠️ Validation failed, using unvalidated data:', error.message);
    return extractedData;
  }
}

/**
 * Main intelligent extraction function
 * @param {Object} extractedData - Data from Document AI (text, tables)
 * @param {Object} options - Extraction options
 * @returns {Promise<Object>} - Extracted items in standard format
 */
async function intelligentExtract(extractedData, options = {}) {
  const startTime = Date.now();
  console.log('🧠 Starting intelligent extraction...');

  if (!INTELLIGENT_EXTRACTION_ENABLED) {
    throw new Error('Intelligent extraction is not enabled. Set INTELLIGENT_EXTRACTION=true');
  }

  const { pdfBuffer } = options;

  try {
    // Phase 1: Analyze document structure (optional but recommended)
    let analysis = null;
    if (USE_TWO_PHASE) {
      analysis = await analyzeDocumentStructure(extractedData);
    }

    // Phase 2: Extract with understanding
    let extraction = await extractWithUnderstanding(extractedData, analysis, pdfBuffer);

    // Phase 3: Validate extraction (optional but recommended)
    if (USE_VALIDATION && extraction.items?.length > 0) {
      const validated = await validateExtraction(extraction, extractedData.text);
      if (validated.items) {
        extraction.items = validated.items;
        extraction.validation_report = validated.validation_report;
      }
    }

    const duration = Date.now() - startTime;
    console.log(`🎉 Intelligent extraction complete in ${duration}ms`);
    console.log(`   Items: ${extraction.items?.length || 0}`);
    console.log(`   Confidence: ${extraction.confidence || 'N/A'}`);

    // Convert to standard format for compatibility
    return convertToStandardFormat(extraction, analysis);

  } catch (error) {
    console.error('❌ Intelligent extraction failed:', error.message);
    throw error;
  }
}

/**
 * Convert intelligent extraction output to standard RFQ format
 * for compatibility with existing system
 */
function convertToStandardFormat(extraction, analysis) {
  const items = (extraction.items || []).map((item, index) => ({
    line_number: item.line_number || index + 1,
    item_number: item.line_number || index + 1,
    item_type: item.item_type || null,
    size: item.size || null,
    description: item.description || '',
    material_code: item.material_code || null,
    material_spec: item.material_spec || null,
    quantity: parseQuantity(item.quantity),
    unit: normalizeUnit(item.unit),
    total_length_m: item.length_m || null,
    total_weight_kg: item.weight_kg || null,
    area_m2: item.area_m2 || null,
    remarks: item.remarks || item.group || null,
    confidence: extraction.confidence || 0.85
  }));

  return {
    document_type: extraction.document_understanding?.document_type || 'MTO',
    metadata: extraction.metadata || {},
    items,
    rfq_metadata: extraction.metadata || {},
    line_items: items, // Alias for compatibility
    confidence: extraction.confidence || 0.85,
    extraction_notes: extraction.extraction_notes,
    document_analysis: analysis,
    validation_report: extraction.validation_report,
    _intelligent_extraction: true,
    _extraction_version: 'INTELLIGENT_V1'
  };
}

/**
 * Parse quantity value handling various formats
 */
function parseQuantity(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Math.round(value);

  const str = String(value).trim();

  // Handle European format (1.234,56 → 1234.56)
  if (str.includes(',') && str.includes('.')) {
    // Check if comma is decimal separator (European)
    const lastComma = str.lastIndexOf(',');
    const lastDot = str.lastIndexOf('.');

    if (lastComma > lastDot) {
      // European: 1.234,56 → 1234.56
      const normalized = str.replace(/\./g, '').replace(',', '.');
      return Math.round(parseFloat(normalized));
    } else {
      // US: 1,234.56 → 1234.56
      const normalized = str.replace(/,/g, '');
      return Math.round(parseFloat(normalized));
    }
  }

  // Handle comma as thousand separator only (no decimal)
  if (str.includes(',') && !str.includes('.')) {
    // Could be European thousand separator OR decimal
    // If 3 digits after comma, it's thousand separator
    const parts = str.split(',');
    if (parts.length === 2 && parts[1].length === 3) {
      // 1,234 → 1234
      return Math.round(parseFloat(str.replace(/,/g, '')));
    }
    // Otherwise treat comma as decimal (European style)
    return Math.round(parseFloat(str.replace(',', '.')));
  }

  // Handle dot as thousand separator only
  if (str.includes('.') && !str.includes(',')) {
    const parts = str.split('.');
    if (parts.length === 2 && parts[1].length === 3) {
      // 1.234 → 1234 (European thousand separator)
      return Math.round(parseFloat(str.replace(/\./g, '')));
    }
    // Otherwise normal decimal
    return Math.round(parseFloat(str));
  }

  return Math.round(parseFloat(str)) || null;
}

/**
 * Normalize unit to standard format
 */
function normalizeUnit(unit) {
  if (!unit) return 'EA';

  const normalized = String(unit).toUpperCase().trim();

  const unitMap = {
    'EA': 'EA',
    'PC': 'PC',
    'PCS': 'PCS',
    'PCE': 'PC',
    'PIECE': 'PC',
    'PIECES': 'PCS',
    'SET': 'SET',
    'SETS': 'SET',
    'LOT': 'LOT',
    'LOTS': 'LOT',
    'EACH': 'EA',
    'NOS': 'EA',
    'NO': 'EA',
    'NO.': 'EA'
  };

  return unitMap[normalized] || 'EA';
}

/**
 * Check if intelligent extraction is available and enabled
 */
function isIntelligentExtractionAvailable() {
  if (!INTELLIGENT_EXTRACTION_ENABLED) {
    return { available: false, reason: 'INTELLIGENT_EXTRACTION not enabled' };
  }

  try {
    initializeClient();
    return { available: true };
  } catch (error) {
    return { available: false, reason: error.message };
  }
}

module.exports = {
  intelligentExtract,
  analyzeDocumentStructure,
  extractWithUnderstanding,
  validateExtraction,
  isIntelligentExtractionAvailable,
  parseQuantity,
  normalizeUnit,
  // Export config for testing
  config: {
    INTELLIGENT_EXTRACTION_ENABLED,
    USE_MULTIMODAL,
    USE_TWO_PHASE,
    USE_VALIDATION
  }
};
