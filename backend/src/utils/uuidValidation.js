/**
 * UUID Validation Utility
 * 
 * Provides centralized UUID validation to prevent empty strings and invalid UUIDs
 * from reaching the database, which causes "invalid input syntax for type uuid: "" errors.
 * 
 * This is used across routes and services to validate UUID inputs early.
 */

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validates that a value is a valid UUID string
 * @param {*} value - Value to validate
 * @returns {boolean} - True if valid UUID, false otherwise
 */
function isValidUuid(value) {
  if (!value) return false;
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed === '') return false; // Reject empty strings explicitly
  return UUID_REGEX.test(trimmed);
}

/**
 * Validates UUID and throws a descriptive error if invalid
 * @param {*} value - Value to validate
 * @param {string} fieldName - Name of the field for error message
 * @returns {string} - Trimmed UUID string if valid
 * @throws {Error} - If value is not a valid UUID
 */
function validateUuidOrThrow(value, fieldName = 'UUID') {
  if (!isValidUuid(value)) {
    throw new Error(
      `${fieldName} is required and must be a valid UUID string. Received: ${JSON.stringify(value)}`
    );
  }
  return value.trim();
}

module.exports = {
  isValidUuid,
  validateUuidOrThrow,
  UUID_REGEX,
};

