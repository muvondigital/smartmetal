// MUVOS Platform – SmartMetal CPQ runs on Muvon Unified Commercial Operating System
// SmartMetal CPQ - A product from Muvon Digital, an innovation arm of Muvon Energy
// Developed by Muvon Digital, the innovation arm of Muvon Energy.
// Copyright (c) 2025 Muvon Energy. All rights reserved.
// Proprietary & Confidential — Not for distribution.

console.log('🔧 [INIT] Loading environment variables...');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { loadSecretsFromManager } = require('./config/secretManager');

const envPaths = [
  path.join(__dirname, '..', '.env'),
  path.join(__dirname, '..', '.env.gcp'),
  path.join(__dirname, '..', '..', '.env'),
];

const loadedEnvPaths = [];
envPaths.forEach((envPath) => {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    loadedEnvPaths.push(envPath);
  }
});

const loadedEnvLabel = loadedEnvPaths.length ? loadedEnvPaths.join(', ') : 'process.env only';
console.log('✅ [INIT] Environment variables loaded (' + loadedEnvLabel + ')');

// Rotate logs on startup to prevent huge log files
try {
  const { rotateBacklog } = require('../scripts/rotate-logs');
  rotateBacklog();
} catch (err) {
  console.warn('⚠️  [LOG] Failed to rotate logs:', err.message);
}

// Load branding configuration
const BRANDING = require('./config/branding');

(async () => {
  await loadSecretsFromManager();

console.log('🔧 [INIT] Initializing Express app...');
const express = require('express');
const cors = require('cors');

// Initialize config (validates env vars)
console.log('🔧 [INIT] Validating environment configuration...');
const { config } = require('./config/env');
console.log('✅ [INIT] Environment configuration validated');

// Log JWT auth mode
if (config.auth.jwtSecret) {
  console.log('🔐 [AUTH] JWT_SECRET detected. Using NORMAL authentication mode.');
} else {
  console.warn('⚠️  [AUTH] JWT_SECRET missing. Dev bypass mode ENABLED (NSC dev admin).');
}

const { log } = require('./utils/logger');

const app = express();
const PORT = config.server.port;

// Initialize Sentry FIRST (must be before all other middleware)
const { initSentry, sentryErrorHandler } = require('./config/sentry');
initSentry(app);

// Enable CORS for frontend - must be before routes
// In development, allow all localhost origins for flexibility
const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, Postman, curl)
    if (!origin) {
      return callback(null, true);
    }
    
    // In development, allow any localhost origin
    if (config.server.nodeEnv === 'development') {
      if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
        return callback(null, true);
      }
    }
    
    // Production: strict origin list
    const allowedOrigins = [
      'http://localhost:5173',
      'http://localhost:5174',
      'http://localhost:5175',
      'http://localhost:5176',
      'http://localhost:5177',
      'http://localhost:5178',
      config.server.frontendUrl, // Add configured frontend URL if set
    ].filter(Boolean); // Remove undefined values
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`🌐 [CORS] Blocked origin: ${origin}`);
      callback(new Error(`Not allowed by CORS. Origin: ${origin}`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Tenant-Code',
    'X-Requested-With',
    'Accept',
    'Origin',
  ],
  exposedHeaders: ['X-API-Warn'], // Expose deprecation warnings
};

app.use(cors(corsOptions));

// Handle preflight with enhanced logging
app.options('*', (req, res, next) => {
  const origin = req.headers.origin;
  console.log(`🌐 [CORS] Preflight ${req.method} ${req.originalUrl}`, {
    origin,
    requestedHeaders: req.headers['access-control-request-headers'] || 'none',
    requestedMethod: req.headers['access-control-request-method'] || 'none',
  });
  return cors(corsOptions)(req, res, next);
});

// Configure JSON body parser with increased limit for large document extractions
// Default limit is 100KB, but large PDFs with many tables can exceed this
// Set to 10MB to handle documents with 30+ tables and extensive text
// TODO: Architectural fix - persist extraction server-side and use extractionId instead
app.use(express.json({ limit: '10mb' }));

// Import middleware
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { sanitizeRequest } = require('./middleware/validation');
const { correlationIdMiddleware } = require('./middleware/correlationId');
const { tenantMiddleware } = require('./middleware/tenant');
const { aiRateLimiter } = require('./middleware/rateLimiter'); // Only import AI limiter
const { timingMiddleware } = require('./middleware/timingMiddleware');

