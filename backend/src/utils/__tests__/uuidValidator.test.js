/**
 * Unit tests for UUID validation and normalization utilities
 * Tests prevention of PostgreSQL 22P02 errors (invalid UUID)
 */

const {
  isValidUuid,
  normalizeUuid,
  normalizeUuids,
  requireUuid,
} = require('../uuidValidator');
const { ValidationError } = require('../../middleware/errorHandler');

describe('UUID Validator - POC Stability Fix', () => {
  const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';
  const VALID_UUID_UPPERCASE = '550E8400-E29B-41D4-A716-446655440000';

  describe('isValidUuid', () => {
    test('returns true for valid lowercase UUID', () => {
      expect(isValidUuid(VALID_UUID)).toBe(true);
    });

    test('returns true for valid uppercase UUID', () => {
      expect(isValidUuid(VALID_UUID_UPPERCASE)).toBe(true);
    });

    test('returns true for valid mixed-case UUID', () => {
      expect(isValidUuid('550e8400-E29B-41d4-A716-446655440000')).toBe(true);
    });

    test('returns true for UUID with whitespace (after trim)', () => {
      expect(isValidUuid(`  ${VALID_UUID}  `)).toBe(true);
    });

    test('returns false for empty string', () => {
      expect(isValidUuid('')).toBe(false);
    });

    test('returns false for null', () => {
      expect(isValidUuid(null)).toBe(false);
    });

    test('returns false for undefined', () => {
      expect(isValidUuid(undefined)).toBe(false);
    });

    test('returns false for non-UUID string', () => {
      expect(isValidUuid('abc-def-ghi')).toBe(false);
    });

    test('returns false for number', () => {
      expect(isValidUuid(12345)).toBe(false);
    });

    test('returns false for object', () => {
      expect(isValidUuid({ id: VALID_UUID })).toBe(false);
    });

    test('returns false for UUID with invalid version', () => {
      // Version digit must be 1-5 (position 14)
      expect(isValidUuid('550e8400-e29b-61d4-a716-446655440000')).toBe(false);
    });

    test('returns false for UUID with invalid variant', () => {
      // Variant must be 8, 9, a, or b (position 19)
      expect(isValidUuid('550e8400-e29b-41d4-c716-446655440000')).toBe(false);
    });
  });

  describe('normalizeUuid - Empty String Handling (PRIMARY FIX)', () => {
    test('converts empty string to null', () => {
      expect(normalizeUuid('', 'tenantId')).toBeNull();
    });

    test('converts whitespace-only string to null', () => {
      expect(normalizeUuid('   ', 'userId')).toBeNull();
    });

    test('converts tab/newline to null', () => {
      expect(normalizeUuid('\t\n', 'rfqId')).toBeNull();
    });

    test('converts null to null', () => {
      expect(normalizeUuid(null, 'id')).toBeNull();
    });

    test('converts undefined to null', () => {
      expect(normalizeUuid(undefined, 'id')).toBeNull();
    });
  });

  describe('normalizeUuid - Valid UUID Handling', () => {
    test('returns valid UUID unchanged', () => {
      expect(normalizeUuid(VALID_UUID, 'id')).toBe(VALID_UUID);
    });

    test('trims whitespace from valid UUID', () => {
      expect(normalizeUuid(`  ${VALID_UUID}  `, 'id')).toBe(VALID_UUID);
    });

    test('accepts uppercase UUID', () => {
      expect(normalizeUuid(VALID_UUID_UPPERCASE, 'id')).toBe(VALID_UUID_UPPERCASE);
    });

    test('accepts mixed-case UUID', () => {
      const mixedCase = '550e8400-E29B-41d4-A716-446655440000';
      expect(normalizeUuid(mixedCase, 'id')).toBe(mixedCase);
    });
  });

  describe('normalizeUuid - Invalid UUID Handling', () => {
    test('throws ValidationError for invalid UUID format', () => {
      expect(() => normalizeUuid('abc-def-ghi', 'tenantId')).toThrow(ValidationError);
      expect(() => normalizeUuid('abc-def-ghi', 'tenantId')).toThrow('Invalid tenantId');
    });

    test('throws ValidationError for malformed UUID', () => {
      expect(() => normalizeUuid('550e8400-XXXX-41d4-a716-446655440000', 'userId')).toThrow(
        ValidationError
      );
    });

    test('throws ValidationError for too-short string', () => {
      expect(() => normalizeUuid('123', 'rfqId')).toThrow(ValidationError);
    });

    test('throws ValidationError for too-long string', () => {
      expect(() =>
        normalizeUuid('550e8400-e29b-41d4-a716-446655440000-extra', 'id')
      ).toThrow(ValidationError);
    });

    test('throws ValidationError for number', () => {
      expect(() => normalizeUuid(12345, 'id')).toThrow(ValidationError);
    });

    test('throws ValidationError for object', () => {
      expect(() => normalizeUuid({ id: VALID_UUID }, 'id')).toThrow(ValidationError);
    });

    test('throws ValidationError for array', () => {
      expect(() => normalizeUuid([VALID_UUID], 'id')).toThrow(ValidationError);
    });

    test('includes field name in error message', () => {
      try {
        normalizeUuid('invalid', 'customFieldName');
        fail('Should have thrown ValidationError');
      } catch (error) {
        expect(error.message).toContain('customFieldName');
      }
    });

    test('includes invalid value in error message', () => {
      try {
        normalizeUuid('bad-uuid', 'tenantId');
        fail('Should have thrown ValidationError');
      } catch (error) {
        expect(error.message).toContain('bad-uuid');
      }
    });
  });

  describe('normalizeUuids - Batch Normalization', () => {
    test('normalizes multiple UUID fields', () => {
      const input = {
        userId: VALID_UUID,
        tenantId: '',
        rfqId: null,
      };

      const result = normalizeUuids(input, ['userId', 'tenantId', 'rfqId']);

      expect(result.userId).toBe(VALID_UUID);
      expect(result.tenantId).toBeNull();
      expect(result.rfqId).toBeNull();
    });

    test('preserves non-UUID fields', () => {
      const input = {
        userId: VALID_UUID,
        tenantId: '',
        email: 'test@example.com',
        name: 'Test User',
      };

      const result = normalizeUuids(input, ['userId', 'tenantId']);

      expect(result.userId).toBe(VALID_UUID);
      expect(result.tenantId).toBeNull();
      expect(result.email).toBe('test@example.com');
      expect(result.name).toBe('Test User');
    });

    test('throws ValidationError for invalid UUID in batch', () => {
      const input = {
        userId: VALID_UUID,
        tenantId: 'invalid-uuid',
      };

      expect(() => normalizeUuids(input, ['userId', 'tenantId'])).toThrow(ValidationError);
    });

    test('handles empty fields array', () => {
      const input = { userId: VALID_UUID };
      const result = normalizeUuids(input, []);
      expect(result).toEqual(input);
    });

    test('handles missing fields gracefully', () => {
      const input = { userId: VALID_UUID };
      const result = normalizeUuids(input, ['userId', 'tenantId']);
      expect(result.userId).toBe(VALID_UUID);
      expect(result.tenantId).toBeUndefined();
    });
  });

  describe('requireUuid - Required UUID Validation', () => {
    test('returns valid UUID', () => {
      expect(requireUuid(VALID_UUID, 'id')).toBe(VALID_UUID);
    });

    test('trims and returns valid UUID', () => {
      expect(requireUuid(`  ${VALID_UUID}  `, 'id')).toBe(VALID_UUID);
    });

    test('throws ValidationError for empty string', () => {
      expect(() => requireUuid('', 'tenantId')).toThrow(ValidationError);
      expect(() => requireUuid('', 'tenantId')).toThrow('tenantId is required');
    });

    test('throws ValidationError for null', () => {
      expect(() => requireUuid(null, 'userId')).toThrow(ValidationError);
      expect(() => requireUuid(null, 'userId')).toThrow('userId is required');
    });

    test('throws ValidationError for undefined', () => {
      expect(() => requireUuid(undefined, 'rfqId')).toThrow(ValidationError);
      expect(() => requireUuid(undefined, 'rfqId')).toThrow('rfqId is required');
    });

    test('throws ValidationError for invalid UUID', () => {
      expect(() => requireUuid('invalid-uuid', 'id')).toThrow(ValidationError);
    });

    test('includes field name in error message', () => {
      try {
        requireUuid(null, 'pricingRunId');
        fail('Should have thrown ValidationError');
      } catch (error) {
        expect(error.message).toContain('pricingRunId');
      }
    });
  });

  describe('Real-World Scenarios (from POC logs)', () => {
    test('prevents PostgreSQL 22P02 error for empty tenantId in login', () => {
      // Simulates: JWT decoding returns tenantId: ""
      const jwtPayload = {
        id: VALID_UUID,
        email: 'user@metasteel.com',
        tenantId: '', // PROBLEM: empty string
        tenantCode: 'METASTEEL',
      };

      const normalized = normalizeUuids(jwtPayload, ['id', 'tenantId']);

      expect(normalized.tenantId).toBeNull(); // Safe for SQL: WHERE tenant_id = $1 with null
      expect(normalized.id).toBe(VALID_UUID);
    });

    test('prevents PostgreSQL 22P02 error for empty userId in pricing', () => {
      // Simulates: req.userId becomes "" somehow
      const requestContext = {
        userId: '', // PROBLEM: empty string
        tenantId: VALID_UUID,
        rfqId: VALID_UUID,
      };

      const normalized = normalizeUuids(requestContext, ['userId', 'tenantId', 'rfqId']);

      expect(normalized.userId).toBeNull();
      expect(normalized.tenantId).toBe(VALID_UUID);
      expect(normalized.rfqId).toBe(VALID_UUID);
    });

    test('handles mixed valid/invalid/empty UUIDs in request', () => {
      const request = {
        userId: VALID_UUID,
        tenantId: '',
        rfqId: null,
        pricingRunId: '  ',
      };

      const normalized = normalizeUuids(request, [
        'userId',
        'tenantId',
        'rfqId',
        'pricingRunId',
      ]);

      expect(normalized.userId).toBe(VALID_UUID);
      expect(normalized.tenantId).toBeNull();
      expect(normalized.rfqId).toBeNull();
      expect(normalized.pricingRunId).toBeNull();
    });

    test('rejects invalid UUID before database query', () => {
      // Simulates: malformed UUID in request parameter
      const req = { params: { rfqId: 'not-a-uuid' } };

      expect(() => requireUuid(req.params.rfqId, 'rfqId')).toThrow(ValidationError);
      // This prevents: SELECT * FROM rfqs WHERE id = 'not-a-uuid'::uuid (22P02 error)
    });
  });

  describe('Edge Cases', () => {
    test('handles UUID-like string with wrong length', () => {
      expect(() => normalizeUuid('550e8400-e29b-41d4-a716-44665544000', 'id')).toThrow(
        ValidationError
      );
    });

    test('handles UUID with wrong number of hyphens', () => {
      expect(() => normalizeUuid('550e8400e29b41d4a716446655440000', 'id')).toThrow(
        ValidationError
      );
    });

    test('handles UUID with hyphens in wrong positions', () => {
      expect(() => normalizeUuid('550e-8400-e29b-41d4-a716-446655440000', 'id')).toThrow(
        ValidationError
      );
    });

    test('handles boolean false', () => {
      expect(() => normalizeUuid(false, 'id')).toThrow(ValidationError);
    });

    test('handles boolean true', () => {
      expect(() => normalizeUuid(true, 'id')).toThrow(ValidationError);
    });

    test('handles zero', () => {
      expect(() => normalizeUuid(0, 'id')).toThrow(ValidationError);
    });

    test('handles NaN', () => {
      expect(() => normalizeUuid(NaN, 'id')).toThrow(ValidationError);
    });
  });
});
