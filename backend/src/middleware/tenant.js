/**
 * Tenant Middleware (CLEAN, FIXED VERSION)
 *
 * Resolves tenant for every request:
 * - From JWT (preferred)
 * - From X-Tenant-Code header
 * - From NSC fallback (dev)
 *
 * Ensures:
 * - One single UUID regex in file (no duplicates)
 * - UUID validation helper
 * - Stable tenantId assignment
 */

const { connectDb } = require('../db/supabaseClient');
const { log } = require('../utils/logger');
const { normalizeUuid } = require('../utils/uuidValidator');

// Cache tenant lookup to avoid DB queries on every request
const tenantCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Reusable UUID validation regex
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUuid(value) {
  return (
    value &&
    typeof value === 'string' &&
    UUID_REGEX.test(value.trim())
  );
}

// Dev fallback tenant (only usable when explicitly enabled via env flag)
const DEV_FALLBACK_TENANT = {
  id: '00000000-0000-0000-0000-000000000000',
  name: 'DEV DEFAULT TENANT',
  code: 'DEV',
  is_active: true,
  is_demo: false
};

const ALLOW_DEV_TENANT_FALLBACK =
  process.env.ALLOW_DEV_TENANT_FALLBACK === 'true' &&
  process.env.NODE_ENV !== 'production';

let hasWarnedAboutMissingTable = false;

/* -------------------------------------------------------------------------- */
/*                          GET TENANT BY CODE                                */
/* -------------------------------------------------------------------------- */

async function getTenantByCode(tenantCode) {
  // Normalize: treat empty strings, null, undefined as missing
  if (!tenantCode || (typeof tenantCode === 'string' && !tenantCode.trim())) {
    return null;
  }

  const normalizedCode = tenantCode.trim().toUpperCase();

  const cached = tenantCache.get(normalizedCode);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.tenant;
  }

  try {
    const db = await connectDb();

    const result = await db.query(
      `SELECT id, name, code, is_active, is_demo
       FROM tenants
       WHERE UPPER(code) = $1 AND is_active = true
       LIMIT 1`,
      [normalizedCode]
    );

    if (result.rows.length === 0) return null;

    const tenant = result.rows[0];

    tenantCache.set(normalizedCode, {
      tenant,
      timestamp: Date.now()
    });

    return tenant;
  } catch (error) {
    if (error.code === '42P01' && process.env.NODE_ENV !== 'production') {
      if (!hasWarnedAboutMissingTable) {
        log.warn('⚠️  Tenants table missing. Using dev fallback.');
        hasWarnedAboutMissingTable = true;
      }
      return null;
    }
    throw error;
  }
}

/* -------------------------------------------------------------------------- */
/*                          GET DEFAULT TENANT (NSC)                          */
/* -------------------------------------------------------------------------- */

async function getDefaultTenant() {
  const cached = tenantCache.get('__default__');
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.tenant;
  }

  try {
    const db = await connectDb();

    const queryPromise = db.query(
      `SELECT id, name, code, is_active, is_demo
       FROM tenants
       WHERE code = 'nsc' AND is_active = true
       LIMIT 1`
    );

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Database query timeout after 5 seconds')), 5000)
    );

    const result = await Promise.race([queryPromise, timeoutPromise]);

    if (result.rows.length === 0) {
      log.warn('Default tenant (NSC) not found.');

      if (process.env.NODE_ENV !== 'production') {
        if (!hasWarnedAboutMissingTable) {
          log.warn('Using dev fallback tenant instead.');
          hasWarnedAboutMissingTable = true;
        }
        return DEV_FALLBACK_TENANT;
      }

      return null;
    }

    const tenant = result.rows[0];

    tenantCache.set('__default__', {
      tenant,
      timestamp: Date.now()
    });

    return tenant;
  } catch (error) {
    if (error.code === '42P01' && process.env.NODE_ENV !== 'production') {
      if (!hasWarnedAboutMissingTable) {
        log.warn('⚠️  Tenants table missing. Using dev fallback.');
        hasWarnedAboutMissingTable = true;
      }
      return DEV_FALLBACK_TENANT;
    }

    if (
      (error.message && error.message.includes('timeout')) ||
      (error.code && ['ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND'].includes(error.code))
    ) {
      if (process.env.NODE_ENV !== 'production') {
        if (!hasWarnedAboutMissingTable) {
          log.warn(`⚠️  DB connection issue (${error.message}). Using fallback tenant.`);
          hasWarnedAboutMissingTable = true;
        }
        return DEV_FALLBACK_TENANT;
      }
      throw error;
    }

    throw error;
  }
}

/* -------------------------------------------------------------------------- */
/*                           TENANT MIDDLEWARE                                */
/* -------------------------------------------------------------------------- */

