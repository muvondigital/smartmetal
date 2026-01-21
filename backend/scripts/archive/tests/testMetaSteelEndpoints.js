/**
 * Test MetaSteel API Endpoints
 * 
 * This script:
 * 1. Logs in as MetaSteel sales user
 * 2. Extracts JWT token
 * 3. Tests RFQs and Price Agreements endpoints
 * 4. Reports HTTP status codes and errors
 */

require('dotenv').config();
const http = require('http');

const API_BASE = 'http://localhost:4000';
const METASTEEL_EMAIL = 'sales@metasteel.com';
const METASTEEL_PASSWORD = 'Password123!';

// Helper to make HTTP requests
function httpRequest(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          const parsed = body ? JSON.parse(body) : null;
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: parsed || body,
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: body,
          });
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

async function testMetaSteelEndpoints() {
  const results = {
    login: { status: null, success: false, tenantCode: null, error: null },
    rfqs: { status: null, success: false, count: 0, error: null },
    priceAgreements: { status: null, success: false, count: 0, error: null },
    token: { tenantCode: null, email: null }
  };

  console.log('========================================');
  console.log('  MetaSteel API Endpoint Test');
  console.log('========================================');
  console.log('');

  try {
    // Step 1: Login
    console.log('[STEP 1] Logging in as MetaSteel user...');
    console.log(`  Email: ${METASTEEL_EMAIL}`);
    
    const loginResponse = await httpRequest({
      hostname: 'localhost',
      port: 4000,
      path: '/api/v1/auth/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    }, {
      email: METASTEEL_EMAIL,
      password: METASTEEL_PASSWORD,
    });

    console.log(`  Status: ${loginResponse.status}`);
    results.login.status = loginResponse.status;
    
    if (loginResponse.status !== 200) {
      console.error('  ❌ Login failed!');
      console.error('  Response:', loginResponse.body);
      results.login.error = loginResponse.body;
      return results;
    }

    const { user, tenant, token } = loginResponse.body;
    
    console.log('  ✅ Login successful');
    results.login.success = true;
    results.login.tenantCode = tenant.code;
    
    console.log('  User:', {
      email: user.email,
      tenantCode: tenant.code,
      userId: user.id,
    });
    console.log('  Tenant:', {
      code: tenant.code,
      name: tenant.name,
      id: tenant.id,
    });

    // Decode token to verify tenant info (without verification, just decode)
    const jwt = require('jsonwebtoken');
    const decoded = jwt.decode(token);
    results.token.tenantCode = decoded.tenantCode;
    results.token.email = decoded.email;
    
    console.log('  Token decoded:', {
      email: decoded.email,
      tenantCode: decoded.tenantCode,
      tenantId: decoded.tenantId,
      userId: decoded.id || decoded.sub,
    });

    if (decoded.tenantCode !== 'metasteel') {
      console.error('  ⚠️  WARNING: Token tenantCode is not "metasteel"!');
      console.error('     Actual:', decoded.tenantCode);
    }

    console.log('');

    // Step 2: Test RFQs endpoint
    console.log('[STEP 2] Testing GET /api/rfqs...');
    
    const rfqsResponse = await httpRequest({
      hostname: 'localhost',
      port: 4000,
      path: '/api/rfqs',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    });

    console.log(`  Status: ${rfqsResponse.status}`);
    results.rfqs.status = rfqsResponse.status;
    
    if (rfqsResponse.status === 200) {
      const rfqs = Array.isArray(rfqsResponse.body) ? rfqsResponse.body : [];
      results.rfqs.success = true;
      results.rfqs.count = rfqs.length;
      console.log(`  ✅ Success: Found ${rfqs.length} RFQs`);
      if (rfqs.length > 0) {
        console.log('  Sample RFQ:', {
          id: rfqs[0].id,
          title: rfqs[0].title || rfqs[0].customer_name,
          tenantId: rfqs[0].tenant_id,
        });
      }
    } else {
      results.rfqs.error = rfqsResponse.body;
      console.error('  ❌ Failed!');
      console.error('  Response:', JSON.stringify(rfqsResponse.body, null, 2));
    }

    console.log('');

    // Step 3: Test Price Agreements endpoint
    console.log('[STEP 3] Testing GET /api/price-agreements...');
    
    const agreementsResponse = await httpRequest({
      hostname: 'localhost',
      port: 4000,
      path: '/api/price-agreements',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    });

    console.log(`  Status: ${agreementsResponse.status}`);
    results.priceAgreements.status = agreementsResponse.status;
    
    if (agreementsResponse.status === 200) {
      let agreements = [];
      if (agreementsResponse.body.agreements) {
        agreements = agreementsResponse.body.agreements;
      } else if (Array.isArray(agreementsResponse.body)) {
        agreements = agreementsResponse.body;
      } else if (agreementsResponse.body.data && Array.isArray(agreementsResponse.body.data.agreements)) {
        agreements = agreementsResponse.body.data.agreements;
      }
      
      results.priceAgreements.success = true;
      results.priceAgreements.count = agreements.length;
      console.log(`  ✅ Success: Found ${agreements.length} Price Agreements`);
      if (agreements.length > 0) {
        console.log('  Sample Agreement:', {
          id: agreements[0].id,
          client_id: agreements[0].client_id,
          tenantId: agreements[0].tenant_id,
        });
      }
    } else {
      results.priceAgreements.error = agreementsResponse.body;
      console.error('  ❌ Failed!');
      console.error('  Response:', JSON.stringify(agreementsResponse.body, null, 2));
    }

    console.log('');
    console.log('========================================');
    console.log('  Test Summary');
    console.log('========================================');
    console.log('');
    console.log('Login:', loginResponse.status === 200 ? '✅ SUCCESS' : '❌ FAILED');
    console.log('RFQs:', rfqsResponse.status === 200 ? '✅ SUCCESS' : `❌ FAILED (${rfqsResponse.status})`);
    console.log('Price Agreements:', agreementsResponse.status === 200 ? '✅ SUCCESS' : `❌ FAILED (${agreementsResponse.status})`);
    console.log('');
    console.log('Token tenantCode:', decoded.tenantCode);
    console.log('Expected tenantCode: metasteel');
    console.log('');

    return results;

  } catch (error) {
    console.error('');
    console.error('❌ Test failed with error:');
    console.error('  Message:', error.message);
    console.error('  Stack:', error.stack);
    process.exit(1);
  }
}

// Run the test
const fs = require('fs');
const path = require('path');

testMetaSteelEndpoints().then((results) => {
  console.log('Test completed.');
  
  // Write results to file
  const resultsFile = path.join(__dirname, '..', 'test-results.json');
  fs.writeFileSync(resultsFile, JSON.stringify(results || { status: 'completed' }, null, 2));
  console.log(`Results saved to: ${resultsFile}`);
  
  process.exit(0);
}).catch((error) => {
  console.error('Test error:', error);
  
  // Write error to file
  const fs = require('fs');
  const path = require('path');
  const resultsFile = path.join(__dirname, '..', 'test-results.json');
  fs.writeFileSync(resultsFile, JSON.stringify({
    status: 'error',
    error: error.message,
    stack: error.stack
  }, null, 2));
  
  process.exit(1);
});
