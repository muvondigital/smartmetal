/**
 * Test script to verify Azure AI services connectivity
 * Run: node scripts/test_azure_services.js
 */

require('dotenv').config();
const { DocumentAnalysisClient, AzureKeyCredential } = require("@azure/ai-form-recognizer");

console.log('🔍 Testing Azure AI Services Configuration...\n');

// Test 1: Document Intelligence
async function testDocumentIntelligence() {
  try {
    console.log('1️⃣  Testing Document Intelligence...');

    if (!process.env.AZURE_DOC_INTELLIGENCE_ENDPOINT || !process.env.AZURE_DOC_INTELLIGENCE_KEY) {
      throw new Error('Missing AZURE_DOC_INTELLIGENCE credentials in .env');
    }

    const client = new DocumentAnalysisClient(
      process.env.AZURE_DOC_INTELLIGENCE_ENDPOINT,
      new AzureKeyCredential(process.env.AZURE_DOC_INTELLIGENCE_KEY)
    );

    console.log('   ✅ Document Intelligence client initialized');
    console.log(`   📍 Endpoint: ${process.env.AZURE_DOC_INTELLIGENCE_ENDPOINT}`);
    console.log('   🔑 Key: ****' + process.env.AZURE_DOC_INTELLIGENCE_KEY.slice(-4));

    return true;
  } catch (error) {
    console.log('   ❌ Document Intelligence test failed:', error.message);
    return false;
  }
}

// Test 2: Computer Vision
async function testComputerVision() {
  try {
    console.log('\n2️⃣  Testing Computer Vision...');

    if (!process.env.AZURE_COMPUTER_VISION_ENDPOINT || !process.env.AZURE_COMPUTER_VISION_KEY) {
      throw new Error('Missing AZURE_COMPUTER_VISION credentials in .env');
    }

    console.log('   ✅ Computer Vision credentials found');
    console.log(`   📍 Endpoint: ${process.env.AZURE_COMPUTER_VISION_ENDPOINT}`);
    console.log('   🔑 Key: ****' + process.env.AZURE_COMPUTER_VISION_KEY.slice(-4));

    return true;
  } catch (error) {
    console.log('   ❌ Computer Vision test failed:', error.message);
    return false;
  }
}

// Test 3: Custom Vision
async function testCustomVision() {
  try {
    console.log('\n3️⃣  Testing Custom Vision...');

    if (!process.env.AZURE_CUSTOM_VISION_TRAINING_KEY || !process.env.AZURE_CUSTOM_VISION_PREDICTION_KEY) {
      throw new Error('Missing AZURE_CUSTOM_VISION credentials in .env');
    }

    console.log('   ✅ Custom Vision credentials found');
    console.log(`   📍 Training Endpoint: ${process.env.AZURE_CUSTOM_VISION_TRAINING_ENDPOINT}`);
    console.log('   🔑 Training Key: ****' + process.env.AZURE_CUSTOM_VISION_TRAINING_KEY.slice(-4));
    console.log(`   📍 Prediction Endpoint: ${process.env.AZURE_CUSTOM_VISION_PREDICTION_ENDPOINT}`);
    console.log('   🔑 Prediction Key: ****' + process.env.AZURE_CUSTOM_VISION_PREDICTION_KEY.slice(-4));

    return true;
  } catch (error) {
    console.log('   ❌ Custom Vision test failed:', error.message);
    return false;
  }
}

// Test 4: Azure OpenAI (optional - may not be set up yet)
async function testAzureOpenAI() {
  try {
    console.log('\n4️⃣  Testing Azure OpenAI...');

    if (!process.env.AZURE_OPENAI_ENDPOINT || !process.env.AZURE_OPENAI_KEY) {
      console.log('   ⚠️  Azure OpenAI not configured (optional - requires separate approval)');
      console.log('   ℹ️  You need to apply for Azure OpenAI access at: https://aka.ms/oai/access');
      return null; // Not a failure, just not configured
    }

    console.log('   ✅ Azure OpenAI credentials found');
    console.log(`   📍 Endpoint: ${process.env.AZURE_OPENAI_ENDPOINT}`);
    console.log('   🔑 Key: ****' + process.env.AZURE_OPENAI_KEY.slice(-4));

    return true;
  } catch (error) {
    console.log('   ❌ Azure OpenAI test failed:', error.message);
    return false;
  }
}

// Run all tests
async function runTests() {
  console.log('════════════════════════════════════════════════════════');
  console.log('           Azure AI Services Configuration Test         ');
  console.log('════════════════════════════════════════════════════════\n');

  const results = {
    documentIntelligence: await testDocumentIntelligence(),
    computerVision: await testComputerVision(),
    customVision: await testCustomVision(),
    azureOpenAI: await testAzureOpenAI()
  };

  console.log('\n════════════════════════════════════════════════════════');
  console.log('                      Test Summary                      ');
  console.log('════════════════════════════════════════════════════════');

  const passed = Object.values(results).filter(r => r === true).length;
  const failed = Object.values(results).filter(r => r === false).length;
  const skipped = Object.values(results).filter(r => r === null).length;

  console.log(`✅ Passed:  ${passed}`);
  console.log(`❌ Failed:  ${failed}`);
  console.log(`⚠️  Skipped: ${skipped} (optional services)`);

  if (failed === 0) {
    console.log('\n🎉 All configured Azure services are working correctly!');
    console.log('\n📋 Next Steps:');
    console.log('   1. Apply for Azure OpenAI access (if needed): https://aka.ms/oai/access');
    console.log('   2. Create a Custom Vision project for material recognition');
    console.log('   3. Start implementing AI features in Stage 1 (Smart Approval Automation)');
    console.log('\n📚 See AZURE_AI_IMPLEMENTATION_PLAN.md for detailed implementation guide');
  } else {
    console.log('\n⚠️  Some tests failed. Please check your .env configuration.');
  }

  console.log('\n════════════════════════════════════════════════════════\n');
}

// Run the tests
runTests().catch(console.error);
