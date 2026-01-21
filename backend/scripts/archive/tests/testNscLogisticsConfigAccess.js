/**
 * Test NSC Logistics Config Access
 * Verifies that logistics_config can be accessed through tenantConfig system
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { getTenantSetting } = require('../src/config/tenantConfig');

async function testNscLogisticsConfigAccess() {
  console.log('='.repeat(80));
  console.log('NSC LOGISTICS CONFIG ACCESS TEST');
  console.log('='.repeat(80));
  console.log('');

  try {
    // NSC tenant ID
    const nscTenantId = 'b449bdd1-a9d2-4a20-afa2-979316c9ef0e';

    console.log('📋 Testing access to logistics_config...');
    const logisticsConfig = await getTenantSetting(nscTenantId, 'logistics_config');

    if (!logisticsConfig) {
      console.log('❌ logistics_config not found');
      return false;
    }

    console.log('✅ logistics_config accessible\n');

    // Verify structure
    console.log('📋 Verifying configuration structure...');
    
    if (logisticsConfig.hsCodeMappings) {
      console.log('✅ hsCodeMappings found');
      if (logisticsConfig.hsCodeMappings.pipes) {
        console.log(`  • Pipes - Carbon Steel: ${logisticsConfig.hsCodeMappings.pipes.carbon_steel || 'N/A'}`);
        console.log(`  • Pipes - Stainless Steel: ${logisticsConfig.hsCodeMappings.pipes.stainless_steel || 'N/A'}`);
        console.log(`  • Pipes - Alloy: ${logisticsConfig.hsCodeMappings.pipes.alloy || 'N/A'}`);
      }
      if (logisticsConfig.hsCodeMappings.fittings) {
        console.log(`  • Fittings - Elbows: ${logisticsConfig.hsCodeMappings.fittings.elbows || 'N/A'}`);
        console.log(`  • Fittings - Tees: ${logisticsConfig.hsCodeMappings.fittings.tees || 'N/A'}`);
        console.log(`  • Fittings - Reducers: ${logisticsConfig.hsCodeMappings.fittings.reducers || 'N/A'}`);
      }
      console.log(`  • Flanges: ${logisticsConfig.hsCodeMappings.flanges || 'N/A'}`);
      console.log(`  • Valves: ${logisticsConfig.hsCodeMappings.valves || 'N/A'}`);
      console.log(`  • Structural: ${logisticsConfig.hsCodeMappings.structural || 'N/A'}`);
    } else {
      console.log('❌ hsCodeMappings not found');
      return false;
    }

    console.log('\n📋 Other fields (expected to be empty):');
    console.log(`  • Sea Freight Routes: ${Object.keys(logisticsConfig.seaFreightRoutes || {}).length} routes`);
    console.log(`  • Inland Trucking Zones: ${Object.keys(logisticsConfig.inlandTruckingZones || {}).length} zones`);
    console.log(`  • Duty Rules: ${Object.keys(logisticsConfig.dutyRules || {}).length} rules`);
    console.log(`  • Duty Exemptions: ${(logisticsConfig.dutyExemptions || []).length} exemptions`);

    if (logisticsConfig._metadata) {
      console.log('\n📋 Metadata:');
      console.log(`  • HS Codes Source: ${logisticsConfig._metadata.hsCodesSource || 'N/A'}`);
      console.log(`  • HS Codes Populated At: ${logisticsConfig._metadata.hsCodesPopulatedAt || 'N/A'}`);
    }

    console.log('\n' + '='.repeat(80));
    console.log('✅ TEST PASSED - Configuration is accessible');
    console.log('='.repeat(80));

    return true;

  } catch (error) {
    console.error('\n❌ TEST FAILED:', error);
    console.error(error.stack);
    return false;
  }
}

if (require.main === module) {
  testNscLogisticsConfigAccess()
    .then((success) => {
      process.exit(success ? 0 : 1);
    })
    .catch((error) => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = { testNscLogisticsConfigAccess };
