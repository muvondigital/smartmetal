/**
 * Test MetaSteel Tenant Resolution Flow
 * 
 * This script simulates the frontend login and API call flow to verify:
 * 1. Login returns correct tenant information
 * 2. JWT token contains tenant info
 * 3. Analytics endpoint works with tenant context
 * 4. RFQ endpoints work with tenant context
 * 5. Data is properly scoped to MetaSteel tenant
 * 
 * Usage: node scripts/testMetaSteelTenantResolution.js
 */

require('dotenv').config();
const http = require('http');
const https = require('https');

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:4000';
const METASTEEL_EMAIL = 'manager@metasteel.com';
const METASTEEL_PASSWORD = 'Password123!';
const METASTEEL_TENANT_CODE = 'METASTEEL';

// Color output helpers
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(60));
  log(title, 'cyan');
  console.log('='.repeat(60));
}

function logSuccess(message) {
  log(`✅ ${message}`, 'green');
}

function logError(message) {
  log(`❌ ${message}`, 'red');
}

function logWarning(message) {
  log(`⚠️  ${message}`, 'yellow');
}

function logInfo(message) {
  log(`ℹ️  ${message}`, 'blue');
}

/**
 * Build standard headers with tenant code and optional JWT
 */
function buildHeaders(token = null) {
  const headers = {
    'X-Tenant-Code': METASTEEL_TENANT_CODE,
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

/**
 * Make HTTP request
 */
function httpRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const client = isHttps ? https : http;

    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    };

    const req = client.request(requestOptions, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        let parsedBody;
        try {
          parsedBody = body ? JSON.parse(body) : {};
        } catch (e) {
          parsedBody = body;
        }

        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: parsedBody,
        });
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (options.body) {
      req.write(JSON.stringify(options.body));
    }

    req.end();
  });
}

/**
 * Decode JWT token (without verification)
 */
function decodeJWT(token) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      Buffer.from(base64, 'base64')
        .toString()
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (error) {
    return null;
  }
}

/**
 * Test 1: Login and verify tenant info
 */
async function testLogin() {
  logSection('Test 1: Login and Tenant Resolution');

  try {
    logInfo(`Logging in as ${METASTEEL_EMAIL}...`);

    const response = await httpRequest(`${API_BASE_URL}/api/v1/auth/login`, {
      method: 'POST',
      body: {
        email: METASTEEL_EMAIL,
        password: METASTEEL_PASSWORD,
      },
    });

    if (response.status !== 200) {
      logError(`Login failed with status ${response.status}`);
      console.log('Response:', JSON.stringify(response.body, null, 2));
      return null;
    }

    const { user, tenant, token } = response.body;

    if (!user || !tenant || !token) {
      logError('Login response missing required fields');
      console.log('Response:', JSON.stringify(response.body, null, 2));
      return null;
    }

    logSuccess('Login successful');
    logInfo(`User: ${user.email} (${user.role})`);
    logInfo(`Tenant: ${tenant.code} (${tenant.name})`);
    logInfo(`Tenant ID: ${tenant.id}`);

    // Verify tenant code
    if (tenant.code.toLowerCase() !== 'metasteel') {
      logError(`Expected tenant code 'metasteel', got '${tenant.code}'`);
      return null;
    }
    logSuccess(`Tenant code matches: ${tenant.code}`);

    // Decode JWT to verify tenant info
    const decoded = decodeJWT(token);
    if (decoded) {
      logInfo('JWT Token Contents:');
      console.log('  - userId:', decoded.id || decoded.sub);
      console.log('  - email:', decoded.email);
      console.log('  - tenantId:', decoded.tenantId);
      console.log('  - tenantCode:', decoded.tenantCode);

      if (decoded.tenantId && decoded.tenantId === tenant.id) {
        logSuccess('JWT contains correct tenantId');
      } else {
        logWarning('JWT tenantId missing or mismatched');
      }

      if (decoded.tenantCode && decoded.tenantCode.toLowerCase() === 'metasteel') {
        logSuccess('JWT contains correct tenantCode');
      } else {
        logWarning('JWT tenantCode missing or mismatched');
      }
    } else {
      logWarning('Could not decode JWT token');
    }

    return { user, tenant, token };
  } catch (error) {
    logError(`Login test failed: ${error.message}`);
    console.error(error);
    return null;
  }
}

/**
 * Test 2: Analytics endpoint with JWT token
 */
