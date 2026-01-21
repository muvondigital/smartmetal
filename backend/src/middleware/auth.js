/**
 * Authentication and Authorization Middleware
 * Handles JWT-based authentication and role-based access control
 *
 * RBAC quick reference (MetaSteel/NSC):
 * - Role lives in the `users.role` column (created in migration 031).
 * - Current role constants: admin, manager, procurement, user, viewer (ROLES below).
 * - Historical migrations added sales_rep for early approvals; most seeded demo
 *   users map Sales to `user`.
 * - Price agreements V2 creation now allows manager/procurement/admin (sales
 *   blocked); approvals approve/reject stay on manager/admin; submissions only
 *   require authentication.
 */

const jwt = require('jsonwebtoken');
const { config } = require('../config/env');
const { AuthenticationError, AuthorizationError } = require('./errorHandler');
const { normalizeUuids, isValidUuid } = require('../utils/uuidValidator');
const { connectDb } = require('../db/supabaseClient');

// Track if dev auth bypass warning has been shown
let devAuthWarningShown = false;

// Log auth mode on startup
const { config: startupConfig } = require('../config/env');
if (startupConfig.auth.jwtSecret) {
  console.log('🔐 [AUTH] JWT_SECRET detected. Using normal authentication mode.');
} else if (startupConfig.server.nodeEnv !== 'production') {
  console.warn('⚠️  [AUTH] JWT_SECRET missing. Dev bypass mode ENABLED (NSC dev admin).');
}

/**
 * Extract JWT token from Authorization header
 * @param {Object} req - Express request object
 * @returns {string|null} - JWT token or null if not found
 */
function getTokenFromHeader(req) {
  const authHeader = req.headers.authorization || req.headers.Authorization;

  if (!authHeader) {
    return null;
  }

  // Expect format: "Bearer <token>"
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }

  return parts[1];
}

/**
 * Verify that a user belongs to the tenant they claim
 * This is a critical security check to prevent tenant isolation breaches
 *
 * @param {string} userId - User ID from JWT
 * @param {string} tenantId - Tenant ID from JWT
 * @throws {AuthenticationError} - If user doesn't belong to tenant or verification fails
 */
async function verifyUserTenantIsolation(userId, tenantId) {
  // Skip verification in dev mode if flag is set
  if (config.server.nodeEnv !== 'production' && process.env.SKIP_TENANT_VERIFICATION === 'true') {
    return;
  }

  // Validate inputs
  if (!isValidUuid(userId)) {
    throw new AuthenticationError('Invalid user ID format');
  }

  if (!isValidUuid(tenantId)) {
    throw new AuthenticationError('Invalid tenant ID format');
  }

  try {
    const db = await connectDb();

    // Verify user exists and belongs to the claimed tenant
    const result = await db.query(`
      SELECT u.id, u.tenant_id, u.is_active, t.is_active as tenant_is_active
      FROM users u
      INNER JOIN tenants t ON u.tenant_id = t.id
      WHERE u.id = $1::uuid
        AND u.tenant_id = $2::uuid
        AND u.is_active = true
        AND t.is_active = true
      LIMIT 1
    `, [userId.trim(), tenantId.trim()]);

    if (result.rows.length === 0) {
      // User doesn't exist, is inactive, or doesn't belong to this tenant
      console.warn('[AUTH SECURITY] Tenant isolation violation attempt detected', {
        userId,
        claimedTenantId: tenantId,
        timestamp: new Date().toISOString(),
      });
      throw new AuthenticationError('Invalid authentication credentials');
    }

    // Verification successful
    if (config.server.nodeEnv === 'development') {
      console.log('[AUTH] Tenant isolation verified', {
        userId,
        tenantId,
      });
    }
  } catch (error) {
    if (error instanceof AuthenticationError) {
      throw error;
    }
    // Log database errors but don't expose details to client
    console.error('[AUTH] Tenant isolation verification failed', {
      userId,
      tenantId,
      error: error.message,
    });
    throw new AuthenticationError('Authentication verification failed');
  }
}

/**
 * Authenticate middleware - requires valid JWT token
 * In development without JWT_SECRET, provides a dev user fallback
 * @throws {AuthenticationError} - If authentication fails
 */
