/**
 * Tenant-Aware Configuration System
 * 
 * Provides tenant-specific configuration by reading from tenant_settings table
 * with fallback to default static configuration.
 * 
 * This system replaces hardcoded NSC-specific values with tenant-configurable settings.
 * 
 * Configuration Keys:
 * - approval_rules: Approval workflow thresholds and SLAs
 * - lme_config: LME pricing engine settings
 * - stage9_config: Intelligence and automation settings
 * - pricing_rules: Default pricing rules
 * - email_config: Email notification settings
 * - rounding_rules: Price rounding rules
 * 
 * Usage:
 *   const config = require('./config/tenantConfig');
 *   const approvalConfig = await config.getApprovalConfig(tenantId);
 *   const lmeConfig = await config.getLmeConfig(tenantId);
 */

const { connectDb } = require('../db/supabaseClient');
const { withTenantContext } = require('../db/tenantContext');
const approvalRulesDefault = require('./approvalRules');
const { log } = require('../utils/logger');

// In-memory cache for tenant settings
// TODO: Replace with GCP Memorystore (Redis) for production
const cacheService = require('../services/cacheService');
const CACHE_TTL_SECONDS = 10 * 60; // 10 minutes in seconds

/**
 * Get tenant setting by key
 */
async function getTenantSetting(tenantId, key) {
  // Validate tenantId to prevent empty string UUID errors
  if (!tenantId || typeof tenantId !== 'string' || tenantId.trim() === '') {
    throw new Error(`getTenantSetting: invalid tenantId (value: "${tenantId}", type: ${typeof tenantId})`);
  }

  const normalizedTenantId = tenantId.trim();
  const cacheKey = `tenant:${normalizedTenantId}:${key}`;

  const value = await cacheService.getOrSet(
    cacheKey,
    async () => {
      // Use withTenantContext to ensure RLS context is set
      return await withTenantContext(normalizedTenantId, async (client) => {
        const result = await client.query(
          `SELECT value FROM tenant_settings WHERE tenant_id = $1 AND key = $2`,
          [normalizedTenantId, key]
        );

        if (result.rows.length === 0) {
          return null;
        }

        return result.rows[0].value;
      });
    },
    CACHE_TTL_SECONDS
  );

  return value;
}

/**
 * Set tenant setting
 */
async function setTenantSetting(tenantId, key, value) {
  // Validate tenantId to prevent empty string UUID errors
  if (!tenantId || typeof tenantId !== 'string' || tenantId.trim() === '') {
    throw new Error(`setTenantSetting: invalid tenantId (value: "${tenantId}", type: ${typeof tenantId})`);
  }

  const normalizedTenantId = tenantId.trim();

  // Use withTenantContext to ensure RLS context is set
  await withTenantContext(normalizedTenantId, async (client) => {
    await client.query(`
      INSERT INTO tenant_settings (tenant_id, key, value)
      VALUES ($1, $2, $3)
      ON CONFLICT (tenant_id, key)
      DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `, [normalizedTenantId, key, JSON.stringify(value)]);
  });

  // Clear cache for this key
  await cacheService.del(`tenant:${normalizedTenantId}:${key}`);
}

/**
 * Get approval configuration for tenant
 */
async function getApprovalConfig(tenantId) {
  const tenantSettings = await getTenantSetting(tenantId, 'approval_rules');
  
  if (tenantSettings) {
    // Merge tenant-specific settings with defaults
    return {
      ...approvalRulesDefault,
      ...tenantSettings,
      // Deep merge for nested objects
      sla: {
        ...approvalRulesDefault.sla,
        ...(tenantSettings.sla || {})
      },
      thresholds: {
        ...approvalRulesDefault.thresholds,
        ...(tenantSettings.thresholds || {})
      }
    };
  }
  
  return approvalRulesDefault;
}

/**
 * Get LME configuration for tenant
 */
async function getLmeConfig(tenantId) {
  // LME feature removed
  return null;
}

/**
 * Get Stage 9 configuration for tenant
 */
async function getStage9Config(tenantId) {
  const tenantSettings = await getTenantSetting(tenantId, 'stage9_config');
  
  if (tenantSettings) {
    return {
      ...stage9ConfigDefault,
      ...tenantSettings
    };
  }
  
  return stage9ConfigDefault;
}

/**
 * Get pricing rules configuration for tenant
 */
async function getPricingRulesConfig(tenantId) {
  const tenantSettings = await getTenantSetting(tenantId, 'pricing_rules');
  
  if (tenantSettings) {
    return tenantSettings;
  }
  
  // Return default pricing rules config
  return {
    defaultMarkup: 0.20, // 20%
    defaultLogistics: 0.05, // 5%
    defaultRisk: 0.02, // 2%
    roundingRules: {
      material: 'nearest_10',
      fabrication: 'nearest_1'
    }
  };
}

/**
 * Get email configuration for tenant
 */
async function getEmailConfig(tenantId) {
  const tenantSettings = await getTenantSetting(tenantId, 'email_config');
  
  if (tenantSettings) {
    return tenantSettings;
  }
  
  // Return default email config
  return {
    fromEmail: process.env.SMTP_FROM_EMAIL || 'noreply@smartmetal.com',
    fromName: 'SmartMetal Platform',
    replyTo: process.env.SMTP_REPLY_TO || null
  };
}

