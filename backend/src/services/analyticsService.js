const { connectDb } = require('../db/supabaseClient');
const { getApprovalStatistics } = require('./approvalService');

/**
 * Analytics Service
 * Provides business intelligence and metrics for pricing runs
 */

/**
 * Gets dashboard-level metrics
 * @param {Object} dateRange - Start and end dates
 * @returns {Promise<Object>} Dashboard metrics
 */
async function getDashboardMetrics(dateRange = {}) {
  const db = await connectDb();

  const { start_date, end_date } = getDateRange(dateRange);

  // Get quote statistics
  const quoteStats = await db.query(
    `SELECT
      COUNT(*) as total_quotes,
      COUNT(*) FILTER (WHERE approval_status = 'draft' OR approval_status = 'pending_approval') as pending_quotes,
      COUNT(*) FILTER (WHERE approval_status = 'approved') as approved_quotes,
      COUNT(*) FILTER (WHERE approval_status = 'rejected') as rejected_quotes,
      SUM(total_price) as total_value,
      AVG(total_price) as average_quote_value
    FROM pricing_runs
    WHERE created_at >= $1 AND created_at <= $2`,
    [start_date, end_date]
  );

  // Get win/loss statistics
  const winLossStats = await db.query(
    `SELECT
      COUNT(*) FILTER (WHERE outcome = 'won') as total_won,
      COUNT(*) FILTER (WHERE outcome = 'lost') as total_lost,
      SUM(total_price) FILTER (WHERE outcome = 'won') as won_value,
      SUM(total_price) FILTER (WHERE outcome = 'lost') as lost_value
    FROM pricing_runs
    WHERE created_at >= $1 AND created_at <= $2
      AND outcome IN ('won', 'lost')`,
    [start_date, end_date]
  );

  // Get margin statistics
  const marginStats = await db.query(
    `SELECT
      AVG((unit_price - base_cost) / NULLIF(base_cost, 0)) as avg_margin,
      MIN((unit_price - base_cost) / NULLIF(base_cost, 0)) as min_margin,
      MAX((unit_price - base_cost) / NULLIF(base_cost, 0)) as max_margin
    FROM pricing_run_items pri
    JOIN pricing_runs pr ON pri.pricing_run_id = pr.id
    WHERE pr.created_at >= $1 AND pr.created_at <= $2`,
    [start_date, end_date]
  );

  // Get approval statistics
  const approvalStats = await getApprovalStatistics();

  // Get agreement statistics - split into two queries to avoid ambiguity
  const activeAgreementsResult = await db.query(
    `SELECT COUNT(*) as total_active_agreements
    FROM price_agreements
    WHERE status = 'active'`
  );

  const agreementUsageResult = await db.query(
    `SELECT
      COUNT(DISTINCT pri.pricing_run_id) FILTER (WHERE pri.pricing_method = 'agreement') as quotes_using_agreements,
      COUNT(DISTINCT pri.pricing_run_id) as total_quotes_with_items
    FROM pricing_run_items pri
    JOIN pricing_runs pr ON pri.pricing_run_id = pr.id
    WHERE pr.created_at >= $1 AND pr.created_at <= $2`,
    [start_date, end_date]
  );

  const agreementStats = {
    total_active_agreements: activeAgreementsResult.rows[0].total_active_agreements,
    quotes_using_agreements: agreementUsageResult.rows[0].quotes_using_agreements,
    total_quotes_with_items: agreementUsageResult.rows[0].total_quotes_with_items,
  };

  const quotes = quoteStats.rows[0];
  const winLoss = winLossStats.rows[0];
  const margins = marginStats.rows[0];

  const totalWon = parseInt(winLoss.total_won) || 0;
  const totalLost = parseInt(winLoss.total_lost) || 0;
  const winRate = totalWon + totalLost > 0 ? totalWon / (totalWon + totalLost) : 0;

  const quotesWithAgreements = parseInt(agreementStats.quotes_using_agreements) || 0;
  const totalQuotesWithItems = parseInt(agreementStats.total_quotes_with_items) || 0;
  const agreementUtilization = totalQuotesWithItems > 0 ? quotesWithAgreements / totalQuotesWithItems : 0;

  return {
    date_range: {
      start: start_date,
      end: end_date,
    },
    quotes: {
      total_quotes: parseInt(quotes.total_quotes) || 0,
      pending_quotes: parseInt(quotes.pending_quotes) || 0,
      approved_quotes: parseInt(quotes.approved_quotes) || 0,
      rejected_quotes: parseInt(quotes.rejected_quotes) || 0,
    },
    revenue: {
      total_value: parseFloat(quotes.total_value) || 0,
      average_quote_value: parseFloat(quotes.average_quote_value) || 0,
      currency: 'USD',
    },
    win_loss: {
      total_won: totalWon,
      total_lost: totalLost,
      win_rate: parseFloat(winRate.toFixed(2)),
      won_value: parseFloat(winLoss.won_value) || 0,
      lost_value: parseFloat(winLoss.lost_value) || 0,
    },
    margins: {
      average_margin: parseFloat(margins.avg_margin) || 0,
      min_margin: parseFloat(margins.min_margin) || 0,
      max_margin: parseFloat(margins.max_margin) || 0,
    },
    approvals: {
      pending_approvals: approvalStats.pending,
      avg_approval_time_hours: approvalStats.avg_approval_time_hours,
    },
    agreements: {
      total_active_agreements: parseInt(agreementStats.total_active_agreements) || 0,
      agreement_utilization_rate: parseFloat(agreementUtilization.toFixed(2)),
      quotes_using_agreements: quotesWithAgreements,
    },
  };
}

