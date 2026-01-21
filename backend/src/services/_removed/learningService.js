const { query, connectDb } = require('../db/supabaseClient');
const analyticsService = require('./analyticsService');

/**
 * Learning Service - Stage 9: Intelligence and Automation
 * 
 * Continuous learning algorithms to improve pricing and business decisions:
 * - Analyze pricing outcomes (won/lost)
 * - Learn optimal markup strategies
 * - Learn client behavior patterns
 * - Update pricing recommendations
 * 
 * STATUS: Learning features are not yet fully implemented (Phase A.1).
 * Most functions return placeholder data or null values. Only syncLearningInsights() 
 * is functional and can update pricing rules based on win/loss data.
 * 
 * TODO: Implement actual learning algorithms (Phase 2+)
 * - Track actual outcomes vs predictions
 * - Adjust AI models based on results
 * - Continuous improvement algorithm
 * - No external news or prediction logic yet (per requirements)
 */

// Learning service implementation status
const LEARNING_SERVICE_STATUS = {
  implemented: false,
  status: 'not_implemented',
  message: 'Learning algorithms are planned for Phase 2+. Only syncLearningInsights() is currently functional.',
  functional_functions: ['syncLearningInsights'],
  placeholder_functions: [
    'analyzePricingOutcomes',
    'learnClientBehavior',
    'learnOptimalMarkup',
    'trackPredictionAccuracy',
    'continuousImprovement',
    'getLearningSummary'
  ]
};

/**
 * Analyze pricing outcomes to learn optimal strategies
 * @param {string} tenantId - Tenant UUID (required)
 * @param {Object} options - Analysis options
 * @returns {Promise<Object>} Learning insights and recommendations
 * @note Learning service status: Not fully implemented (Phase A.1) - returns placeholder data
 */
