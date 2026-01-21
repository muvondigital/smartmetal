/**
 * Unit tests for Material Service Safety Contract (Catalog Write-Safety)
 *
 * Tests the split between:
 * - createMaterialSafe() - Safe for commercial request flows (no overwrite)
 * - upsertMaterialForSeed() - Seed/import only (allows overwrite)
 */

const { connectDb } = require('../../db/supabaseClient');
const {
  createMaterialSafe,
  upsertMaterialForSeed,
  getMaterialByCode,
} = require('../materialsService');

// Mock database to avoid real DB calls in unit tests
jest.mock('../../db/supabaseClient');

describe('Materials Service Safety Contract', () => {
  let mockDb;

  beforeEach(() => {
    mockDb = {
      query: jest.fn(),
    };
    connectDb.mockResolvedValue(mockDb);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createMaterialSafe()', () => {
    const tenantId = '11111111-1111-1111-1111-111111111111';
    const payload = {
      material_code: 'TEST-001',
      category: 'PIPE',
      origin_type: 'NON_CHINA',
      base_cost: 100.0,
    };

    it('should insert new material successfully', async () => {
      const newMaterial = { id: 'mat-1', ...payload, tenant_id: tenantId };
      mockDb.query.mockResolvedValueOnce({ rows: [newMaterial] });

      const result = await createMaterialSafe(payload, tenantId);

      expect(result).toEqual(newMaterial);
      expect(mockDb.query).toHaveBeenCalledTimes(1);
      expect(mockDb.query.mock.calls[0][0]).toContain('ON CONFLICT (tenant_id, material_code) DO NOTHING');
    });

    it('should return existing material without updates on conflict', async () => {
      const existingMaterial = {
        id: 'mat-1',
        material_code: 'TEST-001',
        category: 'FLANGE', // Different category than payload
        base_cost: 200.0, // Different cost than payload
        tenant_id: tenantId,
      };

      // First query (INSERT) returns empty (conflict)
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      // Second query (SELECT existing) returns existing material
      mockDb.query.mockResolvedValueOnce({ rows: [existingMaterial] });

      const result = await createMaterialSafe(payload, tenantId);

      expect(result).toEqual(existingMaterial);
      expect(result.category).toBe('FLANGE'); // Original category preserved
      expect(result.base_cost).toBe(200.0); // Original cost preserved
      expect(mockDb.query).toHaveBeenCalledTimes(2);
    });

    it('should validate required fields', async () => {
      await expect(
        createMaterialSafe({ material_code: 'TEST' }, tenantId)
      ).rejects.toThrow('material_code, category, origin_type, and base_cost are required');
    });

    it('should validate tenantId is provided', async () => {
      await expect(createMaterialSafe(payload, null)).rejects.toThrow(
        'tenantId is required (materials are tenant-scoped)'
      );
    });

    it('should enforce tenant isolation (same material_code, different tenants)', async () => {
      const tenant1Id = '11111111-1111-1111-1111-111111111111';
      const tenant2Id = '22222222-2222-2222-2222-222222222222';

      const material1 = { id: 'mat-1', ...payload, tenant_id: tenant1Id };
      const material2 = { id: 'mat-2', ...payload, tenant_id: tenant2Id };

      // First call for tenant1 - creates new material
      mockDb.query.mockResolvedValueOnce({ rows: [material1] });
      const result1 = await createMaterialSafe(payload, tenant1Id);

      // Second call for tenant2 - creates new material (different tenant)
      mockDb.query.mockResolvedValueOnce({ rows: [material2] });
      const result2 = await createMaterialSafe(payload, tenant2Id);

      expect(result1.id).toBe('mat-1');
      expect(result1.tenant_id).toBe(tenant1Id);
      expect(result2.id).toBe('mat-2');
      expect(result2.tenant_id).toBe(tenant2Id);
    });
  });

  describe('upsertMaterialForSeed()', () => {
    const tenantId = '11111111-1111-1111-1111-111111111111';
    const payload = {
      material_code: 'SEED-001',
      category: 'PIPE',
      origin_type: 'NON_CHINA',
      base_cost: 100.0,
    };

    it('should insert new material successfully', async () => {
      const newMaterial = { id: 'mat-1', ...payload, tenant_id: tenantId };
      mockDb.query.mockResolvedValueOnce({ rows: [newMaterial] });

      const result = await upsertMaterialForSeed(payload, tenantId);

      expect(result).toEqual(newMaterial);
      expect(mockDb.query).toHaveBeenCalledTimes(1);
      expect(mockDb.query.mock.calls[0][0]).toContain('ON CONFLICT (tenant_id, material_code) DO UPDATE');
    });

    it('should update existing material on conflict (upsert behavior)', async () => {
      const updatedPayload = {
        ...payload,
        category: 'FLANGE', // Changed category
        base_cost: 200.0, // Changed cost
      };

      const updatedMaterial = { id: 'mat-1', ...updatedPayload, tenant_id: tenantId };
      mockDb.query.mockResolvedValueOnce({ rows: [updatedMaterial] });

      const result = await upsertMaterialForSeed(updatedPayload, tenantId);

      expect(result).toEqual(updatedMaterial);
      expect(result.category).toBe('FLANGE'); // New category applied
      expect(result.base_cost).toBe(200.0); // New cost applied
      expect(mockDb.query).toHaveBeenCalledTimes(1);
    });

    it('should validate required fields', async () => {
      await expect(
        upsertMaterialForSeed({ material_code: 'SEED' }, tenantId)
      ).rejects.toThrow('material_code, category, origin_type, and base_cost are required');
    });

    it('should validate tenantId is provided', async () => {
      await expect(upsertMaterialForSeed(payload, null)).rejects.toThrow(
        'tenantId is required (materials are tenant-scoped)'
      );
    });
  });

  describe('Safety Contract Comparison', () => {
    const tenantId = '11111111-1111-1111-1111-111111111111';
    const originalPayload = {
      material_code: 'COMPARE-001',
      category: 'PIPE',
      origin_type: 'NON_CHINA',
      base_cost: 100.0,
    };

    const updatedPayload = {
      material_code: 'COMPARE-001',
      category: 'FLANGE', // Changed
      origin_type: 'NON_CHINA',
      base_cost: 200.0, // Changed
    };

    it('createMaterialSafe does NOT overwrite existing fields', async () => {
      const existingMaterial = { id: 'mat-1', ...originalPayload, tenant_id: tenantId };

      // Conflict: return empty rows, then return existing material
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      mockDb.query.mockResolvedValueOnce({ rows: [existingMaterial] });

      const result = await createMaterialSafe(updatedPayload, tenantId);

      expect(result.category).toBe('PIPE'); // Original preserved
      expect(result.base_cost).toBe(100.0); // Original preserved
    });

    it('upsertMaterialForSeed DOES overwrite existing fields', async () => {
      const updatedMaterial = { id: 'mat-1', ...updatedPayload, tenant_id: tenantId };

      mockDb.query.mockResolvedValueOnce({ rows: [updatedMaterial] });

      const result = await upsertMaterialForSeed(updatedPayload, tenantId);

      expect(result.category).toBe('FLANGE'); // New value applied
      expect(result.base_cost).toBe(200.0); // New value applied
    });
  });
});
