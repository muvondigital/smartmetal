/**
 * Google Gemini API Client Service
 *
 * Uses @google/generative-ai SDK with API key authentication
 * This is a fallback when Vertex AI service account auth is not available
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');

let genAI = null;
let modelName = null;

/**
 * Initialize Gemini API client
 */
function initializeClient() {
  if (genAI) {
    return genAI;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  modelName = process.env.VERTEX_AI_MODEL || 'gemini-2.5-pro';

  if (!apiKey) {
    throw new Error(
      `Gemini API configuration incomplete. Required:\n` +
      `  GEMINI_API_KEY=your-api-key\n`
    );
  }

  genAI = new GoogleGenerativeAI(apiKey);
  console.log(`✅ Gemini API client initialized (Model: ${modelName})`);
  return genAI;
}

/**
 * Repair truncated JSON by closing unclosed brackets
 * @param {string} candidate - Potentially truncated JSON string
 * @returns {string|null} - Repaired JSON or null if unrepairable
 */
function repairTruncatedJson(candidate) {
  // Try to repair various truncation scenarios
  const itemsIndex = candidate.indexOf("\"line_items\"");
  const itemsIndexAlt = candidate.indexOf("\"items\"");
  const itemsIndexToUse = itemsIndex !== -1 ? itemsIndex : itemsIndexAlt;
  
  if (itemsIndexToUse === -1) {
    return null;
  }
  const arrayStart = candidate.indexOf("[", itemsIndexToUse);
  if (arrayStart === -1) {
    return null;
  }

  // Find the last complete object in the items array
  const lastItemEnd = candidate.lastIndexOf("}");
  if (lastItemEnd === -1 || lastItemEnd < arrayStart) {
    return null;
  }

  // Truncate at the last complete object
  let trimmed = candidate.slice(0, lastItemEnd + 1);

  // Remove trailing commas and incomplete content
  trimmed = trimmed.replace(/,\s*$/g, "");

  // Check if we need to close the items array
  const openBrackets = (trimmed.match(/\[/g) || []).length;
  const closeBrackets = (trimmed.match(/\]/g) || []).length;
  const openBraces = (trimmed.match(/\{/g) || []).length;
  const closeBraces = (trimmed.match(/\}/g) || []).length;

  let repaired = trimmed;

  // Close unclosed arrays
  for (let i = 0; i < openBrackets - closeBrackets; i++) {
    repaired += "\n  ]";
  }

  // Close unclosed objects
  for (let i = 0; i < openBraces - closeBraces; i++) {
    repaired += "\n}";
  }

  return repaired;
}

function parseJsonResponse(text) {
  const trimmed = (text || "").trim();
  const fencedMatch = trimmed.match(/```json\s*([\s\S]*?)```/i) || trimmed.match(/```([\s\S]*?)```/i);
  const fenced = fencedMatch ? fencedMatch[1].trim() : null;
  const candidates = fenced ? [fenced, trimmed] : [trimmed];

  let lastError = null;
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch (error) {
      lastError = error;

      // Try repair strategies in order
      const repairStrategies = [
        // Strategy 1: Extract JSON between first { and last }
        () => {
          const firstBrace = candidate.indexOf("{");
          const lastBrace = candidate.lastIndexOf("}");
          if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            return candidate.slice(firstBrace, lastBrace + 1);
          }
          return null;
        },

        // Strategy 2: Repair truncated JSON (close unclosed brackets)
        () => repairTruncatedJson(candidate),

        // Strategy 3: Extract JSON array between [ and ]
        () => {
          const firstBracket = candidate.indexOf("[");
          const lastBracket = candidate.lastIndexOf("]");
          if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
            return candidate.slice(firstBracket, lastBracket + 1);
          }
          return null;
        },

        // Strategy 4: Parse error location and truncate before it
        () => {
          const errorMatch = error.message?.match(/position (\d+)/);
          if (errorMatch) {
            const errorPos = parseInt(errorMatch[1]);
            if (errorPos > 0 && errorPos < candidate.length) {
              // Find the last complete object before the error position
              const beforeError = candidate.slice(0, errorPos);
              const lastCompleteObject = beforeError.lastIndexOf("}");
              if (lastCompleteObject !== -1) {
                const truncated = candidate.slice(0, lastCompleteObject + 1);
                return repairTruncatedJson(truncated);
              }
            }
          }
          return null;
        }
      ];

      // Try each repair strategy
      for (const strategy of repairStrategies) {
        try {
          const repaired = strategy();
          if (repaired) {
            return JSON.parse(repaired);
          }
        } catch (innerError) {
          lastError = innerError;
        }
      }
    }
  }

  const preview = trimmed.substring(0, 500);
  throw new Error(`Invalid JSON response from Gemini API: ${lastError?.message || "Unknown parse error"}. Preview: ${preview}`);
}

