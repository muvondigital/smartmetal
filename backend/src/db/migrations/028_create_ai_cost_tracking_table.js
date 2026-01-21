/**
 * Migration 028: Create AI Cost Tracking Table
 *
 * Purpose: Tracks Azure AI API usage and costs for budget management
 *
 * Features:
 * - Tracks GPT-4o, Document Intelligence, and Vision API calls
 * - Records token usage, API latency, and estimated costs
 * - Supports cost analysis and budget alerting
 * - Tenant-scoped for multi-tenant cost allocation
 *
 * Use Cases:
 * - Budget monitoring and alerting
 * - Cost optimization analysis
 * - Per-tenant cost allocation
 * - API usage analytics
 *
 * Created: Dec 3, 2025
 */

async function up(db) {
  if (!db) {
    throw new Error('Migration 028 requires db parameter. Use runAllMigrations.js to run migrations.');
  }

  console.log('Creating ai_api_usage table...');

  await db.query(`
    -- AI API Usage Tracking Table
    CREATE TABLE IF NOT EXISTS ai_api_usage (
      -- Primary key
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

      -- API call metadata
      service VARCHAR(50) NOT NULL, -- 'gpt4o', 'document_intelligence', 'vision', 'custom_vision'
      operation VARCHAR(100) NOT NULL, -- 'chat_completion', 'document_analysis', 'image_classification', etc.
      model VARCHAR(100), -- 'gpt-4o', 'prebuilt-read', etc.

      -- Usage metrics
      input_tokens INT, -- For GPT-4o
      output_tokens INT, -- For GPT-4o
      total_tokens INT, -- For GPT-4o
      pages_analyzed INT, -- For Document Intelligence
      images_analyzed INT, -- For Vision/Custom Vision
      api_latency_ms INT, -- API response time in milliseconds

      -- Cost tracking
      estimated_cost_usd DECIMAL(10, 6), -- Estimated cost in USD
      pricing_model_version VARCHAR(50), -- Pricing model version for auditing

      -- Context
      pricing_run_id UUID REFERENCES pricing_runs(id) ON DELETE SET NULL,
      rfq_id UUID REFERENCES rfqs(id) ON DELETE SET NULL,
      tenant_id UUID, -- Multi-tenant cost allocation
      user_id VARCHAR(255), -- User who triggered the call
      correlation_id UUID, -- Request correlation ID

      -- Request/Response metadata
      request_metadata JSONB, -- Additional request details
      response_metadata JSONB, -- Additional response details
      error_message TEXT, -- Error message if call failed
      success BOOLEAN DEFAULT true,

      -- Timestamps
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- Indexes for cost analytics
    CREATE INDEX IF NOT EXISTS idx_ai_usage_service_created
      ON ai_api_usage(service, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_ai_usage_tenant_created
      ON ai_api_usage(tenant_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_ai_usage_pricing_run
      ON ai_api_usage(pricing_run_id);

    CREATE INDEX IF NOT EXISTS idx_ai_usage_correlation
      ON ai_api_usage(correlation_id);

    -- Index for cost queries
    CREATE INDEX IF NOT EXISTS idx_ai_usage_cost_analysis
      ON ai_api_usage(tenant_id, service, created_at DESC)
      INCLUDE (estimated_cost_usd, total_tokens);

    -- Create view for daily cost summaries
    CREATE OR REPLACE VIEW ai_cost_summary_daily AS
    SELECT
      DATE(created_at) as date,
      tenant_id,
      service,
      COUNT(*) as api_calls,
      SUM(total_tokens) as total_tokens,
      SUM(estimated_cost_usd) as total_cost_usd,
      AVG(api_latency_ms) as avg_latency_ms,
      COUNT(*) FILTER (WHERE NOT success) as failed_calls
    FROM ai_api_usage
    GROUP BY DATE(created_at), tenant_id, service;

    COMMENT ON TABLE ai_api_usage IS 'Tracks Azure AI API usage and costs for budget management and optimization';
    COMMENT ON COLUMN ai_api_usage.service IS 'AI service used: gpt4o, document_intelligence, vision, custom_vision';
    COMMENT ON COLUMN ai_api_usage.estimated_cost_usd IS 'Estimated cost in USD based on current pricing';
    COMMENT ON VIEW ai_cost_summary_daily IS 'Daily cost summary by tenant and service';
  `);

  console.log('✅ ai_api_usage table created successfully');
  console.log('✅ Cost tracking indexes created');
  console.log('✅ Daily cost summary view created');
}

async function down(db) {
  if (!db) {
    throw new Error('Migration 028 requires db parameter. Use runAllMigrations.js to run migrations.');
  }

  console.log('Dropping ai_api_usage table...');

  await db.query(`
    DROP VIEW IF EXISTS ai_cost_summary_daily;
    DROP TABLE IF EXISTS ai_api_usage CASCADE;
  `);

  console.log('✅ ai_api_usage table dropped');
}

module.exports = { up, down };