/**
 * Gets win/loss analysis
 * @param {Object} filters - Filter options
 * @returns {Promise<Object>} Win/loss data
 */
async function getWinLossAnalysis(filters = {}) {
  const db = await connectDb();

  const { start_date, end_date } = getDateRange(filters);
  const { client_id, group_by = 'month' } = filters;

  const conditions = ['pr.outcome IN (\'won\', \'lost\')', 'pr.won_lost_date IS NOT NULL'];
  const params = [start_date, end_date];
  let paramCount = 2;

  if (client_id) {
    paramCount++;
    conditions.push(`c.id = $${paramCount}`);
    params.push(client_id);
  }

  const whereClause = `WHERE ${conditions.join(' AND ')} AND pr.won_lost_date >= $1 AND pr.won_lost_date <= $2`;

  // Get summary
  const summary = await db.query(
    `SELECT
      COUNT(*) FILTER (WHERE pr.outcome = 'won') as total_won,
      COUNT(*) FILTER (WHERE pr.outcome = 'lost') as total_lost
    FROM pricing_runs pr
    JOIN rfqs r ON pr.rfq_id = r.id
    JOIN projects p ON r.project_id = p.id
    JOIN clients c ON p.client_id = c.id
    ${whereClause}`,
    params
  );

  const totalWon = parseInt(summary.rows[0].total_won) || 0;
  const totalLost = parseInt(summary.rows[0].total_lost) || 0;
  const winRate = totalWon + totalLost > 0 ? totalWon / (totalWon + totalLost) : 0;

  // Get by month/quarter
  let timeGrouping = 'TO_CHAR(pr.won_lost_date, \'YYYY-MM\')';
  if (group_by === 'quarter') {
    timeGrouping = 'TO_CHAR(pr.won_lost_date, \'YYYY-Q\')';
  }

  const byPeriod = await db.query(
    `SELECT
      ${timeGrouping} as period,
      COUNT(*) FILTER (WHERE pr.outcome = 'won') as won,
      COUNT(*) FILTER (WHERE pr.outcome = 'lost') as lost,
      SUM(pr.total_price) FILTER (WHERE pr.outcome = 'won') as won_value,
      SUM(pr.total_price) FILTER (WHERE pr.outcome = 'lost') as lost_value
    FROM pricing_runs pr
    JOIN rfqs r ON pr.rfq_id = r.id
    JOIN projects p ON r.project_id = p.id
    JOIN clients c ON p.client_id = c.id
    ${whereClause}
    GROUP BY period
    ORDER BY period`,
    params
  );

  // Get by client
  const byClient = await db.query(
    `SELECT
      c.id as client_id,
      c.name as client_name,
      COUNT(*) FILTER (WHERE pr.outcome = 'won') as won,
      COUNT(*) FILTER (WHERE pr.outcome = 'lost') as lost,
      SUM(pr.total_price) FILTER (WHERE pr.outcome = 'won') as won_value
    FROM pricing_runs pr
    JOIN rfqs r ON pr.rfq_id = r.id
    JOIN projects p ON r.project_id = p.id
    JOIN clients c ON p.client_id = c.id
    ${whereClause}
    GROUP BY c.id, c.name
    ORDER BY won DESC`,
    params
  );

  // Get loss reasons
  const lossReasons = await db.query(
    `SELECT
      pr.won_lost_notes as reason,
      COUNT(*) as count
    FROM pricing_runs pr
    JOIN rfqs r ON pr.rfq_id = r.id
    JOIN projects p ON r.project_id = p.id
    JOIN clients c ON p.client_id = c.id
    WHERE pr.outcome = 'lost'
      AND pr.won_lost_notes IS NOT NULL
      AND pr.won_lost_date >= $1 AND pr.won_lost_date <= $2
      ${client_id ? `AND c.id = $3` : ''}
    GROUP BY pr.won_lost_notes
    ORDER BY count DESC
    LIMIT 10`,
    params
  );

  return {
    summary: {
      total_won: totalWon,
      total_lost: totalLost,
      win_rate: parseFloat(winRate.toFixed(2)),
    },
    by_period: byPeriod.rows.map(row => ({
      [group_by === 'quarter' ? 'quarter' : 'month']: row.period,
      won: parseInt(row.won) || 0,
      lost: parseInt(row.lost) || 0,
      win_rate: parseFloat(((parseInt(row.won) || 0) / ((parseInt(row.won) || 0) + (parseInt(row.lost) || 0)) || 0).toFixed(2)),
      won_value: parseFloat(row.won_value) || 0,
      lost_value: parseFloat(row.lost_value) || 0,
    })),
    by_client: byClient.rows.map(row => ({
      client_id: row.client_id,
      client_name: row.client_name,
      won: parseInt(row.won) || 0,
      lost: parseInt(row.lost) || 0,
      win_rate: parseFloat(((parseInt(row.won) || 0) / ((parseInt(row.won) || 0) + (parseInt(row.lost) || 0)) || 0).toFixed(2)),
      won_value: parseFloat(row.won_value) || 0,
    })),
    loss_reasons: lossReasons.rows.map(row => ({
      reason: row.reason,
      count: parseInt(row.count),
      percentage: parseFloat((parseInt(row.count) / totalLost || 0).toFixed(2)),
    })),
  };
}

