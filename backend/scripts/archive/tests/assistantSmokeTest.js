/**
 * AI Assistant Smoke Test
 * 
 * Diagnostic script to exercise the AI Assistant pipeline with sample queries.
 * Tests intent classification, entity extraction, and response generation.
 * 
 * Usage: node scripts/assistantSmokeTest.js
 * 
 * Prerequisites:
 * - Backend .env configured with Azure OpenAI credentials
 * - Database connection configured
 * - At least one tenant with data (for data queries)
 * 
 * This is a developer-only diagnostic tool. Not wired into production paths.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { processQuery, classifyIntent } = require('../src/services/ai/assistantOrchestrator');

// Sample test queries
const TEST_QUERIES = [
  {
    name: 'UNKNOWN_INTENT - Generic greeting',
    message: 'Are you up?',
    expectedIntent: 'internal_qna',
    description: 'Should get a friendly general response, not UNKNOWN_INTENT'
  },
  {
    name: 'UNKNOWN_INTENT - HS Code question',
    message: 'What is HS Code?',
    expectedIntent: 'REGULATORY_QA',
    description: 'Should be treated as regulatory/general question, not UNKNOWN_INTENT'
  },
  {
    name: 'COUNT_RFQS - Simple count',
    message: 'How many RFQs are there?',
    expectedIntent: 'COUNT_RFQS',
    description: 'Should count total RFQs for tenant'
  },
  {
    name: 'APPROVAL_PENDING - Pending approvals',
    message: 'Show pending approvals',
    expectedIntent: 'APPROVAL_PENDING',
    description: 'Should fetch pending approvals list'
  },
  {
    name: 'MATERIAL_SEARCH - Material search',
    message: 'Search materials: pipe',
    expectedIntent: 'MATERIAL_SEARCH',
    description: 'Should search materials catalog'
  },
  {
    name: 'MARGIN_ANALYSIS - Why is margin low',
    message: 'Why is the margin so low for pricing run 101?',
    expectedIntent: 'MARGIN_ANALYSIS',
    description: 'Should perform read-only margin analysis context'
  },
  {
    name: 'WORKLOAD_OVERVIEW - What is on my plate',
    message: 'Anything pending for me today?',
    expectedIntent: 'WORKLOAD_OVERVIEW',
    description: 'Should combine pending approvals and RFQs needing attention'
  },
  {
    name: 'RUN PRICING REQUEST - should stay read-only',
    message: 'Run pricing for RFQ 123',
    expectedIntent: 'GENERAL_QA',
    description: 'Should explain how to run pricing, not execute it'
  }
];

// Test configuration
const TEST_CONFIG = {
  tenantId: process.env.TEST_TENANT_ID || '00000000-0000-0000-0000-000000000000', // Replace with actual tenant ID
  tenantCode: process.env.TEST_TENANT_CODE || 'NSC',
  userId: 'test-user-smoke-test',
  userEmail: 'test@example.com',
  userRole: 'manager' // Manager has access to most intents
};

/**
 * Run a single test query
 */
async function runTestQuery(testCase) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`Test: ${testCase.name}`);
  console.log(`Query: "${testCase.message}"`);
  console.log(`Expected Intent: ${testCase.expectedIntent}`);
  console.log(`Description: ${testCase.description}`);
  console.log('-'.repeat(80));

  try {
    // First, test intent classification only (no LLM call)
    console.log('\n[1] Testing Intent Classification...');
    const classification = await classifyIntent(testCase.message, null);
    console.log(`   Detected Intent: ${classification.intent}`);
    console.log(`   Confidence: ${classification.confidence.toFixed(2)}`);
    console.log(`   Reasons: ${classification.reasons.join(', ')}`);
    console.log(`   Entities: ${JSON.stringify(classification.entities)}`);

    if (classification.intent === testCase.expectedIntent) {
      console.log('   ✅ Intent matches expected value');
    } else {
      console.log(`   ⚠️  Intent mismatch: expected ${testCase.expectedIntent}, got ${classification.intent}`);
    }

    // Then, test full pipeline (includes LLM call)
    console.log('\n[2] Testing Full Pipeline (with LLM call)...');
    const startTime = Date.now();
    
    const result = await processQuery({
      userMessage: testCase.message,
      chatHistory: [],
      quickAction: null,
      userId: TEST_CONFIG.userId,
      userEmail: TEST_CONFIG.userEmail,
      userRole: TEST_CONFIG.userRole,
      tenantId: TEST_CONFIG.tenantId,
      tenantCode: TEST_CONFIG.tenantCode
    });

    const duration = Date.now() - startTime;

    if (result.error) {
      console.log(`   ❌ Error: ${result.error}`);
      return { success: false, error: result.error };
    }

    console.log(`   ✅ Success (${duration}ms)`);
    console.log(`   Intent: ${result.intent}`);
    console.log(`   Reply Length: ${result.reply?.length || 0} characters`);
    console.log(`   Reply Preview: ${(result.reply || '').substring(0, 100)}...`);
    console.log(`   Follow-up: ${result.followUp ? 'Yes' : 'No'}`);
    console.log(`   Clarification Options: ${result.clarificationOptions?.length || 0}`);
    console.log(`   Suggested Actions: ${result.suggestedActions?.length || 0}`);
    console.log(`   Data Preview: ${result.dataPreview ? result.dataPreview.type : 'None'}`);
    console.log(`   Tokens Used: ${result.metadata?.tokensUsed || 'N/A'}`);
    console.log(`   Latency: ${result.metadata?.latency || 'N/A'}ms`);

    return { success: true, result };

  } catch (error) {
    console.log(`   ❌ Exception: ${error.message}`);
    console.log(`   Stack: ${error.stack}`);
    return { success: false, error: error.message };
  }
}

/**
 * Main test runner
 */
async function runSmokeTest() {
  console.log('🔍 AI Assistant Smoke Test');
  console.log('='.repeat(80));
  console.log(`Tenant ID: ${TEST_CONFIG.tenantId}`);
  console.log(`Tenant Code: ${TEST_CONFIG.tenantCode}`);
  console.log(`User Role: ${TEST_CONFIG.userRole}`);
  console.log(`\nRunning ${TEST_QUERIES.length} test queries...`);

  const results = [];
  let successCount = 0;
  let failureCount = 0;

  for (const testCase of TEST_QUERIES) {
    const result = await runTestQuery(testCase);
    results.push({ testCase, result });
    
    if (result.success) {
      successCount++;
    } else {
      failureCount++;
    }

    // Small delay between tests to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Summary
  console.log(`\n${'='.repeat(80)}`);
  console.log('📊 Test Summary');
  console.log('='.repeat(80));
  console.log(`Total Tests: ${TEST_QUERIES.length}`);
  console.log(`✅ Passed: ${successCount}`);
  console.log(`❌ Failed: ${failureCount}`);
  console.log(`Success Rate: ${((successCount / TEST_QUERIES.length) * 100).toFixed(1)}%`);

  // Detailed results
  console.log('\n📋 Detailed Results:');
  results.forEach(({ testCase, result }, index) => {
    const status = result.success ? '✅' : '❌';
    console.log(`${status} [${index + 1}] ${testCase.name}: ${result.success ? 'PASS' : `FAIL - ${result.error}`}`);
  });

  // Exit with appropriate code
  process.exit(failureCount > 0 ? 1 : 0);
}

// Run the smoke test
runSmokeTest().catch(error => {
  console.error('\n❌ Fatal error running smoke test:');
  console.error(error);
  process.exit(1);
});
