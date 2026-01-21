const { VertexAI } = require('@google-cloud/vertexai');

/**
 * Google Cloud Vertex AI Client Service
 * Replaces Azure OpenAI with Vertex AI (Gemini models)
 * Maintains same interface as azureClient for backward compatibility
 */

let vertexAI = null;
let modelName = null;

/**
 * Initialize Vertex AI client
 */
function initializeClient() {
  if (vertexAI) {
    return vertexAI;
  }

  const projectId = process.env.GCP_PROJECT_ID;
  const location = process.env.VERTEX_AI_LOCATION || 'us-central1';
  modelName = process.env.VERTEX_AI_MODEL || 'gemini-1.5-pro-002';

  // Validate required configuration
  const missingVars = [];
  if (!projectId) missingVars.push('GCP_PROJECT_ID');

  if (missingVars.length > 0) {
    throw new Error(
      `Vertex AI configuration incomplete. Missing required environment variables:\n` +
      `  ${missingVars.join('\n  ')}\n\n` +
      `Please add these to your .env file:\n` +
      `  GCP_PROJECT_ID=your-project-id\n` +
      `  GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json\n` +
      `  VERTEX_AI_LOCATION=us-central1\n` +
      `  VERTEX_AI_MODEL=gemini-1.5-pro-002`
    );
  }

  vertexAI = new VertexAI({
    project: projectId,
    location: location,
  });

  console.log(`✅ Vertex AI client initialized (Model: ${modelName}, Location: ${location})`);
  return vertexAI;
}

/**
 * Convert OpenAI-style messages to Gemini format
 * @param {Array} messages - OpenAI format [{role, content}]
 * @returns {Object} - {systemInstruction, contents}
 */
function convertMessagesToGeminiFormat(messages) {
  let systemInstruction = null;
  const contents = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      // Gemini uses systemInstruction instead of system message
      systemInstruction = {
        parts: [{ text: msg.content }],
      };
    } else {
      // Convert 'assistant' to 'model' (Gemini's term)
      contents.push({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      });
    }
  }

  return { systemInstruction, contents };
}

/**
 * Call Gemini with retry logic and error handling
 * MAINTAINS SAME INTERFACE AS AZURE OPENAI for backward compatibility
 * @param {Array} messages - Array of message objects {role: 'system'|'user'|'assistant', content: string}
 * @param {Object} options - Additional options (temperature, maxTokens, etc.)
 * @returns {Promise<string>} - AI response
 */
async function callGPT4(messages, options = {}) {
  const client = initializeClient();

  const {
    temperature = 0.7,
    maxTokens = 1000,
    retries = 3,
    retryDelay = 1000
  } = options;

  let lastError;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const startTime = Date.now();

      // Convert messages to Gemini format
      const { systemInstruction, contents } = convertMessagesToGeminiFormat(messages);

      // Get generative model
      const generativeModel = client.getGenerativeModel({
        model: modelName,
        systemInstruction,
        generationConfig: {
          temperature,
          maxOutputTokens: maxTokens,
          topP: 0.95,
          topK: 40,
        },
      });

      // Generate content
      const result = await generativeModel.generateContent({
        contents,
      });

      const response = result.response;
      const text = response.candidates[0]?.content?.parts[0]?.text;

      if (!text || typeof text !== 'string') {
        console.error('❌ Invalid response from Vertex AI:', {
          text,
          responseType: typeof text,
          candidatesLength: response.candidates?.length
        });
        throw new Error('Empty or invalid response from Vertex AI');
      }

      const duration = Date.now() - startTime;

      // Log request/response for monitoring
      console.log(`✅ Vertex AI (${modelName}) call successful (${duration}ms, attempt ${attempt}/${retries})`);
      console.log(`   Tokens used: ${response.usageMetadata?.totalTokenCount || 'N/A'}`);

      return text;

    } catch (error) {
      lastError = error;
      console.error(`❌ Vertex AI call failed (attempt ${attempt}/${retries}):`, error.message);

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
  const client = initializeClient();

  const {
    temperature = 0.7,
    maxTokens = 1000,
    retries = 3,
    retryDelay = 1000
  } = options;

  let lastError;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const startTime = Date.now();

      // Convert messages to Gemini format
      const { systemInstruction, contents } = convertMessagesToGeminiFormat(messages);

      // Enhance system instruction to request JSON
      const jsonSystemInstruction = {
        parts: [
          ...(systemInstruction?.parts || []),
          { text: '\n\nYou must respond with valid JSON only. Do not include any markdown formatting or explanatory text outside the JSON object.' }
        ]
      };

      // Get generative model with JSON response mode
      const generativeModel = client.getGenerativeModel({
        model: modelName,
        systemInstruction: jsonSystemInstruction,
        generationConfig: {
          temperature,
          maxOutputTokens: maxTokens,
          topP: 0.95,
          topK: 40,
          responseMimeType: 'application/json', // Force JSON response
        },
      });

      // Generate content
      const result = await generativeModel.generateContent({
        contents,
      });

      const response = result.response;
      const text = response.candidates[0]?.content?.parts[0]?.text;

      if (!text || typeof text !== 'string') {
        throw new Error('Invalid response from Vertex AI: response is not a string');
      }

      const duration = Date.now() - startTime;
      console.log(`✅ Vertex AI JSON call successful (${duration}ms, attempt ${attempt}/${retries})`);

      // Try to parse JSON
      try {
        // Sanitize JSON text (remove markdown code blocks if present)
        let jsonText = text.trim();

        if (jsonText.startsWith('```json')) {
          jsonText = jsonText.replace(/^```json\s*/, '').replace(/```\s*$/, '');
        } else if (jsonText.startsWith('```')) {
          jsonText = jsonText.replace(/^```\s*/, '').replace(/```\s*$/, '');
        }

        const parsed = JSON.parse(jsonText);
        console.log(`   Tokens used: ${response.usageMetadata?.totalTokenCount || 'N/A'}`);
        return parsed;
      } catch (parseError) {
        console.error('❌ Failed to parse Vertex AI JSON response:', text);
        throw new Error(`Invalid JSON response from Vertex AI: ${parseError.message}`);
      }

    } catch (error) {
      lastError = error;
      console.error(`❌ Vertex AI JSON call failed (attempt ${attempt}/${retries}):`, error.message);

      if (attempt < retries) {
        const delay = retryDelay * attempt;
        console.log(`   Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  // All retries failed
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

module.exports = {
  initializeClient,
  callGPT4,
  callGPT4JSON,
  estimateTokens
};
