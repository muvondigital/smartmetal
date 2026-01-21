/**
 * Quick test: NSC user should see 6 NSC RFQs
 */

require('dotenv').config();
const axios = require('axios');

const API_BASE = 'http://localhost:4000';

async function testNscRfqAccess() {
  console.log('\n=== NSC RFQ Test ===\n');

  try {
    // Login as NSC user
    console.log('1. Logging in as NSC user...');
    const loginResponse = await axios.post(`${API_BASE}/api/v1/auth/login`, {
      email: 'Sales01@nscsinergi.com.my',
      password: 'Password123!'
    });

    const { token, user, tenant } = loginResponse.data;
    console.log('✅ Login successful');
    console.log('   User:', user.email);
    console.log('   Tenant:', tenant.name, '(', tenant.code, ')');

    // Fetch RFQs
    console.log('\n2. Fetching RFQs...');
    const rfqResponse = await axios.get(`${API_BASE}/api/rfqs`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    console.log('   RFQ Response:', rfqResponse.data.length, 'RFQs returned');
    
    if (rfqResponse.data.length === 6) {
      console.log('\n✅ CORRECT: Got 6 NSC RFQs');
    } else {
      console.log('\n❌ UNEXPECTED: Expected 6 NSC RFQs, got', rfqResponse.data.length);
    }

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Error:', error.response.data);
    }
  }

  console.log('\n=== End of Test ===\n');
}

testNscRfqAccess();

