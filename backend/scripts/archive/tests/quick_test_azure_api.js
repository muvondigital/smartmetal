/**
 * Quick Test: Make a simple Azure OpenAI API call
 *
 * This verifies the client works end-to-end with a minimal test query.
 */

require('dotenv').config();

async function testAzureOpenAI() {
  console.log('🧪 Quick Azure OpenAI API Test\n');

  try {
    const { callGPT4 } = require('../src/services/ai/azureClient');

    console.log('📤 Sending test message to GPT-4o...');

    const messages = [
      {
        role: 'system',
        content: 'You are a helpful assistant. Respond with exactly 5 words.'
      },
      {
        role: 'user',
        content: 'Say hello and confirm you are working.'
      }
    ];

    const response = await callGPT4(messages, {
      temperature: 0.7,
      maxTokens: 50,
      retries: 1
    });

    console.log('\n📥 Response received:');
    console.log(`   "${response}"`);
    console.log('\n✅ API call successful!');
    console.log('✅ Azure OpenAI client is working correctly!');
    console.log('✅ No apiVersion errors occurred!');

  } catch (error) {
    console.error('\n❌ Test failed:');
    console.error(error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  }
}

testAzureOpenAI();
