/**
 * Authentication Routes
 * Handles login, logout, and user authentication endpoints
 * 
 * Part of: Shared login portal (Mode A) - Multi-tenant authentication
 */

const express = require('express');
const router = express.Router();
const { authenticateUser } = require('../services/authService');
const { asyncHandler, ValidationError } = require('../middleware/errorHandler');
const { body } = require('express-validator');
const { authRateLimiter } = require('../middleware/rateLimiter');
const log = require('../utils/logger');

/**
 * @route   POST /api/v1/auth/login
 * @desc    Authenticate user with email and password
 * @access  Public
 * 
 * Request body:
 * {
 *   "email": "user@example.com",
 *   "password": "password123"
 * }
 * 
 * Response:
 * {
 *   "user": {
 *     "id": "uuid",
 *     "email": "user@example.com",
 *     "name": "User Name",
 *     "role": "user"
 *   },
 *   "tenant": {
 *     "id": "uuid",
 *     "code": "NSC",
 *     "name": "NSC Sinergi"
 *   },
 *   "token": "jwt_token_here"
 * }
 */
router.post(
  '/login',
  authRateLimiter, // Rate limit login attempts
  [
    body('email')
      .isEmail()
      .withMessage('Email must be a valid email address')
      .normalizeEmail(),
    body('password')
      .notEmpty()
      .withMessage('Password is required')
      .isLength({ min: 1 })
      .withMessage('Password cannot be empty'),
  ],
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    
    // Validate input (express-validator handles this, but double-check)
    if (!email || !password) {
      throw new ValidationError('Email and password are required');
    }
    
    try {
      // Authenticate user
      const authResult = await authenticateUser(email, password);
      
      log.logInfo('User logged in successfully', {
        userId: authResult.user.id,
        email: authResult.user.email,
        tenantCode: authResult.tenant.code,
        role: authResult.user.role,
      });
      
      // Development logging for quick verification
      if (process.env.NODE_ENV === 'development') {
        console.log('[LOGIN] User logged in', {
          email: authResult.user.email,
          tenantCode: authResult.tenant.code,
          userId: authResult.user.id,
        });
      }
      
      // Return user info, tenant info, and token
      res.json({
        user: authResult.user,
        tenant: authResult.tenant,
        token: authResult.token,
      });
    } catch (error) {
      // Log failed login attempt
      log.logWarn('Login attempt failed', {
        email,
        error: error.message,
        ip: req.ip,
      });
      
      // Re-throw to be handled by error handler middleware
      throw error;
    }
  })
);

/**
 * @route   GET /api/v1/auth/me
 * @desc    Get current authenticated user info
 * @access  Private - Authenticated users
 * 
 * Response:
 * {
 *   "user": {
 *     "id": "uuid",
 *     "email": "user@example.com",
 *     "name": "User Name",
 *     "role": "user"
 *   },
 *   "tenant": {
 *     "id": "uuid",
 *     "code": "NSC",
 *     "name": "NSC Sinergi"
 *   }
 * }
 */
router.get(
  '/me',
  require('../middleware/auth').authenticate,
  asyncHandler(async (req, res) => {
    // User info is already attached by auth middleware
    // Fetch tenant information from the user's tenant_id
    // NOTE: We don't use tenantMiddleware here because /api/v1/auth/* routes are bypassed
    const db = await require('../db/supabaseClient').connectDb();
    let tenantInfo = null;

    if (req.user.tenant_id) {
      try {
        const tenantResult = await db.query(
          'SELECT id, code, name, is_demo FROM tenants WHERE id = $1 AND is_active = true',
          [req.user.tenant_id]
        );
        if (tenantResult.rows.length > 0) {
          tenantInfo = tenantResult.rows[0];
        }
      } catch (error) {
        console.error('Error fetching tenant for /me endpoint:', error);
      }
    }

    res.json({
      user: {
        id: req.user.id,
        email: req.user.email,
        name: req.user.name || req.user.email.split('@')[0],
        role: req.user.role,
      },
      tenant: tenantInfo ? {
        id: tenantInfo.id,
        code: tenantInfo.code,
        name: tenantInfo.name,
        is_demo: tenantInfo.is_demo || false,
      } : null,
    });
  })
);

module.exports = router;