/**
 * Gets margin analysis
 * @param {Object} filters - Filter options
 * @returns {Promise<Object>} Margin analysis data
 */
async function getMarginAnalysis(filters = {}) {
  const db = await connectDb();

  const { start_date, end_date } = getDateRange(filters);
  const { client_id, material_id, category } = filters;

  const conditions = ['1=1'];
  const params = [start_date, end_date];
  let paramCount = 2;

  if (client_id) {
    paramCount++;
    conditions.push(`c.id = $${paramCount}`);
    params.push(client_id);
  }

  if (material_id) {
    paramCount++;
    conditions.push(`pri.material_id = $${paramCount}`);
    params.push(material_id);
  }

  if (category) {
    paramCount++;
    conditions.push(`m.category = $${paramCount}`);
    params.push(category);
  }

  const whereClause = `WHERE ${conditions.join(' AND ')} AND pr.created_at >= $1 AND pr.created_at <= $2`;

  // Overall margin
  const overall = await db.query(
    `SELECT AVG((pri.unit_price - pri.base_cost) / NULLIF(pri.base_cost, 0)) as avg_margin
    FROM pricing_run_items pri
    JOIN pricing_runs pr ON pri.pricing_run_id = pr.id
    JOIN rfqs r ON pr.rfq_id = r.id
    JOIN projects p ON r.project_id = p.id
    JOIN clients c ON p.client_id = c.id
    LEFT JOIN materials m ON pri.material_id = m.id
    ${whereClause}`,
    params
  );

  // By material
  const byMaterial = await db.query(
    `SELECT
      m.id as material_id,
      m.material_code,
      AVG((pri.unit_price - pri.base_cost) / NULLIF(pri.base_cost, 0)) as avg_margin,
      COUNT(DISTINCT pr.id) as quote_count,
      SUM(pri.total_price) as total_value
    FROM pricing_run_items pri
    JOIN pricing_runs pr ON pri.pricing_run_id = pr.id
    JOIN rfqs r ON pr.rfq_id = r.id
    JOIN projects p ON r.project_id = p.id
    JOIN clients c ON p.client_id = c.id
    LEFT JOIN materials m ON pri.material_id = m.id
    ${whereClause}
    GROUP BY m.id, m.material_code
    ORDER BY quote_count DESC
    LIMIT 20`,
    params
  );

  // By category
  const byCategory = await db.query(
    `SELECT
      m.category,
      AVG((pri.unit_price - pri.base_cost) / NULLIF(pri.base_cost, 0)) as avg_margin,
      COUNT(DISTINCT pr.id) as quote_count
    FROM pricing_run_items pri
    JOIN pricing_runs pr ON pri.pricing_run_id = pr.id
    JOIN rfqs r ON pr.rfq_id = r.id
    JOIN projects p ON r.project_id = p.id
    JOIN clients c ON p.client_id = c.id
    LEFT JOIN materials m ON pri.material_id = m.id
    ${whereClause}
    GROUP BY m.category
    ORDER BY quote_count DESC`,
    params
  );

  // By client
  const byClient = await db.query(
    `SELECT
      c.id as client_id,
      c.name as client_name,
      AVG((pri.unit_price - pri.base_cost) / NULLIF(pri.base_cost, 0)) as avg_margin,
      COUNT(DISTINCT pr.id) as quote_count,
      SUM(pri.total_price) as total_value
    FROM pricing_run_items pri
    JOIN pricing_runs pr ON pri.pricing_run_id = pr.id
    JOIN rfqs r ON pr.rfq_id = r.id
    JOIN projects p ON r.project_id = p.id
    JOIN clients c ON p.client_id = c.id
    LEFT JOIN materials m ON pri.material_id = m.id
    ${whereClause}
    GROUP BY c.id, c.name
    ORDER BY total_value DESC`,
    params
  );

  // Margin distribution
  const distribution = await db.query(
    `SELECT
      CASE
        WHEN margin < 0.10 THEN '0-10%'
        WHEN margin < 0.15 THEN '10-15%'
        WHEN margin < 0.20 THEN '15-20%'
        WHEN margin < 0.25 THEN '20-25%'
        WHEN margin < 0.30 THEN '25-30%'
        ELSE '30%+'
      END as range,
      COUNT(*) as count
    FROM (
      SELECT (pri.unit_price - pri.base_cost) / NULLIF(pri.base_cost, 0) as margin
      FROM pricing_run_items pri
      JOIN pricing_runs pr ON pri.pricing_run_id = pr.id
      JOIN rfqs r ON pr.rfq_id = r.id
      JOIN projects p ON r.project_id = p.id
      JOIN clients c ON p.client_id = c.id
      LEFT JOIN materials m ON pri.material_id = m.id
      ${whereClause}
    ) margins
    GROUP BY range
    ORDER BY range`,
    params
  );

  return {
    overall_margin: parseFloat(overall.rows[0]?.avg_margin) || 0,
    by_material: byMaterial.rows.map(row => ({
      material_id: row.material_id,
      material_code: row.material_code,
      avg_margin: parseFloat(row.avg_margin) || 0,
      quote_count: parseInt(row.quote_count),
      total_value: parseFloat(row.total_value) || 0,
    })),
    by_category: byCategory.rows.map(row => ({
      category: row.category,
      avg_margin: parseFloat(row.avg_margin) || 0,
      quote_count: parseInt(row.quote_count),
    })),
    by_client: byClient.rows.map(row => ({
      client_id: row.client_id,
      client_name: row.client_name,
      avg_margin: parseFloat(row.avg_margin) || 0,
      quote_count: parseInt(row.quote_count),
      total_value: parseFloat(row.total_value) || 0,
    })),
    margin_distribution: distribution.rows.reduce((acc, row) => {
      acc[row.range] = parseInt(row.count);
      return acc;
    }, {}),
  };
}

