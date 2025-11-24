/**
 * Environment Variable Validation
 * Validates and exports all required environment variables
 */

const requiredEnvVars = [
  'DATABASE_URL',
];

const optionalEnvVars = {
  PORT: { default: 4000, type: 'number' },
  NODE_ENV: { default: 'development', type: 'string' },
  DB_POOL_MAX: { default: 20, type: 'number' },
  DB_POOL_MIN: { default: 2, type: 'number' },
  DB_POOL_IDLE_TIMEOUT: { default: 30000, type: 'number' },
  DB_POOL_CONNECTION_TIMEOUT: { default: 2000, type: 'number' },
  FRONTEND_URL: { default: 'http://localhost:5173', type: 'string' },
  JWT_SECRET: { default: null, type: 'string' },
  JWT_EXPIRES_IN: { default: '24h', type: 'string' },
  SMTP_HOST: { default: 'smtp.gmail.com', type: 'string' },
  SMTP_PORT: { default: 587, type: 'number' },
  SMTP_SECURE: { default: false, type: 'boolean' },
  SMTP_USER: { default: null, type: 'string' },
  SMTP_PASSWORD: { default: null, type: 'string' },
  SMTP_FROM: { default: null, type: 'string' },
  AZURE_OPENAI_ENDPOINT: { default: null, type: 'string' },
  AZURE_OPENAI_API_KEY: { default: null, type: 'string' },
  AZURE_OPENAI_DEPLOYMENT_NAME: { default: null, type: 'string' },
  AZURE_DOC_INTELLIGENCE_ENDPOINT: { default: null, type: 'string' },
  AZURE_DOC_INTELLIGENCE_KEY: { default: null, type: 'string' },
};

/**
 * Validate required environment variables
 */
function validateEnv() {
  const missing = [];
  
  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      missing.push(envVar);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}\n` +
      'Please check your .env file or environment configuration.'
    );
  }
}

/**
 * Get environment variable with type conversion and defaults
 */
function getEnvVar(name, options = {}) {
  const value = process.env[name];
  
  if (value === undefined || value === null) {
    if (options.default !== undefined) {
      return options.default;
    }
    return null;
  }

  switch (options.type) {
    case 'number':
      const num = parseInt(value, 10);
      if (isNaN(num)) {
        console.warn(`Invalid number for ${name}, using default: ${options.default}`);
        return options.default;
      }
      return num;
    case 'boolean':
      return value === 'true' || value === '1';
    case 'string':
      return value;
    default:
      return value;
  }
}

/**
 * Build config object from environment variables
 */
function buildConfig() {
  validateEnv();

  const config = {
    server: {
      port: getEnvVar('PORT', optionalEnvVars.PORT),
      nodeEnv: getEnvVar('NODE_ENV', optionalEnvVars.NODE_ENV),
      frontendUrl: getEnvVar('FRONTEND_URL', optionalEnvVars.FRONTEND_URL),
    },
    database: {
      url: process.env.DATABASE_URL,
      pool: {
        max: getEnvVar('DB_POOL_MAX', optionalEnvVars.DB_POOL_MAX),
        min: getEnvVar('DB_POOL_MIN', optionalEnvVars.DB_POOL_MIN),
        idleTimeout: getEnvVar('DB_POOL_IDLE_TIMEOUT', optionalEnvVars.DB_POOL_IDLE_TIMEOUT),
        connectionTimeout: getEnvVar('DB_POOL_CONNECTION_TIMEOUT', optionalEnvVars.DB_POOL_CONNECTION_TIMEOUT),
      },
    },
    auth: {
      jwtSecret: getEnvVar('JWT_SECRET', optionalEnvVars.JWT_SECRET),
      jwtExpiresIn: getEnvVar('JWT_EXPIRES_IN', optionalEnvVars.JWT_EXPIRES_IN),
    },
    email: {
      smtp: {
        host: getEnvVar('SMTP_HOST', optionalEnvVars.SMTP_HOST),
        port: getEnvVar('SMTP_PORT', optionalEnvVars.SMTP_PORT),
        secure: getEnvVar('SMTP_SECURE', optionalEnvVars.SMTP_SECURE),
        user: getEnvVar('SMTP_USER', optionalEnvVars.SMTP_USER),
        password: getEnvVar('SMTP_PASSWORD', optionalEnvVars.SMTP_PASSWORD),
      },
      from: getEnvVar('SMTP_FROM', optionalEnvVars.SMTP_FROM) || 
            getEnvVar('SMTP_USER', optionalEnvVars.SMTP_USER) || 
            'noreply@nscpricer.com',
    },
    azure: {
      openai: {
        endpoint: getEnvVar('AZURE_OPENAI_ENDPOINT', optionalEnvVars.AZURE_OPENAI_ENDPOINT),
        apiKey: getEnvVar('AZURE_OPENAI_API_KEY', optionalEnvVars.AZURE_OPENAI_API_KEY),
        deploymentName: getEnvVar('AZURE_OPENAI_DEPLOYMENT_NAME', optionalEnvVars.AZURE_OPENAI_DEPLOYMENT_NAME),
      },
      docIntelligence: {
        endpoint: getEnvVar('AZURE_DOC_INTELLIGENCE_ENDPOINT', optionalEnvVars.AZURE_DOC_INTELLIGENCE_ENDPOINT),
        key: getEnvVar('AZURE_DOC_INTELLIGENCE_KEY', optionalEnvVars.AZURE_DOC_INTELLIGENCE_KEY),
      },
    },
  };

  // Warn about missing optional but important variables
  if (!config.auth.jwtSecret && config.server.nodeEnv === 'production') {
    console.warn('⚠️  WARNING: JWT_SECRET is not set. Authentication will not work in production!');
  }

  if (!config.email.smtp.user || !config.email.smtp.password) {
    console.warn('⚠️  WARNING: SMTP credentials not set. Email notifications will not work!');
  }

  return config;
}

// Build and export config
const config = buildConfig();

module.exports = {
  config,
  validateEnv,
  getEnvVar,
};