// Sanitize all inputs (early in pipeline)
app.use(sanitizeRequest);

// ============================================================================
// RATE LIMITING CONFIGURATION
// ============================================================================
// GLOBAL RATE LIMITER DISABLED:
// The dashboard and RFQ pages fire multiple parallel API calls (rfqs, dashboard,
// analytics, price-import/recent-changes, etc.) which triggers false positives
// with a global /api rate limiter.
//
// SOLUTION:
// - Standard API routes (RFQs, dashboard, analytics, approvals, etc.) have NO rate limiting in dev
// - Rate limiting is ONLY applied to expensive AI endpoints to prevent budget overrun
//
// FUTURE: Re-enable per-route rate limiting in production if needed, but NOT globally on /api
// ============================================================================
// app.use('/api/', standardRateLimiter); // ❌ DISABLED - causes 429 on normal traffic

// Apply correlation ID middleware globally (MUST be before tenantMiddleware)
// This ensures all requests have a correlationId for tracing
app.use(correlationIdMiddleware);

// Apply tenant middleware globally (all routes will have req.tenantId)
// Note: Individual routes can override this if needed
// EXCEPTION: Auth routes should NOT use tenant middleware (login needs to work without tenant context)
app.use((req, res, next) => {
  // Skip tenant middleware for auth routes (login, etc.)
  // Check both req.path and req.originalUrl to handle all cases
  const path = (req.path || req.originalUrl?.split('?')[0] || '').toLowerCase();
  // Skip tenant middleware for:
  // - /api/auth/* (legacy auth routes)
  // - /api/v1/auth/* (v1 auth routes, including /login)
  if (path.startsWith('/api/auth/') || path.startsWith('/api/v1/auth/') || 
      path === '/api/auth' || path === '/api/v1/auth') {
    return next();
  }
  // Apply tenant middleware for all other routes
  tenantMiddleware(req, res, next);
});

// Apply timing middleware (controlled by ENABLE_TIMING_LOGS env var)
// Must be after correlationId and tenant middleware to have access to context
app.use(timingMiddleware);

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const responseTime = Date.now() - start;
    const requestContext = {
      correlationId: req.correlationId,
      tenantId: req.tenantId,
      tenantCode: req.tenantCode,
    };
    log.request(req, res, responseTime, requestContext);
  });
  
  next();
});

// Initialize database tables and seed data
const { initMaterialsTable } = require('./db/initMaterialsTable');
// DISABLED: seedMaterials automatically creates duplicate materials for all tenants on every server startup
// Materials should ONLY be seeded manually via dedicated scripts (e.g., seedMetaSteelSuppliersAndMaterials.js)
// const { seedMaterials } = require('./db/seeds/seedMaterials');
const { enhancePricingRunItemsTable } = require('./db/enhancePricingRunItemsTable');
const { initPricingRulesTable } = require('./db/initPricingRulesTable');
const { seedPricingRules } = require('./db/seeds/seedPricingRules');

// Swagger/OpenAPI documentation
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./docs/swagger');

// Import routes - v1 API
const v1Router = require('./routes/v1');

// Import individual routes (legacy support - will be deprecated)
const authRoutes = require('./routes/authRoutes');
const rfqRoutes = require('./routes/rfqRoutes');
const materialsRoutes = require('./routes/materialsRoutes');
const pricingRoutes = require('./routes/pricingRoutes');
const ocrRoutes = require('./routes/ocrRoutes');
const aiRoutes = require('./routes/aiRoutes');
// Price agreements, renewals removed (de-engineered)
const onboardingRoutes = require('./routes/onboardingRoutes');
const approvalRoutes = require('./routes/approvalRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const pipesRoutes = require('./routes/pipesRoutes');
const pdfExportRoutes = require('./routes/pdfExportRoutes');
const priceImportRoutes = require('./routes/priceImportRoutes');
const adminRoutes = require('./routes/adminRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const qeeRoutes = require('./routes/qeeRoutes');
const debugRoutes = require('./routes/debugRoutes');
const quoteCandidatesRoutes = require('./routes/quoteCandidatesRoutes');

// Initialize database on startup (non-blocking)
async function initializeDatabase() {
  try {
    log.info('Starting database initialization (non-blocking)...');
    
    // Add timeout to prevent hanging
    const initPromise = (async () => {
      await initMaterialsTable();
      await enhancePricingRunItemsTable();
      await initPricingRulesTable();
      // DISABLED: seedMaterials() creates duplicate materials for all active tenants on every server restart
      // Materials should be seeded manually using dedicated tenant-specific scripts
      // await seedMaterials();
      await seedPricingRules();
      log.info('Database initialization complete');
    })();
    
    // Set a timeout of 30 seconds for initialization
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Database initialization timed out after 30 seconds')), 30000);
    });
    
    await Promise.race([initPromise, timeoutPromise]);
  } catch (error) {
    log.error('Database initialization error', error);
    log.warn('Server will continue running, but some features may not work until database is available');
    // Don't crash the server, but log the error
  }
}

