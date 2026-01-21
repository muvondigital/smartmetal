/**
 * Integration tests for AI Approval Service
 * Tests the complete approval workflow with AI risk assessment
 */

// Set up environment variables before requiring modules
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test';
process.env.AZURE_OPENAI_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT || 'https://test.openai.azure.com/';
process.env.AZURE_OPENAI_KEY = process.env.AZURE_OPENAI_KEY || 'test-key';
process.env.AZURE_OPENAI_DEPLOYMENT_NAME = process.env.AZURE_OPENAI_DEPLOYMENT_NAME || 'gpt-4o';

const aiApprovalService = require('../ai/aiApprovalService');
const approvalService = require('../approvalService');
const { connectDb } = require('../../db/supabaseClient');
const pricingService = require('../pricingService');

// Mock dependencies
jest.mock('../../db/supabaseClient');
jest.mock('../pricingService');
jest.mock('../ai/azureClient', () => ({
  callGPT4: jest.fn(),
  callGPT4JSON: jest.fn()
}));

const { callGPT4JSON } = require('../ai/azureClient');

describe('AI Approval Service Integration', () => {
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

  describe('assessQuoteRisk', () => {
    test('should assess low-risk quote correctly', async () => {
      const pricingRunId = 'test-run-123';
      
      // Mock pricing run data
      const mockPricingRun = {
        id: pricingRunId,
        client_id: 'client-123',
        total_price: 25000,
        items: [
          {
            id: 'item-1',
            material_code: 'MAT-001',
            base_cost: 100,
            unit_price: 120,
            quantity: 100
          }
        ]
      };

      pricingService.getPricingRunById.mockResolvedValue(mockPricingRun);

      // Mock database queries for risk calculation
      // Margin deviation query
      mockDb.query
        .mockResolvedValueOnce({
          rows: [{
            avg_margin_pct: '18.0',
            quote_count: '5'
          }]
        })
        // Credit risk - client query
        .mockResolvedValueOnce({
          rows: [{
            payment_terms: 'NET30',
            lifetime_value: '150000',
            created_at: new Date(Date.now() - 12 * 30 * 24 * 60 * 60 * 1000),
            notes: 'Good client'
          }]
        })
        // Credit risk - history query
        .mockResolvedValueOnce({
          rows: [{
            approved_count: '8',
            rejected_count: '1',
            sent_count: '2'
          }]
        });

      // Mock GPT-4 response
      callGPT4JSON.mockResolvedValue({
        rationale: 'This is a low-risk quote with standard margins and established client.',
        key_points: [
          'Standard margin within client history',
          'Established client with good payment record',
          'No pricing anomalies detected'
        ],
        warnings: [],
        confidence: 0.92
      });

      const assessment = await aiApprovalService.assessQuoteRisk(pricingRunId);

      expect(assessment).toBeDefined();
      expect(assessment.pricing_run_id).toBe(pricingRunId);
      expect(assessment.risk_level).toBeDefined();
      expect(assessment.risk_score).toBeDefined();
      expect(assessment.recommendation).toBeDefined();
      expect(assessment.risk_factors).toBeDefined();
      expect(assessment.ai_rationale).toBeDefined();
    });

    test('should assess high-risk quote correctly', async () => {
      const pricingRunId = 'test-run-456';
      
      const mockPricingRun = {
        id: pricingRunId,
        client_id: 'new-client',
        total_price: 600000,
        items: [
          {
            id: 'item-1',
            material_code: null, // Missing material code
            base_cost: 100,
            unit_price: 80, // Negative margin
            quantity: 1000
          }
        ]
      };

      pricingService.getPricingRunById.mockResolvedValue(mockPricingRun);

      // Mock high-risk scenario
      mockDb.query
        .mockResolvedValueOnce({
          rows: [{
            avg_margin_pct: null,
            quote_count: '0'
          }]
        })
        .mockResolvedValueOnce({
          rows: [{
            payment_terms: 'NET90',
            lifetime_value: '5000',
            created_at: new Date(Date.now() - 1 * 30 * 24 * 60 * 60 * 1000),
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

      callGPT4JSON.mockResolvedValue({
        rationale: 'This quote has multiple risk factors including negative margins and new client.',
        key_points: [
          'Negative margin detected',
          'New client with limited history',
          'Large quote value',
          'Missing material codes'
        ],
        warnings: [
          'Negative margin requires immediate attention',
          'New client requires credit verification'
        ],
        confidence: 0.88
      });

      const assessment = await aiApprovalService.assessQuoteRisk(pricingRunId);

      // With negative margin, new client, and large quote, should be at least MEDIUM risk
      expect(['MEDIUM', 'HIGH']).toContain(assessment.risk_level);
      expect(assessment.risk_score).toBeGreaterThan(30);
      expect(assessment.recommendation).toBe('MANUAL_REVIEW');
      expect(assessment.ai_warnings).toBeDefined();
      expect(assessment.ai_warnings.length).toBeGreaterThan(0);
    });

    test('should handle missing pricing run', async () => {
      const pricingRunId = 'non-existent';
      pricingService.getPricingRunById.mockResolvedValue(null);

      await expect(aiApprovalService.assessQuoteRisk(pricingRunId))
        .rejects
        .toThrow('Pricing run not found');
    });

    test('should handle pricing run with no items', async () => {
      const pricingRunId = 'empty-run';
      pricingService.getPricingRunById.mockResolvedValue({
        id: pricingRunId,
        client_id: 'client-123',
        items: []
      });

      await expect(aiApprovalService.assessQuoteRisk(pricingRunId))
        .rejects
        .toThrow('Pricing run has no items');
    });
  });

  describe('Approval Workflow Integration', () => {
    test('should auto-approve low-risk quote', async () => {
      const pricingRunId = 'low-risk-run';
      const submitter = { name: 'Test User', id: 'user-123' };

      // Mock pricing run
      const mockPricingRun = {
        id: pricingRunId,
        client_id: 'client-123',
        approval_status: 'draft',
        total_price: 20000,
        items: [
          {
            id: 'item-1',
            material_code: 'MAT-001',
            base_cost: 100,
            unit_price: 120,
            quantity: 100
          }
        ]
      };

      // Mock database queries
      mockDb.query
        // Initial pricing run query
        .mockResolvedValueOnce({
          rows: [mockPricingRun]
        })
        // Margin deviation
        .mockResolvedValueOnce({
          rows: [{
            avg_margin_pct: '18.0',
            quote_count: '5'
          }]
        })
        // Credit risk - client
        .mockResolvedValueOnce({
          rows: [{
            payment_terms: 'NET30',
            lifetime_value: '150000',
            created_at: new Date(Date.now() - 12 * 30 * 24 * 60 * 60 * 1000),
            notes: 'Good client'
          }]
        })
        // Credit risk - history
        .mockResolvedValueOnce({
          rows: [{
            approved_count: '8',
            rejected_count: '1',
            sent_count: '2'
          }]
        })
        // Update query for auto-approval
        .mockResolvedValueOnce({
          rows: [{ id: pricingRunId }]
        })
        // Approval history insert
        .mockResolvedValueOnce({
          rows: [{ id: 'history-1' }]
        })
        // Get approvers query (for email notifications)
        .mockResolvedValueOnce({
          rows: []
        });

      pricingService.getPricingRunById.mockResolvedValue(mockPricingRun);

      callGPT4JSON.mockResolvedValue({
        rationale: 'Low-risk quote eligible for auto-approval.',
        key_points: ['Standard margins', 'Established client'],
        warnings: [],
        confidence: 0.95
      });

      const result = await approvalService.submitForApproval(pricingRunId, submitter);

      expect(result).toBeDefined();
      // Check that auto-approval occurred by verifying the database update query
      const autoApproveQuery = mockDb.query.mock.calls.find(call => 
        call[0] && call[0].includes('UPDATE pricing_runs') && call[0].includes('approved_at')
      );
      expect(autoApproveQuery).toBeDefined();
      // Verify 'AI_SYSTEM' is in the SQL query (it's hardcoded, not in parameters)
      expect(autoApproveQuery[0]).toContain("approved_by = 'AI_SYSTEM'");
      
      // Verify AI assessment was stored in the same query
      // Parameters: [submitter, notes, risk_level, risk_score, recommendation, risk_factors, rationale, key_points, warnings, confidence, pricingRunId]
      expect(autoApproveQuery[1][2]).toBe('LOW'); // ai_risk_level (index 2)
      expect(autoApproveQuery[1][4]).toBe('AUTO_APPROVE'); // ai_recommendation (index 4)
    });

    test('should queue high-risk quote for manual review', async () => {
      const pricingRunId = 'high-risk-run';
      const submitter = { name: 'Test User', id: 'user-123' };

      const mockPricingRun = {
        id: pricingRunId,
        client_id: 'new-client',
        approval_status: 'draft',
        total_price: 600000,
        items: [
          {
            id: 'item-1',
            material_code: null,
            base_cost: 100,
            unit_price: 80,
            quantity: 1000
          }
        ]
      };

      mockDb.query
        // Initial pricing run query
        .mockResolvedValueOnce({
          rows: [mockPricingRun]
        })
        // Margin deviation query (for AI assessment)
        .mockResolvedValueOnce({
          rows: [{
            avg_margin_pct: null,
            quote_count: '0'
          }]
        })
        // Credit risk - client query (for AI assessment)
        .mockResolvedValueOnce({
          rows: [{
            payment_terms: 'NET90',
            lifetime_value: '5000',
            created_at: new Date(Date.now() - 1 * 30 * 24 * 60 * 60 * 1000),
            notes: 'New client'
          }]
        })
        // Credit risk - history query (for AI assessment)
        .mockResolvedValueOnce({
          rows: [{
            approved_count: '0',
            rejected_count: '0',
            sent_count: '0'
          }]
        })
        // BEGIN transaction
        .mockResolvedValueOnce({
          rows: []
        })
        // UPDATE pricing_runs (set to pending_approval)
        .mockResolvedValueOnce({
          rows: [{ id: pricingRunId }]
        })
        // INSERT into approval_history
        .mockResolvedValueOnce({
          rows: [{ id: 'history-1' }]
        })
        // COMMIT
        .mockResolvedValueOnce({
          rows: []
        })
        // Get approvers query (for email notifications)
        .mockResolvedValueOnce({
          rows: []
        });

      pricingService.getPricingRunById.mockResolvedValue(mockPricingRun);

      callGPT4JSON.mockResolvedValue({
        rationale: 'High-risk quote requires manual review.',
        key_points: ['Multiple risk factors detected'],
        warnings: ['Negative margin', 'New client'],
        confidence: 0.85
      });

      const result = await approvalService.submitForApproval(pricingRunId, submitter);

      // Verify that it was queued for approval (not auto-approved)
      const updateQuery = mockDb.query.mock.calls.find(call => 
        call[0] && call[0].includes('UPDATE pricing_runs') && call[0].includes('pending_approval')
      );
      expect(updateQuery).toBeDefined();
    });

    test('should handle AI assessment failure gracefully', async () => {
      const pricingRunId = 'test-run';
      const submitter = { name: 'Test User', id: 'user-123' };

      const mockPricingRun = {
        id: pricingRunId,
        client_id: 'client-123',
        approval_status: 'draft',
        total_price: 20000,
        items: [
          {
            id: 'item-1',
            material_code: 'MAT-001',
            base_cost: 100,
            unit_price: 120,
            quantity: 100
          }
        ]
      };

      // Mock AI service to throw error using jest.spyOn BEFORE setting up DB mocks
      const assessQuoteRiskSpy = jest.spyOn(aiApprovalService, 'assessQuoteRisk')
        .mockRejectedValueOnce(new Error('AI service unavailable'));

      // Mock all database queries in order
      mockDb.query
        // Initial pricing run query
        .mockResolvedValueOnce({
          rows: [mockPricingRun]
        })
        // BEGIN transaction
        .mockResolvedValueOnce({
          rows: []
        })
        // UPDATE pricing_runs (set to pending_approval)
        .mockResolvedValueOnce({
          rows: [{ id: pricingRunId }]
        })
        // INSERT into approval_history
        .mockResolvedValueOnce({
          rows: [{ id: 'history-1' }]
        })
        // COMMIT (returns nothing, but we need to mock it)
        .mockResolvedValueOnce({
          rows: []
        })
        // Get approvers query (for email notifications)
        .mockResolvedValueOnce({
          rows: []
        });

      // Mock getPricingRunById for email details
      pricingService.getPricingRunById.mockResolvedValueOnce(mockPricingRun);

      // Should still proceed with manual approval
      const result = await approvalService.submitForApproval(pricingRunId, submitter);

      // Restore original function
      assessQuoteRiskSpy.mockRestore();

      // Verify that it was queued for approval (not auto-approved)
      const updateQuery = mockDb.query.mock.calls.find(call => 
        call[0] && call[0].includes('UPDATE pricing_runs') && call[0].includes('pending_approval')
      );
      expect(updateQuery).toBeDefined();
      // Verify AI assessment was NOT stored (since it failed)
      const aiQuery = mockDb.query.mock.calls.find(call => 
        call[0] && call[0].includes('UPDATE pricing_runs') && call[0].includes('ai_risk_level')
      );
      // AI query should not exist since AI assessment failed
      expect(aiQuery).toBeUndefined();
    });
  });

  describe('Performance Testing', () => {
    test('should complete risk assessment within 2 seconds', async () => {
      const pricingRunId = 'perf-test';
      
      const mockPricingRun = {
        id: pricingRunId,
        client_id: 'client-123',
        total_price: 25000,
        items: [
          {
            id: 'item-1',
            material_code: 'MAT-001',
            base_cost: 100,
            unit_price: 120,
            quantity: 100
          }
        ]
      };

      pricingService.getPricingRunById.mockResolvedValue(mockPricingRun);

      // Mock all database queries
      mockDb.query
        // Margin deviation query
        .mockResolvedValueOnce({
          rows: [{
            avg_margin_pct: '18.0',
            quote_count: '5'
          }]
        })
        // Credit risk - client query
        .mockResolvedValueOnce({
          rows: [{
            payment_terms: 'NET30',
            lifetime_value: '150000',
            created_at: new Date(Date.now() - 12 * 30 * 24 * 60 * 60 * 1000),
            notes: 'Good client'
          }]
        })
        // Credit risk - history query
        .mockResolvedValueOnce({
          rows: [{
            approved_count: '8',
            rejected_count: '1',
            sent_count: '2'
          }]
        });

      callGPT4JSON.mockResolvedValue({
        rationale: 'Test rationale',
        key_points: ['Test point'],
        warnings: [],
        confidence: 0.9
      });

      const startTime = Date.now();
      await aiApprovalService.assessQuoteRisk(pricingRunId);
      const duration = Date.now() - startTime;

      // Should complete within 2 seconds (allowing for async operations)
      expect(duration).toBeLessThan(2000);
    });
  });
});