/**
 * Gets agreement utilization metrics
 * @param {Object} filters - Filter options
 * @returns {Promise<Object>} Agreement utilization data
 */
async function getAgreementUtilization(filters = {}) {
  const db = await connectDb();

  const { start_date, end_date } = getDateRange(filters);
  const { client_id } = filters;

  const conditions = ['1=1'];
  const params = [start_date, end_date];
  let paramCount = 2;

  if (client_id) {
    paramCount++;
    conditions.push(`c.id = $${paramCount}`);
    params.push(client_id);
  }

  const whereClause = `WHERE ${conditions.join(' AND ')} AND pr.created_at >= $1 AND pr.created_at <= $2`;

  // Overall utilization
  const overall = await db.query(
    `SELECT
      COUNT(DISTINCT pr.id) as total_quotes,
      COUNT(DISTINCT CASE WHEN pri.pricing_method = 'agreement' THEN pr.id END) as quotes_using_agreements,
      COUNT(DISTINCT CASE WHEN pri.pricing_method = 'rule_based' THEN pr.id END) as quotes_using_rules
    FROM pricing_runs pr
    JOIN rfqs r ON pr.rfq_id = r.id
    JOIN projects p ON r.project_id = p.id
    JOIN clients c ON p.client_id = c.id
    JOIN pricing_run_items pri ON pr.id = pri.pricing_run_id
    ${whereClause}`,
    params
  );

  const totalQuotes = parseInt(overall.rows[0].total_quotes) || 0;
  const quotesUsingAgreements = parseInt(overall.rows[0].quotes_using_agreements) || 0;
  const quotesUsingRules = parseInt(overall.rows[0].quotes_using_rules) || 0;

  // By agreement
  const byAgreement = await db.query(
    `SELECT
      pa.id as agreement_id,
      c.name as client_name,
      COALESCE(m.material_code, pa.category) as item,
      COUNT(DISTINCT pri.pricing_run_id) as times_used,
      SUM(pri.total_price) as total_value,
      AVG(pa.base_price - pri.base_cost) / NULLIF(AVG(pri.base_cost), 0) as avg_discount_vs_rule
    FROM price_agreements pa
    JOIN clients c ON pa.client_id = c.id
    LEFT JOIN materials m ON pa.material_id = m.id
    LEFT JOIN pricing_run_items pri ON pri.price_agreement_id = pa.id
    LEFT JOIN pricing_runs pr ON pri.pricing_run_id = pr.id
    WHERE pr.created_at >= $1 AND pr.created_at <= $2
      ${client_id ? `AND c.id = $${paramCount}` : ''}
    GROUP BY pa.id, c.name, m.material_code, pa.category
    HAVING COUNT(DISTINCT pri.pricing_run_id) > 0
    ORDER BY times_used DESC`,
    params
  );

  return {
    overall_utilization: totalQuotes > 0 ? parseFloat((quotesUsingAgreements / totalQuotes).toFixed(2)) : 0,
    total_quotes: totalQuotes,
    quotes_using_agreements: quotesUsingAgreements,
    quotes_using_rules: quotesUsingRules,
    by_agreement: byAgreement.rows.map(row => ({
      agreement_id: row.agreement_id,
      client_name: row.client_name,
      item: row.item,
      times_used: parseInt(row.times_used),
      total_value: parseFloat(row.total_value) || 0,
      avg_discount_vs_rule: parseFloat(row.avg_discount_vs_rule) || 0,
    })),
  };
}

/**
 * Helper function to get date range with defaults
 * @param {Object} filters - Date range filters
 * @returns {Object} Start and end dates
 */
function getDateRange(filters) {
  const end_date = filters.end_date || new Date().toISOString().split('T')[0];
  const start_date = filters.start_date || getDefaultStartDate();

  return { start_date, end_date };
}

/**
 * Gets default start date (90 days ago)
 * @returns {string} ISO date string
 */
function getDefaultStartDate() {
  const date = new Date();
  date.setDate(date.getDate() - 90);
  return date.toISOString().split('T')[0];
}

module.exports = {
  getDashboardMetrics,
  getWinLossAnalysis,
  getMarginAnalysis,
  getAgreementUtilization,
};