// API Documentation (Swagger UI)
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'SmartMetal API Documentation',
}));

// Swagger JSON endpoint
app.get('/api/docs.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

// Mount v1 API (primary, versioned endpoints)
app.use('/api/v1', v1Router);

// Mount auth routes (no deprecation - core functionality)
app.use('/api/auth', authRoutes);

// Mount legacy routes (backwards compatibility - will be deprecated in v2)
// These routes will show deprecation warnings in headers
app.use('/api/rfqs', (req, res, next) => {
  res.setHeader('X-API-Warn', 'This endpoint is deprecated. Please use /api/v1/rfqs instead.');
  next();
}, rfqRoutes);
app.use('/api/materials', (req, res, next) => {
  res.setHeader('X-API-Warn', 'This endpoint is deprecated. Please use /api/v1/materials instead.');
  next();
}, materialsRoutes);
app.use('/api/pricing-runs', (req, res, next) => {
  res.setHeader('X-API-Warn', 'This endpoint is deprecated. Please use /api/v1/pricing-runs instead.');
  next();
}, pricingRoutes);
app.use('/api/ocr', (req, res, next) => {
  res.setHeader('X-API-Warn', 'This endpoint is deprecated. Please use /api/v1/ocr instead.');
  next();
}, ocrRoutes);
// AI routes with rate limiting applied in the router itself
// (Rate limiting is in aiRoutes.js and aiAssistantRoutes.js to protect both legacy and v1 endpoints)
app.use('/api/ai', (req, res, next) => {
  res.setHeader('X-API-Warn', 'This endpoint is deprecated. Please use /api/v1/ai instead.');
  next();
}, aiRoutes);
// Price agreements removed (de-engineered)
app.use('/api/quote-candidates', quoteCandidatesRoutes);
app.use('/api/onboarding', onboardingRoutes);
app.use('/api/approvals', (req, res, next) => {
  res.setHeader('X-API-Warn', 'This endpoint is deprecated. Please use /api/v1/approvals instead.');
  next();
}, approvalRoutes);
app.use('/api/pipes', (req, res, next) => {
  res.setHeader('X-API-Warn', 'This endpoint is deprecated. Please use /api/v1/pipes instead.');
  next();
}, pipesRoutes);
app.use('/api/pdf', (req, res, next) => {
  res.setHeader('X-API-Warn', 'This endpoint is deprecated. Please use /api/v1/pdf instead.');
  next();
}, pdfExportRoutes);
app.use('/api/price-import', (req, res, next) => {
  res.setHeader('X-API-Warn', 'This endpoint is deprecated. Please use /api/v1/price-import instead.');
  next();
}, priceImportRoutes);
// Renewals removed (de-engineered)
app.use('/api/admin', (req, res, next) => {
  res.setHeader('X-API-Warn', 'This endpoint is deprecated. Please use /api/v1/admin instead.');
  next();
}, adminRoutes);

// Legacy analytics and dashboard routes (special handling for root-level endpoints)
const legacyDeprecationMiddleware = (req, res, next) => {
  res.setHeader('X-API-Warn', 'This endpoint is deprecated. Please use /api/v1/* instead.');
  next();
};
app.use('/api', legacyDeprecationMiddleware, analyticsRoutes);
app.use('/api', legacyDeprecationMiddleware, dashboardRoutes);
app.use('/api/qee', qeeRoutes);

// Debug routes (dev-only - requires tenant middleware)
// Only mount in development/staging environments
if (process.env.NODE_ENV !== 'production' || process.env.ENABLE_DEBUG_ROUTES === 'true') {
  app.use('/api/debug', debugRoutes);
}

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'SmartMetal Core Platform API',
    version: '1.0.0',
    apiVersion: 'v1 (stable)',
    status: 'running',
    documentation: '/api/docs',
    apiVersions: {
      v1: '/api/v1 (recommended)',
      legacy: '/api/* (deprecated, use /api/v1/* instead)',
    },
    endpoints: {
      health: '/health',
      docs: '/api/docs',
      // Recommended v1 endpoints
      v1: {
        rfqs: '/api/v1/rfqs',
        materials: '/api/v1/materials',
        pricingRuns: '/api/v1/pricing-runs',
        ocr: '/api/v1/ocr',
        ai: '/api/v1/ai',
        approvals: '/api/v1/approvals',
        analytics: '/api/v1/analytics',
        pipes: '/api/v1/pipes',
        pdfExport: '/api/v1/pdf',
        priceImport: '/api/v1/price-import',
        admin: '/api/v1/admin',
        dashboard: '/api/v1/dashboard',
      },
      // Legacy endpoints (will be removed in v2)
      legacy: {
        note: 'These endpoints are deprecated. Migrate to /api/v1/* before v2 release.',
        rfqs: '/api/rfqs (deprecated)',
        materials: '/api/materials (deprecated)',
        pricingRuns: '/api/pricing-runs (deprecated)',
        // ... other legacy endpoints
      }
    }
  });
});

