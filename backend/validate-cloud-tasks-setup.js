/**
 * Cloud Tasks Setup Validation Script
 * Validates that all required configuration is in place for Cloud Tasks integration
 */

require('dotenv').config({ path: require('path').join(__dirname, '.env.gcp') });
const { config } = require('./src/config/env');

console.log('🔍 Cloud Tasks Setup Validation');
console.log('================================\n');

let allValid = true;

// Check service account
console.log('1. Service Account Configuration:');
if (config.gcp.serviceAccountEmail) {
  console.log(`   ✅ Service Account: ${config.gcp.serviceAccountEmail}`);
  if (config.gcp.serviceAccountEmail.includes('@helpful-aurora-482800-v8.iam.gserviceaccount.com')) {
    console.log('   ✅ Valid GCP service account format');
  } else {
    console.log('   ⚠️  Warning: May not be a valid GCP service account');
    allValid = false;
  }
} else {
  console.log('   ❌ Service Account not configured');
  allValid = false;
}

// Check project and location
console.log('\n2. GCP Project Configuration:');
if (config.gcp.projectId) {
  console.log(`   ✅ Project ID: ${config.gcp.projectId}`);
} else {
  console.log('   ❌ Project ID not configured');
  allValid = false;
}

if (config.gcp.location) {
  console.log(`   ✅ Location: ${config.gcp.location}`);
} else {
  console.log('   ❌ Location not configured');
  allValid = false;
}

// Check queue
console.log('\n3. Cloud Tasks Queue:');
if (config.gcp.cloudtasks.extractionQueue) {
  console.log(`   ✅ Queue: ${config.gcp.cloudtasks.extractionQueue}`);
} else {
  console.log('   ❌ Queue not configured');
  allValid = false;
}

// Check target URL (CRITICAL)
console.log('\n4. Cloud Tasks Target URL (HTTPS):');
if (config.gcp.cloudtasks.targetUrl) {
  const url = config.gcp.cloudtasks.targetUrl;
  console.log(`   ✅ Target URL: ${url}`);
  
  if (url.startsWith('https://')) {
    console.log('   ✅ URL uses HTTPS (required for OIDC auth)');
  } else {
    console.log('   ❌ URL must use HTTPS (not HTTP)');
    allValid = false;
  }
  
  if (url.includes('/api/ai/process-extraction-task')) {
    console.log('   ✅ URL includes correct endpoint path');
  } else {
    console.log('   ⚠️  Warning: URL may not include correct endpoint path');
  }
} else {
  console.log('   ❌ Target URL not configured');
  console.log('   📝 Action Required:');
  console.log('      - For local testing: Set up ngrok and add CLOUDTASKS_TARGET_URL to .env.gcp');
  console.log('      - For production: Add your deployed service URL to .env.gcp');
  console.log('      - Format: CLOUDTASKS_TARGET_URL=https://your-url/api/ai/process-extraction-task');
  allValid = false;
}

// Summary
console.log('\n' + '='.repeat(32));
if (allValid) {
  console.log('✅ All configurations are valid!');
  console.log('   You can now test Cloud Tasks integration.');
  console.log('   Run: node test-cloud-tasks-extraction.js');
} else {
  console.log('❌ Configuration incomplete');
  console.log('   Please fix the issues above before testing.');
}
console.log('='.repeat(32) + '\n');

process.exit(allValid ? 0 : 1);

