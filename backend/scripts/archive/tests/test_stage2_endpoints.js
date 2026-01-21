/**
 * Stage 2 Testing Script
 * Tests Document Intelligence endpoints to verify Stage 2 is working
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');

const API_BASE = 'http://localhost:4000/api';

async function testEndpoint(name, method, endpoint, body = null, filePath = null) {
  console.log(`\n🧪 Testing: ${name}`);
  console.log(`   ${method} ${endpoint}`);

  try {
    const fetch = (await import('node-fetch')).default;
    
    let options = {
      method,
      headers: {}
    };

    if (filePath) {
      // File upload test
      const FormData = (await import('form-data')).default;
      const form = new FormData();
      
      const fileBuffer = fs.readFileSync(filePath);
      const fileName = path.basename(filePath);
      form.append('file', fileBuffer, fileName);
      
      if (body) {
        Object.keys(body).forEach(key => {
          form.append(key, body[key]);
        });
      }

      options.body = form;
      options.headers = form.getHeaders();
    } else if (body) {
      // JSON body
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }

    const response = await fetch(`${API_BASE}${endpoint}`, options);
    const data = await response.json();

    if (response.ok) {
      console.log(`   ✅ SUCCESS (${response.status})`);
      if (data.extraction_id) console.log(`   📋 Extraction ID: ${data.extraction_id}`);
      if (data.confidence) console.log(`   📊 Confidence: ${(data.confidence * 100).toFixed(1)}%`);
      if (data.structured) console.log(`   📄 Pages: ${data.structured.rawPages || 'N/A'}`);
      if (data.extracted_data?.items) {
        console.log(`   📦 Items extracted: ${data.extracted_data.items.length}`);
      }
      return { success: true, data };
    } else {
      console.log(`   ❌ FAILED (${response.status})`);
      console.log(`   Error: ${data.error || data.details || JSON.stringify(data)}`);
      return { success: false, error: data };
    }
  } catch (error) {
    console.log(`   ❌ ERROR: ${error.message}`);
    if (error.code === 'ECONNREFUSED') {
      console.log(`   ⚠️  Backend server not running. Start with: cd backend && npm run dev`);
    }
    return { success: false, error: error.message };
  }
}

async function runTests() {
  console.log('='.repeat(60));
  console.log('Stage 2: Document Intelligence - Endpoint Testing');
  console.log('='.repeat(60));

  // Check if backend is running
  try {
    const fetch = (await import('node-fetch')).default;
    const healthCheck = await fetch(`${API_BASE.replace('/api', '')}/health`);
    if (!healthCheck.ok) throw new Error('Health check failed');
    console.log('✅ Backend server is running');
  } catch (error) {
    console.log('❌ Backend server is NOT running');
    console.log('   Please start the backend: cd backend && npm run dev');
    process.exit(1);
  }

  // Test 1: OCR Test endpoint
  await testEndpoint('OCR Test Endpoint', 'GET', '/ocr/test');

  // Test 2: Check for sample PDF
  const samplePdfPath = path.join(__dirname, '../../test/fixtures/sample-rfq.pdf');
  const samplePdfExists = fs.existsSync(samplePdfPath);
  
  if (!samplePdfExists) {
    console.log('\n⚠️  No sample PDF found for testing');
    console.log(`   Expected location: ${samplePdfPath}`);
    console.log('   Creating test fixtures directory...');
    
    const fixturesDir = path.dirname(samplePdfPath);
    if (!fs.existsSync(fixturesDir)) {
      fs.mkdirSync(fixturesDir, { recursive: true });
      console.log('   ✅ Created fixtures directory');
    }
    
    console.log('\n📝 To test file upload endpoints:');
    console.log('   1. Place a sample RFQ PDF in: test/fixtures/sample-rfq.pdf');
    console.log('   2. Run this script again');
    console.log('\n✅ Basic endpoint tests completed');
    process.exit(0);
  }

  // Test 3: OCR Extract endpoint
  console.log(`\n📄 Using sample PDF: ${samplePdfPath}`);
  await testEndpoint('OCR Extract', 'POST', '/ocr/extract', null, samplePdfPath);

  // Test 4: AI Extract RFQ (unified endpoint)
  await testEndpoint('AI Extract RFQ (Unified)', 'POST', '/ai/extract-rfq', {
    enrichItems: 'true',
    matchMaterials: 'true'
  }, samplePdfPath);

  console.log('\n' + '='.repeat(60));
  console.log('✅ Stage 2 Endpoint Testing Complete');
  console.log('='.repeat(60));
  console.log('\nNext Steps:');
  console.log('1. Test frontend integration at: http://localhost:5173/rfqs/import');
  console.log('2. Verify end-to-end flow works');
  console.log('3. Check for any errors in backend logs');
}

// Run tests
runTests().catch(error => {
  console.error('\n❌ Test script failed:', error);
  process.exit(1);
});