// Health check endpoint (CORS-friendly, no auth required)
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    timestamp: new Date().toISOString(),
    server: 'SmartMetal Core Platform API',
    version: '1.0.0',
  });
});

// CORS test endpoint (for debugging)
app.get('/cors-test', (req, res) => {
  res.json({
    message: 'CORS is working!',
    origin: req.headers.origin || 'no origin header',
    timestamp: new Date().toISOString(),
  });
});

// 404 handler (must be after all routes, before error handler)
app.use(notFoundHandler);

// Sentry error handler (must be before other error handlers)
app.use(sentryErrorHandler());

// Error handler (must be last)
app.use(errorHandler);

// Graceful shutdown handler
const { closePool } = require('./db/supabaseClient');

async function shutdown() {
  log.info('Shutting down server...');
  try {
    // Stop cron scheduler
    try {
      const cronScheduler = require('./jobs/cronScheduler');
      cronScheduler.stop();
      log.info('Cron scheduler stopped');
    } catch (error) {
      log.error('Error stopping cron scheduler', error);
    }

    // Close Service Bus client (Phase 1)
    // Removed Pub/Sub extraction client close, as extraction now uses Cloud Tasks.
    // The parsing client remains in pubsubService.js.

    // Close database pool
    await closePool();
    log.info('Database pool closed');
    process.exit(0);
  } catch (error) {
    log.error('Error during shutdown', error);
    process.exit(1);
  }
}

// Graceful shutdown handlers
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Process-level error handlers with explicit console output
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ [FATAL] Unhandled Promise Rejection');
  console.error('❌ [FATAL] Reason:', reason);
  console.error('❌ [FATAL] Promise:', promise);
  
  log.error('Unhandled Promise Rejection', reason instanceof Error ? reason : new Error(String(reason)), {
    promise: String(promise),
  });
  
  // In production, exit after logging
  if (config.server.nodeEnv === 'production') {
    console.error('❌ [FATAL] Exiting due to unhandled rejection in production');
    log.error('Exiting due to unhandled rejection in production');
    process.exit(1);
  } else {
    console.error('⚠️  [WARN] Unhandled rejection in development - server continues');
  }
});

process.on('uncaughtException', (error) => {
  console.error('❌ [FATAL] Uncaught Exception');
  console.error('❌ [FATAL] Error name:', error.name);
  console.error('❌ [FATAL] Error message:', error.message);
  console.error('❌ [FATAL] Error stack:', error.stack);
  
  log.error('Uncaught Exception', error);
  
  // Always exit on uncaught exception
  console.error('❌ [FATAL] Exiting due to uncaught exception');
  log.error('Exiting due to uncaught exception');
  process.exit(1);
});

// Start server with comprehensive error handling and logging
console.log('🚀 [STARTUP] Attempting to start server on port', PORT);
console.log('🚀 [STARTUP] Environment:', config.server.nodeEnv);
console.log('🚀 [STARTUP] Frontend URL:', config.server.frontendUrl);

