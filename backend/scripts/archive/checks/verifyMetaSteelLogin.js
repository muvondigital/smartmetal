/**
 * Verify MetaSteel Login Test
 * 
 * This script simulates a login request to verify that MetaSteel users
 * get the correct tenant code in the response.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { authenticateUser } = require('../src/services/authService');

async function testLogin() {
  console.log('\n=== Testing MetaSteel Login ===\n');
  
  try {
    // Test MetaSteel user login
    console.log('Testing login for: sales@metasteel.com');
    const result = await authenticateUser('sales@metasteel.com', 'Password123!');
    
    console.log('\n✅ Login successful!');
    console.log('\nResponse structure:');
    console.log('  User:', {
      id: result.user.id,
      email: result.user.email,
      name: result.user.name,
      role: result.user.role
    });
    console.log('\n  Tenant:', {
      id: result.tenant.id,
      code: result.tenant.code,
      name: result.tenant.name
    });
    console.log('\n  Token:', result.token ? 'Generated (length: ' + result.token.length + ')' : 'Missing');
    
    console.log('\n📋 IMPORTANT:');
    console.log('  - Tenant code should be: "metasteel"');
    console.log('  - Frontend should store this in localStorage as "tenantCode"');
    console.log('  - All API requests should include header: X-Tenant-Code: metasteel');
    
  } catch (error) {
    console.error('\n❌ Login failed:', error.message);
    console.error('\nMake sure:');
    console.error('  1. MetaSteel users are seeded (run: npm run seed:metasteel-demo)');
    console.error('  2. Password is correct: Password123!');
  }
}

testLogin();

