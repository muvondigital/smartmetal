/**
 * Authentication and Authorization Middleware
 * Provides JWT-based authentication and role-based access control
 */

const jwt = require('jsonwebtoken');
const { config } = require('../config/env');
const { AuthenticationError, AuthorizationError } = require('./errorHandler');

/**
 * Extract JWT token from request
 * Supports Bearer token in Authorization header or token query parameter
 */
function extractToken(req) {
  // Try Authorization header first
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  // Fallback to query parameter (for development/debugging)
  if (req.query.token) {
    return req.query.token;
  }

  return null;
}

/**
 * Verify JWT token and attach user to request
 */
async function authenticate(req, res, next) {
  try {
    const token = extractToken(req);

    if (!token) {
      throw new AuthenticationError('No authentication token provided');
    }

    if (!config.auth.jwtSecret) {
      console.warn('⚠️  JWT_SECRET not configured. Authentication disabled.');
      // In development, allow bypass if JWT_SECRET not set
      if (config.server.nodeEnv === 'development') {
        req.user = {
          id: 'dev-user',
          email: 'dev@example.com',
          name: 'Development User',
          role: 'manager',
        };
        return next();
      }
      throw new AuthenticationError('Authentication is not configured');
    }

    try {
      const decoded = jwt.verify(token, config.auth.jwtSecret);
      req.user = decoded;
      next();
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw new AuthenticationError('Token has expired');
      }
      if (error.name === 'JsonWebTokenError') {
        throw new AuthenticationError('Invalid token');
      }
      throw error;
    }
  } catch (error) {
    next(error);
  }
}

/**
 * Optional authentication - doesn't fail if no token
 */
function optionalAuth(req, res, next) {
  const token = extractToken(req);
  
  if (!token) {
    req.user = null;
    return next();
  }

  if (!config.auth.jwtSecret) {
    req.user = null;
    return next();
  }

  try {
    const decoded = jwt.verify(token, config.auth.jwtSecret);
    req.user = decoded;
    next();
  } catch (error) {
    // Ignore token errors for optional auth
    req.user = null;
    next();
  }
}

/**
 * Role-based authorization middleware factory
 * @param {string[]} allowedRoles - Array of allowed roles
 */
function authorize(...allowedRoles) {
  return (req, res, next) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required');
      }

      const userRole = req.user.role || 'user';

      if (!allowedRoles.includes(userRole)) {
        throw new AuthorizationError(
          `Access denied. Required roles: ${allowedRoles.join(', ')}`
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Check if user owns resource or has admin role
 * @param {Function} resourceOwnerCheck - Async function that returns true if user owns resource
 */
function authorizeOwnerOrRole(resourceOwnerCheck, ...allowedRoles) {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required');
      }

      const userRole = req.user.role || 'user';

      // Check role first
      if (allowedRoles.includes(userRole)) {
        return next();
      }

      // Check ownership
      const isOwner = await resourceOwnerCheck(req);
      if (isOwner) {
        return next();
      }

      throw new AuthorizationError('Access denied. You do not have permission to access this resource.');
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Generate JWT token for user
 * @param {Object} user - User object with id, email, name, role
 * @returns {string} JWT token
 */
function generateToken(user) {
  if (!config.auth.jwtSecret) {
    throw new Error('JWT_SECRET is not configured');
  }

  const payload = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role || 'user',
  };

  return jwt.sign(payload, config.auth.jwtSecret, {
    expiresIn: config.auth.jwtExpiresIn,
  });
}

/**
 * Role definitions
 */
const ROLES = {
  ADMIN: 'admin',
  MANAGER: 'manager',
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