async function authenticate(req, res, next) {
  try {
    const token = getTokenFromHeader(req);
    const jwtSecret = config.auth.jwtSecret;
    const isDevelopment = config.server.nodeEnv !== 'production';

    // Case 1: JWT secret is configured - strict authentication
    if (jwtSecret) {
      if (!token) {
        throw new AuthenticationError('Authentication required');
      }

      try {
        const decoded = jwt.verify(token, jwtSecret);

        // CRITICAL FIX: Normalize UUIDs to prevent empty string PostgreSQL errors (22P02)
        // If JWT contains tenantId: "" or id: "", convert to null to prevent DB crashes
        const normalizedUser = normalizeUuids(decoded, ['id', 'tenantId']);

        // SECURITY FIX #2: Verify tenant isolation
        // Ensure the user actually belongs to the tenant they claim in their JWT
        if (normalizedUser.id && normalizedUser.tenantId) {
          await verifyUserTenantIsolation(normalizedUser.id, normalizedUser.tenantId);
        }

        req.user = normalizedUser;

        // Development logging (DISABLED: too verbose for debugging, wastes tokens)
        // if (config.server.nodeEnv === 'development') {
        //   console.log('[AUTH] Token decoded', {
        //     email: normalizedUser.email,
        //     tenantCode: normalizedUser.tenantCode,
        //     userId: normalizedUser.id,
        //   });
        // }

        // Tenant info is included in JWT token (Mode A - shared portal)
        // Tenant middleware will use this if available
        return next();
      } catch (err) {
        if (err.name === 'TokenExpiredError') {
          throw new AuthenticationError('Token has expired');
        }
        if (err.name === 'JsonWebTokenError') {
          throw new AuthenticationError('Invalid token');
        }
        if (err instanceof AuthenticationError) {
          throw err; // Re-throw tenant isolation errors
        }
        throw new AuthenticationError('Invalid or expired token');
      }
    }

    // Case 2: No JWT secret in development - dev bypass mode
    if (!jwtSecret && isDevelopment) {
      // Show warning once
      if (!devAuthWarningShown) {
        console.warn('⚠️  WARNING: JWT_SECRET not set. Using development authentication bypass mode.');
        console.warn('   All requests will be authenticated as a dev admin user.');
        console.warn('   This is NOT secure and should NEVER be used in production!');
        devAuthWarningShown = true;
      }

      // If token provided, try to decode it (but don't verify)
      if (token) {
        try {
          // Decode without verification (for dev testing)
          const decoded = jwt.decode(token);
          if (decoded) {
            req.user = decoded;
            return next();
          }
        } catch (err) {
          // Ignore decode errors in dev mode
        }
      }

      // No token or decode failed - create dev user
      req.user = {
        id: 'dev-user',
        name: 'Dev User',
        email: 'dev@smartmetal.local',
        role: 'admin'
      };
      return next();
    }

    // Case 3: No JWT secret in production - fail
    throw new AuthenticationError('Authentication is not configured');
  } catch (error) {
    next(error);
  }
}

/**
 * Optional authentication middleware
 * Attaches user to request if valid token provided, but doesn't fail if missing
 */
