require('dotenv').config();
const express = require('express');
const cors = require('cors');

// Initialize config (validates env vars)
const { config } = require('./config/env');

const app = express();
const PORT = config.server.port;

// Enable CORS for frontend - must be before routes
app.use(
  cors({
    origin: ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

app.use(express.json());

// Import middleware
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { sanitizeRequest } = require('./middleware/validation');

// Sanitize all inputs (early in pipeline)
app.use(sanitizeRequest);

// Log all requests for debugging
app.use((req, res, next) => {
  if (config.server.nodeEnv === 'development') {
    console.log(`${req.method} ${req.path}`);
  }
  next();
});

// Initialize database tables and seed data
const { initMaterialsTable } = require('./db/initMaterialsTable');
const { seedMaterials } = require('./db/seedMaterials');
const { enhancePricingRunItemsTable } = require('./db/enhancePricingRunItemsTable');
const { initPricingRulesTable } = require('./db/initPricingRulesTable');
const { seedPricingRules } = require('./db/seedPricingRules');

// Import routes
const rfqRoutes = require('./routes/rfqRoutes');
const materialsRoutes = require('./routes/materialsRoutes');
const pricingRoutes = require('./routes/pricingRoutes');
const ocrRoutes = require('./routes/ocrRoutes');
const aiRoutes = require('./routes/aiRoutes');
const priceAgreementsRoutes = require('./routes/priceAgreementsRoutes');
const approvalRoutes = require('./routes/approvalRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');

// Initialize database on startup
async function initializeDatabase() {
  try {
    await initMaterialsTable();
    await enhancePricingRunItemsTable();
    await initPricingRulesTable();
    await seedMaterials();
    await seedPricingRules();
    console.log('Database initialization complete');
  } catch (error) {
    console.error('Database initialization error:', error);
    // Don't crash the server, but log the error
  }
}

// Mount routes
app.use('/api/rfqs', rfqRoutes);
app.use('/api/materials', materialsRoutes);
app.use('/api/pricing-runs', pricingRoutes);
app.use('/api/ocr', ocrRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/price-agreements', priceAgreementsRoutes);
app.use('/api/approvals', approvalRoutes);
app.use('/api', analyticsRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'NSC Pricer API',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: '/health',
      rfqs: '/api/rfqs',
      materials: '/api/materials',
      pricingRuns: '/api/pricing-runs',
      ocr: '/api/ocr',
      ai: '/api/ai',
      priceAgreements: '/api/price-agreements',
      approvals: '/api/approvals',
      analytics: '/api/analytics'
    }
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// 404 handler (must be after all routes, before error handler)
app.use(notFoundHandler);

// Error handler (must be last)
app.use(errorHandler);

// Graceful shutdown handler
const { closePool } = require('./db/supabaseClient');

async function shutdown() {
  console.log('\n🛑 Shutting down server...');
  try {
    await closePool();
    console.log('✅ Database pool closed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start server
app.listen(PORT, async () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📡 Environment: ${config.server.nodeEnv}`);
  console.log(`🔗 CORS enabled for: ${config.server.frontendUrl}`);

  // Initialize database after server starts
  try {
    await initializeDatabase();
    console.log('✅ Server initialization complete');
  } catch (error) {
    console.error('❌ Server initialization error:', error);
    // Don't exit - server can still run but some features may not work
  }
});

