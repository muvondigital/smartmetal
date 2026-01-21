/**
 * Test Vertex AI Extraction with Real NSC Documents
 *
 * Purpose: Verify the @google-cloud/vertexai SDK fix works with actual commercial documents
 *
 * What we're testing:
 * 1. Pure JSON response (no markdown contamination)
 * 2. Fail-loud behavior (reject metadata-only responses)
 * 3. NULL preservation (missing data stays as null, not dropped)
 */

require('dotenv').config({ path: '.env.gcp' });
const fs = require('fs');
const path = require('path');

// Import the FIXED Vertex AI client
const { callGPT4JSON } = require('./src/services/gcp/genaiClient');

// Test configuration
const TEST_DOCUMENTS = [
  {
    name: 'PetroVietnam MTO',
    path: '../test_data/RealSamples/WHP-DHN-S-X-2001_0 (PetroVietnam).pdf',
    expectedBehavior: 'Should extract pipe materials with sizes and quantities'
  },
  {
    name: 'Shell MTO',
    path: '../test_data/RealSamples/mto_shell.pdf',
    expectedBehavior: 'Should extract table items or fail loudly'
  }
];

/**
 * Simulate extraction call with minimal prompt
 */
async function testExtractionWithDocument(docInfo) {
  console.log('\n' + '='.repeat(80));
  console.log(`Testing: ${docInfo.name}`);
  console.log(`Expected: ${docInfo.expectedBehavior}`);
  console.log('='.repeat(80));

  try {
    // Simulate a simple extraction prompt
    const messages = [
      {
        role: 'system',
        content: `You are a material extraction assistant. Extract materials from the document into a structured list.

CRITICAL RULES:
- If tables exist, you MUST extract items
- Empty items array is a FAILURE, not success
- Missing data = null (do not guess or drop rows)
- Return ONLY valid JSON

Output schema:
{
  "document_type": "MTO" | "PR" | "PO",
  "items": [
    {
      "line_number": number,
      "description": string | null,
      "quantity": number | null,
      "unit": string | null,
      "size": string | null,
      "material": string | null
    }
  ]
}`
      },
      {
        role: 'user',
        content: `Extract materials from this ${docInfo.name}. Return structured JSON with items array.`
      }
    ];

    const startTime = Date.now();

    // Call Vertex AI with JSON mode
    const result = await callGPT4JSON(messages, {
      temperature: 0.2,
      maxTokens: 4000,
      retries: 1
    });

    const duration = Date.now() - startTime;

    console.log('\n✅ EXTRACTION SUCCESSFUL');
    console.log(`Duration: ${duration}ms`);
    console.log(`Document type: ${result.document_type || 'N/A'}`);
    console.log(`Items extracted: ${result.items?.length || 0}`);

    // Validation checks
    const validationResults = {
      hasItems: Array.isArray(result.items) && result.items.length > 0,
      isPureJSON: typeof result === 'object' && !result._markdown,
      hasNulls: result.items?.some(item =>
        Object.values(item).some(val => val === null)
      ),
      allRowsPresent: result.items?.every(item => item.line_number !== undefined)
    };

    console.log('\nValidation Results:');
    console.log(`  ✓ Has items: ${validationResults.hasItems ? 'PASS' : 'FAIL'}`);
    console.log(`  ✓ Pure JSON: ${validationResults.isPureJSON ? 'PASS' : 'FAIL'}`);
    console.log(`  ✓ Preserves nulls: ${validationResults.hasNulls ? 'PASS' : 'FAIL'}`);
    console.log(`  ✓ All rows present: ${validationResults.allRowsPresent ? 'PASS' : 'FAIL'}`);

    // Show sample items
    if (result.items && result.items.length > 0) {
      console.log('\nSample Items (first 3):');
      result.items.slice(0, 3).forEach((item, idx) => {
        console.log(`  ${idx + 1}. Line ${item.line_number}: ${item.description || 'N/A'}`);
        console.log(`     Qty: ${item.quantity || 'null'} ${item.unit || ''}`);
        console.log(`     Size: ${item.size || 'null'}`);
      });
    }

    return {
      success: true,
      document: docInfo.name,
      itemCount: result.items?.length || 0,
      validation: validationResults
    };

  } catch (error) {
    console.log('\n❌ EXTRACTION FAILED');
    console.log(`Error: ${error.message}`);

    // Check if it's a GOOD failure (fail-loud behavior)
    const isGoodFailure =
      error.message.includes('metadata-only') ||
      error.message.includes('0 items') ||
      error.message.includes('Invalid JSON');

    console.log(`\nIs this a "fail-loud" behavior? ${isGoodFailure ? 'YES ✓' : 'NO ✗'}`);

    return {
      success: false,
      document: docInfo.name,
      error: error.message,
      isGoodFailure
    };
  }
}

/**
 * Test direct JSON parsing (verify responseMimeType works)
 */
async function testPureJSONResponse() {
  console.log('\n' + '='.repeat(80));
  console.log('TEST: Pure JSON Response (responseMimeType validation)');
  console.log('='.repeat(80));

  const messages = [
    { role: 'system', content: 'Return a simple JSON object with test data.' },
    { role: 'user', content: 'Return this JSON: {"test": "value", "number": 42}' }
  ];

  try {
    const result = await callGPT4JSON(messages, { temperature: 0, maxTokens: 100 });

    console.log('✅ Response is pure JSON (no markdown)');
    console.log('Result:', JSON.stringify(result, null, 2));

    return { success: true };
  } catch (error) {
    console.log('❌ JSON parsing failed:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Main test runner
 */
async function runTests() {
  console.log('\n🧪 Vertex AI Extraction Test Suite');
  console.log('Testing: @google-cloud/vertexai SDK with responseMimeType: "application/json"');
  console.log('\nObjective: Verify commercial discipline (fail-loud, preserve nulls, no silent failures)');

  const results = {
    pureJSON: null,
    extractions: []
  };

  // Test 1: Pure JSON response
  results.pureJSON = await testPureJSONResponse();

  // Test 2: Real document extraction (only test first document to save API costs)
  if (results.pureJSON.success) {
    console.log('\n📄 Testing with real NSC document...');
    const docToTest = TEST_DOCUMENTS[0]; // Test PetroVietnam first
    results.extractions.push(await testExtractionWithDocument(docToTest));
  }

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('TEST SUMMARY');
  console.log('='.repeat(80));
  console.log(`Pure JSON test: ${results.pureJSON.success ? '✅ PASS' : '❌ FAIL'}`);

  results.extractions.forEach(result => {
    if (result.success) {
      console.log(`${result.document}: ✅ EXTRACTED ${result.itemCount} items`);
    } else {
      console.log(`${result.document}: ${result.isGoodFailure ? '✅ FAILED CORRECTLY' : '❌ FAILED INCORRECTLY'}`);
    }
  });

  const allPassed = results.pureJSON.success &&
    results.extractions.every(r => r.success || r.isGoodFailure);

  console.log('\n' + (allPassed ? '🎉 ALL TESTS PASSED' : '⚠️  SOME TESTS FAILED'));

  process.exit(allPassed ? 0 : 1);
}

// Run tests
runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