async function analyzePricingOutcomes(tenantId, options = {}) {
  if (!tenantId) {
    throw new Error('tenantId is required');
  }

  const db = await connectDb();
  const { startDate, endDate, clientId, category } = options;

  // TODO: Implement outcome analysis (Phase 2+)
  // Should analyze:
  // - Win/loss rates by margin range
  // - Optimal margin by client type
  // - Optimal margin by material category
  // - Optimal margin by project type
  // - Pricing patterns that lead to wins

  const conditions = ['pr.tenant_id = $1', 'pr.outcome IN (\'won\', \'lost\')'];
  const params = [tenantId];
  let paramCount = 1;

  if (startDate) {
    paramCount++;
    conditions.push(`pr.created_at >= $${paramCount}`);
    params.push(startDate);
  }
  if (endDate) {
    paramCount++;
    conditions.push(`pr.created_at <= $${paramCount}`);
    params.push(endDate);
  }
  if (clientId) {
    paramCount++;
    conditions.push(`pr.client_id = $${paramCount}`);
    params.push(clientId);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await db.query(
    `SELECT 
      CASE 
        WHEN (unit_price - base_cost) / NULLIF(base_cost, 0) < 0.10 THEN '0-10%'
        WHEN (unit_price - base_cost) / NULLIF(base_cost, 0) < 0.20 THEN '10-20%'
        WHEN (unit_price - base_cost) / NULLIF(base_cost, 0) < 0.30 THEN '20-30%'
        ELSE '30%+'
      END as margin_range,
      COUNT(*) FILTER (WHERE outcome = 'won') as won_count,
      COUNT(*) FILTER (WHERE outcome = 'lost') as lost_count,
      COUNT(*) as total_count,
      AVG(total_price) FILTER (WHERE outcome = 'won') as avg_won_value,
      AVG(total_price) FILTER (WHERE outcome = 'lost') as avg_lost_value
    FROM pricing_runs pr
    JOIN pricing_run_items pri ON pr.id = pri.pricing_run_id
    ${whereClause}
    GROUP BY margin_range
    ORDER BY margin_range`,
    params
  );

  // TODO: Calculate optimal margin recommendations (Phase 2+)
  const insights = {
    learning_status: LEARNING_SERVICE_STATUS.status,
    learning_message: LEARNING_SERVICE_STATUS.message,
    margin_analysis: result.rows,
    optimal_margin_ranges: null, // TODO: Calculate based on win rates (Phase 2+)
    recommendations: [] // TODO: Generate recommendations (Phase 2+)
  };

  return insights;
}

/**
 * Learn client behavior patterns
 * @param {string} tenantId - Tenant UUID (required)
 * @param {string} clientId - Client UUID (optional, analyzes all if not provided)
 * @returns {Promise<Object>} Client behavior insights
 * @note Learning service status: Not fully implemented (Phase A.1) - returns placeholder data
 */
async function learnClientBehavior(tenantId, clientId = null) {
  if (!tenantId) {
    throw new Error('tenantId is required');
  }

  const db = await connectDb();

  // TODO: Implement client behavior learning (Phase 2+)
  // Should analyze:
  // - Order frequency patterns
  // - Preferred material categories
  // - Price sensitivity
  // - Seasonal patterns
  // - Response time patterns
  // - Negotiation patterns

  const queryStr = clientId
    ? `SELECT * FROM pricing_runs WHERE tenant_id = $1 AND client_id = $2 ORDER BY created_at DESC`
    : `SELECT client_id, COUNT(*) as order_count, AVG(total_price) as avg_order_value 
       FROM pricing_runs WHERE tenant_id = $1 GROUP BY client_id ORDER BY order_count DESC`;

  const result = await db.query(queryStr, clientId ? [tenantId, clientId] : [tenantId]);

  return {
    learning_status: LEARNING_SERVICE_STATUS.status,
    learning_message: LEARNING_SERVICE_STATUS.message,
    client_patterns: result.rows,
    behavior_insights: null, // TODO: Analyze patterns (Phase 2+)
    recommendations: [] // TODO: Generate recommendations (Phase 2+)
  };
}

/**
 * Learn optimal markup strategies
 * @param {string} tenantId - Tenant UUID (required)
 * @param {Object} options - Learning options
 * @returns {Promise<Object>} Optimal markup recommendations
 * @note Learning service status: Not fully implemented (Phase A.1) - returns placeholder data
 */
async function learnOptimalMarkup(tenantId, options = {}) {
  if (!tenantId) {
    throw new Error('tenantId is required');
  }

  const db = await connectDb();
  const { category, origin, projectType } = options;

  // TODO: Implement markup learning (Phase 2+)
  // Should analyze:
  // - Win rates by markup percentage
  // - Revenue optimization (margin × win probability)
  // - Optimal markup by category
  // - Optimal markup by origin
  // - Optimal markup by project type
  // - Optimal markup by client type

  const conditions = ['pr.tenant_id = $1', 'pr.outcome IN (\'won\', \'lost\')'];
  const params = [tenantId];
  let paramCount = 1;

  if (category) {
    paramCount++;
    conditions.push(`pr.category = $${paramCount}`);
    params.push(category);
  }
  if (origin) {
    paramCount++;
    conditions.push(`pr.origin = $${paramCount}`);
    params.push(origin);
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  const result = await db.query(
    `SELECT 
      pr.category,
      pr.origin,
      AVG((pri.unit_price - pri.base_cost) / NULLIF(pri.base_cost, 0)) as avg_margin,
      COUNT(*) FILTER (WHERE pr.outcome = 'won') as won_count,
      COUNT(*) FILTER (WHERE pr.outcome = 'lost') as lost_count,
      COUNT(*) as total_count
    FROM pricing_runs pr
    JOIN pricing_run_items pri ON pr.id = pri.pricing_run_id
    ${whereClause}
    GROUP BY pr.category, pr.origin
    ORDER BY (COUNT(*) FILTER (WHERE pr.outcome = 'won'))::float / NULLIF(COUNT(*), 0) DESC`,
    params
  );

  return {
    learning_status: LEARNING_SERVICE_STATUS.status,
    learning_message: LEARNING_SERVICE_STATUS.message,
    markup_analysis: result.rows,
    optimal_markups: null, // TODO: Calculate optimal markups (Phase 2+)
    recommendations: [] // TODO: Generate recommendations (Phase 2+)
  };
}

/**
 * Track prediction accuracy and update models
 * @param {string} tenantId - Tenant UUID (required)
 * @param {Object} options - Tracking options
 * @returns {Promise<Object>} Accuracy metrics and model updates
 * @note Learning service status: Not fully implemented (Phase A.1) - returns placeholder data
 */
async function trackPredictionAccuracy(tenantId, options = {}) {
  if (!tenantId) {
    throw new Error('tenantId is required');
  }

  const db = await connectDb();
  const { startDate, endDate } = options;

  // TODO: Implement prediction accuracy tracking (Phase 2+)
  // Should:
  // - Compare predicted win probability vs actual outcomes
  // - Calculate accuracy metrics (calibration, Brier score, etc.)
  // - Identify prediction errors
  // - Suggest model improvements
  // - Update model parameters if needed

  const conditions = ['pr.tenant_id = $1', 'pr.predicted_win_probability IS NOT NULL', 'pr.outcome IN (\'won\', \'lost\')'];
  const params = [tenantId];
  let paramCount = 1;

  if (startDate) {
    paramCount++;
    conditions.push(`pr.created_at >= $${paramCount}`);
    params.push(startDate);
  }
  if (endDate) {
    paramCount++;
    conditions.push(`pr.created_at <= $${paramCount}`);
    params.push(endDate);
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  const result = await db.query(
    `SELECT 
      pr.id,
      pr.predicted_win_probability,
      CASE WHEN pr.outcome = 'won' THEN 1 ELSE 0 END as actual_outcome,
      ABS((pr.predicted_win_probability / 100.0) - 
          (CASE WHEN pr.outcome = 'won' THEN 1 ELSE 0 END)) as prediction_error
    FROM pricing_runs pr
    ${whereClause}
    ORDER BY pr.created_at DESC`,
    params
  );

  // TODO: Calculate accuracy metrics (Phase 2+)
  const accuracy = {
    total_predictions: result.rows.length,
    mean_absolute_error: null, // TODO: Calculate MAE (Phase 2+)
    calibration_score: null, // TODO: Calculate calibration (Phase 2+)
    brier_score: null, // TODO: Calculate Brier score (Phase 2+)
    accuracy_by_range: null // TODO: Analyze accuracy by probability range (Phase 2+)
  };

  return {
    learning_status: LEARNING_SERVICE_STATUS.status,
    learning_message: LEARNING_SERVICE_STATUS.message,
    predictions: result.rows,
    accuracy_metrics: accuracy,
    model_updates: null, // TODO: Suggest model improvements (Phase 2+)
    recommendations: [] // TODO: Generate recommendations (Phase 2+)
  };
}

/**
 * Continuous improvement algorithm
 * @param {string} tenantId - Tenant UUID (required)
 * @param {Object} options - Improvement options
 * @returns {Promise<Object>} Improvement recommendations
 * @note Learning service status: Not fully implemented (Phase A.1) - returns placeholder data
 */
async function continuousImprovement(tenantId, options = {}) {
  if (!tenantId) {
    throw new Error('tenantId is required');
  }

  // TODO: Implement continuous improvement algorithm (Phase 2+)
  // Should:
  // - Combine insights from all learning functions
  // - Identify improvement opportunities
  // - Generate actionable recommendations
  // - Update pricing rules if needed
  // - Update AI model parameters if needed

  const [outcomes, markup, accuracy] = await Promise.all([
    analyzePricingOutcomes(tenantId, options),
    learnOptimalMarkup(tenantId, options),
    trackPredictionAccuracy(tenantId, options)
  ]);

  return {
    learning_status: LEARNING_SERVICE_STATUS.status,
    learning_message: LEARNING_SERVICE_STATUS.message,
    insights: {
      pricing_outcomes: outcomes,
      optimal_markup: markup,
      prediction_accuracy: accuracy
    },
    improvements: [], // TODO: Generate improvement recommendations (Phase 2+)
    actions: [] // TODO: Generate actionable items (Phase 2+)
  };
}

/**
 * Get learning summary and recommendations
 * @param {string} tenantId - Tenant UUID (required)
 * @param {Object} options - Summary options
 * @returns {Promise<Object>} Learning summary
 * @note Learning service status: Not fully implemented (Phase A.1) - returns placeholder data
 */
async function getLearningSummary(tenantId, options = {}) {
  if (!tenantId) {
    throw new Error('tenantId is required');
  }

  const improvement = await continuousImprovement(tenantId, options);

  return {
    learning_status: LEARNING_SERVICE_STATUS.status,
    learning_message: LEARNING_SERVICE_STATUS.message,
    summary: {
      total_quotes_analyzed: null, // TODO: Calculate (Phase 2+)
      learning_period: {
        start: options.startDate || null,
        end: options.endDate || new Date().toISOString()
      },
      key_insights: [], // TODO: Extract key insights (Phase 2+)
      improvement_opportunities: improvement.improvements
    },
    recommendations: improvement.actions,
    next_steps: [] // TODO: Generate next steps (Phase 2+)
  };
}

/**
 * Sync learning insights - ACTUALLY UPDATES pricing rules based on learning
 * This is the feedback loop that was missing in Stage 9
 *
 * @param {string} tenantId - Tenant UUID (required)
 * @param {Object} options - Sync options
 * @param {boolean} [options.dryRun=false] - If true, only calculates but doesn't update
 * @param {number} [options.minSampleSize=10] - Minimum quotes needed before updating rules
 * @param {number} [options.confidenceThreshold=0.7] - Confidence threshold for updates
 * @returns {Promise<Object>} Sync results with actual updates made
 */
async function syncLearningInsights(tenantId, options = {}) {
  if (!tenantId) {
    throw new Error('tenantId is required');
  }

  const db = await connectDb();
  const { dryRun = false, minSampleSize = 10, confidenceThreshold = 0.7 } = options;

  console.log(`🧠 [Learning] Starting learning insights sync for tenant ${tenantId}...`);
  console.log(`   Mode: ${dryRun ? 'DRY RUN (no updates)' : 'LIVE (will update rules)'}`);

  const updates = [];
  const skipped = [];

  try {
    // Step 1: Analyze pricing outcomes by client
    const clientsResult = await db.query(
      `SELECT
        c.id as client_id,
        c.name as client_name,
        COUNT(DISTINCT pr.id) as total_quotes,
        COUNT(DISTINCT pr.id) FILTER (WHERE pr.outcome = 'won') as won_quotes,
        COUNT(DISTINCT pr.id) FILTER (WHERE pr.outcome = 'lost') as lost_quotes,
        AVG((pri.unit_price - pri.base_cost) / NULLIF(pri.base_cost, 0)) FILTER (WHERE pr.outcome = 'won') as avg_won_margin,
        AVG((pri.unit_price - pri.base_cost) / NULLIF(pri.base_cost, 0)) FILTER (WHERE pr.outcome = 'lost') as avg_lost_margin
      FROM clients c
      LEFT JOIN projects p ON p.client_id = c.id
      LEFT JOIN rfqs r ON r.project_id = p.id
      LEFT JOIN pricing_runs pr ON pr.rfq_id = r.id
      LEFT JOIN pricing_run_items pri ON pri.pricing_run_id = pr.id
      WHERE c.tenant_id = $1
        AND pr.outcome IN ('won', 'lost')
        AND pr.created_at >= NOW() - INTERVAL '90 days'
      GROUP BY c.id, c.name
      HAVING COUNT(DISTINCT pr.id) >= $2`,
      [tenantId, minSampleSize]
    );

    console.log(`   Found ${clientsResult.rows.length} clients with sufficient data (>=${minSampleSize} quotes)`);

    // Step 2: For each client, calculate optimal margin and update pricing rules
    for (const client of clientsResult.rows) {
      const wonMargin = parseFloat(client.avg_won_margin) || 0;
      const lostMargin = parseFloat(client.avg_lost_margin) || 0;
      const winRate = parseInt(client.won_quotes) / parseInt(client.total_quotes);

      // Only update if win rate is meaningful and we have good data
      const confidence = Math.min(parseInt(client.total_quotes) / 50, 1.0); // Max confidence at 50 quotes

      if (confidence < confidenceThreshold) {
        skipped.push({
          client_id: client.client_id,
          client_name: client.client_name,
          reason: `Confidence too low (${(confidence * 100).toFixed(0)}% < ${(confidenceThreshold * 100).toFixed(0)}%)`,
          total_quotes: parseInt(client.total_quotes),
        });
        continue;
      }

      // Calculate recommended margin adjustment
      // If win rate is too high (>70%), increase margin slightly
      // If win rate is too low (<40%), decrease margin slightly
      let recommendedAdjustment = 0;
      let reason = '';

      if (winRate > 0.7 && wonMargin > 0) {
        recommendedAdjustment = wonMargin * 1.05; // Increase by 5%
        reason = `High win rate (${(winRate * 100).toFixed(0)}%) suggests room for higher margins`;
      } else if (winRate < 0.4 && wonMargin > 0) {
        recommendedAdjustment = wonMargin * 0.95; // Decrease by 5%
        reason = `Low win rate (${(winRate * 100).toFixed(0)}%) suggests margins are too high`;
      } else {
        recommendedAdjustment = wonMargin; // Keep current winning margin
        reason = `Win rate is optimal (${(winRate * 100).toFixed(0)}%), maintaining current margin`;
      }

      // Check if client has existing pricing rules
      // First check if table and tenant_id column exist
      let hasTenantIdColumn = false;
      let tableExists = false;
      
      try {
        const tableCheck = await db.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = 'client_pricing_rules'
          );
        `);
        tableExists = tableCheck.rows[0].exists;
        
        if (tableExists) {
          const columnCheck = await db.query(`
            SELECT EXISTS (
              SELECT FROM information_schema.columns 
              WHERE table_schema = 'public' 
              AND table_name = 'client_pricing_rules' 
              AND column_name = 'tenant_id'
            );
          `);
          hasTenantIdColumn = columnCheck.rows[0].exists;
        }
      } catch (err) {
        console.warn('Could not check client_pricing_rules schema:', err.message);
        tableExists = false;
      }
      
      if (!tableExists) {
        console.log(`   ⏭️  Skipping ${client.client_name} - client_pricing_rules table does not exist`);
        continue;
      }
      
      // Build query based on whether tenant_id column exists
      let query;
      let params;
      
      if (hasTenantIdColumn) {
        query = `SELECT * FROM client_pricing_rules WHERE client_id = $1 AND tenant_id = $2`;
        params = [client.client_id, tenantId];
      } else {
        query = `SELECT * FROM client_pricing_rules WHERE client_id = $1`;
        params = [client.client_id];
      }
      
      const existingRuleResult = await db.query(query, params);

      if (existingRuleResult.rows.length === 0) {
        console.log(`   ⏭️  Skipping ${client.client_name} - no existing pricing rules`);
        skipped.push({
          client_id: client.client_id,
          client_name: client.client_name,
          reason: 'No existing pricing rules to update',
        });
        continue;
      }

      const existingRule = existingRuleResult.rows[0];
      const currentMargin = parseFloat(existingRule.material_pct) / 100 || 0;

      // Calculate the margin change
      const marginChange = recommendedAdjustment - currentMargin;
      const marginChangePct = (marginChange / currentMargin) * 100;

      // Only update if change is meaningful (>2%) but not too drastic (>20%)
      if (Math.abs(marginChangePct) < 2) {
        skipped.push({
          client_id: client.client_id,
          client_name: client.client_name,
          reason: `Margin change too small (${marginChangePct.toFixed(1)}%)`,
        });
        continue;
      }

      if (Math.abs(marginChangePct) > 20) {
        skipped.push({
          client_id: client.client_id,
          client_name: client.client_name,
          reason: `Margin change too large (${marginChangePct.toFixed(1)}%), requires manual review`,
        });
        continue;
      }

      // Perform the update (unless dry run)
      if (!dryRun) {
        await db.query(
          `UPDATE client_pricing_rules
           SET material_pct = $1,
               updated_at = NOW(),
               last_learning_update_at = NOW(),
               learning_metadata = jsonb_build_object(
                 'win_rate', $2,
                 'total_quotes', $3,
                 'avg_won_margin', $4,
                 'avg_lost_margin', $5,
                 'confidence', $6,
                 'reason', $7,
                 'updated_by', 'learning_service'
               )
           WHERE client_id = $8 AND tenant_id = $9`,
          [
            (recommendedAdjustment * 100).toFixed(2), // Convert to percentage
            winRate,
            parseInt(client.total_quotes),
            wonMargin,
            lostMargin,
            confidence,
            reason,
            client.client_id,
            tenantId,
          ]
        );
      }

      updates.push({
        client_id: client.client_id,
        client_name: client.client_name,
        previous_margin: currentMargin,
        new_margin: recommendedAdjustment,
        margin_change: marginChange,
        margin_change_pct: marginChangePct,
        win_rate: winRate,
        total_quotes: parseInt(client.total_quotes),
        confidence,
        reason,
        applied: !dryRun,
      });

      console.log(`   ✅ ${client.client_name}: ${currentMargin.toFixed(1)}% → ${recommendedAdjustment.toFixed(1)}% (${marginChangePct > 0 ? '+' : ''}${marginChangePct.toFixed(1)}%)`);
    }

    console.log(`\n🎯 [Learning] Sync complete:`);
    console.log(`   - ${updates.length} pricing rules ${dryRun ? 'would be ' : ''}updated`);
    console.log(`   - ${skipped.length} clients skipped`);

    return {
      success: true,
      tenant_id: tenantId,
      dry_run: dryRun,
      timestamp: new Date().toISOString(),
      summary: {
        clients_analyzed: clientsResult.rows.length,
        rules_updated: updates.length,
        rules_skipped: skipped.length,
      },
      updates,
      skipped,
    };
  } catch (error) {
    console.error(`❌ [Learning] Sync failed:`, error);
    throw error;
  }
}

module.exports = {
  analyzePricingOutcomes,
  learnClientBehavior,
  learnOptimalMarkup,
  trackPredictionAccuracy,
  continuousImprovement,
  getLearningSummary,
  syncLearningInsights, // Functional: Actual feedback loop that updates pricing rules
  LEARNING_SERVICE_STATUS, // Export status for API/UI consumption
};

