/**
 * Verify NSC Logistics Configuration
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { connectDb } = require('../src/db/supabaseClient');

async function verifyNscLogisticsConfig() {
  const db = await connectDb();

  try {
    console.log('='.repeat(80));
    console.log('NSC LOGISTICS CONFIGURATION VERIFICATION');
    console.log('='.repeat(80));
    console.log('');

    // Get NSC tenant
    const tenantResult = await db.query(
      `SELECT id, code, name FROM tenants WHERE code = 'nsc' LIMIT 1`
    );

    if (tenantResult.rows.length === 0) {
      throw new Error('NSC tenant not found');
    }

    const nscTenant = tenantResult.rows[0];
    console.log(`Tenant: ${nscTenant.code} (${nscTenant.name})`);
    console.log(`Tenant ID: ${nscTenant.id}\n`);

    // Get logistics config
    const result = await db.query(
      `SELECT key, value FROM tenant_settings WHERE tenant_id = $1 AND key = 'logistics_config'`,
      [nscTenant.id]
    );

    if (result.rows.length === 0) {
      console.log('❌ logistics_config not found in tenant_settings');
      return;
    }

    const config = result.rows[0].value;
    console.log('✅ logistics_config found\n');

    // Display HS code mappings
    console.log('HS Code Mappings:');
    console.log('-----------------');
    if (config.hsCodeMappings) {
      if (config.hsCodeMappings.pipes) {
        console.log('Pipes:');
        console.log(`  • Carbon Steel: ${config.hsCodeMappings.pipes.carbon_steel || 'N/A'}`);
        console.log(`  • Stainless Steel: ${config.hsCodeMappings.pipes.stainless_steel || 'N/A'}`);
        console.log(`  • Alloy: ${config.hsCodeMappings.pipes.alloy || 'N/A'}`);
      }
      if (config.hsCodeMappings.fittings) {
        console.log('Fittings:');
        console.log(`  • Elbows: ${config.hsCodeMappings.fittings.elbows || 'N/A'}`);
        console.log(`  • Tees: ${config.hsCodeMappings.fittings.tees || 'N/A'}`);
        console.log(`  • Reducers: ${config.hsCodeMappings.fittings.reducers || 'N/A'}`);
      }
      console.log(`Flanges: ${config.hsCodeMappings.flanges || 'N/A'}`);
      console.log(`Valves: ${config.hsCodeMappings.valves || 'N/A'}`);
      console.log(`Structural: ${config.hsCodeMappings.structural || 'N/A'}`);
    } else {
      console.log('❌ hsCodeMappings not found');
    }

    console.log('\nOther Fields:');
    console.log('-------------');
    console.log(`Sea Freight Routes: ${Object.keys(config.seaFreightRoutes || {}).length} routes`);
    console.log(`Inland Trucking Zones: ${Object.keys(config.inlandTruckingZones || {}).length} zones`);
    console.log(`Duty Rules: ${Object.keys(config.dutyRules || {}).length} rules`);
    console.log(`Duty Exemptions: ${(config.dutyExemptions || []).length} exemptions`);

    if (config._metadata) {
      console.log('\nMetadata:');
      console.log('---------');
      console.log(`HS Codes Source: ${config._metadata.hsCodesSource || 'N/A'}`);
      console.log(`HS Codes Populated At: ${config._metadata.hsCodesPopulatedAt || 'N/A'}`);
    }

    console.log('\n' + '='.repeat(80));
    console.log('✅ Verification completed');
    console.log('='.repeat(80));

  } catch (error) {
    console.error('❌ Verification failed:', error);
    throw error;
  } finally {
    await db.end();
  }
}

if (require.main === module) {
  verifyNscLogisticsConfig()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { verifyNscLogisticsConfig };
