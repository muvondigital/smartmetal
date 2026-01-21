/**
 * Test script for Cloud Tasks integration
 * Tests document extraction with async=true parameter
 */

require('dotenv').config({ path: require('path').join(__dirname, '.env.gcp') });
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const axios = require('axios');

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const TENANT_CODE = process.env.TEST_TENANT_CODE || 'nsc';
const SAMPLE_FILE = path.join(__dirname, 'sample.pdf');

async function testAsyncExtraction() {
  console.log('🧪 Testing Cloud Tasks Integration');
  console.log('===================================\n');

  // Check if sample file exists
  if (!fs.existsSync(SAMPLE_FILE)) {
    console.error(`❌ Sample file not found: ${SAMPLE_FILE}`);
    process.exit(1);
  }

  console.log(`📄 Using sample file: ${SAMPLE_FILE}`);
  console.log(`🌐 Backend URL: ${BACKEND_URL}`);
  console.log(`🏢 Tenant Code: ${TENANT_CODE}\n`);

  // Create form data
  const form = new FormData();
  form.append('file', fs.createReadStream(SAMPLE_FILE));
  form.append('async', 'true');
  form.append('enrichItems', 'false'); // Skip enrichment for faster test
  form.append('matchMaterials', 'false'); // Skip material matching for faster test

  try {
    console.log('📤 Sending extraction request with async=true...\n');
    
    const response = await axios.post(
      `${BACKEND_URL}/api/ai/extract-rfq`,
      form,
      {
        headers: {
          ...form.getHeaders(),
          'X-Tenant-Code': TENANT_CODE,
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        timeout: 30000, // 30 seconds
      }
    );

    console.log('✅ Request successful!\n');
    console.log('Response:', JSON.stringify(response.data, null, 2));
    
    if (response.data.status === 'queued') {
      console.log('\n✅ Cloud Task has been queued successfully!');
      console.log(`📋 Correlation ID: ${response.data.correlationId}`);
      console.log('\n💡 Next steps:');
      console.log('   1. Check backend logs for Cloud Task creation messages');
      console.log('   2. Monitor Google Cloud Console for Cloud Tasks queue');
      console.log('   3. Check backend logs for task processing messages');
    } else {
      console.log('\n⚠️  Response indicates sync processing (not queued)');
    }

  } catch (error) {
    console.error('\n❌ Request failed!\n');
    
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Response:', JSON.stringify(error.response.data, null, 2));
    } else if (error.request) {
      console.error('No response received:', error.message);
    } else {
      console.error('Error:', error.message);
    }
    
    process.exit(1);
  }
}

// Run the test
testAsyncExtraction().catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});

