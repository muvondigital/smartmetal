/**
 * Unit tests for Risk Calculation Utilities
 * Tests all risk calculation functions for Stage 1 AI Approval
 */

const {
  calculateMarginDeviation,
  assessClientCreditRisk,
  detectPricingAnomalies,
  checkMaterialAvailability,
  calculateOverallRisk,
  calculateAverageMargin,
  calculateItemMargin
} = require('../riskCalculation');
const { connectDb } = require('../../db/supabaseClient');

// Mock database connection
jest.mock('../../db/supabaseClient', () => ({
  connectDb: jest.fn()
}));

describe('Risk Calculation Utilities', () => {
  let mockDb;

  beforeEach(() => {
    mockDb = {
      query: jest.fn()
    };
    connectDb.mockResolvedValue(mockDb);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('calculateItemMargin', () => {
    test('should calculate margin percentage correctly', () => {
      const item = { base_cost: 100, unit_price: 120 };
      const margin = calculateItemMargin(item);
      expect(margin).toBe(20); // (120 - 100) / 100 * 100 = 20%
    });

    test('should return 0 for zero base cost', () => {
      const item = { base_cost: 0, unit_price: 120 };
      const margin = calculateItemMargin(item);
      expect(margin).toBe(0);
    });

    test('should handle negative margin', () => {
      const item = { base_cost: 100, unit_price: 80 };
      const margin = calculateItemMargin(item);
      expect(margin).toBe(-20);
    });

    test('should handle missing values', () => {
      const item = { base_cost: null, unit_price: 120 };
      const margin = calculateItemMargin(item);
      expect(margin).toBe(0);
    });
  });

  describe('calculateAverageMargin', () => {
    test('should calculate average margin for multiple items', () => {
      const items = [
        { base_cost: 100, unit_price: 120 }, // 20%
        { base_cost: 100, unit_price: 130 }, // 30%
        { base_cost: 100, unit_price: 110 }  // 10%
      ];
      const avgMargin = calculateAverageMargin(items);
      expect(avgMargin).toBeCloseTo(20, 1); // (20 + 30 + 10) / 3 = 20%
    });

    test('should return 0 for empty array', () => {
      const avgMargin = calculateAverageMargin([]);
      expect(avgMargin).toBe(0);
    });

    test('should handle null items', () => {
      const avgMargin = calculateAverageMargin(null);
      expect(avgMargin).toBe(0);
    });
  });

  describe('detectPricingAnomalies', () => {
    test('should detect negative margin', () => {
      const pricingRun = {
        items: [
          { base_cost: 100, unit_price: 80 } // -20% margin
        ],
        total_price: 80
      };
      const result = detectPricingAnomalies(pricingRun);
      expect(result.has_anomalies).toBe(true);
      expect(result.anomalies.some(a => a.includes('Negative margin'))).toBe(true);
      expect(result.anomaly_score).toBeGreaterThan(0);
    });

    test('should detect very low margin', () => {
      const pricingRun = {
        items: [
          { base_cost: 100, unit_price: 102 } // 2% margin
        ],
        total_price: 102
      };
      const result = detectPricingAnomalies(pricingRun);
      expect(result.has_anomalies).toBe(true);
      expect(result.anomalies.some(a => a.includes('Very low margin'))).toBe(true);
    });

    test('should detect very high margin', () => {
      const pricingRun = {
        items: [
          { base_cost: 100, unit_price: 160 } // 60% margin
        ],
        total_price: 160
      };
      const result = detectPricingAnomalies(pricingRun);
      expect(result.has_anomalies).toBe(true);
      expect(result.anomalies.some(a => a.includes('Very high margin'))).toBe(true);
    });

    test('should detect missing base cost', () => {
      const pricingRun = {
        items: [
          { base_cost: 0, unit_price: 120 }
        ],
        total_price: 120
      };
      const result = detectPricingAnomalies(pricingRun);
      expect(result.has_anomalies).toBe(true);
      expect(result.anomalies.some(a => a.includes('Missing base cost'))).toBe(true);
    });

    test('should detect large quote value', () => {
      const pricingRun = {
        items: [
          { base_cost: 100, unit_price: 120 }
        ],
        total_price: 600000 // > 500000 threshold
      };
      const result = detectPricingAnomalies(pricingRun);
      expect(result.has_anomalies).toBe(true);
      expect(result.anomalies.some(a => a.includes('Large quote value'))).toBe(true);
    });

    test('should detect small quote value', () => {
      const pricingRun = {
        items: [
          { base_cost: 100, unit_price: 120 }
        ],
        total_price: 500 // < 1000 threshold
      };
      const result = detectPricingAnomalies(pricingRun);
      expect(result.has_anomalies).toBe(true);
      expect(result.anomalies.some(a => a.includes('Very small quote value'))).toBe(true);
    });

    test('should detect high margin variance', () => {
      const pricingRun = {
        items: [
          { base_cost: 100, unit_price: 120 }, // 20%
          { base_cost: 100, unit_price: 180 }  // 80%
        ],
        total_price: 300
      };
      const result = detectPricingAnomalies(pricingRun);
      // High variance should be detected if stdDev > 15
      expect(result.anomaly_score).toBeGreaterThan(0);
    });

    test('should return no anomalies for normal pricing', () => {
      const pricingRun = {
        items: [
          { base_cost: 100, unit_price: 120 }, // 20% margin
          { base_cost: 100, unit_price: 125 }  // 25% margin
        ],
        total_price: 24500
      };
      const result = detectPricingAnomalies(pricingRun);
      // Normal pricing should have low or no anomaly score
      expect(result.anomaly_score).toBeLessThan(20);
    });

    test('should handle empty items array', () => {
      const pricingRun = {
        items: [],
        total_price: 0
      };
      const result = detectPricingAnomalies(pricingRun);
      expect(result.anomalies).toContain('No items in pricing run');
      expect(result.anomaly_score).toBe(100);
      // Note: has_anomalies is not returned when items array is empty (early return)
      expect(result.anomalies.length).toBeGreaterThan(0);
    });
  });

  describe('checkMaterialAvailability', () => {
    test('should detect missing material codes', async () => {
      const items = [
        { material_code: 'MAT-001' },
        { material_code: null },
        { material_code: 'MAT-002' }
      ];
      const result = await checkMaterialAvailability(items);
      expect(result.has_availability_issues).toBe(true);
      expect(result.availability_issues.length).toBeGreaterThan(0);
      expect(result.availability_issues.some(issue => issue.includes('No material code'))).toBe(true);
    });

    test('should return no issues when all items have material codes', async () => {
      const items = [
        { material_code: 'MAT-001' },
        { material_code: 'MAT-002' },
        { material_code: 'MAT-003' }
      ];
      const result = await checkMaterialAvailability(items);
      expect(result.has_availability_issues).toBe(false);
      expect(result.availability_issues.length).toBe(0);
      expect(result.availability_score).toBe(0);
    });
  });

  describe('calculateMarginDeviation', () => {
    test('should calculate deviation when historical data exists', async () => {
      const pricingRun = {
        items: [
          { base_cost: 100, unit_price: 120 } // 20% margin
        ]
      };
      const clientId = 'client-123';

      // Mock historical average margin of 15%
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          avg_margin_pct: '15.0',
          quote_count: '5'
        }]
      });

      const result = await calculateMarginDeviation(pricingRun, clientId);
      expect(result.current_margin_pct).toBe(20);
      expect(result.historical_margin_pct).toBe(15);
      expect(result.deviation_pct).toBe(5); // 20% - 15% = 5%
      expect(result.deviation_score).toBeGreaterThan(0);
      expect(result.has_sufficient_history).toBe(true);
    });

    test('should handle new client with no history', async () => {
      const pricingRun = {
        items: [
          { base_cost: 100, unit_price: 120 }
        ]
      };
      const clientId = 'new-client';

      // Mock no historical data
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          avg_margin_pct: null,
          quote_count: '0'
        }]
      });

      const result = await calculateMarginDeviation(pricingRun, clientId);
      expect(result.historical_margin_pct).toBeNull();
      expect(result.deviation_score).toBe(40); // Default risk for new clients
      expect(result.has_sufficient_history).toBe(false);
    });

    test('should handle insufficient history (< 3 quotes)', async () => {
      const pricingRun = {
        items: [
          { base_cost: 100, unit_price: 120 }
        ]
      };
      const clientId = 'client-123';

      // Mock insufficient history (only 2 quotes)
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          avg_margin_pct: '15.0',
          quote_count: '2'
        }]
      });

      const result = await calculateMarginDeviation(pricingRun, clientId);
      expect(result.deviation_score).toBe(40); // Default risk for insufficient history
      expect(result.has_sufficient_history).toBe(false);
    });
  });

  describe('assessClientCreditRisk', () => {
    test('should assess established client with good history', async () => {
      const clientId = 'good-client';

      // Mock client data
      mockDb.query
        .mockResolvedValueOnce({
          rows: [{
            payment_terms: 'NET30',
            lifetime_value: '200000',
            created_at: new Date(Date.now() - 15 * 30 * 24 * 60 * 60 * 1000), // 15 months ago
            notes: 'Good client'
          }]
        })
        .mockResolvedValueOnce({
          rows: [{
            approved_count: '10',
            rejected_count: '1',
            sent_count: '2'
          }]
        });

      const result = await assessClientCreditRisk(clientId);
      expect(result.credit_score).toBeGreaterThan(70);
      expect(result.risk_score).toBeLessThan(30);
      expect(result.client_age_months).toBeGreaterThan(12);
    });

    test('should assess new client as higher risk', async () => {
      const clientId = 'new-client';

      // Mock new client data
      mockDb.query
        .mockResolvedValueOnce({
          rows: [{
            payment_terms: 'NET30',
            lifetime_value: '5000',
            created_at: new Date(Date.now() - 1 * 30 * 24 * 60 * 60 * 1000), // 1 month ago
            notes: 'New client'
          }]
        })
        .mockResolvedValueOnce({
          rows: [{
            approved_count: '0',
            rejected_count: '0',
            sent_count: '0'
          }]
        });

      const result = await assessClientCreditRisk(clientId);
      expect(result.credit_score).toBeLessThan(70);
      expect(result.risk_score).toBeGreaterThan(30);
      expect(result.risk_factors.some(factor => factor.includes('New client'))).toBe(true);
    });

    test('should detect NET90 payment terms as risk', async () => {
      const clientId = 'net90-client';

      mockDb.query
        .mockResolvedValueOnce({
          rows: [{
            payment_terms: 'NET90',
            lifetime_value: '100000',
            created_at: new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000),
            notes: 'NET90 client'
          }]
        })
        .mockResolvedValueOnce({
          rows: [{
            approved_count: '5',
            rejected_count: '0',
            sent_count: '1'
          }]
        });

      const result = await assessClientCreditRisk(clientId);
      expect(result.risk_factors.some(factor => factor.includes('NET90'))).toBe(true);
    });

    test('should handle client not found', async () => {
      const clientId = 'non-existent';

      mockDb.query.mockResolvedValueOnce({
        rows: []
      });

      const result = await assessClientCreditRisk(clientId);
      expect(result.credit_score).toBe(50);
      expect(result.risk_factors).toContain('Client not found');
      expect(result.client_age_months).toBe(0);
    });
  });

  describe('calculateOverallRisk', () => {
    test('should calculate LOW risk for good factors', () => {
      const factors = {
        marginDeviation: {
          deviation_score: 10 // Low deviation
        },
        creditRisk: {
          risk_score: 15 // Low credit risk
        },
        anomalies: {
          anomaly_score: 5 // Low anomalies
        },
        availability: {
          availability_score: 0 // No availability issues
        }
      };

      const result = calculateOverallRisk(factors);
      expect(result.risk_level).toBe('LOW');
      expect(result.overall_score).toBeLessThan(30);
      expect(result.auto_approve_eligible).toBe(true);
    });

    test('should calculate MEDIUM risk for moderate factors', () => {
      const factors = {
        marginDeviation: {
          deviation_score: 40
        },
        creditRisk: {
          risk_score: 35
        },
        anomalies: {
          anomaly_score: 30
        },
        availability: {
          availability_score: 10
        }
      };

      const result = calculateOverallRisk(factors);
      expect(result.risk_level).toBe('MEDIUM');
      expect(result.overall_score).toBeGreaterThanOrEqual(30);
      expect(result.overall_score).toBeLessThan(60);
      expect(result.auto_approve_eligible).toBe(false);
    });

    test('should calculate HIGH risk for poor factors', () => {
      const factors = {
        marginDeviation: {
          deviation_score: 80
        },
        creditRisk: {
          risk_score: 70
        },
        anomalies: {
          anomaly_score: 90
        },
        availability: {
          availability_score: 50
        }
      };

      const result = calculateOverallRisk(factors);
      expect(result.risk_level).toBe('HIGH');
      expect(result.overall_score).toBeGreaterThanOrEqual(60);
      expect(result.auto_approve_eligible).toBe(false);
    });

    test('should include contributing factors breakdown', () => {
      const factors = {
        marginDeviation: {
          deviation_score: 20
        },
        creditRisk: {
          risk_score: 30
        },
        anomalies: {
          anomaly_score: 40
        },
        availability: {
          availability_score: 10
        }
      };

      const result = calculateOverallRisk(factors);
      expect(result.contributing_factors).toBeDefined();
      expect(result.contributing_factors.margin_deviation).toBeDefined();
      expect(result.contributing_factors.credit_risk).toBeDefined();
      expect(result.contributing_factors.anomalies).toBeDefined();
      expect(result.contributing_factors.availability).toBeDefined();
    });
  });
});

