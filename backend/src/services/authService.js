/**
 * Authentication Service
 * Handles user authentication, password validation, and user lookup
 * 
 * Part of: Shared login portal (Mode A) - Multi-tenant authentication
 */

const bcrypt = require('bcrypt');
const { connectDb } = require('../db/supabaseClient');
const { generateToken } = require('../middleware/auth');
const { AuthenticationError } = require('../middleware/errorHandler');
const log = require('../utils/logger');
const { isValidUuid, normalizeUuid } = require('../utils/uuidValidator');
const { retryDbOperation } = require('../utils/dbWarmup');

// Legacy UUID validation helper (kept for backward compatibility)
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isValidUUID(value) {
  return isValidUuid(value);
}

/**
 * Find user by email (searches across all tenants)
 * In Mode A (shared portal), we need to find the user first, then get their tenant
 * 
 * @param {string} email - User email
 * @returns {Promise<Object|null>} - User object with tenant info or null
 */
async function findUserByEmail(email) {
  // Validate email parameter
  if (!email || typeof email !== 'string' || email.trim().length === 0) {
    log.logWarn('findUserByEmail called with invalid email', { email });
    return null;
  }

  // Wrap database operation with retry logic to handle warmup issues
  return await retryDbOperation(
    async () => {
      const db = await connectDb();

      // Filter out users with invalid tenant_id to prevent UUID errors
      // Use subquery to filter invalid UUIDs (empty strings) before JOIN
      // This prevents PostgreSQL from trying to cast empty strings to UUID in JOIN condition
      // CRITICAL: Filter by text length and pattern BEFORE attempting UUID cast
      const result = await db.query(`
        SELECT
          u.id,
          u.email,
          u.password_hash,
          u.name,
          u.role,
          u.tenant_id,
          u.is_active,
          t.code as tenant_code,
          t.name as tenant_name,
          COALESCE(t.is_demo, false) as tenant_is_demo
        FROM users u
        INNER JOIN tenants t ON
          CASE
            WHEN u.tenant_id IS NULL OR TRIM(u.tenant_id::text) = '' THEN NULL
            ELSE u.tenant_id
          END = t.id
        WHERE LOWER(u.email) = LOWER($1)
          AND u.is_active = true
          AND t.is_active = true
          AND u.id IS NOT NULL
          AND TRIM(u.id::text) != ''
          AND u.tenant_id IS NOT NULL
          AND TRIM(u.tenant_id::text) != ''
          AND LENGTH(TRIM(u.tenant_id::text)) = 36
          AND t.id IS NOT NULL
          AND TRIM(t.id::text) != ''
        LIMIT 1
      `, [email.trim()]);

      if (result.rows.length === 0) {
        return null;
      }

      const user = result.rows[0];

      // Validate UUIDs after fetching to ensure data integrity
      if (!isValidUUID(user.id) || !isValidUUID(user.tenant_id)) {
        log.logWarn('User found but has invalid UUIDs', {
          email,
          userId: user.id,
          tenantId: user.tenant_id,
        });
        return null;
      }

      return user;
    },
    {
      maxRetries: 3,
      retryDelay: 500,
      backoffMultiplier: 1.5,
      operationName: 'Find user by email',
    }
  );
}

/**
 * Validate password against stored hash
 * 
 * @param {string} password - Plain text password
 * @param {string} passwordHash - Bcrypt hash from database
 * @returns {Promise<boolean>} - True if password matches
 */
async function validatePassword(password, passwordHash) {
  try {
    return await bcrypt.compare(password, passwordHash);
  } catch (error) {
    log.logError('Error validating password', {
      error: error.message,
    });
    return false;
  }
}

/**
 * Hash password using bcrypt
 * 
 * @param {string} password - Plain text password
 * @returns {Promise<string>} - Bcrypt hash
 */
async function hashPassword(password) {
  const saltRounds = 10;
  return await bcrypt.hash(password, saltRounds);
}

/**
 * Authenticate user with email and password
 * Returns user info, tenant info, and JWT token
 * 
 * @param {string} email - User email
 * @param {string} password - Plain text password
 * @returns {Promise<Object>} - { user, tenant, token }
 * @throws {AuthenticationError} - If authentication fails
 */