const server = app.listen(PORT, async () => {
  console.log('🌐 [MUVOS]', BRANDING.STARTUP_PLATFORM_MESSAGE);
  console.log('⚡ [SMARTMETAL]', BRANDING.STARTUP_PRODUCT_MESSAGE);
  console.log('✅ [SUCCESS] Backend server is LISTENING on port', PORT);
  console.log('✅ [SUCCESS] Server URL: http://localhost:' + PORT);
  log.info(`Server running on http://localhost:${PORT}`, {
    port: PORT,
    environment: config.server.nodeEnv,
    frontendUrl: config.server.frontendUrl,
    platform: BRANDING.PLATFORM_NAME,
    product: BRANDING.PRODUCT_NAME,
  });

  // Warm up database connection pool FIRST (critical for preventing cold-start issues)
  const { warmupConnectionPool } = require('./utils/dbWarmup');
  try {
    console.log('🔥 [WARMUP] Starting database connection pool warmup...');
    const warmupResult = await warmupConnectionPool({
      minConnections: 3,
      maxRetries: 5,
      retryDelay: 1000,
      timeout: 5000,
    });

    if (warmupResult.success) {
      console.log('✅ [WARMUP] Database connection pool is ready');
      log.info('Database connection pool warmup successful', warmupResult);
    } else {
      console.warn('⚠️  [WARMUP] Database connection pool warmup failed, but server will continue');
      log.warn('Database connection pool warmup failed', { result: warmupResult });
    }
  } catch (error) {
    console.error('❌ [WARMUP] Database warmup error:', error.message);
    log.error('Database warmup error', error);
    // Don't crash the server - continue startup
  }

  // Initialize database in background (non-blocking)
  // This allows the server to respond to requests immediately
  initializeDatabase().catch(error => {
    log.error('Background database initialization error', error);
  });

  // Start cron scheduler for background jobs (non-blocking)
  try {
    const cronScheduler = require('./jobs/cronScheduler');
    cronScheduler.start();
    log.info('Cron scheduler started successfully');
  } catch (error) {
    log.error('Cron scheduler initialization error', error);
    // Don't exit - server can still run but background jobs won't run
  }

  // Start Service Bus workers for async processing (Phase 1 - non-blocking)
  try {
    const { startAiParsingWorker } = require('./jobs/aiParsingWorker');
    
    // Start workers in background (they run indefinitely)
    // startDocumentExtractionWorker().catch(error => { // Removed: Extraction now uses Cloud Tasks
    //   log.error('Document extraction worker failed to start', error);
    //   // Don't exit - server can still run with sync processing
    // });
    
    startAiParsingWorker().catch(error => {
      log.error('AI parsing worker failed to start', error);
      // Don't exit - server can still run with sync processing
    });
    
    log.info('Service Bus workers started successfully');
  } catch (error) {
    log.error('Service Bus workers initialization error', error);
    // Don't exit - server can still run but async processing won't work
  }

  console.log('✅ [SUCCESS] Server is ready to accept requests');
  log.info('Server is ready to accept requests');
});

// Handle server errors (port conflicts, etc.)
server.on('error', (error) => {
  console.error('❌ [ERROR] Server failed to start!');
  console.error('❌ [ERROR] Error code:', error.code);
  console.error('❌ [ERROR] Error message:', error.message);
  
  if (error.code === 'EADDRINUSE') {
    console.error('❌ [ERROR] Port', PORT, 'is already in use!');
    console.error('❌ [ERROR] Please stop the process using port', PORT, 'or change PORT in .env');
    console.error('❌ [ERROR] To find process using port:', 'netstat -ano | findstr :' + PORT);
  } else {
    console.error('❌ [ERROR] Unexpected server error:', error);
  }
  
  log.error('Server startup error', error);
  process.exit(1);
});

// Verify server is actually listening
server.on('listening', () => {
  const address = server.address();
  console.log('✅ [VERIFY] Server is bound to:', address);
  console.log('✅ [VERIFY] Address:', address.address);
  console.log('✅ [VERIFY] Port:', address.port);
  console.log('✅ [VERIFY] Family:', address.family);
});


})().catch((error) => {
  console.error('? [FATAL] Startup failed:', error);
  process.exit(1);
});
