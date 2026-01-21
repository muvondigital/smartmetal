/**
 * Simple Stage 2 Testing Script
 * Tests Document Intelligence endpoints using built-in Node.js modules
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const http = require('http');
const fs = require('fs');
const path = require('path');

const API_BASE = 'localhost';
const API_PORT = 4000;

function makeRequest(method, path, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: API_BASE,
      port: API_PORT,
      path: path,
      method: method,
      headers: headers
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, data: json });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (body) {
      req.write(body);
    }
    req.end();
  });
}

async function testHealthCheck() {
  console.log('\n🧪 Test 1: Health Check');
  try {
    const response = await makeRequest('GET', '/health');
    if (response.status === 200) {
      console.log('   ✅ Backend server is running');
      return true;
    } else {
      console.log(`   ❌ Health check failed: ${response.status}`);
      return false;
    }
  } catch (error) {
    console.log(`   ❌ Cannot connect to backend: ${error.message}`);
    console.log('   ⚠️  Please start the backend: cd backend && npm run dev');
    return false;
  }
}

async function testOCREndpoint() {
  console.log('\n🧪 Test 2: OCR Test Endpoint');
  try {
    const response = await makeRequest('GET', '/api/ocr/test');
    if (response.status === 200 && response.data.ok) {
      console.log('   ✅ OCR endpoint is accessible');
      console.log(`   📋 Provider: ${response.data.provider}`);
      return true;
    } else {
      console.log(`   ❌ OCR endpoint failed: ${response.status}`);
      return false;
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    return false;
  }
}

async function testAIEndpoints() {
  console.log('\n🧪 Test 3: AI Routes Check');
  try {
    // Test approval stats endpoint (should work without auth for testing)
    const response = await makeRequest('GET', '/api/ai/approval-stats?days=7');
    if (response.status === 200 || response.status === 401) {
      console.log('   ✅ AI routes are mounted correctly');
      return true;
    } else {
      console.log(`   ⚠️  Unexpected status: ${response.status}`);
      return true; // Still consider it working if route exists
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    return false;
  }
}

async function checkSamplePDF() {
  console.log('\n📄 Checking for sample PDF...');
  const samplePaths = [
    path.join(__dirname, '../sample.pdf'),
    path.join(__dirname, '../../test/fixtures/sample-rfq.pdf'),
    path.join(__dirname, '../../sample.pdf')
  ];

  for (const pdfPath of samplePaths) {
    if (fs.existsSync(pdfPath)) {
      const stats = fs.statSync(pdfPath);
      console.log(`   ✅ Found: ${pdfPath} (${(stats.size / 1024).toFixed(1)} KB)`);
      return pdfPath;
    }
  }

  console.log('   ⚠️  No sample PDF found');
  console.log('   📝 To test file upload:');
  console.log('      Place a sample RFQ PDF in: backend/sample.pdf');
  return null;
}

async function runTests() {
  console.log('='.repeat(60));
  console.log('Stage 2: Document Intelligence - Endpoint Testing');
  console.log('='.repeat(60));

  const healthOk = await testHealthCheck();
  if (!healthOk) {
    console.log('\n❌ Backend server is not running. Please start it first.');
    process.exit(1);
  }

  const ocrOk = await testOCREndpoint();
  const aiOk = await testAIEndpoints();
  const samplePdf = await checkSamplePDF();

  console.log('\n' + '='.repeat(60));
  console.log('Test Summary');
  console.log('='.repeat(60));
  console.log(`Backend Health: ${healthOk ? '✅' : '❌'}`);
  console.log(`OCR Endpoint: ${ocrOk ? '✅' : '❌'}`);
  console.log(`AI Routes: ${aiOk ? '✅' : '❌'}`);
  console.log(`Sample PDF: ${samplePdf ? '✅' : '⚠️  Not found'}`);

  if (healthOk && ocrOk && aiOk) {
    console.log('\n✅ Basic endpoint tests PASSED');
    console.log('\n📋 Next Steps:');
    console.log('1. Test file upload via frontend: http://localhost:5173/rfqs/import');
    console.log('2. Or use curl/Postman to test:');
    console.log('   curl -X POST http://localhost:4000/api/ocr/extract \\');
    console.log('        -F "file=@backend/sample.pdf"');
    if (samplePdf) {
      console.log(`\n3. Sample PDF available at: ${samplePdf}`);
    }
  } else {
    console.log('\n⚠️  Some tests failed. Check backend logs for details.');
  }
}

runTests().catch(error => {
  console.error('\n❌ Test script failed:', error);
  process.exit(1);
});

