const { withTenantContext } = require('../db/tenantContext');
const { getApprovalStatistics } = require('./approvalService');

/**
 * Analytics Service
 * Provides business intelligence and metrics for pricing runs
 * All functions require tenantId to ensure proper data isolation
 */

/**
 * Gets dashboard-level metrics
 * @param {string} tenantId - Tenant UUID (required)
 * @param {Object} dateRange - Start and end dates
 * @returns {Promise<Object>} Dashboard metrics with data_mode indicator
 */
async function getDashboardMetrics(tenantId, dateRange = {}) {
  if (!tenantId || tenantId === '' || typeof tenantId !== 'string') {
    throw new Error('tenantId is required and must be a valid UUID string');
  }
  
  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(tenantId)) {
    throw new Error(`Invalid tenantId format: "${tenantId}". Expected a valid UUID.`);
  }

  const { start_date, end_date } = getDateRange(dateRange);

  // Debug logging
  console.log('[ANALYTICS] getDashboardMetrics called:', {
    tenantId,
    start_date,
    end_date,
    dateRange,
    params_for_query: [tenantId, start_date, end_date]
  });

  // Use tenant context to ensure RLS policies are applied
  return await withTenantContext(tenantId, async (client) => {
    // Get quote statistics within the date range
    // Count from pricing_runs table where is_current=true to show only current quotes
    // Use date casting to ensure we match dates correctly (created_at is timestamp, start_date/end_date are dates)
    const quoteStats = await client.query(
    `SELECT
      COUNT(DISTINCT r.id) as total_quotes,
      COUNT(*) FILTER (WHERE pr.approval_status = 'pending_approval' AND pr.is_current = true) as pending_quotes,
      COUNT(*) FILTER (WHERE pr.approval_status = 'approved' AND pr.is_current = true) as approved_quotes,
      COUNT(*) FILTER (WHERE pr.approval_status = 'rejected' AND pr.is_current = true) as rejected_quotes,
      COALESCE(SUM(pr.total_price) FILTER (WHERE pr.is_current = true), 0) as total_value,
      COALESCE(AVG(pr.total_price) FILTER (WHERE pr.is_current = true), 0) as average_quote_value
    FROM rfqs r
    LEFT JOIN pricing_runs pr ON r.id = pr.rfq_id
    WHERE r.tenant_id = $1::uuid AND r.created_at::date >= $2::date AND r.created_at::date <= $3::date`,
    [tenantId, start_date, end_date]
  );
  
    console.log('[ANALYTICS] Query result:', {
      total_quotes: quoteStats.rows[0].total_quotes,
      pending: quoteStats.rows[0].pending_quotes,
      approved: quoteStats.rows[0].approved_quotes
    });
    
    // Also check if tenant has ANY RFQs (to avoid demo mode when data exists but outside date range)
    const anyRfqsCheck = await client.query(
      `SELECT COUNT(*) as total FROM rfqs WHERE tenant_id = $1::uuid`,
      [tenantId]
    );
    const hasAnyRuns = parseInt(anyRfqsCheck.rows[0]?.total || 0) > 0;

    // Determine if we have real data based on the actual query results
    const totalQuotesInRange = parseInt(quoteStats.rows[0].total_quotes) || 0;
    // Treat tenants with any real data as "real" mode so demo tenants like MetaSteel surface seeded quotes
    // Use hasAnyRuns to avoid demo mode when data exists but is outside the date range
    const hasRealData = totalQuotesInRange > 0 || hasAnyRuns;
    const data_mode = hasRealData ? 'real' : 'demo';

    // Get win/loss statistics
    // Note: 'outcome' column doesn't exist yet in pricing_runs table
    // Return zero values until the column is added via migration
    const winLossStats = {
      rows: [{
        total_won: 0,
        total_lost: 0,
        won_value: 0,
        lost_value: 0
      }]
    };

    // Get margin statistics
    const marginStats = await client.query(
    `SELECT
      AVG((unit_price - unit_cost) / NULLIF(unit_cost, 0)) as avg_margin,
      MIN((unit_price - unit_cost) / NULLIF(unit_cost, 0)) as min_margin,
      MAX((unit_price - unit_cost) / NULLIF(unit_cost, 0)) as max_margin
    FROM pricing_run_items pri
    JOIN pricing_runs pr ON pri.pricing_run_id = pr.id
    WHERE pr.tenant_id = $1::uuid AND pr.created_at::date >= $2::date AND pr.created_at::date <= $3::date`,
    [tenantId, start_date, end_date]
  );

    // Get approval statistics (with tenantId)
    const approvalStats = await getApprovalStatistics(tenantId);

    // Get agreement statistics - split into two queries to avoid ambiguity
    const activeAgreementsResult = await client.query(
      `SELECT COUNT(*) as total_active_agreements
      FROM price_agreements
      WHERE tenant_id = $1 AND status = 'active'`,
      [tenantId]
    );

    // Note: pricing_method column doesn't exist in pricing_run_items yet
    // Return 0 for now until the feature is implemented
    const agreementStats = {
      total_active_agreements: activeAgreementsResult.rows[0].total_active_agreements,
      quotes_using_agreements: 0,
      total_quotes_with_items: 0,
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

      // Get revenue time series data (last 6 months)
    // Ensure end_date is valid, fallback to current date
    // getDateRange already validates dates, but double-check here
    let endDateObj;
    try {
      endDateObj = new Date(end_date);
      if (isNaN(endDateObj.getTime())) {
        throw new Error(`Invalid end_date: ${end_date}`);
      }
    } catch (error) {
      console.error('[Analytics] Invalid end_date, using current date:', error);
      endDateObj = new Date();
    }
    
    const sixMonthsAgo = new Date(endDateObj);
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  
  // Validate before calling split
  const sixMonthsAgoISO = sixMonthsAgo.toISOString();
  const endDateISO = endDateObj.toISOString();
  
  if (!sixMonthsAgoISO || !endDateISO) {
    throw new Error('Failed to generate ISO date strings');
  }
  
  const sixMonthsAgoStr = sixMonthsAgoISO.split('T')[0];
  const endDateStr = endDateISO.split('T')[0];

    const revenueTimeSeries = await client.query(
      `SELECT
        TO_CHAR(created_at, 'Mon') as month,
        TO_CHAR(created_at, 'YYYY-MM') as month_key,
      SUM(total_price) as revenue
    FROM pricing_runs
    WHERE tenant_id = $1::uuid AND created_at::date >= $2::date AND created_at::date <= $3::date
    GROUP BY TO_CHAR(created_at, 'Mon'), TO_CHAR(created_at, 'YYYY-MM')
    ORDER BY month_key`,
    [tenantId, sixMonthsAgoStr, endDateStr]
  );

  // Get previous period data for trend calculations
  // Ensure start_date is valid before creating Date objects
  // getDateRange already validates dates, but double-check here
  let startDateObj;
  try {
    startDateObj = new Date(start_date);
    if (isNaN(startDateObj.getTime())) {
      throw new Error(`Invalid start_date: ${start_date}`);
    }
  } catch (error) {
    console.error('[Analytics] Invalid start_date, using default:', error);
    startDateObj = new Date();
    startDateObj.setDate(startDateObj.getDate() - 90);
  }
  
  const prevPeriodStart = new Date(startDateObj);
  prevPeriodStart.setMonth(prevPeriodStart.getMonth() - 1);
  const prevPeriodEnd = new Date(startDateObj);
  
  // Validate before calling split
  const prevPeriodStartISO = prevPeriodStart.toISOString();
  const prevPeriodEndISO = prevPeriodEnd.toISOString();
  
  if (!prevPeriodStartISO || !prevPeriodEndISO) {
    throw new Error('Failed to generate ISO date strings for previous period');
  }
  
  const prevPeriodStartStr = prevPeriodStartISO.split('T')[0];
  const prevPeriodEndStr = prevPeriodEndISO.split('T')[0];

    const prevPeriodStats = await client.query(
      `SELECT
        COUNT(*) as total_quotes,
        SUM(total_price) as total_value
    FROM pricing_runs
    WHERE tenant_id = $1::uuid AND created_at::date >= $2::date AND created_at::date < $3::date`,
    [tenantId, prevPeriodStartStr, prevPeriodEndStr]
  );

    const currentTotalQuotes = parseInt(quotes.total_quotes) || 0;
    const currentTotalValue = parseFloat(quotes.total_value) || 0;
    const prevTotalQuotes = parseInt(prevPeriodStats.rows[0]?.total_quotes) || 0;
    const prevTotalValue = parseFloat(prevPeriodStats.rows[0]?.total_value) || 0;

    // Calculate percentage changes
    const quotesChangePercent = prevTotalQuotes > 0 
      ? ((currentTotalQuotes - prevTotalQuotes) / prevTotalQuotes) * 100 
      : 0;
    const revenueChangePercent = prevTotalValue > 0 
      ? ((currentTotalValue - prevTotalValue) / prevTotalValue) * 100 
      : 0;
    const approvedChangePercent = prevTotalQuotes > 0
      ? ((parseInt(quotes.approved_quotes) || 0) - (prevTotalQuotes * 0.6)) / (prevTotalQuotes * 0.6) * 100
      : 0;
    const pendingChangePercent = prevTotalQuotes > 0
      ? ((parseInt(quotes.pending_quotes) || 0) - (prevTotalQuotes * 0.2)) / (prevTotalQuotes * 0.2) * 100
      : 0;

    // Build time series data
    const timeSeriesData = revenueTimeSeries.rows.map(row => ({
      month: row.month,
      revenue: parseFloat(row.revenue) || 0,
    }));

    // If no real data, return demo mode with demo values
    if (!hasRealData) {
      return {
        data_mode: 'demo',
        date_range: {
          start: start_date,
          end: end_date,
        },
        quotes: {
          total_quotes: 0,
          pending_quotes: 0,
          approved_quotes: 0,
          rejected_quotes: 0,
        },
        revenue: {
          total_value: 0,
          average_quote_value: 0,
          currency: 'USD',
        },
        win_loss: {
          total_won: 0,
          total_lost: 0,
          win_rate: 0,
          won_value: 0,
          lost_value: 0,
        },
        margins: {
          average_margin: 0,
          min_margin: 0,
          max_margin: 0,
        },
        approvals: {
          pending_approvals: approvalStats.pending || 0,
          avg_approval_time_hours: approvalStats.avg_approval_time_hours || 0,
        },
        agreements: {
          total_active_agreements: 0,
          agreement_utilization_rate: 0,
          quotes_using_agreements: 0,
        },
        trends: {
          quotes_change_percent: 12.0,
          revenue_change_percent: 8.5,
          approved_change_percent: 15.0,
          pending_change_percent: -8.0,
        },
        revenue_time_series: [
          { month: 'May', revenue: 3200000 },
          { month: 'Jun', revenue: 3600000 },
          { month: 'Jul', revenue: 3400000 },
          { month: 'Aug', revenue: 3900000 },
          { month: 'Sep', revenue: 4100000 },
          { month: 'Oct', revenue: 3800000 },
          { month: 'Nov', revenue: 4250000 },
        ],
      };
    }

    return {
      data_mode: 'real',
      date_range: {
        start: start_date,
        end: end_date,
      },
      quotes: {
        total_quotes: currentTotalQuotes,
        pending_quotes: parseInt(quotes.pending_quotes) || 0,
        approved_quotes: parseInt(quotes.approved_quotes) || 0,
        rejected_quotes: parseInt(quotes.rejected_quotes) || 0,
      },
      revenue: {
        total_value: currentTotalValue,
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
      trends: {
        quotes_change_percent: parseFloat(quotesChangePercent.toFixed(1)),
        revenue_change_percent: parseFloat(revenueChangePercent.toFixed(1)),
        approved_change_percent: parseFloat(approvedChangePercent.toFixed(1)),
        pending_change_percent: parseFloat(pendingChangePercent.toFixed(1)),
      },
      revenue_time_series: timeSeriesData.length > 0 ? timeSeriesData : [
        { month: 'May', revenue: 0 },
        { month: 'Jun', revenue: 0 },
        { month: 'Jul', revenue: 0 },
        { month: 'Aug', revenue: 0 },
        { month: 'Sep', revenue: 0 },
        { month: 'Oct', revenue: 0 },
        { month: 'Nov', revenue: 0 },
      ],
    };
  });
}

/**
 * Gets win/loss analysis
 * @param {string} tenantId - Tenant UUID (required)
 * @param {Object} filters - Filter options
 * @returns {Promise<Object>} Win/loss data
 */
async function getWinLossAnalysis(tenantId, filters = {}) {
  if (!tenantId) {
    throw new Error('tenantId is required');
  }

  // Note: 'outcome' and 'won_lost_date' columns don't exist yet in pricing_runs table
  // Return empty/zero data until these columns are added via migration
  return {
    summary: {
      total_won: 0,
      total_lost: 0,
      win_rate: 0,
    },
    by_period: [],
    by_client: [],
    loss_reasons: [],
  };

  /* Original code commented out until outcome column is added:
  const db = await withTenantContext(tenantId, async (client) => client);

  const { start_date, end_date } = getDateRange(filters);
  const { client_id, group_by = 'month' } = filters;
  const conditions = ['pr.tenant_id = $1', 'pr.outcome IN (\'won\', \'lost\')', 'pr.won_lost_date IS NOT NULL'];
  const params = [tenantId, start_date, end_date];
  let paramCount = 3;

  if (client_id) {
    paramCount++;
    conditions.push(`c.id = $${paramCount}`);
    params.push(client_id);
  }

  const whereClause = `WHERE ${conditions.join(' AND ')} AND pr.won_lost_date >= $2 AND pr.won_lost_date <= $3`;

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
  const lossParams = [tenantId, start_date, end_date];
  if (client_id) {
    lossParams.push(client_id);
  }
  const lossReasons = await db.query(
    `SELECT
      pr.won_lost_notes as reason,
      COUNT(*) as count
    FROM pricing_runs pr
    JOIN rfqs r ON pr.rfq_id = r.id
    JOIN projects p ON r.project_id = p.id
    JOIN clients c ON p.client_id = c.id
    WHERE pr.tenant_id = $1
      AND pr.outcome = 'lost'
      AND pr.won_lost_notes IS NOT NULL
      AND pr.won_lost_date >= $2 AND pr.won_lost_date <= $3
      ${client_id ? `AND c.id = $4` : ''}
    GROUP BY pr.won_lost_notes
    ORDER BY count DESC
    LIMIT 10`,
    lossParams
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
  */
}

/**
 * Gets margin analysis
 * @param {string} tenantId - Tenant UUID (required)
 * @param {Object} filters - Filter options
 * @returns {Promise<Object>} Margin analysis data
 */
async function getMarginAnalysis(tenantId, filters = {}) {
  if (!tenantId) {
    throw new Error('tenantId is required');
  }

  const { start_date, end_date } = getDateRange(filters);
  const { client_id, material_id, category } = filters;

  const conditions = ['pr.tenant_id = $1'];
  const params = [tenantId, start_date, end_date];
  let paramCount = 3;

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

  const whereClause = `WHERE ${conditions.join(' AND ')} AND pr.created_at >= $2 AND pr.created_at <= $3`;

  // Overall margin
  return await withTenantContext(tenantId, async (db) => {
    const overall = await db.query(
      `SELECT AVG((pri.unit_price - pri.unit_cost) / NULLIF(pri.unit_cost, 0)) as avg_margin
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
        AVG((pri.unit_price - pri.unit_cost) / NULLIF(pri.unit_cost, 0)) as avg_margin,
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
        AVG((pri.unit_price - pri.unit_cost) / NULLIF(pri.unit_cost, 0)) as avg_margin,
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
        AVG((pri.unit_price - pri.unit_cost) / NULLIF(pri.unit_cost, 0)) as avg_margin,
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
        SELECT (pri.unit_price - pri.unit_cost) / NULLIF(pri.unit_cost, 0) as margin
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
  });
}

/**
 * Helper function to get date range with defaults
 * @param {Object} filters - Date range filters
 * @returns {Object} Start and end dates
 */
function getDateRange(filters) {
  // Handle both camelCase and snake_case, and ensure filters is an object
  const filtersObj = filters || {};
  
  // Ensure end_date is always a valid date string
  let end_date = filtersObj.end_date || filtersObj.endDate;
  if (!end_date) {
    end_date = new Date().toISOString().split('T')[0];
  } else {
    // Validate the date string
    const testDate = new Date(end_date);
    if (isNaN(testDate.getTime())) {
      console.warn(`[Analytics] Invalid end_date provided: ${end_date}, using current date`);
      end_date = new Date().toISOString().split('T')[0];
    } else {
      end_date = testDate.toISOString().split('T')[0];
    }
  }
  
  // Ensure start_date is always a valid date string
  let start_date = filtersObj.start_date || filtersObj.startDate;
  if (!start_date) {
    start_date = getDefaultStartDate();
  } else {
    // Validate the date string
    const testDate = new Date(start_date);
    if (isNaN(testDate.getTime())) {
      console.warn(`[Analytics] Invalid start_date provided: ${start_date}, using default`);
      start_date = getDefaultStartDate();
    } else {
      start_date = testDate.toISOString().split('T')[0];
    }
  }

  // Final validation - ensure both are valid strings
  if (!start_date || typeof start_date !== 'string' || !start_date.match(/^\d{4}-\d{2}-\d{2}$/)) {
    console.error('[Analytics] start_date validation failed, using default');
    start_date = getDefaultStartDate();
  }
  
  if (!end_date || typeof end_date !== 'string' || !end_date.match(/^\d{4}-\d{2}-\d{2}$/)) {
    console.error('[Analytics] end_date validation failed, using current date');
    end_date = new Date().toISOString().split('T')[0];
  }

  return { start_date, end_date };
}

/**
 * Gets default start date (90 days ago)
 * @returns {string} ISO date string (YYYY-MM-DD)
 */
function getDefaultStartDate() {
  try {
    const date = new Date();
    date.setDate(date.getDate() - 90);
    const dateStr = date.toISOString().split('T')[0];
    
    // Validate the result
    if (!dateStr || typeof dateStr !== 'string' || !dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
      throw new Error('Invalid date string generated');
    }
    
    return dateStr;
  } catch (error) {
    console.error('[Analytics] Error generating default start date:', error);
    // Fallback to a safe default
    const fallbackDate = new Date();
    fallbackDate.setDate(fallbackDate.getDate() - 90);
    return fallbackDate.toISOString().split('T')[0];
  }
}

/**
 * Gets a tenant snapshot for the AI Assistant
 * This provides a consistent view of tenant data that matches the dashboard
 * @param {string} tenantId - Tenant UUID (required)
 * @param {Object} dateRange - Start and end dates (optional)
 * @returns {Promise<Object>} Tenant snapshot with all key metrics
 */
async function getTenantSnapshot(tenantId, dateRange = {}) {
  if (!tenantId) {
    throw new Error('tenantId is required');
  }

  const metrics = await getDashboardMetrics(tenantId, dateRange);

  return {
    data_mode: metrics.data_mode,
    date_range: metrics.date_range,
    quotes: metrics.quotes || {
      total_quotes: 0,
      pending_quotes: 0,
      approved_quotes: 0,
      rejected_quotes: 0
    },
    approvals: metrics.approvals || {
      pending_approvals: 0,
      avg_approval_time_hours: 0
    },
    agreements: metrics.agreements || {
      total_active_agreements: 0,
      agreement_utilization_rate: 0,
      quotes_using_agreements: 0
    },
    margins: metrics.margins || {
      average_margin: 0,
      min_margin: 0,
      max_margin: 0
    },
    revenue: metrics.revenue || {
      total_value: 0,
      average_quote_value: 0,
      currency: 'USD'
    },
    trends: metrics.trends || {
      quotes_change_percent: 0,
      revenue_change_percent: 0,
      approved_change_percent: 0,
      pending_change_percent: 0
    },
    revenue_time_series: metrics.revenue_time_series || []
  };
}

module.exports = {
  getDashboardMetrics,
  getWinLossAnalysis,
  getMarginAnalysis,
  getTenantSnapshot
};
