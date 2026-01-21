/**
 * Google Vertex AI Client Service
 *
 * This uses @google-cloud/vertexai SDK (official GCP SDK)
 * This is the WORKING SDK that properly supports responseMimeType: 'application/json'
 *
 * Falls back to Gemini API with API key if Vertex AI auth fails
 */

const { VertexAI } = require('@google-cloud/vertexai');
const geminiApiClient = require('./geminiApiClient');

/**
 * Executes promises with a concurrency limit.
 * @param {Array<Function>} promiseFns - An array of functions that return promises.
 * @param {number} concurrency - The maximum number of promises to run in parallel.
 * @returns {Promise<Array<any>>} A promise that resolves with an array of all promise results.
 */
async function runPromisesWithConcurrency(promiseFns, concurrency) {
  const results = [];
  let currentIndex = 0;

  async function worker() {
    while (currentIndex < promiseFns.length) {
      const promiseIndex = currentIndex++;
      if (promiseIndex < promiseFns.length) {
        const promiseFn = promiseFns[promiseIndex];
        try {
          results[promiseIndex] = await promiseFn();
        } catch (error) {
          results[promiseIndex] = error;
        }
      }
    }
  }

  const workers = Array(concurrency).fill(null).map(worker);
  await Promise.all(workers);

  return results;
}

let vertexAI = null;
let modelName = null;
let useGeminiApiFallback = false;

function isAuthError(error) {
  if (!error) {
    return false;
  }

  const message = error.message || error.toString() || '';
  const lowerMessage = message.toLowerCase();
  if (
    lowerMessage.includes('authenticate') ||
    lowerMessage.includes('authentication') ||
    lowerMessage.includes('invalid_grant') ||
    lowerMessage.includes('permission') ||
    lowerMessage.includes('credentials') ||
    lowerMessage.includes('unauthorized') ||
    lowerMessage.includes('unauthorised')
  ) {
    return true;
  }

  const code = error.code || error.status || error.statusCode;
  if (code === 401 || code === 403) {
    return true;
  }

  const responseStatus = error.response?.status;
  return responseStatus === 401 || responseStatus === 403;
}

function enableGeminiFallback(reason) {
  if (process.env.GEMINI_API_KEY && !useGeminiApiFallback) {
    console.log(`🔄 ${reason}, enabling Gemini API fallback`);
    useGeminiApiFallback = true;
    return true;
  }
  return false;
}

/**
 * Repair truncated JSON by closing unclosed brackets
 * @param {string} candidate - Potentially truncated JSON string
 * @returns {string|null} - Repaired JSON or null if unrepairable
 */
function repairTruncatedJson(candidate) {
  if (!candidate || typeof candidate !== 'string') {
    return null;
  }

  // Try to repair various truncation scenarios
  const itemsIndex = candidate.indexOf('"line_items"');
  const itemsIndexAlt = candidate.indexOf('"items"');
  const itemsIndexToUse = itemsIndex !== -1 ? itemsIndex : itemsIndexAlt;
  
  if (itemsIndexToUse === -1) {
    return null;
  }
  
  const arrayStart = candidate.indexOf('[', itemsIndexToUse);
  if (arrayStart === -1) {
    return null;
  }

  // Find the last complete object in the items array
  const lastItemEnd = candidate.lastIndexOf('}');
  if (lastItemEnd === -1 || lastItemEnd < arrayStart) {
    return null;
  }

  // Truncate at the last complete object
  let trimmed = candidate.slice(0, lastItemEnd + 1);

  // Remove trailing commas and incomplete content
  trimmed = trimmed.replace(/,\s*$/gm, '');

  // Check if we need to close the items array
  const openBrackets = (trimmed.match(/\[/g) || []).length;
  const closeBrackets = (trimmed.match(/\]/g) || []).length;
  const openBraces = (trimmed.match(/\{/g) || []).length;
  const closeBraces = (trimmed.match(/\}/g) || []).length;

  let repaired = trimmed;

  // Close unclosed arrays
  for (let i = 0; i < openBrackets - closeBrackets; i++) {
    repaired += '\n  ]';
  }

  // Close unclosed objects
  for (let i = 0; i < openBraces - closeBraces; i++) {
    repaired += '\n}';
  }

  return repaired;
}

/**
 * Parse JSON response with repair strategies for malformed/truncated JSON
 * @param {string} text - JSON text to parse
 * @returns {Object} - Parsed JSON object
 */
