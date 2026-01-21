/**
 * AI Approval Configuration
 * Thresholds and settings for automated approval system
 */

module.exports = {
  // Auto-approval thresholds
  autoApproval: {
    enabled: true,

    // Maximum risk score for auto-approval (0-100)
    maxRiskScore: 30,

    // Required risk level for auto-approval
    requiredRiskLevel: 'LOW',

    // Minimum confidence level (0-1)
    minConfidence: 0.85,

    // Maximum quote value for auto-approval (USD)
    maxQuoteValue: 50000,

    // Minimum historical quotes required for client
    minClientQuoteHistory: 3,

    // Auto-approve only for existing clients (>3 months old)
    requireEstablishedClient: true
  },

  // Risk scoring weights (must sum to 1.0)
  riskWeights: {
    marginDeviation: 0.30,
    creditRisk: 0.25,
    anomalies: 0.35,
    availability: 0.10
  },

  // Risk level thresholds
  riskThresholds: {
    low: 30,    // Score < 30 = LOW
    medium: 60  // Score 30-59 = MEDIUM, 60+ = HIGH
  },

  // Margin deviation alerts
  marginDeviation: {
    // Alert if deviation exceeds this percentage
    alertThreshold: 5.0,

    // High risk if deviation exceeds this percentage
    highRiskThreshold: 10.0
  },

  // Credit risk settings
  creditRisk: {
    // New client age threshold (months)
    newClientThreshold: 3,

    // Established client age threshold (months)
    establishedClientThreshold: 12,

    // Minimum approval rate for existing clients
    minApprovalRate: 0.70,

    // Minimum lifetime value for low risk (USD)
    minLifetimeValue: 50000
  },

  // Anomaly detection settings
  anomalyDetection: {
    // Margin thresholds
    minAcceptableMargin: 5.0,
    maxAcceptableMargin: 50.0,
    negativeMarginPenalty: 30,

    // Quote size thresholds
    largeQuoteThreshold: 500000,
    smallQuoteThreshold: 1000,

    // Margin variance threshold (standard deviation)
    maxMarginVariance: 15.0
  },

  // GPT-4 settings
  gpt4: {
    temperature: 0.7,
    maxTokens: 1000,
    retries: 3,
    retryDelay: 1000
  },

  // Notification settings
  notifications: {
    // Notify approvers for MEDIUM+ risk quotes
    notifyForRiskLevel: ['MEDIUM', 'HIGH'],

    // Send daily digest of auto-approvals
    sendDailyDigest: true,

    // Alert on auto-approval overrides
    alertOnOverride: true
  },

  // Monitoring and logging
  monitoring: {
    // Log all AI decisions
    logAllDecisions: true,

    // Track prediction accuracy
    trackAccuracy: true,

    // Weekly performance reports
    weeklyReports: true
  },

  // Override settings
  overrides: {
    // Allow users to override AI decisions
    allowOverride: true,

    // Require reason for override
    requireReason: true,

    // Roles that can override
    allowedRoles: ['manager', 'admin', 'approver']
  }
};
