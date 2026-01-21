const { connectDb } = require('../db/supabaseClient');

/**
 * Risk Calculation Utilities
 * Calculate various risk factors for pricing run approval automation
 */

/**
 * Calculate margin deviation from client's historical average
 * @param {Object} pricingRun - Current pricing run with items
 * @param {string} clientId - Client UUID
 * @returns {Promise<Object>} Deviation analysis
 */
async function calculateMarginDeviation(pricingRun, clientId) {
  const db = await connectDb();

  // Calculate current pricing run average margin
  const currentMarginPct = calculateAverageMargin(pricingRun.items);

  // Get client's historical average margin from approved quotes
  const historyResult = await db.query(
    `SELECT
      AVG((pri.unit_price - pri.base_cost) / NULLIF(pri.base_cost, 0) * 100) as avg_margin_pct,
      COUNT(DISTINCT pr.id) as quote_count
    FROM pricing_runs pr
    JOIN pricing_run_items pri ON pr.id = pri.pricing_run_id
    JOIN rfqs r ON pr.rfq_id = r.id
    JOIN projects p ON r.project_id = p.id
    WHERE p.client_id = $1
      AND pr.approval_status IN ('approved', 'sent_to_client')
      AND pr.created_at >= NOW() - INTERVAL '12 months'`,
    [clientId]
  );

  const historicalMarginPct = parseFloat(historyResult.rows[0]?.avg_margin_pct) || null;
  const historicalQuoteCount = parseInt(historyResult.rows[0]?.quote_count) || 0;

  let deviation = 0;
  let deviationScore = 0; // 0-100, higher = more risky

  if (historicalMarginPct !== null && historicalQuoteCount >= 3) {
    deviation = currentMarginPct - historicalMarginPct;

    // Score based on absolute deviation
    // 0% deviation = 0 score, 10%+ deviation = 100 score
    deviationScore = Math.min(Math.abs(deviation) * 10, 100);
  } else {
    // New client or insufficient history - moderate risk
    deviationScore = 40;
  }

  return {
    current_margin_pct: currentMarginPct,
    historical_margin_pct: historicalMarginPct,
    deviation_pct: deviation,
    deviation_score: deviationScore,
    historical_quote_count: historicalQuoteCount,
    has_sufficient_history: historicalQuoteCount >= 3
  };
}

/**
 * Assess client credit and payment risk
 * @param {string} clientId - Client UUID
 * @returns {Promise<Object>} Credit risk assessment
 */
