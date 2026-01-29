/**
 * Environment Variable Validation
 * Validates and exports all required environment variables using Joi schema validation
 * 
 * Developed by Muvon Digital (Muvon Energy)
 */

const Joi = require('joi');

/**
 * Joi schema for environment variables
 */
const envSchema = Joi.object({
  // Database connection - supports multiple env vars with priority order
  // Priority: DATABASE_URL > PG_CONNECTION_STRING > SUPABASE_DB_URL
  //
  // IMPORTANT: DATABASE_URL is used by the application runtime and must point to
  // a non-superuser role (e.g., smartmetal_app) for RLS enforcement.
  // This connection is used by:
  //   - Backend server runtime (src/index.js)
  //   - Service queries (rfqService, pricingService, etc.)
  //   - Tests (RLS tests, integration tests)
  // RLS is ENFORCED for this connection.
  DATABASE_URL: Joi.string().pattern(/^postgres(ql)?:\/\//).allow('').optional(),
  PG_CONNECTION_STRING: Joi.string().pattern(/^postgres(ql)?:\/\//).allow('').optional(),
  SUPABASE_DB_URL: Joi.string().pattern(/^postgres(ql)?:\/\//).allow('').optional(),

  // Migration database connection (optional, for admin operations)
  // Used ONLY by migration scripts (runAllMigrations.js) to run as superuser/admin role.
  // This connection is used for:
  //   - Database schema changes (CREATE TABLE, ALTER TABLE, etc.)
  //   - Running migrations (including migration 051: FORCE RLS)
  //   - Manual admin operations (scripts/seedAdminUser.js, etc.)
  // RLS is BYPASSED for this connection (superuser role).
  // Falls back to DATABASE_URL if not specified (backward compatibility).
  // IMPORTANT: Runtime code must NEVER use MIGRATION_DATABASE_URL.
  MIGRATION_DATABASE_URL: Joi.string().pattern(/^postgres(ql)?:\/\//).allow('').optional(),

  // Server configuration
  // Cloud Run sets PORT=8080 by default, fallback to 4000 for local dev
  PORT: Joi.number().integer().min(1).max(65535).default(process.env.PORT || 8080),
  NODE_ENV: Joi.string().valid('development', 'staging', 'production').default('development'),
  FRONTEND_URL: Joi.string().pattern(/^https?:\/\//).default('http://localhost:5173'),

  // Database pool configuration
  DB_POOL_MAX: Joi.number().integer().min(1).default(20),
  DB_POOL_MIN: Joi.number().integer().min(1).default(2),
  DB_POOL_IDLE_TIMEOUT: Joi.number().integer().min(1000).default(30000),
  DB_POOL_CONNECTION_TIMEOUT: Joi.number().integer().min(1000).default(10000), // Reduced from 30s to 10s for faster failure

  // Authentication
  JWT_SECRET: Joi.string().allow('').optional(),
  JWT_EXPIRES_IN: Joi.string().default('24h'),

  // Email/SMTP configuration
  SMTP_HOST: Joi.string().hostname().default('smtp.gmail.com'),
  SMTP_PORT: Joi.number().integer().min(1).max(65535).default(587),
  SMTP_SECURE: Joi.boolean().default(false),
  SMTP_USER: Joi.string().email().allow('').optional(),
  SMTP_PASSWORD: Joi.string().allow('').optional(),
  SMTP_FROM: Joi.string().email().allow('').optional(),

  // Google Cloud Platform configuration
  GCP_PROJECT_ID: Joi.string().allow('').optional(),
  GOOGLE_APPLICATION_CREDENTIALS: Joi.string().allow('').optional(),
  GCP_SERVICE_ACCOUNT_EMAIL: Joi.string().email().allow('').optional(),
  GCP_LOCATION: Joi.string().allow('').optional(),

  // Vertex AI configuration
  VERTEX_AI_LOCATION: Joi.string().default('us-central1'),
  VERTEX_AI_MODEL: Joi.string().default('gemini-2.0-flash-exp'),
  GEMINI_API_KEY: Joi.string().allow('').optional(), // Fallback for Vertex AI auth issues
  GEMINI_FORCE_FALLBACK: Joi.string().valid('true', 'false').default('false'),

  // Document AI configuration
  DOCUMENT_AI_PROCESSOR_ID: Joi.string().allow('').optional(),
  DOCUMENT_AI_LOCATION: Joi.string().default('us'),

  // Cloud Storage configuration
  GCS_RFQ_BUCKET: Joi.string().default('pricer-rfq-documents'),
  GCS_EXTRACTED_BUCKET: Joi.string().default('pricer-extracted-data'),

  // Memorystore (Redis) configuration
  MEMORYSTORE_HOST: Joi.string().hostname().allow('').optional(),
  MEMORYSTORE_PORT: Joi.number().integer().min(1).max(65535).default(6379),
  MEMORYSTORE_ENABLED: Joi.string().valid('true', 'false').default('false'),

  // Cloud Pub/Sub configuration
  PUBSUB_PARSING_TOPIC: Joi.string().default('ai-parsing-topic'),
  PUBSUB_PARSING_SUBSCRIPTION: Joi.string().default('ai-parsing-sub'),

  // Cloud Tasks configuration
  CLOUDTASKS_EXTRACTION_QUEUE: Joi.string().default('document-extraction-queue'),
  CLOUDTASKS_TARGET_URL: Joi.string().pattern(/^https?:\/\//).allow('').optional(), // HTTPS URL for Cloud Tasks to invoke (required for OIDC auth)

  // PDF processing configuration
  MAX_PDF_PAGES_TO_PROCESS: Joi.number().integer().min(1).default(100),

  // Document AI chunking configuration
  ENABLE_DI_CHUNKED_FALLBACK: Joi.string().valid('true', 'false').default('true'),
  DI_CHUNK_SIZE: Joi.number().integer().min(2).max(50).default(10),
  DI_PARTIAL_RESULT_THRESHOLD: Joi.number().integer().min(1).default(5),

  // Price Agreement configuration
  PRICE_AGREEMENT_STRICT_MODE: Joi.string().valid('true', 'false').default('false'),

  // Timing and performance logging
  ENABLE_TIMING_LOGS: Joi.string().valid('true', 'false').default('false'),

  // Feature flags
  ENABLE_ADVANCED_DUTY_RULES: Joi.string().valid('true', 'false').default('true'),
  ENABLE_REGULATORY_INTELLIGENCE: Joi.string().valid('true', 'false').default('true'),
  ENABLE_COMPLIANCE_CENTER: Joi.string().valid('true', 'false').default('false'),
  ENABLE_LANDED_COST_V2: Joi.string().valid('true', 'false').default('false'),
  ENABLE_AI_REGULATORY_ASSISTANT: Joi.string().valid('true', 'false').default('false'),

  // Intelligent Extraction Feature Flags
  // When enabled, uses LLM-native document understanding instead of pattern matching
  INTELLIGENT_EXTRACTION: Joi.string().valid('true', 'false').default('true'),
  INTELLIGENT_EXTRACTION_MULTIMODAL: Joi.string().valid('true', 'false').default('false'), // Use PDF images
  INTELLIGENT_EXTRACTION_TWO_PHASE: Joi.string().valid('true', 'false').default('true'), // Analyze structure first
  INTELLIGENT_EXTRACTION_VALIDATION: Joi.string().valid('true', 'false').default('true'), // Validate extraction
  DETERMINISTIC_EXTRACTION: Joi.string().valid('true', 'false').default('false'), // Use temperature=0
})
  .unknown() // Allow additional env vars not in schema
  .required(); // All required fields must be present

/**
 * Get database URL with priority order:
 * 1. DATABASE_URL
 * 2. PG_CONNECTION_STRING
 * 3. SUPABASE_DB_URL
 * 
 * @returns {string} Database connection string
 * @throws {Error} If no database URL is found
 */
function getDatabaseUrl() {
  const dbUrl = process.env.DATABASE_URL || 
                process.env.PG_CONNECTION_STRING || 
                process.env.SUPABASE_DB_URL;
  
  if (!dbUrl) {
    throw new Error(
      'Database URL is required. Please set one of:\n' +
      '  - DATABASE_URL\n' +
      '  - PG_CONNECTION_STRING\n' +
      '  - SUPABASE_DB_URL'
    );
  }
  
  // Log which env var is being used (mask password)
  const source = process.env.DATABASE_URL ? 'DATABASE_URL' :
                 process.env.PG_CONNECTION_STRING ? 'PG_CONNECTION_STRING' :
                 'SUPABASE_DB_URL';
  const maskedUrl = dbUrl.replace(/:[^:@]+@/, ':***@');
  console.log(`🔌 [DB] Using database connection from: ${source}`);
  console.log(`🔌 [DB] Connection string: ${maskedUrl}`);
  
  return dbUrl;
}

/**
 * Validate and build config object from environment variables
 */
function buildConfig() {
  // Get database URL first (before validation)
  const databaseUrl = getDatabaseUrl();
  
  const { error, value } = envSchema.validate(process.env, {
    abortEarly: false, // Collect all errors, don't stop at first
    stripUnknown: false, // Keep unknown keys
  });

  if (error) {
    const errorMessages = error.details.map((detail) => detail.message).join('\n');
    throw new Error(
      `Environment variable validation failed:\n${errorMessages}\n\n` +
      'Please check your .env file or environment configuration.'
    );
  }

  const config = {
    server: {
      port: value.PORT,
      nodeEnv: value.NODE_ENV,
      frontendUrl: value.FRONTEND_URL,
    },
    database: {
      // Runtime database URL - used by application for all queries
      // Must use non-superuser role (e.g., smartmetal_app) for RLS enforcement
      url: databaseUrl,
      // Migration database URL - used ONLY by migration scripts
      // Should use superuser/admin role (e.g., postgres) for schema operations
      // Falls back to runtime URL if not specified (backward compatibility)
      migrationUrl: value.MIGRATION_DATABASE_URL || databaseUrl,
      pool: {
        max: value.DB_POOL_MAX,
        min: value.DB_POOL_MIN,
        idleTimeout: value.DB_POOL_IDLE_TIMEOUT,
        connectionTimeout: value.DB_POOL_CONNECTION_TIMEOUT,
      },
    },
    auth: {
      jwtSecret: value.JWT_SECRET || null,
      jwtExpiresIn: value.JWT_EXPIRES_IN,
    },
    email: {
      smtp: {
        host: value.SMTP_HOST,
        port: value.SMTP_PORT,
        secure: value.SMTP_SECURE,
        user: value.SMTP_USER || null,
        password: value.SMTP_PASSWORD || null,
      },
      from: value.SMTP_FROM || value.SMTP_USER || 'noreply@muvondigital.com',
    },
    gcp: {
      projectId: value.GCP_PROJECT_ID || null,
      credentials: value.GOOGLE_APPLICATION_CREDENTIALS || null,
      serviceAccountEmail: value.GCP_SERVICE_ACCOUNT_EMAIL || null,
      location: value.GCP_LOCATION || null,
      vertexAi: {
        location: value.VERTEX_AI_LOCATION,
        model: value.VERTEX_AI_MODEL,
      },
      documentAi: {
        processorId: value.DOCUMENT_AI_PROCESSOR_ID || null,
        location: value.DOCUMENT_AI_LOCATION,
      },
      storage: {
        rfqBucket: value.GCS_RFQ_BUCKET,
        extractedBucket: value.GCS_EXTRACTED_BUCKET,
      },
      pubsub: {
        parsingTopic: value.PUBSUB_PARSING_TOPIC,
        parsingSubscription: value.PUBSUB_PARSING_SUBSCRIPTION,
      },
      cloudtasks: {
        extractionQueue: value.CLOUDTASKS_EXTRACTION_QUEUE,
        targetUrl: value.CLOUDTASKS_TARGET_URL || null,
      },
    },
    redis: {
      host: value.REDIS_HOST || null,
      port: Number(value.REDIS_PORT || 6379),
      enabled: value.REDIS_ENABLED === 'true',
    },
    pdf: {
      maxPagesToProcess: value.MAX_PDF_PAGES_TO_PROCESS,
      diFallback: {
        enableChunking: value.ENABLE_DI_CHUNKED_FALLBACK === 'true',
        chunkSize: value.DI_CHUNK_SIZE,
        partialResultThreshold: value.DI_PARTIAL_RESULT_THRESHOLD,
      },
    },
    priceAgreement: {
      strictMode: value.PRICE_AGREEMENT_STRICT_MODE === 'true',
    },
    timing: {
      enabled: value.ENABLE_TIMING_LOGS === 'true',
    },
    features: {
      advancedDutyRules: value.ENABLE_ADVANCED_DUTY_RULES === 'true',
      regulatoryIntelligence: value.ENABLE_REGULATORY_INTELLIGENCE === 'true',
      complianceCenter: value.ENABLE_COMPLIANCE_CENTER === 'true',
      landedCostV2: value.ENABLE_LANDED_COST_V2 === 'true',
      aiRegulatoryAssistant: value.ENABLE_AI_REGULATORY_ASSISTANT === 'true',
      intelligentExtraction: value.INTELLIGENT_EXTRACTION === 'true',
      intelligentExtractionMultimodal: value.INTELLIGENT_EXTRACTION_MULTIMODAL === 'true',
      intelligentExtractionTwoPhase: value.INTELLIGENT_EXTRACTION_TWO_PHASE !== 'false',
      intelligentExtractionValidation: value.INTELLIGENT_EXTRACTION_VALIDATION !== 'false',
    },
  };

  // Validate production-specific requirements
  if (config.server.nodeEnv === 'production') {
    const warnings = [];
    
    if (!config.auth.jwtSecret) {
      warnings.push('JWT_SECRET is not set. Authentication will not work!');
    }
    
    if (warnings.length > 0) {
      // In production, these are critical - throw error
      throw new Error(
        `Production configuration errors:\n${warnings.join('\n')}\n\n` +
        'Please set all required environment variables for production.'
      );
    }
  } else {
    // In non-production, just warn
    if (!config.auth.jwtSecret) {
      console.warn('⚠️  WARNING: JWT_SECRET is not set. Authentication will not work!');
    }
    
    if (!config.email.smtp.user || !config.email.smtp.password) {
      console.warn('⚠️  WARNING: SMTP credentials not set. Email notifications will not work!');
    }
  }

  return config;
}

// Build and export config (will throw if validation fails)
let config;
try {
  config = buildConfig();
} catch (error) {
  const nodeEnv = process.env.NODE_ENV || 'development';
  // Log error and handle based on environment
  console.error('❌ Configuration validation failed:');
  console.error(error.message);

  if (nodeEnv === 'test') {
    // In Jest/test environment, avoid exiting the process to allow test runs.
    console.warn('⚠️  Running in test mode with relaxed env validation. Using fallback config for tests.');

    const fallbackDbUrl =
      process.env.DATABASE_URL ||
      process.env.PG_CONNECTION_STRING ||
      process.env.SUPABASE_DB_URL ||
      'postgresql://test:test@localhost:5432/test';

    config = {
      server: {
        port: Number(process.env.PORT || 4000),
        nodeEnv: 'test',
        frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
      },
      database: {
        url: fallbackDbUrl,
        migrationUrl: process.env.MIGRATION_DATABASE_URL || fallbackDbUrl,
        pool: {
          max: Number(process.env.DB_POOL_MAX || 5),
          min: Number(process.env.DB_POOL_MIN || 1),
          idleTimeout: Number(process.env.DB_POOL_IDLE_TIMEOUT || 30000),
          connectionTimeout: Number(process.env.DB_POOL_CONNECTION_TIMEOUT || 10000),
        },
      },
      auth: {
        jwtSecret: process.env.JWT_SECRET || 'test-secret',
        jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
      },
      email: {
        smtp: {
          host: process.env.SMTP_HOST || 'localhost',
          port: Number(process.env.SMTP_PORT || 1025),
          secure: false,
          user: process.env.SMTP_USER || null,
          password: process.env.SMTP_PASSWORD || null,
        },
        from: process.env.SMTP_FROM || 'noreply@test.local',
      },
      gcp: {
        projectId: process.env.GCP_PROJECT_ID || null,
        credentials: process.env.GOOGLE_APPLICATION_CREDENTIALS || null,
        vertexAi: {
          location: process.env.VERTEX_AI_LOCATION || 'us-central1',
          model: process.env.VERTEX_AI_MODEL || 'gemini-1.5-pro-002',
        },
        documentAi: {
          processorId: process.env.DOCUMENT_AI_PROCESSOR_ID || null,
          location: process.env.DOCUMENT_AI_LOCATION || 'us',
        },
        storage: {
          rfqBucket: process.env.GCS_RFQ_BUCKET || 'pricer-rfq-documents',
          extractedBucket: process.env.GCS_EXTRACTED_BUCKET || 'pricer-extracted-data',
        },
        pubsub: {
          extractionTopic: process.env.PUBSUB_EXTRACTION_TOPIC || 'document-extraction-topic',
          extractionSubscription: process.env.PUBSUB_EXTRACTION_SUBSCRIPTION || 'document-extraction-sub',
          parsingTopic: process.env.PUBSUB_PARSING_TOPIC || 'ai-parsing-topic',
          parsingSubscription: process.env.PUBSUB_PARSING_SUBSCRIPTION || 'ai-parsing-sub',
        },
      },
      redis: {
        host: process.env.REDIS_HOST || null,
        port: Number(process.env.REDIS_PORT || 6379),
        enabled: process.env.REDIS_ENABLED === 'true',
      },
      pdf: {
        maxPagesToProcess: Number(process.env.MAX_PDF_PAGES_TO_PROCESS || 100),
      },
      priceAgreement: {
        strictMode: false,
      },
      timing: {
        enabled: false,
      },
      features: {
        advancedDutyRules: true,
        regulatoryIntelligence: true,
        complianceCenter: false,
        landedCostV2: false,
        aiRegulatoryAssistant: false,
      },
    };
  } else {
    // Non-test environments: preserve existing strict failure behavior
    process.exit(1);
  }
}

module.exports = {
  config,
  buildConfig, // Export for testing
};
