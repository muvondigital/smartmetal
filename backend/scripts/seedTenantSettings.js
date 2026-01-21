/**
 * Seed Tenant Settings for NSC
 *
 * Seeds the required tenant settings (pricing_rules, approval_rules, rounding_rules)
 * into the tenant_settings table for NSC tenant.
 *
 * This script is critical for pricing runs to succeed.
 *
 * Usage:
 *   node backend/scripts/seedTenantSettings.js
 */

require('dotenv').config();
const { connectMigrationDb } = require('../src/db/supabaseClient');
const pricingRulesConfig = require('../src/config/pricingRules');
const approvalRulesConfig = require('../src/config/approvalRules');

async function seedTenantSettings() {
  console.log('🌱 Seeding tenant settings for NSC...\n');

  const db = await connectMigrationDb();

  try {
    // 1. Get NSC tenant ID
    console.log('Step 1: Finding NSC tenant...');
    const tenantResult = await db.query(`
      SELECT id, code, name FROM tenants WHERE code = 'nsc'
    `);

    if (tenantResult.rows.length === 0) {
      throw new Error('NSC tenant not found. Please run migration 023 first.');
    }

    const nscTenant = tenantResult.rows[0];
    console.log(`✓ Found NSC tenant: ${nscTenant.name} (${nscTenant.id})\n`);

    // 2. Prepare tenant settings
    console.log('Step 2: Preparing tenant settings...');

    // 2a. Pricing Rules - Store the entire pricingRules config
    const pricingRules = {
      quantityBreaks: pricingRulesConfig.quantityBreaks,
      clientSegmentMargins: pricingRulesConfig.clientSegmentMargins,
      categoryMarginOverrides: pricingRulesConfig.categoryMarginOverrides,
      approvalTriggers: pricingRulesConfig.approvalTriggers,
      fixedMarginClients: pricingRulesConfig.fixedMarginClients,
      regionalAdjustments: pricingRulesConfig.regionalAdjustments,
      industryAdjustments: pricingRulesConfig.industryAdjustments,
    };

    // 2b. Approval Rules - Store the entire approvalRules config
    const approvalRules = {
      sla: approvalRulesConfig.sla,
      valueThresholds: approvalRulesConfig.valueThresholds,
      marginThresholds: approvalRulesConfig.marginThresholds,
      discountThresholds: approvalRulesConfig.discountThresholds,
      specialConditions: approvalRulesConfig.specialConditions,
      thresholds: approvalRulesConfig.thresholds,
      approvers: approvalRulesConfig.approvers,
      roles: approvalRulesConfig.roles,
      backupApprovers: approvalRulesConfig.backupApprovers,
      escalation: approvalRulesConfig.escalation,
    };

    // 2c. Rounding Rules - Store from pricingRules config
    const roundingRules = pricingRulesConfig.roundingRules;

    console.log('✓ Prepared pricing_rules:', JSON.stringify(pricingRules, null, 2).substring(0, 200) + '...');
    console.log('✓ Prepared approval_rules:', JSON.stringify(approvalRules, null, 2).substring(0, 200) + '...');
    console.log('✓ Prepared rounding_rules:', JSON.stringify(roundingRules, null, 2) + '\n');

    // 3. Insert or update tenant settings
    console.log('Step 3: Inserting tenant settings into database...');

    const settings = [
      { key: 'pricing_rules', value: pricingRules },
      { key: 'approval_rules', value: approvalRules },
      { key: 'rounding_rules', value: roundingRules },
    ];

    for (const setting of settings) {
      await db.query(`
        INSERT INTO tenant_settings (tenant_id, key, value, created_at, updated_at)
        VALUES ($1, $2, $3, NOW(), NOW())
        ON CONFLICT (tenant_id, key)
        DO UPDATE SET
          value = EXCLUDED.value,
          updated_at = NOW()
      `, [nscTenant.id, setting.key, JSON.stringify(setting.value)]);

      console.log(`✓ Seeded: ${setting.key}`);
    }

    console.log('\n✅ Tenant settings seeded successfully!\n');

    // 4. Verify settings were inserted
    console.log('Step 4: Verifying tenant settings...');
    const verifyResult = await db.query(`
      SELECT key,
             jsonb_typeof(value) as value_type,
             jsonb_object_keys(value) as keys_sample
      FROM tenant_settings
      WHERE tenant_id = $1
      ORDER BY key
    `, [nscTenant.id]);

    if (verifyResult.rows.length === 0) {
      console.warn('⚠️  Warning: No tenant settings found after seeding!');
    } else {
      console.log('\nVerified tenant settings:');
      for (const row of verifyResult.rows) {
        console.log(`  - ${row.key}: ${row.value_type}`);
      }
    }

    console.log('\n✅ Seeding completed successfully!');
    console.log('\n📌 Next steps:');
    console.log('   1. Restart the backend server');
    console.log('   2. Try running pricing again');

  } catch (error) {
    console.error('\n❌ Error seeding tenant settings:', error);
    console.error('Stack:', error.stack);
    throw error;
  } finally {
    await db.end();
  }
}

// Run if called directly
if (require.main === module) {
  seedTenantSettings()
    .then(() => {
      console.log('\n✅ Script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Script failed:', error.message);
      process.exit(1);
    });
}

module.exports = { seedTenantSettings };
