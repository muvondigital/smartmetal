// SmartMetal CPQ - A product from Muvon Digital, an innovation arm of Muvon Energy
// AI Cost Tracking Service - Tracks Azure AI API usage and costs

const { connectDb } = require('../db/supabaseClient');
const { log } = require('../utils/logger');

/**
 * Azure AI Pricing (as of Dec 2025)
 * These rates are estimates and should be updated based on actual Azure pricing
 */
const AI_PRICING = {
  gpt4o: {
    input_per_1k_tokens: 0.005,  // $5 per 1M input tokens = $0.005 per 1K
    output_per_1k_tokens: 0.015, // $15 per 1M output tokens = $0.015 per 1K
  },
  document_intelligence: {
    per_page: 0.001, // $1 per 1000 pages = $0.001 per page
  },
  vision: {
    per_image: 0.002, // $2 per 1000 images = $0.002 per image
  },
  custom_vision: {
    per_prediction: 0.001, // $1 per 1000 predictions = $0.001 per prediction
  },
};

/**
 * Tracks an AI API call with usage and cost details
 *
 * @param {Object} usage - Usage details
 * @param {string} usage.service - Service name ('gpt4o', 'document_intelligence', 'vision', 'custom_vision')
 * @param {string} usage.operation - Operation name
 * @param {string} [usage.model] - Model name
 * @param {number} [usage.inputTokens] - Input tokens (for GPT-4o)
 * @param {number} [usage.outputTokens] - Output tokens (for GPT-4o)
 * @param {number} [usage.pagesAnalyzed] - Pages analyzed (for Document Intelligence)
 * @param {number} [usage.imagesAnalyzed] - Images analyzed (for Vision)
 * @param {number} [usage.apiLatencyMs] - API latency in milliseconds
 * @param {string} [usage.pricingRunId] - Associated pricing run UUID
 * @param {string} [usage.rfqId] - Associated RFQ UUID
 * @param {string} [usage.tenantId] - Tenant UUID
 * @param {string} [usage.userId] - User ID
 * @param {string} [usage.correlationId] - Request correlation ID
 * @param {Object} [usage.requestMetadata] - Additional request metadata
 * @param {Object} [usage.responseMetadata] - Additional response metadata
 * @param {string} [usage.errorMessage] - Error message if call failed
 * @param {boolean} [usage.success=true] - Whether the call succeeded
 *
 * @returns {Promise<Object>} Created usage record
 */
async function trackAiUsage(usage) {
  const db = await connectDb();

  try {
    // Calculate estimated cost
    const estimatedCost = calculateCost(usage);

    const result = await db.query(
      `INSERT INTO ai_api_usage (
        service,
        operation,
        model,
        input_tokens,
        output_tokens,
        total_tokens,
        pages_analyzed,
        images_analyzed,
        api_latency_ms,
        estimated_cost_usd,
        pricing_model_version,
        pricing_run_id,
        rfq_id,
        tenant_id,
        user_id,
        correlation_id,
        request_metadata,
        response_metadata,
        error_message,
        success
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, $19, $20
      ) RETURNING *`,
      [
        usage.service,
        usage.operation,
        usage.model || null,
        usage.inputTokens || null,
        usage.outputTokens || null,
        (usage.inputTokens || 0) + (usage.outputTokens || 0) || null,
        usage.pagesAnalyzed || null,
        usage.imagesAnalyzed || null,
        usage.apiLatencyMs || null,
        estimatedCost,
        '2025-12', // Pricing model version
        usage.pricingRunId || null,
        usage.rfqId || null,
        usage.tenantId || null,
        usage.userId || null,
        usage.correlationId || null,
        usage.requestMetadata ? JSON.stringify(usage.requestMetadata) : null,
        usage.responseMetadata ? JSON.stringify(usage.responseMetadata) : null,
        usage.errorMessage || null,
        usage.success !== false, // Default to true
      ]
    );

    // Log high-cost calls for alerting
    if (estimatedCost > 0.10) { // Alert on calls costing more than $0.10
      log.warn('High-cost AI API call detected', {
        service: usage.service,
        operation: usage.operation,
        estimatedCost: `$${estimatedCost.toFixed(4)}`,
        tokens: (usage.inputTokens || 0) + (usage.outputTokens || 0),
        correlationId: usage.correlationId,
      });
    }

    return result.rows[0];
  } catch (error) {
    log.error('Failed to track AI usage', error, {
      service: usage.service,
      operation: usage.operation,
    });
    // Don't throw - cost tracking should not break the main flow
    return null;
  }
}

/**
 * Calculates estimated cost based on usage
 *
 * @param {Object} usage - Usage details
 * @returns {number} Estimated cost in USD
 */
function calculateCost(usage) {
  let cost = 0;

  switch (usage.service) {
    case 'gpt4o':
      if (usage.inputTokens) {
        cost += (usage.inputTokens / 1000) * AI_PRICING.gpt4o.input_per_1k_tokens;
      }
      if (usage.outputTokens) {
        cost += (usage.outputTokens / 1000) * AI_PRICING.gpt4o.output_per_1k_tokens;
      }
      break;

    case 'document_intelligence':
      if (usage.pagesAnalyzed) {
        cost += usage.pagesAnalyzed * AI_PRICING.document_intelligence.per_page;
      }
      break;

    case 'vision':
      if (usage.imagesAnalyzed) {
        cost += usage.imagesAnalyzed * AI_PRICING.vision.per_image;
      }
      break;

    case 'custom_vision':
      if (usage.imagesAnalyzed) {
        cost += usage.imagesAnalyzed * AI_PRICING.custom_vision.per_prediction;
      }
      break;

    default:
      log.warn(`Unknown AI service for cost calculation: ${usage.service}`);
  }

  return cost;
}