async function assessClientCreditRisk(clientId) {
  const db = await connectDb();

  // Get client information
  const clientResult = await db.query(
    `SELECT
      payment_terms,
      lifetime_value,
      created_at,
      notes
    FROM clients
    WHERE id = $1`,
    [clientId]
  );

  if (clientResult.rows.length === 0) {
    return {
      credit_score: 50,
      risk_factors: ['Client not found'],
      client_age_months: 0
    };
  }

  const client = clientResult.rows[0];

  // Calculate client age in months
  const clientAge = new Date() - new Date(client.created_at);
  const clientAgeMonths = Math.floor(clientAge / (1000 * 60 * 60 * 24 * 30));

  // Get client's approval/rejection history
  const historyResult = await db.query(
    `SELECT
      COUNT(*) FILTER (WHERE pr.approval_status = 'approved') as approved_count,
      COUNT(*) FILTER (WHERE pr.approval_status = 'rejected') as rejected_count,
      COUNT(*) FILTER (WHERE pr.approval_status = 'sent_to_client') as sent_count
    FROM pricing_runs pr
    JOIN rfqs r ON pr.rfq_id = r.id
    JOIN projects p ON r.project_id = p.id
    WHERE p.client_id = $1`,
    [clientId]
  );

  const approvedCount = parseInt(historyResult.rows[0]?.approved_count) || 0;
  const rejectedCount = parseInt(historyResult.rows[0]?.rejected_count) || 0;
  const sentCount = parseInt(historyResult.rows[0]?.sent_count) || 0;
  const totalQuotes = approvedCount + rejectedCount + sentCount;

  // Calculate credit score (0-100, lower = higher risk)
  let creditScore = 70; // Start with moderate score
  const riskFactors = [];

  // Positive factors
  if (clientAgeMonths > 12) creditScore += 10;
  else if (clientAgeMonths < 3) {
    creditScore -= 10;
    riskFactors.push('New client (< 3 months)');
  }

  if (client.lifetime_value && parseFloat(client.lifetime_value) > 100000) {
    creditScore += 15;
  } else if (!client.lifetime_value || parseFloat(client.lifetime_value) < 10000) {
    creditScore -= 10;
    riskFactors.push('Low lifetime value');
  }

  if (totalQuotes >= 5) {
    const approvalRate = approvedCount / totalQuotes;
    if (approvalRate > 0.8) creditScore += 10;
    else if (approvalRate < 0.5) {
      creditScore -= 15;
      riskFactors.push(`Low approval rate (${Math.round(approvalRate * 100)}%)`);
    }
  } else {
    riskFactors.push('Limited quote history');
  }

  // Payment terms risk
  if (client.payment_terms && client.payment_terms.includes('NET90')) {
    creditScore -= 5;
    riskFactors.push('Extended payment terms (NET90)');
  }

  // Clamp score between 0-100
  creditScore = Math.max(0, Math.min(100, creditScore));

  // Invert to risk score (higher = more risky)
  const riskScore = 100 - creditScore;

  return {
    credit_score: creditScore,
    risk_score: riskScore,
    risk_factors: riskFactors,
    client_age_months: clientAgeMonths,
    total_quotes: totalQuotes,
    approval_rate: totalQuotes > 0 ? approvedCount / totalQuotes : null,
    lifetime_value: client.lifetime_value ? parseFloat(client.lifetime_value) : 0
  };
}

/**
 * Detect pricing anomalies in the quote
 * @param {Object} pricingRun - Pricing run with items
 * @returns {Object} Anomaly detection results
 */
function detectPricingAnomalies(pricingRun) {
  const items = pricingRun.items || [];
  const anomalies = [];
  let anomalyScore = 0;

  if (items.length === 0) {
    anomalies.push('No items in pricing run');
    return { anomalies, anomaly_score: 100 };
  }

  // Check for extremely high or low margins
  items.forEach((item, index) => {
    const marginPct = calculateItemMargin(item);

    if (marginPct < 0) {
      anomalies.push(`Item #${index + 1}: Negative margin (${marginPct.toFixed(1)}%)`);
      anomalyScore += 30;
    } else if (marginPct < 5) {
      anomalies.push(`Item #${index + 1}: Very low margin (${marginPct.toFixed(1)}%)`);
      anomalyScore += 15;
    } else if (marginPct > 50) {
      anomalies.push(`Item #${index + 1}: Very high margin (${marginPct.toFixed(1)}%)`);
      anomalyScore += 20;
    }

    // Check for unusually high unit prices
    if (item.unit_price > 50000) {
      anomalies.push(`Item #${index + 1}: High unit price ($${item.unit_price.toLocaleString()})`);
      anomalyScore += 10;
    }

    // Check for missing or zero costs
    if (!item.base_cost || item.base_cost === 0) {
      anomalies.push(`Item #${index + 1}: Missing base cost`);
      anomalyScore += 25;
    }
  });

  // Check for total quote size anomalies
  const totalPrice = parseFloat(pricingRun.total_price) || 0;
  if (totalPrice > 500000) {
    anomalies.push(`Large quote value ($${totalPrice.toLocaleString()})`);
    anomalyScore += 15;
  } else if (totalPrice < 1000) {
    anomalies.push(`Very small quote value ($${totalPrice.toLocaleString()})`);
    anomalyScore += 10;
  }

  // Check for margin variance (inconsistent pricing)
  const margins = items.map(item => calculateItemMargin(item));
  const avgMargin = margins.reduce((sum, m) => sum + m, 0) / margins.length;
  const variance = margins.reduce((sum, m) => sum + Math.pow(m - avgMargin, 2), 0) / margins.length;
  const stdDev = Math.sqrt(variance);

  if (stdDev > 15) {
    anomalies.push(`High margin variance (σ=${stdDev.toFixed(1)}%)`);
    anomalyScore += 10;
  }

  // Cap score at 100
  anomalyScore = Math.min(anomalyScore, 100);

  return {
    anomalies,
    anomaly_score: anomalyScore,
    has_anomalies: anomalies.length > 0
  };
}

