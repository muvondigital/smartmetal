/**
 * Unit Tests for Assistant Data Service
 * 
 * Test Framework: Jest (v29.7.0)
 * Test Environment: Node.js
 * 
 * Tests cover:
 * - getRfqCount(tenantId)
 * - getPendingApprovals(tenantId)
 * - getRfqsNeedingAttention(tenantId)
 * - getPricingRuns(tenantId, limit)
 * - searchMaterials(term, tenantId)
 * 
 * All tests mock the database layer to avoid real DB dependencies.
 */

const assistantDataService = require('../assistantDataService');
const { connectDb } = require('../../db/supabaseClient');

// Mock the database client
jest.mock('../../db/supabaseClient', () => ({
  connectDb: jest.fn()
}));

describe('Assistant Data Service', () => {
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

  describe('getRfqCount', () => {
    test('should return count when called with valid tenantId', async () => {
      const testTenantId = 'test-tenant-123';
      mockDb.query.mockResolvedValueOnce({
        rows: [{ count: '10' }]
      });

      const count = await assistantDataService.getRfqCount(testTenantId);

      expect(count).toBe(10);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT COUNT(*)'),
        [testTenantId]
      );
    });

    test('should return 0 when DB returns 0 rows', async () => {
      const testTenantId = 'test-tenant-123';
      mockDb.query.mockResolvedValueOnce({
        rows: [{ count: '0' }]
      });

      const count = await assistantDataService.getRfqCount(testTenantId);

      expect(count).toBe(0);
    });

    test('should return 0 when DB returns empty result', async () => {
      const testTenantId = 'test-tenant-123';
      mockDb.query.mockResolvedValueOnce({
        rows: []
      });

      const count = await assistantDataService.getRfqCount(testTenantId);

      expect(count).toBe(0);
    });

    test('should handle null tenantId gracefully', async () => {
      // Based on implementation, it should log warning and return 0
      const count = await assistantDataService.getRfqCount(null);
      expect(count).toBe(0);
      // Should not call DB query
      expect(mockDb.query).not.toHaveBeenCalled();
    });

    test('should handle undefined tenantId gracefully', async () => {
      const count = await assistantDataService.getRfqCount(undefined);
      expect(count).toBe(0);
      expect(mockDb.query).not.toHaveBeenCalled();
    });

    test('should throw database errors (not validation errors)', async () => {
      const testTenantId = 'test-tenant-123';
      const dbError = new Error('Database connection failed');
      mockDb.query.mockRejectedValueOnce(dbError);

      await expect(assistantDataService.getRfqCount(testTenantId))
        .rejects.toThrow('Database connection failed');
    });
  });

  describe('getPendingApprovals', () => {
    test('should return array of pending approvals', async () => {
      const testTenantId = 'test-tenant-123';
      const mockApprovals = [
        {
          pricing_run_id: 'pr-1',
          rfq_id: 'rfq-1',
          rfq_title: 'Test RFQ 1',
          client_name: 'Test Client',
          total_price: 1000,
          submitted_at: new Date(),
          approval_level: 1,
          sla_expired: false,
          ai_risk_level: 'LOW',
          ai_risk_score: 20
        },
        {
          pricing_run_id: 'pr-2',
          rfq_id: 'rfq-2',
          rfq_title: 'Test RFQ 2',
          client_name: 'Test Client 2',
          total_price: 2000,
          submitted_at: new Date(),
          approval_level: 2,
          sla_expired: true,
          ai_risk_level: 'HIGH',
          ai_risk_score: 80
        }
      ];

      mockDb.query.mockResolvedValueOnce({
        rows: mockApprovals
      });

      const approvals = await assistantDataService.getPendingApprovals(testTenantId);

      expect(Array.isArray(approvals)).toBe(true);
      expect(approvals.length).toBe(2);
      expect(approvals[0].pricing_run_id).toBe('pr-1');
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('pending_approval'),
        expect.arrayContaining([testTenantId])
      );
    });

    test('should return empty array when no pending approvals', async () => {
      const testTenantId = 'test-tenant-123';
      mockDb.query.mockResolvedValueOnce({
        rows: []
      });

      const approvals = await assistantDataService.getPendingApprovals(testTenantId);

      expect(Array.isArray(approvals)).toBe(true);
      expect(approvals.length).toBe(0);
      expect(approvals).toEqual([]);
      // Must NOT be undefined or null
      expect(approvals).not.toBeUndefined();
      expect(approvals).not.toBeNull();
    });

    test('should return empty array when DB returns null rows', async () => {
      const testTenantId = 'test-tenant-123';
      mockDb.query.mockResolvedValueOnce({
        rows: null
      });

      const approvals = await assistantDataService.getPendingApprovals(testTenantId);

      expect(Array.isArray(approvals)).toBe(true);
      expect(approvals).toEqual([]);
    });

    test('should handle null tenantId gracefully', async () => {
      const approvals = await assistantDataService.getPendingApprovals(null);
      expect(Array.isArray(approvals)).toBe(true);
      expect(approvals).toEqual([]);
      expect(mockDb.query).not.toHaveBeenCalled();
    });

    test('should handle undefined tenantId gracefully', async () => {
      const approvals = await assistantDataService.getPendingApprovals(undefined);
      expect(Array.isArray(approvals)).toBe(true);
      expect(approvals).toEqual([]);
    });

    test('should throw database errors', async () => {
      const testTenantId = 'test-tenant-123';
      const dbError = new Error('Database query failed');
      mockDb.query.mockRejectedValueOnce(dbError);

      await expect(assistantDataService.getPendingApprovals(testTenantId))
        .rejects.toThrow('Database query failed');
    });
  });

  describe('getRfqsNeedingAttention', () => {
    test('should return array of RFQs needing attention', async () => {
      const testTenantId = 'test-tenant-123';
      
      // Mock RFQs query
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'rfq-1',
            title: 'Test RFQ 1',
            status: 'draft',
            created_at: new Date(),
            client_name: 'Test Client'
          },
          {
            id: 'rfq-2',
            title: 'Test RFQ 2',
            status: 'pricing',
            created_at: new Date(),
            client_name: 'Test Client 2'
          }
        ]
      });

      // Mock pricing runs query for rfq-1 (no pricing runs)
      mockDb.query.mockResolvedValueOnce({
        rows: []
      });

      // Mock pricing runs query for rfq-2 (has pricing run)
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: 'pr-1',
          approval_status: 'pending_approval',
          submitted_for_approval_at: new Date(Date.now() - 50 * 60 * 60 * 1000), // 50 hours ago
          ai_risk_score: 75
        }]
      });

      const rfqs = await assistantDataService.getRfqsNeedingAttention(testTenantId);

      expect(Array.isArray(rfqs)).toBe(true);
      expect(rfqs.length).toBeGreaterThan(0);
      expect(rfqs[0]).toHaveProperty('reason');
      expect(rfqs[0]).toHaveProperty('priority');
    });

    test('should return empty array when no RFQs need attention', async () => {
      const testTenantId = 'test-tenant-123';
      
      mockDb.query.mockResolvedValueOnce({
        rows: []
      });

      const rfqs = await assistantDataService.getRfqsNeedingAttention(testTenantId);

      expect(Array.isArray(rfqs)).toBe(true);
      expect(rfqs).toEqual([]);
      expect(rfqs).not.toBeUndefined();
      expect(rfqs).not.toBeNull();
    });

    test('should handle null tenantId gracefully', async () => {
      const rfqs = await assistantDataService.getRfqsNeedingAttention(null);
      expect(Array.isArray(rfqs)).toBe(true);
      expect(rfqs).toEqual([]);
    });

    test('should throw database errors', async () => {
      const testTenantId = 'test-tenant-123';
      const dbError = new Error('Database error');
      mockDb.query.mockRejectedValueOnce(dbError);

      await expect(assistantDataService.getRfqsNeedingAttention(testTenantId))
        .rejects.toThrow('Database error');
    });
  });

  describe('getPricingRuns', () => {
    test('should return array of pricing runs', async () => {
      const testTenantId = 'test-tenant-123';
      const mockRuns = [
        {
          id: 'pr-1',
          rfq_id: 'rfq-1',
          status: 'approved',
          approval_status: 'approved',
          total_price: 1000,
          created_at: new Date(),
          rfq_title: 'Test RFQ',
          client_name: 'Test Client'
        }
      ];

      mockDb.query.mockResolvedValueOnce({
        rows: mockRuns
      });

      const runs = await assistantDataService.getPricingRuns(testTenantId, 20);

      expect(Array.isArray(runs)).toBe(true);
      expect(runs.length).toBe(1);
      expect(runs[0].id).toBe('pr-1');
    });

    test('should return empty array when no pricing runs', async () => {
      const testTenantId = 'test-tenant-123';
      mockDb.query.mockResolvedValueOnce({
        rows: []
      });

      const runs = await assistantDataService.getPricingRuns(testTenantId);

      expect(Array.isArray(runs)).toBe(true);
      expect(runs).toEqual([]);
      expect(runs).not.toBeUndefined();
    });

    test('should handle null tenantId gracefully', async () => {
      const runs = await assistantDataService.getPricingRuns(null);
      expect(Array.isArray(runs)).toBe(true);
      expect(runs).toEqual([]);
    });

    test('should respect limit parameter', async () => {
      const testTenantId = 'test-tenant-123';
      mockDb.query.mockResolvedValueOnce({
        rows: []
      });

      await assistantDataService.getPricingRuns(testTenantId, 10);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.any(String),
        [testTenantId, 10]
      );
    });
  });

  describe('searchMaterials', () => {
    test('should return array of matching materials', async () => {
      const testTenantId = 'test-tenant-123';
      const searchTerm = 'ASTM A105';
      const mockMaterials = [
        {
          material_code: 'FL-001',
          category: 'flange',
          grade: 'A105',
          spec_standard: 'ASTM A105',
          origin_type: 'non-china',
          size_description: '6"'
        }
      ];

      mockDb.query.mockResolvedValueOnce({
        rows: mockMaterials
      });

      const materials = await assistantDataService.searchMaterials(searchTerm, testTenantId);

      expect(Array.isArray(materials)).toBe(true);
      expect(materials.length).toBe(1);
      expect(materials[0].material_code).toBe('FL-001');
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('ILIKE'),
        expect.arrayContaining([expect.stringContaining(searchTerm)])
      );
    });

    test('should return empty array when no materials match', async () => {
      const testTenantId = 'test-tenant-123';
      mockDb.query.mockResolvedValueOnce({
        rows: []
      });

      const materials = await assistantDataService.searchMaterials('nonexistent', testTenantId);

      expect(Array.isArray(materials)).toBe(true);
      expect(materials).toEqual([]);
      expect(materials).not.toBeUndefined();
    });

    test('should return empty array when search term is undefined', async () => {
      const testTenantId = 'test-tenant-123';
      
      const materials = await assistantDataService.searchMaterials(undefined, testTenantId);

      expect(Array.isArray(materials)).toBe(true);
      expect(materials).toEqual([]);
      expect(mockDb.query).not.toHaveBeenCalled();
    });

    test('should return empty array when search term is empty string', async () => {
      const testTenantId = 'test-tenant-123';
      
      const materials = await assistantDataService.searchMaterials('', testTenantId);

      expect(Array.isArray(materials)).toBe(true);
      expect(materials).toEqual([]);
      expect(mockDb.query).not.toHaveBeenCalled();
    });

    test('should handle null tenantId gracefully', async () => {
      const materials = await assistantDataService.searchMaterials('test', null);
      expect(Array.isArray(materials)).toBe(true);
      expect(materials).toEqual([]);
    });

    test('should throw database errors', async () => {
      const testTenantId = 'test-tenant-123';
      const dbError = new Error('Database error');
      mockDb.query.mockRejectedValueOnce(dbError);

      await expect(assistantDataService.searchMaterials('test', testTenantId))
        .rejects.toThrow('Database error');
    });
  });

  describe('Return Value Guarantees', () => {
    test('all methods should return arrays (never undefined)', async () => {
      const testTenantId = 'test-tenant-123';
      
      // Mock all queries to return empty results
      mockDb.query.mockResolvedValue({ rows: [] });

      const approvals = await assistantDataService.getPendingApprovals(testTenantId);
      const rfqs = await assistantDataService.getRfqsNeedingAttention(testTenantId);
      const runs = await assistantDataService.getPricingRuns(testTenantId);
      const materials = await assistantDataService.searchMaterials('test', testTenantId);

      expect(approvals).not.toBeUndefined();
      expect(rfqs).not.toBeUndefined();
      expect(runs).not.toBeUndefined();
      expect(materials).not.toBeUndefined();

      expect(Array.isArray(approvals)).toBe(true);
      expect(Array.isArray(rfqs)).toBe(true);
      expect(Array.isArray(runs)).toBe(true);
      expect(Array.isArray(materials)).toBe(true);
    });
  });
});

