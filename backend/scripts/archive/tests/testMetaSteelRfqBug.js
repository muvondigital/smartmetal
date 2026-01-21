/**
 * Test Script: MetaSteel RFQ Bug Diagnosis
 * 
 * This script tests the RFQ listing endpoint with MetaSteel user credentials
 * to observe tenant resolution behavior and identify why MetaSteel users
 * are seeing NSC RFQs instead of their own.
 */

require('dotenv').config();
const axios = require('axios');

const API_BASE = 'http://localhost:4000';

async function testMetaSteelRfqAccess() {
  console.log('\n=== MetaSteel RFQ Bug Test ===\n');

  try {
    // Step 1: Login as MetaSteel user
    console.log('1. Logging in as MetaSteel user (sales@metasteel.com)...');
    const loginResponse = await axios.post(`${API_BASE}/api/v1/auth/login`, {
      email: 'sales@metasteel.com',
      password: 'Password123!'
    });

    const { token, user, tenant } = loginResponse.data;
    console.log('✅ Login successful');
    console.log('   User:', user.email, '- Role:', user.role);
    console.log('   Tenant:', tenant.name, '(', tenant.code, ')');
    console.log('   Tenant ID:', tenant.id);
    console.log('   Token (first 50 chars):', token.substring(0, 50) + '...');

    // Decode JWT to see what's in it (without verification)
    const payloadBase64 = token.split('.')[1];
    const payload = JSON.parse(Buffer.from(payloadBase64, 'base64').toString());
    console.log('\n   JWT Payload:');
    console.log('   - email:', payload.email);
    console.log('   - role:', payload.role);
    console.log('   - tenantId:', payload.tenantId);
    console.log('   - tenantCode:', payload.tenantCode);

    // Step 2: Call RFQ list endpoint WITHOUT X-Tenant-Code header
    console.log('\n2. Fetching RFQs (JWT only, NO X-Tenant-Code header)...');
    console.log('   Expected: 3 MetaSteel RFQs');
    console.log('   Watch the backend logs for [TENANT] and [RFQ] messages!\n');
    
    const rfqResponse = await axios.get(`${API_BASE}/api/rfqs`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    console.log('   RFQ Response:', rfqResponse.data.length, 'RFQs returned');
    rfqResponse.data.forEach((rfq, idx) => {
      console.log(`   ${idx + 1}. ${rfq.title} - Client: ${rfq.client_name} - Status: ${rfq.status}`);
    });

    // Determine if bug is present
    console.log('\n=== DIAGNOSIS ===');
    if (rfqResponse.data.length === 3) {
      console.log('✅ CORRECT: Got 3 RFQs (MetaSteel data)');
      console.log('   The bug is FIXED!');
    } else if (rfqResponse.data.length === 6) {
      console.log('❌ BUG CONFIRMED: Got 6 RFQs (NSC data)');
      console.log('   MetaSteel user is seeing NSC RFQs!');
      console.log('\n   Check backend logs above to see:');
      console.log('   - Did optionalAuth decode the JWT and set req.user?');
      console.log('   - Did tenant middleware use Strategy 1 (JWT tenant)?');
      console.log('   - Or did it fall through to Strategy 3 (default NSC)?');
    } else {
      console.log('⚠️  UNEXPECTED: Got', rfqResponse.data.length, 'RFQs');
      console.log('   Expected 3 (MetaSteel) or 6 (NSC bug)');
    }

    // Step 3: Test WITH X-Tenant-Code header (for comparison)
    console.log('\n3. Fetching RFQs (JWT + X-Tenant-Code header)...');
    const rfqResponseWithHeader = await axios.get(`${API_BASE}/api/rfqs`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-Tenant-Code': 'METASTEEL'
      }
    });

    console.log('   With header:', rfqResponseWithHeader.data.length, 'RFQs returned');
    if (rfqResponseWithHeader.data.length === 3) {
      console.log('   ✅ Header approach works correctly');
    }

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Error:', error.response.data);
    }
    if (error.message.includes('ECONNREFUSED')) {
      console.error('\n   Make sure backend is running: cd backend && npm run dev');
    }
  }

  console.log('\n=== End of Test ===\n');
}

// Run test
testMetaSteelRfqAccess();

