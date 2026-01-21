/**
 * Test login functionality
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { connectDb } = require('../src/db/supabaseClient');
const { authenticateUser, findUserByEmail, validatePassword } = require('../src/services/authService');

async function testLogin() {
  const db = await connectDb();
  
  try {
    const testEmail = 'Sales01@nscsinergi.com.my';
    const testPassword = 'Password123!';
    
    console.log('🔍 Testing login for:', testEmail);
    console.log('');
    
    // 1. Check if user exists
    console.log('1. Checking if user exists...');
    const user = await findUserByEmail(testEmail);
    
    if (!user) {
      console.log('❌ User not found!');
      return;
    }
    
    console.log('✓ User found:');
    console.log(`   ID: ${user.id}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Name: ${user.name}`);
    console.log(`   Role: ${user.role}`);
    console.log(`   Tenant ID: ${user.tenant_id}`);
    console.log(`   Tenant Code: ${user.tenant_code}`);
    console.log(`   Tenant Name: ${user.tenant_name}`);
    console.log(`   Is Active: ${user.is_active}`);
    console.log(`   Has Password Hash: ${user.password_hash ? 'Yes' : 'No'}`);
    console.log('');
    
    // 2. Test password validation
    console.log('2. Testing password validation...');
    if (!user.password_hash) {
      console.log('❌ User has no password hash!');
      return;
    }
    
    const isValid = await validatePassword(testPassword, user.password_hash);
    console.log(`   Password valid: ${isValid ? '✓ Yes' : '❌ No'}`);
    console.log('');
    
    // 3. Test full authentication
    console.log('3. Testing full authentication...');
    try {
      const authResult = await authenticateUser(testEmail, testPassword);
      console.log('✓ Authentication successful!');
      console.log(`   User ID: ${authResult.user.id}`);
      console.log(`   User Email: ${authResult.user.email}`);
      console.log(`   User Name: ${authResult.user.name}`);
      console.log(`   User Role: ${authResult.user.role}`);
      console.log(`   Tenant ID: ${authResult.tenant.id}`);
      console.log(`   Tenant Code: ${authResult.tenant.code}`);
      console.log(`   Tenant Name: ${authResult.tenant.name}`);
      console.log(`   Token: ${authResult.token ? 'Generated' : 'Missing'}`);
      console.log(`   Token length: ${authResult.token ? authResult.token.length : 0} chars`);
    } catch (authError) {
      console.log('❌ Authentication failed:');
      console.log(`   Error: ${authError.message}`);
      console.log(`   Stack: ${authError.stack}`);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    console.error('Stack:', error.stack);
  } finally {
    await db.end();
  }
}

if (require.main === module) {
  testLogin()
    .then(() => {
      console.log('\n✅ Test completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Test failed:', error);
      process.exit(1);
    });
}

module.exports = { testLogin };