/**
 * Get rounding rules for tenant
 */
async function getRoundingRules(tenantId) {
  const pricingConfig = await getPricingRulesConfig(tenantId);
  return pricingConfig.roundingRules || {
    material: 'nearest_10',
    fabrication: 'nearest_1'
  };
}

/**
 * Get dashboard configuration for tenant
 *
 * Returns dashboard layout configuration with widget rows and spans.
 * Falls back to default Vendavo-style layout if not configured.
 */
async function getDashboardConfig(tenantId) {
  const tenantSettings = await getTenantSetting(tenantId, 'dashboard_config');

  if (tenantSettings) {
    return tenantSettings;
  }

  // Return default dashboard layout (Vendavo-style)
  return {
    rows: [
      {
        id: 'kpi-row',
        height: 'auto',
        widgets: [
          { id: 'kpi_total_rfq', span: 1 },
          { id: 'kpi_pending_approval', span: 1 },
          { id: 'kpi_approved_quotes', span: 1 },
          { id: 'kpi_quote_revenue', span: 1 },
        ],
      },
      {
        id: 'price-changes-row',
        height: 'auto',
        widgets: [
          { id: 'price_changes', span: 1 },
        ],
      },
      {
        id: 'chart-row',
        height: 'chart',
        widgets: [
          { id: 'quote_revenue_trend', span: 1 },
        ],
      },
      {
        id: 'tables-row',
        height: 'tables',
        widgets: [
          { id: 'table_submitted_for_approval', span: 1 },
          { id: 'table_ready_next_steps', span: 1 },
          { id: 'table_recent_quotes', span: 1 },
        ],
      },
    ],
  };
}

/**
 * Get all tenant IDs
 */
async function getAllTenantIds() {
  const db = await connectDb();
  const result = await db.query(`SELECT DISTINCT id FROM tenants WHERE is_active = true`);
  return result.rows.map(row => row.id);
}

/**
 * Get tenant country configuration
 * 
 * Part of Phase 10: Country-Specific Regulatory Profiles
 * 
 * Returns tenant's home country and allowed countries of import.
 * Falls back to Malaysia if not set.
 */
async function getTenantCountryConfig(tenantId) {
  if (!tenantId) {
    log.logWarn('getTenantCountryConfig: No tenantId provided');
    return {
      homeCountry: 'MY',
      allowedCountriesOfImport: [],
    };
  }

  try {
    const db = await connectDb();
    const result = await db.query(
      `SELECT home_country, allowed_countries_of_import FROM tenants WHERE id = $1`,
      [tenantId]
    );

    if (result.rows.length === 0) {
      log.logWarn('getTenantCountryConfig: Tenant not found', { tenantId });
      return {
        homeCountry: 'MY',
        allowedCountriesOfImport: [],
      };
    }

    const row = result.rows[0];
    return {
      homeCountry: row.home_country || 'MY',
      allowedCountriesOfImport: row.allowed_countries_of_import || [],
    };
  } catch (error) {
    log.logError('getTenantCountryConfig: Database error', {
      error: error.message,
      tenantId,
    });
    return {
      homeCountry: 'MY',
      allowedCountriesOfImport: [],
    };
  }
}

/**
 * Set tenant country configuration
 * 
 * Updates tenant's home country and allowed countries of import.
 * Clears related caches after update.
 */
async function setTenantCountryConfig(tenantId, config) {
  if (!tenantId) {
    throw new Error('setTenantCountryConfig: tenantId is required');
  }

  const { homeCountry, allowedCountriesOfImport } = config;

  try {
    const db = await connectDb();
    
    const updates = [];
    const params = [];
    let paramCount = 1;

    if (homeCountry !== undefined) {
      updates.push(`home_country = $${paramCount}`);
      params.push(homeCountry);
      paramCount++;
    }

    if (allowedCountriesOfImport !== undefined) {
      updates.push(`allowed_countries_of_import = $${paramCount}`);
      params.push(JSON.stringify(allowedCountriesOfImport));
      paramCount++;
    }

    if (updates.length === 0) {
      return; // Nothing to update
    }

    params.push(tenantId);

    await db.query(
      `UPDATE tenants SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${paramCount}`,
      params
    );

    log.logInfo('setTenantCountryConfig: Configuration updated', {
      tenantId,
      homeCountry,
      allowedCountriesOfImport,
    });

    // Clear relevant caches
    await clearSettingsCache(tenantId);
  } catch (error) {
    log.logError('setTenantCountryConfig: Database error', {
      error: error.message,
      tenantId,
      config,
    });
    throw error;
  }
}

/**
 * Clear settings cache (useful for testing or when settings change)
 */
async function clearSettingsCache(tenantId = null) {
  if (tenantId) {
    // Clear all keys for this tenant using pattern matching
    await cacheService.delPattern(`tenant:${tenantId}:*`);
  } else {
    // Clear all tenant cache keys
    await cacheService.delPattern('tenant:*');
  }
}

module.exports = {
  getTenantSetting,
  setTenantSetting,
  getApprovalConfig,
  getLmeConfig,
  getStage9Config,
  getPricingRulesConfig,
  getEmailConfig,
  getRoundingRules,
  getDashboardConfig,
  getTenantCountryConfig,
  setTenantCountryConfig,
  getAllTenantIds,
  clearSettingsCache
};

