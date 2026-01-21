// MUVOS Platform – SmartMetal CPQ runs on Muvon Unified Commercial Operating System
// SmartMetal CPQ - A product from Muvon Digital, an innovation arm of Muvon Energy
// Developed by Muvon Digital, the innovation arm of Muvon Energy.
// Copyright (c) 2025 Muvon Energy. All rights reserved.
// Proprietary & Confidential — Not for distribution.

// This file exports the Express app for use in tests and server startup
// In test mode, the app is exported without starting the server

const express = require('express');
const cors = require('cors');
const { config } = require('./config/env');
const { log } = require('./utils/logger');

// Initialize Sentry FIRST (must be before all other middleware)
const { initSentry, sentryErrorHandler } = require('./config/sentry');

// Import middleware
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { sanitizeRequest } = require('./middleware/validation');
const { correlationIdMiddleware } = require('./middleware/correlationId');
const { tenantMiddleware } = require('./middleware/tenant');
const { aiRateLimiter } = require('./middleware/rateLimiter');
const { timingMiddleware } = require('./middleware/timingMiddleware');

// Import routes
const v1Router = require('./routes/v1');
const authRoutes = require('./routes/authRoutes');
const rfqRoutes = require('./routes/rfqRoutes');
const materialsRoutes = require('./routes/materialsRoutes');
const pricingRoutes = require('./routes/pricingRoutes');
const ocrRoutes = require('./routes/ocrRoutes');
const aiRoutes = require('./routes/aiRoutes');
const onboardingRoutes = require('./routes/onboardingRoutes');
const approvalRoutes = require('./routes/approvalRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const pipesRoutes = require('./routes/pipesRoutes');
const pdfExportRoutes = require('./routes/pdfExportRoutes');
const priceImportRoutes = require('./routes/priceImportRoutes');
const adminRoutes = require('./routes/adminRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const qeeRoutes = require('./routes/qeeRoutes');

// Swagger/OpenAPI documentation
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./docs/swagger');

/**
 * Creates and configures the Express application
 * @param {Object} options - Configuration options
 * @param {boolean} options.skipSentry - Skip Sentry initialization (for tests)
 * @returns {express.Application} Configured Express app
 */
function createApp(options = {}) {
  const { skipSentry = false } = options;
  
  const app = express();

  // Initialize Sentry (skip in test mode)
  if (!skipSentry) {
    initSentry(app);
  }

  // Enable CORS
  const corsOptions = {
    origin: (origin, callback) => {
      if (!origin) {
        return callback(null, true);
      }
      
      if (config.server.nodeEnv === 'development' || config.server.nodeEnv === 'test') {
        if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
          return callback(null, true);
        }
      }
      
      const allowedOrigins = [
        'http://localhost:5173',
        'http://localhost:5174',
        'http://localhost:5175',
        'http://localhost:5176',
        'http://localhost:5177',
        'http://localhost:5178',
        config.server.frontendUrl,
      ].filter(Boolean);
      
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
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
    exposedHeaders: ['X-API-Warn'],
  };

  app.use(cors(corsOptions));
  app.options('*', (req, res, next) => cors(corsOptions)(req, res, next));

  // Configure JSON body parser
  app.use(express.json({ limit: '10mb' }));

  // Sanitize all inputs
  app.use(sanitizeRequest);

  // Apply correlation ID middleware
  app.use(correlationIdMiddleware);

  // Apply tenant middleware (skip for auth routes)
  app.use((req, res, next) => {
    const path = (req.path || req.originalUrl?.split('?')[0] || '').toLowerCase();
    if (path.startsWith('/api/auth/') || path.startsWith('/api/v1/auth/') || 
        path === '/api/auth' || path === '/api/v1/auth') {
      return next();
    }
    tenantMiddleware(req, res, next);
  });

  // Apply timing middleware
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

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: config.server.nodeEnv,
    });
  });

  // Import additional routes
  const quoteCandidatesRoutes = require('./routes/quoteCandidatesRoutes');
  const debugRoutes = require('./routes/debugRoutes');

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
  app.use('/api/ai', (req, res, next) => {
    res.setHeader('X-API-Warn', 'This endpoint is deprecated. Please use /api/v1/ai instead.');
    next();
  }, aiRoutes);
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
  app.use('/api/admin', (req, res, next) => {
    res.setHeader('X-API-Warn', 'This endpoint is deprecated. Please use /api/v1/admin instead.');
    next();
  }, adminRoutes);

  // Legacy analytics and dashboard routes
  const legacyDeprecationMiddleware = (req, res, next) => {
    res.setHeader('X-API-Warn', 'This endpoint is deprecated. Please use /api/v1/* instead.');
    next();
  };
  app.use('/api', legacyDeprecationMiddleware, analyticsRoutes);
  app.use('/api', legacyDeprecationMiddleware, dashboardRoutes);
  app.use('/api/qee', qeeRoutes);

  // Debug routes (dev-only)
  if (config.server.nodeEnv !== 'production' || process.env.ENABLE_DEBUG_ROUTES === 'true') {
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
    });
  });

  // CORS test endpoint
  app.get('/cors-test', (req, res) => {
    res.json({
      message: 'CORS is working!',
      origin: req.headers.origin || 'no origin header',
      timestamp: new Date().toISOString(),
    });
  });

  // Swagger documentation
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

  // Error handling (must be last)
  if (!skipSentry) {
    app.use(sentryErrorHandler);
  }
  app.use(errorHandler);
  app.use(notFoundHandler);

  return app;
}

module.exports = { createApp };