async function optionalAuth(req, res, next) {
  try {
    const token = getTokenFromHeader(req);
    const jwtSecret = config.auth.jwtSecret;

    if (!token) {
      // No token provided - continue without user
      return next();
    }

    if (jwtSecret) {
      try {
        const decoded = jwt.verify(token, jwtSecret);

        // CRITICAL FIX: Normalize UUIDs to prevent empty string errors
        const normalizedUser = normalizeUuids(decoded, ['id', 'tenantId']);

        // SECURITY FIX #2: Verify tenant isolation (optional auth - don't fail on error)
        if (normalizedUser.id && normalizedUser.tenantId) {
          try {
            await verifyUserTenantIsolation(normalizedUser.id, normalizedUser.tenantId);
            req.user = normalizedUser;
          } catch (err) {
            // Invalid tenant isolation - continue without user (don't throw)
            console.warn('[AUTH] Optional auth tenant verification failed', {
              userId: normalizedUser.id,
              tenantId: normalizedUser.tenantId,
              error: err.message,
            });
            // Don't set req.user if verification failed
          }
        } else {
          req.user = normalizedUser;
        }

        // Development logging (DISABLED: too verbose for debugging, wastes tokens)
        // if (config.server.nodeEnv === 'development' && req.user) {
        //   console.log('[AUTH] Token decoded (optional)', {
        //     email: normalizedUser.email,
        //     tenantCode: normalizedUser.tenantCode,
        //     userId: normalizedUser.id,
        //   });
        // }
      } catch (err) {
        // Invalid token - continue without user (don't throw)
        // Could log this for security monitoring
      }
    } else if (config.server.nodeEnv !== 'production') {
      // Dev mode - try to decode token
      try {
        const decoded = jwt.decode(token);
        if (decoded) {
          req.user = decoded;
        }
      } catch (err) {
        // Ignore decode errors
      }
    }

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Role-based authorization middleware
 * Checks if authenticated user has one of the required roles
 * @param {...string} roles - Allowed roles (if empty, any authenticated user is allowed)
 * @returns {Function} - Express middleware function
 * @throws {AuthenticationError} - If user is not authenticated
 * @throws {AuthorizationError} - If user lacks required role
 */
function authorize(...roles) {
  return (req, res, next) => {
    try {
      // Check if user is authenticated
      if (!req.user) {
        throw new AuthenticationError('Authentication required');
      }

      // If no specific roles required, any authenticated user is allowed
      if (roles.length === 0) {
        return next();
      }

      // Check if user has required role
      if (!req.user.role) {
        throw new AuthorizationError('User role not found');
      }

      if (!roles.includes(req.user.role)) {
        throw new AuthorizationError('Insufficient permissions');
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Owner or role-based authorization middleware
 * Allows access if user is the owner (matches ID param) or has required role
 * @param {Object} options - Authorization options
 * @param {string} options.idParam - Request param containing the owner ID (default: 'id')
 * @param {string[]} options.roles - Roles that have access regardless of ownership (default: ['admin'])
 * @returns {Function} - Express middleware function
 * @throws {AuthenticationError} - If user is not authenticated
 * @throws {AuthorizationError} - If user is neither owner nor has required role
 */
function authorizeOwnerOrRole(options = {}) {
  const { idParam = 'id', roles = ['admin'] } = options;

  return (req, res, next) => {
    try {
      // Check if user is authenticated
      if (!req.user) {
        throw new AuthenticationError('Authentication required');
      }

      // Check if user has privileged role
      if (req.user.role && roles.includes(req.user.role)) {
        return next();
      }

      // Check if user is the owner
      const resourceOwnerId = req.params[idParam];
      if (resourceOwnerId && req.user.id === resourceOwnerId) {
        return next();
      }

      // Neither owner nor has required role
      throw new AuthorizationError('Forbidden');
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Generate JWT token for a user
 * @param {Object} user - User object with at least { id, email, role }
 * @returns {string} - Signed JWT token
 * @throws {Error} - If JWT_SECRET is not configured
 */
function generateToken(user) {
  const jwtSecret = config.auth.jwtSecret;
  const isDevelopment = config.server.nodeEnv !== 'production';

  // In development, use a default secret if not configured
  // WARNING: This should NEVER be used in production
  const secret = jwtSecret || (isDevelopment ? 'dev-secret-key-change-in-production' : null);

  if (!secret) {
    throw new Error('JWT_SECRET is not configured. Cannot generate authentication token.');
  }

  if (!jwtSecret && isDevelopment) {
    console.warn('⚠️  WARNING: Using default JWT_SECRET for development. Set JWT_SECRET in .env for production!');
  }

  const payload = {
    id: user.id,
    email: user.email,
    role: user.role,
    tenantId: user.tenantId,
    tenantCode: user.tenantCode,
  };

  const options = {
    expiresIn: config.auth.jwtExpiresIn || '7d',
  };

  return jwt.sign(payload, secret, options);
}

/**
 * Role definitions for convenience
 */
const ROLES = {
  ADMIN: 'admin',
  MANAGER: 'manager',
  PROCUREMENT: 'procurement',
  USER: 'user',
  VIEWER: 'viewer',
};

module.exports = {
  authenticate,
  optionalAuth,
  authorize,
  authorizeOwnerOrRole,
  generateToken,
  ROLES,
};

