/**
 * Verify Azure Configuration
 * Checks if Azure environment variables are properly configured
 */

require('dotenv').config();

console.log('='.repeat(70));
console.log('AZURE CONFIGURATION VERIFICATION');
console.log('='.repeat(70));
console.log('');

// Check Document Intelligence
const docIntelEndpoint = process.env.AZURE_DOC_INTELLIGENCE_ENDPOINT;
const docIntelKey = process.env.AZURE_DOC_INTELLIGENCE_KEY;

console.log('Azure Document Intelligence:');
if (docIntelEndpoint && docIntelKey) {
  console.log('  ✅ Endpoint:', docIntelEndpoint);
  console.log('  ✅ Key:', docIntelKey.substring(0, 20) + '...' + docIntelKey.substring(docIntelKey.length - 10));
} else {
  console.log('  ❌ Missing configuration');
  if (!docIntelEndpoint) console.log('    - AZURE_DOC_INTELLIGENCE_ENDPOINT not set');
  if (!docIntelKey) console.log('    - AZURE_DOC_INTELLIGENCE_KEY not set');
}
console.log('');

// Check Azure OpenAI
const openaiEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
const openaiKey = process.env.AZURE_OPENAI_KEY;
const openaiDeployment = process.env.AZURE_OPENAI_DEPLOYMENT_NAME;
const openaiApiVersion = process.env.OPENAI_API_VERSION || process.env.AZURE_OPENAI_API_VERSION;

console.log('Azure OpenAI:');
if (openaiEndpoint && openaiKey && openaiDeployment) {
  console.log('  ✅ Endpoint:', openaiEndpoint);
  console.log('  ✅ Key:', openaiKey.substring(0, 20) + '...' + openaiKey.substring(openaiKey.length - 10));
  console.log('  ✅ Deployment:', openaiDeployment);
  console.log('  ✅ API Version:', openaiApiVersion || 'default');
} else {
  console.log('  ❌ Missing configuration');
  if (!openaiEndpoint) console.log('    - AZURE_OPENAI_ENDPOINT not set');
  if (!openaiKey) console.log('    - AZURE_OPENAI_KEY not set');
  if (!openaiDeployment) console.log('    - AZURE_OPENAI_DEPLOYMENT_NAME not set');
}
console.log('');

// Check for duplicates
console.log('Checking for duplicate entries...');
const fs = require('fs');
const path = require('path');
const envPath = path.join(__dirname, '../.env');

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  const lines = envContent.split('\n');
  
  const endpoints = lines.filter(l => l.trim().startsWith('AZURE_DOC_INTELLIGENCE_ENDPOINT='));
  if (endpoints.length > 1) {
    console.log('  ⚠️  Found', endpoints.length, 'AZURE_DOC_INTELLIGENCE_ENDPOINT entries');
    console.log('     Last one will be used:', endpoints[endpoints.length - 1].split('=')[1].trim());
  }
  
  const keys = lines.filter(l => l.trim().startsWith('AZURE_DOC_INTELLIGENCE_KEY='));
  if (keys.length > 1) {
    console.log('  ⚠️  Found', keys.length, 'AZURE_DOC_INTELLIGENCE_KEY entries');
  }
}

console.log('');
console.log('='.repeat(70));

if (docIntelEndpoint && docIntelKey && openaiEndpoint && openaiKey && openaiDeployment) {
  console.log('✅ All Azure configuration is present');
  console.log('');
  console.log('⚠️  Backend server restart required to load new environment variables');
} else {
  console.log('❌ Some Azure configuration is missing');
  process.exit(1);
}