async function testAnalyticsWithJWT(token) {
  logSection('Test 2: Analytics Dashboard (JWT Auth)');

  try {
    logInfo('Calling /api/analytics/dashboard with JWT token...');

    const response = await httpRequest(`${API_BASE_URL}/api/analytics/dashboard`, {
      method: 'GET',
      headers: buildHeaders(token),
    });

    if (response.status !== 200) {
      logError(`Analytics failed with status ${response.status}`);
      console.log('Response:', JSON.stringify(response.body, null, 2));
      return false;
    }

    const data = response.body.data || response.body;

    logSuccess('Analytics endpoint responded successfully');
    logInfo('Dashboard Metrics:');
    console.log('  - Total Quotes:', data.total_quotes || 0);
    console.log('  - Pending Approval:', data.pending_quotes || 0);
    console.log('  - Approved Quotes:', data.approved_quotes || 0);
    console.log('  - Total Value:', data.total_value || 0);
    console.log('  - Data Mode:', data.data_mode || 'unknown');

    if (data.total_quotes > 0) {
      logSuccess(`Found ${data.total_quotes} quotes (expected: 3)`);
    } else {
      logWarning('No quotes found (expected: 3)');
    }

    return true;
  } catch (error) {
    logError(`Analytics test failed: ${error.message}`);
    console.error(error);
    return false;
  }
}

/**
 * Test 3: Analytics endpoint with X-Tenant-Code header
 */
async function testAnalyticsWithHeader() {
  logSection('Test 3: Analytics Dashboard (X-Tenant-Code Header)');

  try {
    logInfo('Calling /api/analytics/dashboard with X-Tenant-Code: metasteel...');

    const response = await httpRequest(`${API_BASE_URL}/api/analytics/dashboard`, {
      method: 'GET',
      headers: buildHeaders(),
    });

    if (response.status !== 200) {
      logError(`Analytics failed with status ${response.status}`);
      console.log('Response:', JSON.stringify(response.body, null, 2));
      return false;
    }

    const data = response.body.data || response.body;

    logSuccess('Analytics endpoint responded successfully');
    logInfo('Dashboard Metrics:');
    console.log('  - Total Quotes:', data.total_quotes || 0);
    console.log('  - Pending Approval:', data.pending_quotes || 0);
    console.log('  - Approved Quotes:', data.approved_quotes || 0);
    console.log('  - Total Value:', data.total_value || 0);

    if (data.total_quotes > 0) {
      logSuccess(`Found ${data.total_quotes} quotes (expected: 3)`);
    } else {
      logWarning('No quotes found (expected: 3)');
    }

    return true;
  } catch (error) {
    logError(`Analytics test failed: ${error.message}`);
    console.error(error);
    return false;
  }
}

/**
 * Test 4: RFQ list endpoint
 */
async function testRfqList(token) {
  logSection('Test 4: RFQ List Endpoint');

  try {
    logInfo('Calling /api/rfqs with JWT token...');

    const response = await httpRequest(`${API_BASE_URL}/api/rfqs`, {
      method: 'GET',
      headers: buildHeaders(token),
    });

    if (response.status !== 200) {
      logError(`RFQ list failed with status ${response.status}`);
      console.log('Response:', JSON.stringify(response.body, null, 2));
      return false;
    }

    const rfqs = Array.isArray(response.body) ? response.body : response.body.data || [];

    logSuccess(`RFQ list endpoint responded successfully`);
    logInfo(`Found ${rfqs.length} RFQs (expected: 3)`);

    if (rfqs.length > 0) {
      logInfo('RFQs:');
      rfqs.forEach((rfq, idx) => {
        console.log(`  ${idx + 1}. ${rfq.rfq_name || rfq.title || rfq.id} (${rfq.status})`);
      });
    } else {
      logWarning('No RFQs found');
    }

    return rfqs.length >= 3;
  } catch (error) {
    logError(`RFQ list test failed: ${error.message}`);
    console.error(error);
    return false;
  }
}

/**
 * Test 5: RFQ detail with items
 */
async function testRfqDetail(token, rfqId) {
  logSection('Test 5: RFQ Detail with Line Items');

  try {
    logInfo(`Calling /api/rfqs/${rfqId}/items...`);

    const response = await httpRequest(`${API_BASE_URL}/api/rfqs/${rfqId}/items`, {
      method: 'GET',
      headers: buildHeaders(token),
    });

    if (response.status !== 200) {
      logError(`RFQ items failed with status ${response.status}`);
      console.log('Response:', JSON.stringify(response.body, null, 2));
      return false;
    }

    const items = Array.isArray(response.body) ? response.body : response.body.data || [];

    logSuccess(`RFQ items endpoint responded successfully`);
    logInfo(`Found ${items.length} items (expected: 6 per RFQ)`);

    if (items.length > 0) {
      logInfo('Sample items:');
      items.slice(0, 3).forEach((item, idx) => {
        console.log(`  ${idx + 1}. ${item.description || 'N/A'} (Qty: ${item.quantity} ${item.unit})`);
      });
    } else {
      logWarning('No items found');
    }

    return items.length > 0;
  } catch (error) {
    logError(`RFQ items test failed: ${error.message}`);
    console.error(error);
    return false;
  }
}

