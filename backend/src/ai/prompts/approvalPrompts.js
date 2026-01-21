/**
 * Approval Prompts
 * 
 * Prompts for AI risk assessment and approval recommendations
 */

const APPROVAL_RISK_RATIONALE_V1 = {
  id: "APPROVAL_RISK_RATIONALE_V1",
  description: "AI rationale generation for quote risk assessment",
  template: {
    system: `You are an expert pricing risk analyst. Provide clear, actionable insights based on quantitative data. Be concise and professional.`,
    user: (pricingRun, riskFactors) => {
      const { marginDeviation, creditRisk, anomalies, availability, overallRisk } = riskFactors;
      
      return `You are an expert pricing analyst for an industrial materials company. Analyze this quote and provide risk assessment insights.

QUOTE DETAILS:
- Client: ${pricingRun.client_name}
- RFQ: ${pricingRun.rfq_title}
- Total Value: $${parseFloat(pricingRun.total_price).toLocaleString()}
- Items: ${pricingRun.items.length}
- Current Margin: ${marginDeviation.current_margin_pct?.toFixed(1)}%

RISK ANALYSIS:
Overall Risk Score: ${overallRisk.overall_score}/100 (${overallRisk.risk_level})

1. MARGIN ANALYSIS:
   - Current margin: ${marginDeviation.current_margin_pct?.toFixed(1)}%
   - Historical average: ${marginDeviation.historical_margin_pct?.toFixed(1) || 'N/A'}%
   - Deviation: ${marginDeviation.deviation_pct?.toFixed(1)}%
   - Historical quotes: ${marginDeviation.historical_quote_count}

2. CLIENT CREDIT:
   - Credit score: ${creditRisk.credit_score}/100
   - Client age: ${creditRisk.client_age_months} months
   - Lifetime value: $${creditRisk.lifetime_value.toLocaleString()}
   - Risk factors: ${creditRisk.risk_factors.join(', ') || 'None'}

3. ANOMALIES DETECTED:
${anomalies.anomalies.length > 0 ? anomalies.anomalies.map(a => `   - ${a}`).join('\n') : '   - None'}

4. AVAILABILITY:
${availability.availability_issues.length > 0 ? availability.availability_issues.map(i => `   - ${i}`).join('\n') : '   - No issues'}

Based on this analysis, provide:
1. A clear, concise rationale (2-3 sentences) for the risk level
2. 3-5 key points about this quote (bullet points)
3. Any warnings or concerns (if applicable)
4. Your confidence level in this assessment (0-1)

Respond in JSON format:
{
  "rationale": "Clear explanation of the risk assessment",
  "key_points": ["Point 1", "Point 2", "Point 3"],
  "warnings": ["Warning 1", "Warning 2"] or [],
  "confidence": 0.85
}`;
    }
  }
};

module.exports = {
  APPROVAL_RISK_RATIONALE_V1,
};

