/**
 * Test script to directly test creating an agreement V2
 * This will show the exact error if tables don't exist
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { createAgreementHeader } = require('../src/services/agreementsV2Service');

async function testCreate() {
  console.log('='.repeat(60));
  console.log('TESTING CREATE AGREEMENT V2');
  console.log('='.repeat(60));
  console.log('');

  try {
    // Use a test tenant ID (you may need to adjust this)
    const testTenantId = '00000000-0000-0000-0000-000000000000'; // Replace with actual tenant ID
    
    const testData = {
      agreement_code: `TEST-${Date.now()}`,
      agreement_type: 'STANDARD',
      currency: 'USD',
      valid_from: new Date().toISOString().split('T')[0],
      valid_to: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      status: 'draft',
    };

    console.log('Attempting to create agreement with data:', testData);
    console.log('');

    const result = await createAgreementHeader(testData, testTenantId);
    
    console.log('✅ SUCCESS! Agreement created:');
    console.log(JSON.stringify(result, null, 2));
    
  } catch (error) {
    console.error('❌ ERROR:');
    console.error('Message:', error.message);
    console.error('Code:', error.code);
    console.error('Stack:', error.stack);
    
    if (error.code === '42P01') {
      console.error('');
      console.error('🔍 DIAGNOSIS: PostgreSQL error 42P01 = "undefined table"');
      console.error('This means the table "agreement_headers" does not exist.');
      console.error('');
      console.error('SOLUTION: Run migrations:');
      console.error('  cd backend && npm run migrate');
    }
    
    process.exit(1);
  }
}

testCreate();