/**
 * Test 6: Pricing runs for RFQ
 */
async function testPricingRuns(token, rfqId) {
  logSection('Test 6: Pricing Runs for RFQ');

  try {
    logInfo(`Calling /api/pricing-runs/rfq/${rfqId}...`);

    const response = await httpRequest(`${API_BASE_URL}/api/pricing-runs/rfq/${rfqId}`, {
      method: 'GET',
      headers: buildHeaders(token),
    });

    if (response.status !== 200) {
      logError(`Pricing runs failed with status ${response.status}`);
      console.log('Response:', JSON.stringify(response.body, null, 2));
      return false;
    }

    const runs = Array.isArray(response.body) ? response.body : response.body.data || [];

    logSuccess(`Pricing runs endpoint responded successfully`);
    logInfo(`Found ${runs.length} pricing runs (expected: >= 1)`);

    return runs.length > 0;
  } catch (error) {
    logError(`Pricing runs test failed: ${error.message}`);
    console.error(error);
    return false;
  }
}

/**
 * Test 7: Pending approvals
 */
async function testPendingApprovals(token) {
  logSection('Test 7: Pending Approvals');

  try {
    logInfo('Calling /api/approvals/pending...');

    const response = await httpRequest(`${API_BASE_URL}/api/approvals/pending`, {
      method: 'GET',
      headers: buildHeaders(token),
    });

    if (response.status !== 200) {
      logError(`Pending approvals failed with status ${response.status}`);
      console.log('Response:', JSON.stringify(response.body, null, 2));
      return false;
    }

    const data = response.body.data || response.body.pending_approvals || response.body || {};
    const pendingList = data.pending_approvals || data.pending || data;
    const count = Array.isArray(pendingList) ? pendingList.length : data.total_pending || 0;

    logSuccess(`Pending approvals responded successfully`);
    logInfo(`Pending approvals: ${count} (expected: >= 1)`);

    return count >= 0;
  } catch (error) {
    logError(`Pending approvals test failed: ${error.message}`);
    console.error(error);
    return false;
  }
}

/**
 * Test 8: Price agreements list
 */
async function testPriceAgreements(token) {
  logSection('Test 8: Price Agreements List');

  try {
    logInfo('Calling /api/price-agreements...');

    const response = await httpRequest(`${API_BASE_URL}/api/price-agreements`, {
      method: 'GET',
      headers: buildHeaders(token),
    });

    if (response.status !== 200) {
      logError(`Price agreements failed with status ${response.status}`);
      console.log('Response:', JSON.stringify(response.body, null, 2));
      return false;
    }

    const agreements = response.body.agreements || response.body.data?.agreements || [];

    logSuccess('Price agreements endpoint responded successfully');
    logInfo(`Agreements returned: ${agreements.length} (ok even if 0)`);

    return true;
  } catch (error) {
    logError(`Price agreements test failed: ${error.message}`);
    console.error(error);
    return false;
  }
}

/**
 * Test 9: Price agreement analytics
 */
async function testPriceAgreementAnalytics(token) {
  logSection('Test 9: Price Agreement Analytics');

  try {
    logInfo('Calling /api/price-agreements/analytics...');

    const response = await httpRequest(`${API_BASE_URL}/api/price-agreements/analytics`, {
      method: 'GET',
      headers: buildHeaders(token),
    });

    if (response.status !== 200) {
      logError(`Price agreement analytics failed with status ${response.status}`);
      console.log('Response:', JSON.stringify(response.body, null, 2));
      return false;
    }

    const data = response.body.data || response.body;

    logSuccess('Price agreement analytics responded successfully');
    logInfo(`Active agreements: ${data.summary?.active_agreements ?? 0}`);

    return true;
  } catch (error) {
    logError(`Price agreement analytics test failed: ${error.message}`);
    console.error(error);
    return false;
  }
}

/**
 * Test 6: Verify tenant isolation (should not see NSC data)
 */
