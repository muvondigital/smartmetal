const { OpenAIClient } = require('@azure/openai');
const { AzureKeyCredential } = require('@azure/core-auth');

// Lazy initialization of Azure OpenAI client
let client = null;
let clientInitialized = false;

function getClient() {
  if (clientInitialized) {
    return client;
  }

  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const deploymentName = process.env.AZURE_OPENAI_DEPLOYMENT_NAME;

  if (!endpoint || !apiKey || !deploymentName) {
    console.warn('Warning: Azure OpenAI credentials not fully configured');
    console.warn('Please set AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, and AZURE_OPENAI_DEPLOYMENT_NAME in .env');
    clientInitialized = true;
    return null;
  }

  try {
    client = new OpenAIClient(endpoint, new AzureKeyCredential(apiKey));
    console.log('Azure OpenAI client initialized successfully');
    clientInitialized = true;
    return client;
  } catch (error) {
    console.error('Error initializing Azure OpenAI client:', error);
    console.warn('AI parsing features will not be available.');
    clientInitialized = true;
    return null;
  }
}

/**
 * Extracts JSON from a string that may contain markdown code blocks or other text
 * @param {string} text - Text that may contain JSON
 * @returns {Object|null} Parsed JSON object or null
 */
function extractJsonFromText(text) {
  if (!text) return null;

  // Try to parse as-is first
  try {
    return JSON.parse(text.trim());
  } catch (e) {
    // If that fails, try to extract JSON from markdown code blocks
    const jsonMatch = text.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1]);
      } catch (e2) {
        // Continue to next attempt
      }
    }

    // Try to find JSON object boundaries
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      try {
        return JSON.parse(text.substring(firstBrace, lastBrace + 1));
      } catch (e3) {
        // Continue to next attempt
      }
    }

    return null;
  }
}

/**
 * Builds a prompt for Azure OpenAI to parse RFQ data from OCR output
 * @param {Object} structured - Structured OCR output
 * @returns {string} Prompt text
 */
function buildRfqParsingPrompt(structured) {
  const text = structured.text || '';
  const tables = structured.tables || [];

  // Format tables for the prompt
  let tablesText = '';
  if (tables.length > 0) {
    tablesText = '\n\n## TABLES DETECTED:\n\n';
    tables.forEach((table, idx) => {
      tablesText += `Table ${idx + 1} (${table.rowCount} rows × ${table.columnCount} columns):\n`;
      table.rows.forEach((row, rowIdx) => {
        tablesText += `Row ${rowIdx + 1}: ${JSON.stringify(row)}\n`;
      });
      tablesText += '\n';
    });
  }

  return `You are an expert at parsing Request for Quotation (RFQ) documents for a steel pipe and fittings supplier.

Your task is to extract structured RFQ information from the OCR text and tables provided below.

## INSTRUCTIONS:

1. Extract RFQ metadata from the document header:
   - client_name: Name of the client/customer
   - rfq_reference: RFQ number, reference, or quote number
   - rfq_date: Date of the RFQ (format as YYYY-MM-DD if possible, or keep original format)
   - payment_terms: Payment terms if mentioned
   - delivery_terms: Delivery terms if mentioned
   - remarks: Any additional notes or remarks

2. Extract line items from tables or text:
   - Each line item should have:
     - line_number: Line number or item number (as string)
     - description: Full description of the item
     - quantity: Numeric quantity (null if not found)
     - unit: Unit of measurement (e.g., "LENGTH", "PCS", "KG", "TON")
     - size: Size specification (e.g., "2\"", "DN50", "3 inch")
     - schedule: Schedule/wall thickness (e.g., "SCH40", "SCH80", "XS", "XXS")
     - standard: Standard specification (e.g., "ASTM A106", "ASME B16.9", "API 5L")
     - grade: Material grade (e.g., "GR.B", "GR.A", "316L", "TP316L", "X52")
     - raw_row: The original table row as an array (if from a table), or null

3. Focus on identifying:
   - Pipe specifications (size, schedule, standard, grade)
   - Fittings (elbows, tees, reducers, etc.)
   - Flanges
   - Quantities and units

4. For PIPE items specifically, extract these attributes carefully:
   - Nominal Pipe Size (NPS) in inches: Look for patterns like "6\"", "2\"", "1.5\"", "DN150"
     * Store in the "size" field as inches with quote mark (e.g., "6\"", "2\"")
   - Schedule: Extract "SCH40", "SCH80", "SCH10", "SCH20", "XS", "XXS", etc.
     * Normalize to format like "SCH40" or "XS"
   - Material family: Identify "CS" (Carbon Steel), "LTCS" (Low Temp CS), "SS" (Stainless Steel), "ALLOY"
     * This may be implicit from standard/grade (e.g., A106 = CS, A333 = LTCS, A312 = SS)
   - Standard: Extract full standard name (e.g., "ASTM A106", "ASTM A333", "ASTM A312", "API 5L")
   - Grade: Extract grade designation (e.g., "GR.B", "GR.6", "TP304", "TP316L", "X42", "X52")
     * For API 5L, grades are like "X42", "X52", "X60", "PSL1", "PSL2"
   - Form: Identify "seamless" or "welded" (or "ERW", "SAW" which are welded types)
     * If not specified, default to "seamless" for ASTM A106/A333/A312, "welded" for API 5L

4. If information is missing, use null (not empty strings).

## DOCUMENT TEXT:

${text}${tablesText}

## OUTPUT FORMAT:

Respond ONLY with valid JSON in this exact structure:

{
  "rfq_metadata": {
    "client_name": "...",
    "rfq_reference": "...",
    "rfq_date": "...",
    "payment_terms": "...",
    "delivery_terms": "...",
    "remarks": "..."
  },
  "line_items": [
    {
      "line_number": "1",
      "description": "ASTM A106 GR.B SCH 40 2\" SEAMLESS PIPE",
      "quantity": 10,
      "unit": "LENGTH",
      "size": "2\"",
      "schedule": "SCH40",
      "standard": "ASTM A106",
      "grade": "GR.B",
      "raw_row": ["1", "ASTM A106 GR.B SCH 40 2\" SEAMLESS PIPE", "10", "LENGTH"]
    },
    {
      "line_number": "2",
      "description": "2\" SCH10 SS316L seamless pipe",
      "quantity": 5,
      "unit": "LENGTH",
      "size": "2\"",
      "schedule": "SCH10",
      "standard": "ASTM A312",
      "grade": "TP316L",
      "raw_row": null
    },
    {
      "line_number": "3",
      "description": "20\" SCH80 API 5L X52 pipe",
      "quantity": 100,
      "unit": "LENGTH",
      "size": "20\"",
      "schedule": "SCH80",
      "standard": "API 5L",
      "grade": "X52",
      "raw_row": null
    }
  ]
}

IMPORTANT: Return ONLY the JSON object, no markdown, no explanations, no additional text.`;
}

