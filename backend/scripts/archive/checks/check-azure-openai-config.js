/**
 * Check Azure OpenAI Configuration
 * 
 * This script checks if Azure OpenAI is properly configured.
 * Run: node scripts/check-azure-openai-config.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const requiredVars = [
  'AZURE_OPENAI_ENDPOINT',
  'AZURE_OPENAI_KEY',
  'AZURE_OPENAI_DEPLOYMENT_NAME'
];

console.log('=== Azure OpenAI Configuration Check ===\n');

let allConfigured = true;

requiredVars.forEach(varName => {
  const value = process.env[varName];
  if (value) {
    console.log(`✅ ${varName}: SET`);
  } else {
    console.log(`❌ ${varName}: NOT SET`);
    allConfigured = false;
  }
});

console.log(`\nOPENAI_API_VERSION: ${process.env.OPENAI_API_VERSION || 'NOT SET (using default)'}`);

if (!allConfigured) {
  console.log('\n⚠️  WARNING: Azure OpenAI is NOT fully configured!');
  console.log('   The AI Assistant will NOT work without these credentials.');
  console.log('\n   Please add to backend/.env:');
  console.log('   AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/');
  console.log('   AZURE_OPENAI_KEY=your-api-key');
  console.log('   AZURE_OPENAI_DEPLOYMENT_NAME=gpt-4o');
  console.log('   OPENAI_API_VERSION=2024-02-15-preview');
  process.exit(1);
} else {
  console.log('\n✅ All Azure OpenAI credentials are configured!');
  
  // Try to initialize the client
  try {
    const { initializeClient } = require('../src/services/ai/azureClient');
    const client = initializeClient();
    console.log('✅ Azure OpenAI client initialized successfully!');
    process.exit(0);
  } catch (error) {
    console.log('\n❌ Failed to initialize Azure OpenAI client:');
    console.log(`   ${error.message}`);
    process.exit(1);
  }
}