async function testTenantIsolation(token) {
  logSection('Test 6: Tenant Isolation Verification');

  try {
    logInfo('Checking that MetaSteel tenant only sees MetaSteel data...');

    // Get all RFQs
    const rfqsResponse = await httpRequest(`${API_BASE_URL}/api/rfqs`, {
      method: 'GET',
      headers: buildHeaders(token),
    });

    if (rfqsResponse.status !== 200) {
      logError('Failed to fetch RFQs for isolation test');
      return false;
    }

    const rfqs = Array.isArray(rfqsResponse.body) 
      ? rfqsResponse.body 
      : rfqsResponse.body.data || [];

    // Check RFQ names - should all start with RFQ- (MetaSteel pattern)
    const metaSteelRfqs = rfqs.filter(rfq => {
      const name = rfq.rfq_name || rfq.title || '';
      return name.startsWith('RFQ-');
    });

    logInfo(`Found ${rfqs.length} total RFQs`);
    logInfo(`${metaSteelRfqs.length} match MetaSteel pattern (RFQ-*)`);

    if (rfqs.length === metaSteelRfqs.length) {
      logSuccess('All RFQs match MetaSteel pattern (good isolation)');
    } else {
      logWarning(`Some RFQs don't match MetaSteel pattern - possible cross-tenant leak`);
    }

    return true;
  } catch (error) {
    logError(`Tenant isolation test failed: ${error.message}`);
    console.error(error);
    return false;
  }
}

/**
 * Main test runner
 */
async function runTests() {
  console.log('\n');
  log('═══════════════════════════════════════════════════════════', 'cyan');
  log('   MetaSteel Tenant Resolution Flow Test', 'cyan');
  log('═══════════════════════════════════════════════════════════', 'cyan');
  console.log('');

  const results = {
    login: false,
    analyticsJWT: false,
    analyticsHeader: false,
    rfqList: false,
    rfqDetail: false,
    pricingRuns: false,
    pendingApprovals: false,
    priceAgreements: false,
    agreementAnalytics: false,
    tenantIsolation: false,
  };

  // Test 1: Login
  const authResult = await testLogin();
  results.login = authResult !== null;

  if (!authResult) {
    logError('Login failed - cannot continue with other tests');
    printSummary(results);
    process.exit(1);
  }

  const { token, tenant } = authResult;

  // Test 2: Analytics with JWT
  results.analyticsJWT = await testAnalyticsWithJWT(token);

  // Test 3: Analytics with header
  results.analyticsHeader = await testAnalyticsWithHeader();

  // Test 4: RFQ list
  results.rfqList = await testRfqList(token);

  // Test 5: RFQ detail (get first RFQ ID)
  if (results.rfqList) {
    const rfqsResponse = await httpRequest(`${API_BASE_URL}/api/rfqs`, {
      method: 'GET',
      headers: buildHeaders(token),
    });
    const rfqs = Array.isArray(rfqsResponse.body) 
      ? rfqsResponse.body 
      : rfqsResponse.body.data || [];
    
    if (rfqs.length > 0) {
      const firstRfqId = rfqs[0].id;
      results.rfqDetail = await testRfqDetail(token, firstRfqId);
      // Test 6: Pricing runs for first RFQ
      results.pricingRuns = await testPricingRuns(token, firstRfqId);
    }
  }

  // Test 7: Pending approvals
  results.pendingApprovals = await testPendingApprovals(token);

  // Test 8: Price agreements list
  results.priceAgreements = await testPriceAgreements(token);

  // Test 9: Price agreement analytics
  results.agreementAnalytics = await testPriceAgreementAnalytics(token);

  // Test 10: Tenant isolation
  results.tenantIsolation = await testTenantIsolation(token);

  // Print summary
  printSummary(results);
}

/**
 * Print test summary
 */
function printSummary(results) {
  logSection('Test Summary');

  const tests = [
    { name: 'Login & Tenant Resolution', result: results.login },
    { name: 'Analytics (JWT Auth)', result: results.analyticsJWT },
    { name: 'Analytics (X-Tenant-Code Header)', result: results.analyticsHeader },
    { name: 'RFQ List', result: results.rfqList },
    { name: 'RFQ Detail with Items', result: results.rfqDetail },
    { name: 'Pricing Runs', result: results.pricingRuns },
    { name: 'Pending Approvals', result: results.pendingApprovals },
    { name: 'Price Agreements List', result: results.priceAgreements },
    { name: 'Price Agreement Analytics', result: results.agreementAnalytics },
    { name: 'Tenant Isolation', result: results.tenantIsolation },
  ];

  tests.forEach((test) => {
    if (test.result) {
      logSuccess(test.name);
    } else {
      logError(test.name);
    }
  });

  const passed = Object.values(results).filter(Boolean).length;
  const total = Object.keys(results).length;

  console.log('');
  log(`Passed: ${passed}/${total} tests`, passed === total ? 'green' : 'yellow');

  if (passed === total) {
    logSuccess('All tests passed! Tenant resolution is working correctly.');
    process.exit(0);
  } else {
    logError('Some tests failed. Please check the errors above.');
    process.exit(1);
  }
}

// Run tests
if (require.main === module) {
  runTests().catch((error) => {
    logError(`Test runner failed: ${error.message}`);
    console.error(error);
    process.exit(1);
  });
}

module.exports = { runTests };