/**
 * Parses RFQ data from structured OCR output using Azure OpenAI
 * @param {Object} structured - Structured OCR output from Azure Document Intelligence
 * @returns {Promise<Object>} Parsed RFQ data with rfq_metadata and line_items
 */
async function parseRfqWithAzureOpenAI(structured) {
  const openAIClient = getClient();
  if (!openAIClient) {
    throw new Error('Azure OpenAI client not initialized. Check your environment variables.');
  }

  if (!structured || !structured.text) {
    throw new Error('Structured OCR output must contain text');
  }

  try {
    const prompt = buildRfqParsingPrompt(structured);

    const deploymentName = process.env.AZURE_OPENAI_DEPLOYMENT_NAME;
    console.log('[AI Parse] Calling Azure OpenAI...');
    console.log(`[AI Parse] Deployment: ${deploymentName}`);
    console.log(`[AI Parse] Prompt length: ${prompt.length} characters`);

    const response = await openAIClient.getChatCompletions(deploymentName, [
      {
        role: 'user',
        content: prompt,
      },
    ], {
      temperature: 0.1, // Low temperature for more deterministic output
      maxTokens: 4000,
    });

    const completion = response.choices[0]?.message?.content;
    if (!completion) {
      throw new Error('No completion returned from Azure OpenAI');
    }

    console.log('[AI Parse] Received response from Azure OpenAI');
    console.log(`[AI Parse] Response length: ${completion.length} characters`);

    // Extract and parse JSON from the response
    const parsed = extractJsonFromText(completion);

    if (!parsed) {
      console.error('[AI Parse] Failed to parse JSON from response');
      console.error('[AI Parse] Raw response:', completion);
      throw new Error('Failed to parse JSON from AI response');
    }

    // Validate structure
    if (!parsed.rfq_metadata || !parsed.line_items) {
      throw new Error('AI response missing required fields: rfq_metadata or line_items');
    }

    // Ensure line_items is an array
    if (!Array.isArray(parsed.line_items)) {
      throw new Error('line_items must be an array');
    }

    console.log(`[AI Parse] Successfully parsed ${parsed.line_items.length} line items`);

    // Store token usage for debugging (if available)
    if (response.usage) {
      console.log(`[AI Parse] Token usage - Prompt: ${response.usage.promptTokens}, Completion: ${response.usage.completionTokens}, Total: ${response.usage.totalTokens}`);
    }

    return {
      rfq_metadata: parsed.rfq_metadata,
      line_items: parsed.line_items,
      _debug: {
        model: deploymentName,
        promptTokens: response.usage?.promptTokens || null,
        completionTokens: response.usage?.completionTokens || null,
        totalTokens: response.usage?.totalTokens || null,
      },
    };
  } catch (error) {
    console.error('[AI Parse] Error parsing RFQ with Azure OpenAI:', error);
    console.error('[AI Parse] Error message:', error.message);
    if (error.response) {
      console.error('[AI Parse] Error response:', JSON.stringify(error.response, null, 2));
    }
    throw new Error(`AI parsing failed: ${error.message}`);
  }
}

module.exports = {
  parseRfqWithAzureOpenAI,
};