/**
 * Check material availability and lead times
 * @param {Array} items - Pricing run items
 * @returns {Promise<Object>} Availability assessment
 */
async function checkMaterialAvailability(items) {
  // Placeholder: In a real system, this would check inventory levels,
  // supplier lead times, and material availability

  const availabilityIssues = [];
  let availabilityScore = 0;

  // Simple heuristic: Check if items have material codes
  items.forEach((item, index) => {
    if (!item.material_code) {
      availabilityIssues.push(`Item #${index + 1}: No material code specified`);
      availabilityScore += 15;
    }
  });

  // In future: Check inventory table, supplier lead times, etc.
  // For now, assume materials are generally available
  availabilityScore = Math.min(availabilityScore, 100);

  return {
    availability_issues: availabilityIssues,
    availability_score: availabilityScore,
    has_availability_issues: availabilityIssues.length > 0
  };
}

/**
 * Calculate overall risk score from all factors
 * @param {Object} factors - All risk factor results
 * @returns {Object} Overall risk assessment
 */
function calculateOverallRisk(factors) {
  const {
    marginDeviation,
    creditRisk,
    anomalies,
    availability
  } = factors;

  // Weighted average of risk factors
  const weights = {
    margin: 0.30,
    credit: 0.25,
    anomaly: 0.35,
    availability: 0.10
  };

  const overallScore =
    (marginDeviation.deviation_score * weights.margin) +
    (creditRisk.risk_score * weights.credit) +
    (anomalies.anomaly_score * weights.anomaly) +
    (availability.availability_score * weights.availability);

  // Determine risk level
  let riskLevel;
  if (overallScore < 30) {
    riskLevel = 'LOW';
  } else if (overallScore < 60) {
    riskLevel = 'MEDIUM';
  } else {
    riskLevel = 'HIGH';
  }

  // Auto-approve eligibility (LOW risk + score < 30)
  const autoApproveEligible = riskLevel === 'LOW' && overallScore < 30;

  return {
    overall_score: Math.round(overallScore),
    risk_level: riskLevel,
    auto_approve_eligible: autoApproveEligible,
    contributing_factors: {
      margin_deviation: Math.round(marginDeviation.deviation_score * weights.margin),
      credit_risk: Math.round(creditRisk.risk_score * weights.credit),
      anomalies: Math.round(anomalies.anomaly_score * weights.anomaly),
      availability: Math.round(availability.availability_score * weights.availability)
    }
  };
}

/**
 * Calculate average margin percentage for items
 * @param {Array} items - Pricing run items
 * @returns {number} Average margin percentage
 */
function calculateAverageMargin(items) {
  if (!items || items.length === 0) return 0;

  const margins = items.map(item => calculateItemMargin(item));
  return margins.reduce((sum, m) => sum + m, 0) / margins.length;
}

/**
 * Calculate margin percentage for a single item
 * @param {Object} item - Pricing run item
 * @returns {number} Margin percentage
 */
function calculateItemMargin(item) {
  const baseCost = parseFloat(item.base_cost) || 0;
  const unitPrice = parseFloat(item.unit_price) || 0;

  if (baseCost === 0) return 0;

  return ((unitPrice - baseCost) / baseCost) * 100;
}

module.exports = {
  calculateMarginDeviation,
  assessClientCreditRisk,
  detectPricingAnomalies,
  checkMaterialAvailability,
  calculateOverallRisk,
  calculateAverageMargin,
  calculateItemMargin
};