/**
 * Gets AI cost summary for a given period
 *
 * @param {Object} options - Query options
 * @param {string} [options.tenantId] - Filter by tenant
 * @param {string} [options.service] - Filter by service
 * @param {Date} [options.startDate] - Start date
 * @param {Date} [options.endDate] - End date
 *
 * @returns {Promise<Object>} Cost summary
 */
// UUID validation helper
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUuid(value) {
  return value && typeof value === 'string' && UUID_REGEX.test(value.trim());
}

async function getCostSummary(options = {}) {
  const db = await connectDb();

  const { tenantId, service, startDate, endDate } = options;

  let query = `
    SELECT
      service,
      COUNT(*) as api_calls,
      SUM(total_tokens) as total_tokens,
      SUM(estimated_cost_usd) as total_cost_usd,
      AVG(api_latency_ms) as avg_latency_ms,
      MAX(estimated_cost_usd) as max_single_call_cost,
      COUNT(*) FILTER (WHERE NOT success) as failed_calls
    FROM ai_api_usage
    WHERE 1=1
  `;
  const params = [];

  // Validate tenantId is a proper UUID before using it in SQL query
  if (tenantId && isValidUuid(tenantId)) {
    query += ` AND tenant_id = $${params.length + 1}`;
    params.push(tenantId.trim());
  }

  if (service) {
    query += ` AND service = $${params.length + 1}`;
    params.push(service);
  }

  if (startDate) {
    query += ` AND created_at >= $${params.length + 1}`;
    params.push(startDate);
  }

  if (endDate) {
    query += ` AND created_at <= $${params.length + 1}`;
    params.push(endDate);
  }

  query += ` GROUP BY service ORDER BY total_cost_usd DESC`;

  const result = await db.query(query, params);

  const totalCost = result.rows.reduce((sum, row) => sum + parseFloat(row.total_cost_usd || 0), 0);
  const totalCalls = result.rows.reduce((sum, row) => sum + parseInt(row.api_calls || 0), 0);

  return {
    period: {
      start: startDate || null,
      end: endDate || new Date().toISOString(),
    },
    totals: {
      total_cost_usd: totalCost,
      total_calls: totalCalls,
    },
    by_service: result.rows.map(row => ({
      service: row.service,
      api_calls: parseInt(row.api_calls),
      total_tokens: parseInt(row.total_tokens) || null,
      total_cost_usd: parseFloat(row.total_cost_usd),
      avg_latency_ms: parseFloat(row.avg_latency_ms) || null,
      max_single_call_cost: parseFloat(row.max_single_call_cost),
      failed_calls: parseInt(row.failed_calls),
    })),
  };
}

/**
 * Gets daily cost summary using the materialized view
 *
 * @param {Object} options - Query options
 * @param {string} [options.tenantId] - Filter by tenant
 * @param {number} [options.days=30] - Number of days to include
 *
 * @returns {Promise<Array>} Daily cost summary
 */
async function getDailyCostSummary(options = {}) {
  const db = await connectDb();

  const { tenantId, days = 30 } = options;

  let query = `
    SELECT
      date,
      service,
      api_calls,
      total_tokens,
      total_cost_usd,
      avg_latency_ms,
      failed_calls
    FROM ai_cost_summary_daily
    WHERE date >= CURRENT_DATE - INTERVAL '${days} days'
  `;
  const params = [];

  // Validate tenantId is a proper UUID before using it in SQL query
  if (tenantId && isValidUuid(tenantId)) {
    query += ` AND tenant_id = $${params.length + 1}`;
    params.push(tenantId.trim());
  }

  query += ` ORDER BY date DESC, total_cost_usd DESC`;

  const result = await db.query(query, params);

  return result.rows.map(row => ({
    date: row.date,
    service: row.service,
    api_calls: parseInt(row.api_calls),
    total_tokens: parseInt(row.total_tokens) || null,
    total_cost_usd: parseFloat(row.total_cost_usd),
    avg_latency_ms: parseFloat(row.avg_latency_ms) || null,
    failed_calls: parseInt(row.failed_calls),
  }));
}

/**
 * Checks if cost budget is exceeded
 *
 * @param {Object} options - Budget check options
 * @param {string} [options.tenantId] - Tenant UUID
 * @param {number} options.budgetUsd - Budget in USD
 * @param {string} [options.period='month'] - Period ('day', 'week', 'month')
 *
 * @returns {Promise<Object>} Budget status
 */
async function checkBudget(options) {
  const { tenantId, budgetUsd, period = 'month' } = options;

  const periodIntervals = {
    day: '1 day',
    week: '7 days',
    month: '30 days',
  };

  const periodInterval = periodIntervals[period];
  if (!periodInterval) {
    throw new Error(`Invalid period: ${period}. Must be one of: day, week, month`);
  }

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - parseInt(periodInterval.split(' ')[0]));

  const summary = await getCostSummary({
    tenantId,
    startDate,
    endDate: new Date(),
  });

  const currentCost = summary.totals.total_cost_usd;
  const percentUsed = (currentCost / budgetUsd) * 100;
  const exceeded = currentCost > budgetUsd;

  return {
    budget_usd: budgetUsd,
    current_cost_usd: currentCost,
    remaining_usd: budgetUsd - currentCost,
    percent_used: percentUsed,
    exceeded,
    period,
    alert_level: percentUsed > 90 ? 'critical' : percentUsed > 75 ? 'warning' : 'ok',
  };
}

module.exports = {
  trackAiUsage,
  calculateCost,
  getCostSummary,
  getDailyCostSummary,
  checkBudget,
  AI_PRICING, // Export for reference
};
