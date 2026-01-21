/**
 * Verify Tenant Settings
 *
 * Verifies that tenant settings are properly seeded and accessible.
 * This script helps diagnose issues with pricing run preflight validation.
 *
 * Usage:
 *   node backend/scripts/verifyTenantSettings.js
 */

require('dotenv').config();
const { connectMigrationDb } = require('../src/db/supabaseClient');

async function verifyTenantSettings() {
  console.log('🔍 Verifying tenant settings for NSC...\n');

  const db = await connectMigrationDb();

  try {
    // 1. Get NSC tenant ID
    console.log('Step 1: Finding NSC tenant...');
    const tenantResult = await db.query(`
      SELECT id, code, name FROM tenants WHERE code = 'nsc'
    `);

    if (tenantResult.rows.length === 0) {
      throw new Error('NSC tenant not found.');
    }

    const nscTenant = tenantResult.rows[0];
    console.log(`✓ Found NSC tenant: ${nscTenant.name} (${nscTenant.id})\n`);

    // 2. Query tenant settings
    console.log('Step 2: Querying tenant settings...');
    const settingsResult = await db.query(`
      SELECT key, value
      FROM tenant_settings
      WHERE tenant_id = $1
      ORDER BY key
    `, [nscTenant.id]);

    if (settingsResult.rows.length === 0) {
      console.error('❌ No tenant settings found!');
      console.log('\n📌 Run this to seed tenant settings:');
      console.log('   node backend/scripts/seedTenantSettings.js\n');
      process.exit(1);
    }

    console.log(`✓ Found ${settingsResult.rows.length} tenant settings:\n`);

    // 3. Check required settings
    const requiredSettings = ['pricing_rules', 'approval_rules', 'rounding_rules'];
    const foundSettings = settingsResult.rows.map(row => row.key);

    let allFound = true;
    for (const requiredKey of requiredSettings) {
      const found = foundSettings.includes(requiredKey);
      const status = found ? '✓' : '❌';
      console.log(`${status} ${requiredKey}: ${found ? 'EXISTS' : 'MISSING'}`);

      if (found) {
        // Show a preview of the setting
        const setting = settingsResult.rows.find(row => row.key === requiredKey);
        const valueKeys = Object.keys(setting.value);
        console.log(`   Keys: ${valueKeys.slice(0, 5).join(', ')}${valueKeys.length > 5 ? ', ...' : ''}`);
      }

      allFound = allFound && found;
    }

    console.log('');

    if (!allFound) {
      console.error('❌ Some required tenant settings are missing!');
      console.log('\n📌 Run this to seed missing settings:');
      console.log('   node backend/scripts/seedTenantSettings.js\n');
      process.exit(1);
    }

    console.log('✅ All required tenant settings are present!');
    console.log('\n📌 Pricing runs should now work. Try:');
    console.log('   1. Log in to the app');
    console.log('   2. Navigate to an RFQ');
    console.log('   3. Click "Run Pricing"\n');

  } catch (error) {
    console.error('\n❌ Error verifying tenant settings:', error);
    console.error('Stack:', error.stack);
    throw error;
  } finally {
    await db.end();
  }
}

// Run if called directly
if (require.main === module) {
  verifyTenantSettings()
    .then(() => {
      console.log('✅ Verification completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Verification failed:', error.message);
      process.exit(1);
    });
}

module.exports = { verifyTenantSettings };
