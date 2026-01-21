/**
 * Seed NSC Tenant Settings
 * 
 * Populates tenant_settings table with NSC-specific configuration values
 * extracted from hardcoded config files.
 * 
 * This migration script moves NSC-specific values from code to data,
 * enabling multi-tenant configuration.
 */

const { connectDb } = require('../supabaseClient');
const approvalRules = require('../../config/approvalRules');
const lmeConfig = require('../../config/lmeConfig');
const stage9Config = require('../../config/stage9Config');

async function seedNscTenantSettings() {
  const db = await connectDb();
  
  console.log('Seeding NSC tenant settings...');
  
  try {
    // Get NSC tenant ID
    const tenantResult = await db.query(
      `SELECT id FROM tenants WHERE code = 'nsc' LIMIT 1`
    );
    
    if (tenantResult.rows.length === 0) {
      throw new Error('NSC tenant not found. Please run migration 023 first.');
    }
    
    const nscTenantId = tenantResult.rows[0].id;
    console.log(`Using NSC tenant ID: ${nscTenantId}`);
    
    // 1. Seed approval_rules
    await db.query(`
      INSERT INTO tenant_settings (tenant_id, key, value)
      VALUES ($1, 'approval_rules', $2)
      ON CONFLICT (tenant_id, key)
      DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `, [nscTenantId, JSON.stringify(approvalRules)]);
    console.log('✓ Seeded approval_rules');
    
    // 2. Seed lme_config
    await db.query(`
      INSERT INTO tenant_settings (tenant_id, key, value)
      VALUES ($1, 'lme_config', $2)
      ON CONFLICT (tenant_id, key)
      DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `, [nscTenantId, JSON.stringify(lmeConfig)]);
    console.log('✓ Seeded lme_config');
    
    // 3. Seed stage9_config
    await db.query(`
      INSERT INTO tenant_settings (tenant_id, key, value)
      VALUES ($1, 'stage9_config', $2)
      ON CONFLICT (tenant_id, key)
      DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `, [nscTenantId, JSON.stringify(stage9Config)]);
    console.log('✓ Seeded stage9_config');
    
    // 4. Seed pricing_rules (default rounding rules)
    const pricingRules = {
      defaultMarkup: 0.20, // 20%
      defaultLogistics: 0.05, // 5%
      defaultRisk: 0.02, // 2%
      roundingRules: {
        material: 'nearest_10',
        fabrication: 'nearest_1'
      }
    };
    
    await db.query(`
      INSERT INTO tenant_settings (tenant_id, key, value)
      VALUES ($1, 'pricing_rules', $2)
      ON CONFLICT (tenant_id, key)
      DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `, [nscTenantId, JSON.stringify(pricingRules)]);
    console.log('✓ Seeded pricing_rules');
    
    // 5. Seed email_config (if SMTP is configured)
    const emailConfig = {
      fromEmail: process.env.SMTP_FROM_EMAIL || 'noreply@smartmetal.com',
      fromName: 'SmartMetal Platform',
      replyTo: process.env.SMTP_REPLY_TO || null
    };
    
    await db.query(`
      INSERT INTO tenant_settings (tenant_id, key, value)
      VALUES ($1, 'email_config', $2)
      ON CONFLICT (tenant_id, key)
      DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `, [nscTenantId, JSON.stringify(emailConfig)]);
    console.log('✓ Seeded email_config');
    
    console.log('✅ NSC tenant settings seeded successfully');
    
  } catch (error) {
    console.error('❌ Error seeding NSC tenant settings:', error);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  seedNscTenantSettings()
    .then(() => {
      console.log('Seed completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Seed failed:', error);
      process.exit(1);
    });
}

module.exports = {
  seedNscTenantSettings
};