async function authenticateUser(email, password) {
  if (!email || !password) {
    throw new AuthenticationError('Email and password are required');
  }
  
  // Find user by email
  const user = await findUserByEmail(email);
  
  if (!user) {
    log.logWarn('Login attempt with invalid email', { email });
    throw new AuthenticationError('Invalid email or password');
  }
  
  // Validate password
  const isValidPassword = await validatePassword(password, user.password_hash);

  if (!isValidPassword) {
    log.logWarn('Login attempt with invalid password', {
      email,
      userId: user.id,
    });
    throw new AuthenticationError('Invalid email or password');
  }

  // SECURITY FIX #2: Double-check tenant isolation at login
  // Verify that the user's tenant is active and the user-tenant relationship is valid
  // This is defense-in-depth against database corruption or manual DB edits
  if (!user.tenant_id || user.tenant_id.trim() === '') {
    log.logError('User has no tenant_id assigned', {
      userId: user.id,
      email: user.email,
    });
    throw new AuthenticationError('Invalid user configuration');
  }

  if (!user.tenant_code || user.tenant_code.trim() === '') {
    log.logError('User tenant has no code assigned', {
      userId: user.id,
      email: user.email,
      tenantId: user.tenant_id,
    });
    throw new AuthenticationError('Invalid tenant configuration');
  }
  
  // Update last login timestamp (validate user.id first)
  if (isValidUUID(user.id)) {
    const db = await connectDb();
    try {
      await db.query(`
        UPDATE users
        SET last_login_at = NOW()
        WHERE id = $1::uuid
      `, [user.id.trim()]);
    } catch (error) {
      // Log but don't fail login if timestamp update fails
      log.logWarn('Failed to update last_login_at', {
        userId: user.id,
        error: error.message,
      });
    }
  } else {
    log.logWarn('Skipping last_login_at update - invalid user.id', {
      userId: user.id,
      email: user.email,
    });
  }
  
  // Generate JWT token
  // CRITICAL FIX: Normalize UUIDs to prevent empty string PostgreSQL errors (22P02)
  // Use normalizeUuid utility to ensure we never encode empty strings into JWT
  let normalizedUserId, normalizedTenantId;
  try {
    normalizedUserId = normalizeUuid(user.id, 'user.id');
    normalizedTenantId = normalizeUuid(user.tenant_id, 'user.tenant_id');
  } catch (error) {
    log.logError('Invalid UUID in user record - cannot generate token', {
      userId: user.id,
      email: user.email,
      tenantId: user.tenant_id,
      error: error.message,
    });
    throw new AuthenticationError('Authentication failed: invalid user or tenant configuration');
  }

  // Ensure user ID and tenant ID are present (not null after normalization)
  if (!normalizedUserId || !normalizedTenantId) {
    log.logError('Missing required UUID in user record', {
      userId: user.id,
      tenantId: user.tenant_id,
      email: user.email,
    });
    throw new AuthenticationError('Authentication failed: incomplete user configuration');
  }

  const normalizedTenantCode = (user.tenant_code && typeof user.tenant_code === 'string' && user.tenant_code.trim() !== '')
    ? user.tenant_code.trim()
    : null;

  let token;
  try {
    token = generateToken({
      id: normalizedUserId,
      email: user.email,
      role: user.role,
      tenantId: normalizedTenantId,
      tenantCode: normalizedTenantCode,
    });
  } catch (error) {
    log.logError('Failed to generate JWT token', {
      userId: user.id,
      error: error.message,
    });
    throw new AuthenticationError('Authentication failed: token generation error');
  }
  
  // Return user info (without password hash), tenant info, and token
  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
    tenant: {
      id: user.tenant_id,
      code: user.tenant_code,
      name: user.tenant_name,
      is_demo: user.tenant_is_demo || false,
    },
    token,
  };
}

/**
 * Get user by ID (for token validation, etc.)
 * 
 * @param {string} userId - User ID
 * @returns {Promise<Object|null>} - User object or null
 */
async function getUserById(userId) {
  // Validate userId before querying
  if (!isValidUUID(userId)) {
    log.logWarn('getUserById called with invalid userId', { userId });
    return null;
  }
  
  const db = await connectDb();
  
  try {
    // Filter out users with invalid tenant_id to prevent UUID errors
    // Use subquery to filter invalid UUIDs before JOIN
    const result = await db.query(`
      SELECT 
        u.id,
        u.email,
        u.name,
        u.role,
        u.tenant_id,
        u.is_active,
        t.code as tenant_code,
        t.name as tenant_name
      FROM (
        SELECT *
        FROM users
        WHERE id = $1
          AND is_active = true
          AND id IS NOT NULL
          AND id::text != ''
          AND LENGTH(id::text) = 36
          AND tenant_id IS NOT NULL
          AND tenant_id::text != ''
          AND LENGTH(tenant_id::text) = 36
      ) u
      INNER JOIN tenants t ON u.tenant_id = t.id
      WHERE t.is_active = true
    `, [userId]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    const user = result.rows[0];
    
    // Validate UUIDs after fetching
    if (!isValidUUID(user.id) || !isValidUUID(user.tenant_id)) {
      log.logWarn('User found but has invalid UUIDs', {
        userId: user.id,
        tenantId: user.tenant_id,
      });
      return null;
    }
    
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      tenant: {
        id: user.tenant_id,
        code: user.tenant_code,
        name: user.tenant_name,
      },
    };
  } catch (error) {
    log.logError('Error getting user by ID', {
      userId,
      error: error.message,
    });
    throw error;
  }
}

module.exports = {
  authenticateUser,
  findUserByEmail,
  validatePassword,
  hashPassword,
  getUserById,
};