async function tenantMiddleware(req, res, next) {
  try {
    // Skip tenant resolution for public auth endpoints (login, etc.)
    // Tenant is derived from the user's email during authentication.
    const path = (req.path || req.originalUrl || '').toLowerCase();
    if (process.env.NODE_ENV !== 'production' && process.env.TENANT_DEBUG === 'true') {
      console.log('[TENANT DEBUG] path:', path);
    }
    if (
      path === '/health' ||
      path === '/cors-test' ||
      path.startsWith('/auth') ||
      path.startsWith('/api/auth') ||
      path.startsWith('/api/v1/auth')
    ) {
      if (process.env.NODE_ENV !== 'production' && process.env.TENANT_DEBUG === 'true') {
        console.log('[TENANT DEBUG] bypass tenant middleware for public route');
      }
      return next();
    }

    /* -------------------------------------------- */
    /* 1. If tenant already resolved → skip          */
    /* -------------------------------------------- */
    // CRITICAL FIX: Normalize tenantId to prevent empty string errors
    if (req.tenantId) {
      req.tenantId = normalizeUuid(req.tenantId, 'tenantId');
      if (req.tenantId && isValidUuid(req.tenantId)) {
        return next();
      }
    }

    let tenant = null;

    /* -------------------------------------------- */
    /* 3. Strategy A — Tenant from JWT              */
    /* -------------------------------------------- */
    if (req.user && req.user.tenantId && req.user.tenantCode) {
      const t = await getTenantByCode(req.user.tenantCode);

      if (t && t.id === req.user.tenantId) {
        req.tenantId = t.id;
        req.tenantCode = t.code;
        req.tenant = t;
        return next();
      }

      // Authenticated user with mismatched or unknown tenant must not fall back
      return res.status(403).json({
        error: {
          code: 'TENANT_MISMATCH',
          message: 'Authenticated user tenant does not match provided tenant metadata.'
        }
      });
    }

    /* -------------------------------------------- */
    /* 4. Strategy B — X-Tenant-Code header         */
    /* -------------------------------------------- */
    const tenantCode = req.headers['x-tenant-code'] || req.headers['X-Tenant-Code'];

    // Normalize: treat empty strings as missing
    const normalizedTenantCode =
      tenantCode && typeof tenantCode === 'string' && tenantCode.trim()
        ? tenantCode.trim()
        : null;

    if (normalizedTenantCode) {
      tenant = await getTenantByCode(normalizedTenantCode);

      // If user authenticated → enforce tenant match
      if (tenant && req.user && req.user.tenantCode) {
        if (tenant.code.toUpperCase() !== req.user.tenantCode.toUpperCase()) {
          return res.status(403).json({
            error: {
              code: 'TENANT_MISMATCH',
              message: `User belongs to ${req.user.tenantCode}, but header says ${normalizedTenantCode}`
            }
          });
        }
      }

      if (!tenant) {
        return res.status(400).json({
          error: {
            code: 'TENANT_RESOLUTION_FAILED',
            message: `Unknown tenant: ${normalizedTenantCode}`
          }
        });
      }
    }

    /* -------------------------------------------- */
    /* 5. No tenant resolved → hard fail            */
    /* -------------------------------------------- */
    if (!tenant) {
      if (ALLOW_DEV_TENANT_FALLBACK) {
        log.warn('[TENANT] Fallback enabled via ALLOW_DEV_TENANT_FALLBACK – using DEV tenant', {
          path: req.originalUrl,
          userId: req.user?.id,
        });
        tenant = DEV_FALLBACK_TENANT;
      } else {
        return res.status(400).json({
          error: {
            code: 'TENANT_RESOLUTION_FAILED',
            message: 'Tenant could not be resolved from user claims or X-Tenant-Code header.'
          }
        });
      }
    }

    /* -------------------------------------------- */
    /* 6. Final UUID validation                     */
    /* -------------------------------------------- */
    if (!tenant || !tenant.id || !isValidUuid(tenant.id)) {
      console.error('[TENANT] Invalid tenant UUID detected:', {
        tenant: tenant ? { id: tenant.id, code: tenant.code } : null,
        tenantIdValid: tenant && tenant.id ? isValidUuid(tenant.id) : false
      });
      return res.status(500).json({
        error: { code: 'TENANT_ERROR', message: 'Invalid tenant UUID.' }
      });
    }

    /* -------------------------------------------- */
    /* 7. Attach tenant to request                  */
    /* -------------------------------------------- */
    // CRITICAL FIX: Normalize tenant.id to prevent empty string errors
    let validatedTenantId;
    try {
      validatedTenantId = normalizeUuid(tenant.id, 'tenant.id');
    } catch (error) {
      console.error('[TENANT] CRITICAL: Invalid tenant UUID:', {
        tenantId: tenant.id,
        tenantCode: tenant.code,
        error: error.message,
      });
      return res.status(500).json({
        error: { code: 'TENANT_ERROR', message: 'Invalid tenant UUID format.' }
      });
    }

    if (!validatedTenantId) {
      console.error('[TENANT] CRITICAL: Tenant ID is missing or empty:', {
        tenantId: tenant.id,
        tenantCode: tenant.code,
      });
      return res.status(500).json({
        error: { code: 'TENANT_ERROR', message: 'Invalid tenant UUID.' }
      });
    }

    req.tenantId = validatedTenantId;
    req.tenantCode = tenant.code;
    req.tenant = tenant;

    next();
  } catch (error) {
    log.error('Error in tenant middleware', error);

    return res.status(500).json({
      error: {
        code: 'TENANT_ERROR',
        message: 'Failed to determine tenant'
      }
    });
  }
}

/* -------------------------------------------------------------------------- */
/*                               EXPORTS                                      */
/* -------------------------------------------------------------------------- */

function clearTenantCache() {
  tenantCache.clear();
}

module.exports = {
  tenantMiddleware,
  getTenantByCode,
  getDefaultTenant,
  clearTenantCache
};