/**
 * Call Gemini with retry logic and error handling
 * @param {Array} messages - Array of message objects {role: 'system'|'user'|'assistant', content: string}
 * @param {Object} options - Additional options (temperature, maxTokens, etc.)
 * @returns {Promise<string>} - AI response
 */
async function callGPT4(messages, options = {}) {
  const client = initializeClient();

  const {
    temperature = 0.7,
    maxTokens = 32000, // Gemini 2.5 Pro supports up to 65K output tokens
    retries = 3,
    retryDelay = 1000
  } = options;

  let lastError;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const startTime = Date.now();

      // Convert OpenAI-style messages to Gemini format
      const systemInstructions = messages
        .filter(m => m.role === 'system')
        .map(m => m.content)
        .join('\n\n');

      const contents = messages
        .filter(m => m.role !== 'system')
        .map(m => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }]
        }));

      // Get generative model
      const model = client.getGenerativeModel({
        model: modelName,
        systemInstruction: systemInstructions || undefined,
      });

      // Generate content
      const result = await model.generateContent({
        contents: contents,
        generationConfig: {
          temperature,
          maxOutputTokens: maxTokens,
          topP: 0.95,
          topK: 40,
        },
      });

      const response = result.response;
      const text = response.text();

      if (!text || typeof text !== 'string') {
        console.error('❌ Invalid response from Gemini API:', {
          text,
          responseType: typeof text
        });
        throw new Error('Empty or invalid response from Gemini API');
      }

      const duration = Date.now() - startTime;

      console.log(`✅ Gemini API (${modelName}) call successful (${duration}ms, attempt ${attempt}/${retries})`);
        console.log('   Tokens used: ' + (response.usageMetadata?.totalTokenCount || 'N/A'));

      return text;

    } catch (error) {
      lastError = error;
      console.error(`❌ Gemini API call failed (attempt ${attempt}/${retries}):`, error.message);

      if (attempt < retries) {
        const delay = retryDelay * attempt; // Exponential backoff
        console.log(`   Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  // All retries failed
  throw new Error(`Gemini API call failed after ${retries} attempts: ${lastError.message}`);
}

/**
 * Call Gemini for structured JSON response
 * @param {Array} messages - Array of message objects
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} - Parsed JSON response
 */
async function callGPT4JSON(messages, options = {}) {
  const client = initializeClient();

  const {
    temperature = 0.2,
    maxTokens = 32000, // Gemini 2.5 Pro can handle 65K, using 32K for safety margin
    retries = 1, // Reduced from 3 - JSON parsing errors aren't transient, fail fast
    retryDelay = 1000
  } = options;

  let lastError;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const startTime = Date.now();

      // Convert messages to Gemini format
      const systemInstructions = messages
        .filter(m => m.role === 'system')
        .map(m => m.content)
        .join('\n\n');

      const contents = messages
        .filter(m => m.role !== 'system')
        .map(m => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }]
        }));

      // Get generative model with system instructions
      const model = client.getGenerativeModel({
        model: modelName,
        systemInstruction: systemInstructions || undefined,
        generationConfig: {
          temperature,
          maxOutputTokens: maxTokens,
          topP: 0.95,
          topK: 40,
          responseMimeType: 'application/json',
        },
      });

      // Generate content with JSON response mode
      const result = await model.generateContent({
        contents: contents,
      });

      const response = result.response;
      const text = response.text();

      if (!text || typeof text !== 'string') {
        throw new Error('Invalid response from Gemini API: response is not a string');
      }

      const duration = Date.now() - startTime;
      console.log(`✅ Gemini API JSON call successful (${duration}ms, attempt ${attempt}/${retries})`);

      // Parse JSON (recover from fenced or partial output)
      try {
        const parsed = parseJsonResponse(text);
        console.log('   Tokens used: ' + (response.usageMetadata?.totalTokenCount || 'N/A'));
        return parsed;
      } catch (parseError) {
        console.error('? Failed to parse Gemini API JSON response:', parseError.message);

        // Always attempt aggressive repair on parse failures (especially for truncated output)
        const outputTokens = response.usageMetadata?.candidatesTokenCount || 0;
        const totalTokens = response.usageMetadata?.totalTokenCount || 0;
        console.warn(`⚠️  Parse failed (output: ${outputTokens}, total: ${totalTokens}, limit: ${maxTokens}) - attempting aggressive repair...`);

        // Try aggressive repair by finding the last valid item and truncating
        try {
          const repaired = repairTruncatedJson(text);
          if (repaired) {
            const salvaged = JSON.parse(repaired);
            const itemCount = salvaged.line_items?.length || salvaged.items?.length || 0;
            console.log(`✅ Salvaged ${itemCount} items from truncated response`);
            salvaged._truncated = true;
            salvaged._truncation_note = `Response was truncated at ${outputTokens} tokens. Only partial data extracted.`;
            return salvaged;
          }
        } catch (repairError) {
          console.error('❌ Aggressive repair also failed:', repairError.message);
        }

        // JSON parsing errors are NOT transient - fail fast (no retries)
        console.error('❌ All JSON repair strategies failed - failing fast (no retry)');
        const jsonParseError = new Error(`Invalid JSON response from Gemini API: ${parseError.message}`);
        jsonParseError.isJsonParseError = true;
        throw jsonParseError;
      }

    } catch (error) {
      lastError = error;
      
      // Don't retry JSON parsing errors - they're not transient
      const isJsonParseError = error.isJsonParseError || 
                               error.message?.includes('Invalid JSON response') || 
                               error.message?.includes('Failed to parse');
      
      if (isJsonParseError) {
        console.error(`❌ Gemini API JSON call failed (JSON parse error - failing fast, no retry):`, error.message);
        throw error;
      }
      
      console.error(`❌ Gemini API JSON call failed (attempt ${attempt}/${retries}):`, error.message);

      // Only retry transient errors (network, rate limits, etc.)
      if (attempt < retries) {
        const delay = retryDelay * attempt;
        console.log(`   Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  // All retries failed
  throw new Error(`Gemini API JSON call failed after ${retries} attempts: ${lastError.message}`);
}

/**
 * Call Gemini for structured JSON response with document chunking support
 */
async function callGPT4JSONChunked(messages, options = {}) {
  const { chunks, tables, ...callOptions } = options;

  // If no chunks provided, use standard JSON call
  if (!chunks || chunks.length === 0) {
    return callGPT4JSON(messages, callOptions);
  }

  // Single chunk - use standard call
  if (chunks.length === 1) {
    console.log('📄 Processing single chunk (no chunking needed)');
    return callGPT4JSON(messages, callOptions);
  }

  // Multiple chunks - process in parallel for speed
  console.log(`📚 Processing ${chunks.length} document chunks in parallel...`);

  const documentChunker = require('../../utils/documentChunker');
  const { rebuildPromptWithFilteredTables, filterTablesByPageRange } = require('../../utils/tableFilterForChunks');

  // Create promises for all chunks to process in parallel
  const chunkPromises = chunks.map((chunk, i) => {
    console.log(`📄 Preparing chunk ${i + 1}/${chunks.length} (pages ${chunk.pageRange})...`);

    // Modify the user message to include chunk-specific text and filtered tables
    const chunkMessages = messages.map(msg => {
      if (msg.role === 'user') {
        let modifiedPrompt = msg.content;

        // Filter tables if provided (for RFQ extraction prompts)
        if (tables && Array.isArray(tables) && tables.length > 0) {
          const filteredTables = filterTablesByPageRange(tables, chunk.startPage, chunk.endPage);
          modifiedPrompt = rebuildPromptWithFilteredTables(
            modifiedPrompt,
            tables,
            chunk.startPage,
            chunk.endPage
          );
          console.log(`   📊 Filtered tables: ${tables.length} → ${filteredTables.length} tables for pages ${chunk.pageRange}`);
        }

        // Enhance prompt with chunking context
        const enhancedPrompt = documentChunker.createChunkPrompt(modifiedPrompt, chunk);

        // Replace document text with chunk text
        const promptWithChunkText = enhancedPrompt.replace(
          /DOCUMENT TEXT:\s*---[\s\S]*?---/,
          `DOCUMENT TEXT:\n---\n${chunk.text}\n---`
        );

        return {
          ...msg,
          content: promptWithChunkText
        };
      }
      return msg;
    });

    // Return promise that resolves to result or error object
    return callGPT4JSON(chunkMessages, callOptions)
      .then(result => {
        console.log(`   ✅ Chunk ${i + 1} extracted: ${result.line_items?.length || 0} items`);
        return result;
      })
      .catch(error => {
        console.error(`   ❌ Chunk ${i + 1} failed:`, error.message);
        // Return error object instead of throwing (so Promise.all continues)
        return {
          rfq_metadata: {},
          line_items: [],
          _error: error.message,
          _chunk_index: i
        };
      });
  });

  // Process chunks in batches to avoid rate limits (429 errors)
  // Google Gemini API limit: ~60 requests/minute (free tier: 15 RPM)
  // Process 5 chunks at a time with 2-second delay between batches
  const BATCH_SIZE = 5;
  const BATCH_DELAY_MS = 2000;
  const chunkResults = [];

  for (let i = 0; i < chunkPromises.length; i += BATCH_SIZE) {
    const batch = chunkPromises.slice(i, i + BATCH_SIZE);
    console.log(`   🔄 Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(chunkPromises.length / BATCH_SIZE)} (${batch.length} chunks)...`);

    const batchResults = await Promise.all(batch);
    chunkResults.push(...batchResults);

    // Add delay between batches to respect rate limits
    if (i + BATCH_SIZE < chunkPromises.length) {
      console.log(`   ⏱️  Waiting ${BATCH_DELAY_MS / 1000}s before next batch (rate limit protection)...`);
      await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
    }
  }

  // Merge results from all chunks
  console.log('\n🔄 Merging chunk results...');
  const mergedResult = documentChunker.mergeChunkResults(chunkResults, chunks);
  
  // Log chunk processing summary
  const successfulChunks = chunkResults.filter(r => !r._error).length;
  const failedChunks = chunkResults.filter(r => r._error).length;
  const totalItems = mergedResult.line_items?.length || 0;

  console.log(`📊 Chunk Processing Summary:`);
  console.log(`   Total chunks: ${chunkResults.length}`);
  console.log(`   Successful: ${successfulChunks}`);
  console.log(`   Failed: ${failedChunks}`);
  console.log(`   Total items extracted: ${totalItems}`);

  if (failedChunks > 0) {
    console.error(`   ⚠️ WARNING: ${failedChunks} chunk(s) failed - extraction may be incomplete!`);
    chunkResults.forEach((r, idx) => {
      if (r._error) {
        console.error(`      Chunk ${idx + 1} (${chunks[idx]?.pageRange}): ${r._error}`);
      }
    });
  }
  
  console.log(`✅ Merged extraction complete: ${totalItems} total items`);

  return mergedResult;
}

/**
 * Get token usage estimate for messages
 */
function estimateTokens(messages) {
  const totalChars = messages.reduce((sum, msg) => sum + (msg.content?.length || 0), 0);
  return Math.ceil(totalChars / 4);
}

/**
 * Health check for Gemini API client
 */
async function healthCheck() {
  try {
    const client = initializeClient();
    const model = client.getGenerativeModel({ model: modelName });

    const result = await model.generateContent('Hello');
    const text = result.response.text();
    return { status: 'ok', model: modelName, response: text };
  } catch (error) {
    return { status: 'error', error: error.message };
  }
}

module.exports = {
  initializeClient,
  callGPT4,
  callGPT4JSON,
  callGPT4JSONChunked,
  estimateTokens,
  healthCheck
};
