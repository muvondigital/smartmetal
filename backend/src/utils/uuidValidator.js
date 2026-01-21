/**
 * UUID Validation and Normalization Utilities
 *
 * Purpose: Prevent PostgreSQL 22P02 errors (invalid UUID)
 * Context: Empty strings ("") passed to UUID parameters cause crashes
 * Solution: Normalize empty strings to null, validate UUIDs at boundaries
 */

const { ValidationError } = require('../middleware/errorHandler');

// UUID validation regex (RFC 4122 compliant)
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Check if a value is a valid UUID string
 * @param {any} value - Value to check
 * @returns {boolean} True if valid UUID, false otherwise
 */
function isValidUuid(value) {
  if (!value || typeof value !== 'string') {
    return false;
  }

  const trimmed = value.trim();
  return trimmed.length === 36 && UUID_REGEX.test(trimmed);
}

/**
 * Normalize UUID value to prevent empty string errors
 *
 * Rules:
 * - Empty string ("") → null
 * - null/undefined → null
 * - Valid UUID → trimmed UUID string
 * - Invalid UUID → throws ValidationError with field name
 *
 * @param {any} value - Value to normalize
 * @param {string} fieldName - Field name for error messages (e.g., "tenantId", "userId", "rfqId")
 * @returns {string|null} Normalized UUID or null
 * @throws {ValidationError} If value is non-empty but not a valid UUID
 *
 * @example
 * normalizeUuid("", "tenantId") // returns null
 * normalizeUuid(null, "userId") // returns null
 * normalizeUuid("abc-def", "rfqId") // throws ValidationError
 * normalizeUuid("550e8400-e29b-41d4-a716-446655440000", "id") // returns trimmed UUID
 */
function normalizeUuid(value, fieldName = 'id') {
  // Case 1: null, undefined, or empty string → return null
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();

    // Case 2: Empty string after trimming → return null
    if (trimmed === '') {
      return null;
    }

    // Case 3: Non-empty string → must be valid UUID
    if (!UUID_REGEX.test(trimmed)) {
      throw new ValidationError(
        `Invalid ${fieldName}: must be a valid UUID (got: "${value}")`
      );
    }

    return trimmed;
  }

  // Case 4: Non-string, non-null value → invalid
  throw new ValidationError(
    `Invalid ${fieldName}: expected UUID string, got ${typeof value}`
  );
}

/**
 * Normalize multiple UUID fields in an object
 *
 * @param {Object} obj - Object containing UUID fields
 * @param {Array<string>} fields - Array of field names to normalize
 * @returns {Object} New object with normalized UUIDs
 * @throws {ValidationError} If any field contains invalid UUID
 *
 * @example
 * normalizeUuids({ userId: "", tenantId: "valid-uuid" }, ["userId", "tenantId"])
 * // returns { userId: null, tenantId: "valid-uuid" }
 */
function normalizeUuids(obj, fields) {
  const normalized = { ...obj };

  for (const field of fields) {
    if (field in normalized) {
      normalized[field] = normalizeUuid(normalized[field], field);
    }
  }

  return normalized;
}

/**
 * Validate UUID and throw if invalid (does not normalize empty to null)
 * Use this when UUID is required (not optional)
 *
 * @param {any} value - Value to validate
 * @param {string} fieldName - Field name for error messages
 * @returns {string} Trimmed UUID string
 * @throws {ValidationError} If value is missing or invalid
 */
function requireUuid(value, fieldName = 'id') {
  const normalized = normalizeUuid(value, fieldName);

  if (normalized === null) {
    throw new ValidationError(`${fieldName} is required`);
  }

  return normalized;
}

module.exports = {
  isValidUuid,
  normalizeUuid,
  normalizeUuids,
  requireUuid,
  UUID_REGEX,
};
