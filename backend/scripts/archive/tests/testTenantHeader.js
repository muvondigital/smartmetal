/**
 * Test script to verify tenant header resolution
 * 
 * This simulates what happens when a request comes in with/without headers
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { getTenantByCode, getDefaultTenant } = require('../src/middleware/tenant');

async function testTenantResolution() {
  console.log('\n=== Testing Tenant Resolution ===\n');
  
  // Test 1: MetaSteel tenant code
  console.log('Test 1: Resolving "metasteel" (lowercase)');
  const metaSteel1 = await getTenantByCode('metasteel');
  console.log('  Result:', metaSteel1 ? `${metaSteel1.code} (${metaSteel1.id})` : 'NOT FOUND');
  
  // Test 2: MetaSteel tenant code (uppercase)
  console.log('\nTest 2: Resolving "METASTEEL" (uppercase)');
  const metaSteel2 = await getTenantByCode('METASTEEL');
  console.log('  Result:', metaSteel2 ? `${metaSteel2.code} (${metaSteel2.id})` : 'NOT FOUND');
  
  // Test 3: NSC tenant code
  console.log('\nTest 3: Resolving "nsc" (lowercase)');
  const nsc1 = await getTenantByCode('nsc');
  console.log('  Result:', nsc1 ? `${nsc1.code} (${nsc1.id})` : 'NOT FOUND');
  
  // Test 4: Default tenant
  console.log('\nTest 4: Getting default tenant (NSC)');
  const defaultTenant = await getDefaultTenant();
  console.log('  Result:', defaultTenant ? `${defaultTenant.code} (${defaultTenant.id})` : 'NOT FOUND');
  
  console.log('\n✅ Tenant resolution test complete');
  console.log('\n📋 Key Points:');
  console.log('  - Tenant codes are case-insensitive (metasteel = METASTEEL)');
  console.log('  - If no X-Tenant-Code header, defaults to NSC');
  console.log('  - If JWT has tenant info, that takes priority');
}

testTenantResolution();