function parseJsonResponseWithRepair(text) {
  const trimmed = (text || '').trim();
  
  // Remove markdown fences if present
  const fencedMatch = trimmed.match(/```json\s*([\s\S]*?)```/i) || trimmed.match(/```([\s\S]*?)```/i);
  const candidate = fencedMatch ? fencedMatch[1].trim() : trimmed;

  // Try direct parse first
  try {
    return JSON.parse(candidate);
  } catch (error) {
    // Try repair strategies in order
    const repairStrategies = [
      // Strategy 1: Extract JSON between first { and last }
      () => {
        const firstBrace = candidate.indexOf('{');
        const lastBrace = candidate.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          return candidate.slice(firstBrace, lastBrace + 1);
        }
        return null;
      },

      // Strategy 2: Repair truncated JSON (close unclosed brackets)
      () => repairTruncatedJson(candidate),

      // Strategy 3: Parse error location and truncate before it
      () => {
        const errorMatch = error.message?.match(/position (\d+)/);
        if (errorMatch) {
          const errorPos = parseInt(errorMatch[1]);
          if (errorPos > 0 && errorPos < candidate.length) {
            // Find the last complete object before the error position
            const beforeError = candidate.slice(0, errorPos);
            const lastCompleteObject = beforeError.lastIndexOf('}');
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
        // Continue to next strategy
      }
    }

    // All strategies failed
    throw error;
  }
}

/**
 * Initialize Vertex AI client
 */
function initializeClient() {
  if (vertexAI) {
    return vertexAI;
  }

  const forceGeminiFallback = process.env.GEMINI_FORCE_FALLBACK === "true";
  if (forceGeminiFallback && process.env.GEMINI_API_KEY) {
    console.log("🔄 GEMINI_FORCE_FALLBACK enabled, using Gemini API fallback");
    useGeminiApiFallback = true;
    return null;
  }

  const projectId = process.env.GCP_PROJECT_ID;
  const location = process.env.VERTEX_AI_LOCATION || 'us-central1';
  modelName = process.env.VERTEX_AI_MODEL || 'gemini-2.5-pro';

  if (!projectId) {
    // Check if we can use Gemini API fallback
    if (process.env.GEMINI_API_KEY) {
      console.log('⚠️  GCP_PROJECT_ID not set, using Gemini API fallback with API key');
      useGeminiApiFallback = true;
      return null;
    }
    throw new Error(
      `Vertex AI configuration incomplete. Required:\n` +
      `  GCP_PROJECT_ID=your-project-id\n` +
      `  GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json (or default credentials)\n` +
      `  OR: GEMINI_API_KEY=your-api-key`
    );
  }

  try {
    // Initialize with Vertex AI configuration
    vertexAI = new VertexAI({
      project: projectId,
      location: location,
    });

    console.log(`✅ Vertex AI client initialized (Model: ${modelName}, Location: ${location})`);
    return vertexAI;
  } catch (error) {
    // If Vertex AI initialization fails and we have an API key, use fallback
    if (process.env.GEMINI_API_KEY) {
      console.log(`⚠️  Vertex AI initialization failed (${error.message}), using Gemini API fallback`);
      useGeminiApiFallback = true;
      return null;
    }
    throw error;
  }
}

/**
 * Call Gemini with retry logic and error handling
 * MAINTAINS SAME INTERFACE AS AZURE OPENAI for backward compatibility
 * @param {Array} messages - Array of message objects {role: 'system'|'user'|'assistant', content: string}
 * @param {Object} options - Additional options (temperature, maxTokens, etc.)
 * @returns {Promise<string>} - AI response
 */
async function callGPT4(messages, options = {}) {
  // Try Gemini API fallback first if enabled
  if (useGeminiApiFallback) {
    try {
      return await geminiApiClient.callGPT4(messages, options);
    } catch (error) {
      console.error('❌ Gemini API fallback failed, trying Vertex AI:', error.message);
    }
  }

  const client = initializeClient();
  if (!client && useGeminiApiFallback) {
    return await geminiApiClient.callGPT4(messages, options);
  }

  const {
    temperature = 0.7,
    maxTokens = 8000,
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
      const text = response.candidates[0].content.parts[0].text;

      if (!text || typeof text !== 'string') {
        console.error('❌ Invalid response from Vertex AI:', {
          text,
          responseType: typeof text
        });
        throw new Error('Empty or invalid response from Vertex AI');
      }

      const duration = Date.now() - startTime;

      console.log(`✅ Vertex AI (${modelName}) call successful (${duration}ms, attempt ${attempt}/${retries})`);
      console.log(`   Tokens used: ${response.usageMetadata?.totalTokenCount || 'N/A'}`);

      return text;

    } catch (error) {
      lastError = error;
      console.error(`❌ Vertex AI call failed (attempt ${attempt}/${retries}):`, error.message);
      if (isAuthError(error) && enableGeminiFallback('Detected auth failure')) {
        try {
          return await geminiApiClient.callGPT4(messages, options);
        } catch (fallbackError) {
          console.error('? Gemini API fallback also failed:', fallbackError.message);
        }
      }

      if (attempt < retries) {
        const delay = retryDelay * attempt; // Exponential backoff
        console.log(`   Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  // All retries failed
  throw new Error(`Vertex AI call failed after ${retries} attempts: ${lastError.message}`);
}

/**
 * Call Gemini for structured JSON response
 * MAINTAINS SAME INTERFACE AS AZURE OPENAI for backward compatibility
 * @param {Array} messages - Array of message objects
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} - Parsed JSON response
 */
async function callGPT4JSON(messages, options = {}) {
  // Try Gemini API fallback first if enabled
  if (useGeminiApiFallback) {
    try {
      return await geminiApiClient.callGPT4JSON(messages, options);
    } catch (error) {
      console.error('❌ Gemini API fallback failed, trying Vertex AI:', error.message);
    }
  }

  const client = initializeClient();
  if (!client && useGeminiApiFallback) {
    return await geminiApiClient.callGPT4JSON(messages, options);
  }

  const {
    temperature = 0.2,
    maxTokens = 32000, // Increased for Gemini 2.5 Pro (supports up to 64K)
    retries = 5, // Increased from 1 to 5 to handle transient errors
    retryDelay = 2000 // Increased delay
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
      });

      // Generate content with JSON response mode
      const result = await model.generateContent({
        contents: contents,
        generationConfig: {
          temperature,
          maxOutputTokens: maxTokens,
          topP: 0.95,
          topK: 40,
          responseMimeType: 'application/json', // ✅ THIS WORKS with @google-cloud/vertexai
        },
      });

      const response = result.response;
      const text = response.candidates[0].content.parts[0].text;

      if (!text || typeof text !== 'string') {
        throw new Error('Invalid response from Vertex AI: response is not a string');
      }

      const duration = Date.now() - startTime;
      console.log(`✅ Vertex AI JSON call successful (${duration}ms, attempt ${attempt}/${retries})`);

      // Parse JSON (should be pure JSON with responseMimeType)
      try {
        const parsed = JSON.parse(text);
        console.log(`   Tokens used: ${response.usageMetadata?.totalTokenCount || 'N/A'}`);
        return parsed;
      } catch (parseError) {
        console.error('❌ Failed to parse Vertex AI JSON response:', parseError.message);
        console.warn('⚠️  Attempting JSON repair...');

        // Try repair strategies for malformed/truncated JSON
        try {
          const repaired = parseJsonResponseWithRepair(text);
          console.log('✅ JSON repair successful');
          console.log(`   Tokens used: ${response.usageMetadata?.totalTokenCount || 'N/A'}`);
          
          // Mark as repaired if it was a truncation issue
          if (parseError.message.includes('end of JSON input') || parseError.message.includes('Unexpected')) {
            repaired._json_repaired = true;
            repaired._repair_note = 'JSON response was truncated or malformed and was repaired';
          }
          
          return repaired;
        } catch (repairError) {
          console.error('❌ JSON repair also failed:', repairError.message);
          
          // Try aggressive repair by directly calling repairTruncatedJson on original text
          const outputTokens = response.usageMetadata?.candidatesTokenCount || 0;
          const totalTokens = response.usageMetadata?.totalTokenCount || 0;
          console.warn(`⚠️  Attempting aggressive repair (output: ${outputTokens}, total: ${totalTokens}, limit: ${maxTokens})...`);
          
          try {
            const aggressiveRepair = repairTruncatedJson(text);
            if (aggressiveRepair) {
              const salvaged = JSON.parse(aggressiveRepair);
              const itemCount = salvaged.line_items?.length || salvaged.items?.length || 0;
              console.log(`✅ Aggressive repair successful - salvaged ${itemCount} items from truncated response`);
              console.log(`   Tokens used: ${totalTokens || 'N/A'}`);
              salvaged._json_repaired = true;
              salvaged._truncated = true;
              salvaged._repair_note = `Response was truncated at ${outputTokens} tokens. Only partial data extracted.`;
              return salvaged;
            }
          } catch (aggressiveError) {
            console.error('❌ Aggressive repair also failed:', aggressiveError.message);
          }
          
          // JSON parsing errors are NOT transient - fail fast and fallback immediately (no retries)
          console.error('❌ All JSON repair strategies failed - failing fast (no retry)');
          console.error('   Original error:', parseError.message);
          console.error('   Response preview:', text.substring(0, 1000));
          
          // Don't retry JSON parsing errors - immediately fallback to Gemini API
          if (process.env.GEMINI_API_KEY && !useGeminiApiFallback) {
            console.log('🔄 Failing fast on JSON parse error - trying Gemini API fallback immediately');
            useGeminiApiFallback = true;
            try {
              return await geminiApiClient.callGPT4JSON(messages, options);
            } catch (fallbackError) {
              console.error('❌ Gemini API fallback also failed:', fallbackError.message);
            }
          }
          
          // Create error that will be caught and not retried
          const jsonParseError = new Error(`Invalid JSON response from Vertex AI: ${parseError.message}`);
          jsonParseError.isJsonParseError = true;
          throw jsonParseError;
        }
      }

    } catch (error) {
      lastError = error;
      
      // Don't retry JSON parsing errors - they're not transient
      const isJsonParseError = error.isJsonParseError || 
                               error.message?.includes('Invalid JSON response') || 
                               error.message?.includes('Failed to parse');
      
      if (isJsonParseError) {
        console.error(`❌ Vertex AI JSON call failed (JSON parse error - failing fast, no retry):`, error.message);
        // Fallback already attempted in parse error handler, just throw
        throw error;
      }
      
      console.error(`❌ Vertex AI JSON call failed (attempt ${attempt}/${retries}):`, error.message);

      // Check if this is an auth error - enable fallback for future calls
      if (isAuthError(error) && enableGeminiFallback('Detected auth failure')) {
        try {
          return await geminiApiClient.callGPT4JSON(messages, options);
        } catch (fallbackError) {
          console.error('❌ Gemini API fallback also failed:', fallbackError.message);
        }
      }
      
      // Retry on 429 errors or other transient issues
      const isRateLimitError = error.message && error.message.includes('429');
      if (attempt < retries && isRateLimitError) {
        const delay = retryDelay * Math.pow(2, attempt - 1); // Exponential backoff
        console.log(`   Rate limit error. Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else if (attempt < retries) {
        const delay = retryDelay * attempt;
        console.log(`   Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  // All retries failed - try fallback one last time
  if (process.env.GEMINI_API_KEY && !useGeminiApiFallback) {
    console.log('🔄 All Vertex AI retries failed, trying Gemini API fallback');
    useGeminiApiFallback = true;
    try {
      return await geminiApiClient.callGPT4JSON(messages, options);
    } catch (fallbackError) {
      console.error('❌ Gemini API fallback also failed:', fallbackError.message);
    }
  }

  throw new Error(`Vertex AI JSON call failed after ${retries} attempts: ${lastError.message}`);
}

/**
 * Get token usage estimate for messages
 * Rough estimate: 1 token ≈ 4 characters
 */
function estimateTokens(messages) {
  const totalChars = messages.reduce((sum, msg) => sum + (msg.content?.length || 0), 0);
  return Math.ceil(totalChars / 4);
}

/**
 * Call Gemini for structured JSON response with document chunking support
 * Processes large documents in chunks and merges results
 *
 * @param {Array} messages - Array of message objects
 * @param {Object} options - Additional options
 * @param {Array<Object>} options.chunks - Array of document chunks (optional)
 * @returns {Promise<Object>} - Parsed JSON response (merged if chunked)
 */
async function callGPT4JSONChunked(messages, options = {}) {
  // Try Gemini API fallback first if enabled
  if (useGeminiApiFallback) {
    try {
      return await geminiApiClient.callGPT4JSONChunked(messages, options);
    } catch (error) {
      console.error('❌ Gemini API fallback failed, trying Vertex AI:', error.message);
    }
  }

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

  // CONCURRENCY CONTROL: Process chunks with a limit
  const concurrencyLimit = 3;
  console.log(`📚 Processing ${chunks.length} document chunks with concurrency limit of ${concurrencyLimit}...`);

  const documentChunker = require('../../utils/documentChunker');
  const { rebuildPromptWithFilteredTables, filterTablesByPageRange } = require('../../utils/tableFilterForChunks');

  // Create an array of functions that return promises
  const chunkPromiseFns = chunks.map((chunk, i) => {
    return async () => {
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
      try {
        const result = await callGPT4JSON(chunkMessages, callOptions);
        console.log(`   ✅ Chunk ${i + 1} extracted: ${result.line_items?.length || 0} items`);
        return result;
      } catch (error) {
        console.error(`   ❌ Chunk ${i + 1} failed:`, error.message);
        // Return error object instead of throwing
        return {
          rfq_metadata: {},
          line_items: [],
          _error: error.message,
          _chunk_index: i
        };
      }
    };
  });

  // Process all chunks with concurrency limit
  const chunkResults = await runPromisesWithConcurrency(chunkPromiseFns, concurrencyLimit);

  // Merge results from all chunks
  console.log('\n🔄 Merging chunk results...');
  const mergedResult = documentChunker.mergeChunkResults(chunkResults, chunks);
  console.log(`✅ Merged extraction complete: ${mergedResult.line_items?.length || 0} total items`);

  return mergedResult;
}

/**
 * Health check for Vertex AI client
 */
async function healthCheck() {
  try {
    const client = initializeClient();
    const model = client.getGenerativeModel({ model: modelName });

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
    });

    const text = result.response.candidates[0].content.parts[0].text;
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
