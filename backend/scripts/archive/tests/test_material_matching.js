/**
 * Test Material Matching Performance
 */
require('dotenv').config();
const { matchMaterialsForLineItem } = require('../src/services/materialMatchService');

async function testMaterialMatching() {
  console.log('[Test] Starting material matching tests...\n');

  // Test both single quote (from Azure DI) and double quote
  const testItems = [
    { description: 'FLANGE', size: '6"', size1: '6"', label: '6" (double quote)' },
    { description: 'FLANGE', size: "6'", size1: "6'", label: "6' (single quote - Azure DI)" },
    { description: 'FLANGE', size: '12"', size1: '12"', label: '12" (double quote)' }
  ];

  let allPassed = true;

  for (const testItem of testItems) {
    console.log(`[Test] Testing FLANGE ${testItem.label}...`);
    const startTime = Date.now();
    const matches = await matchMaterialsForLineItem(testItem, { maxResults: 5, minScore: 20 });
    const duration = Date.now() - startTime;

    console.log(`[Test] Time: ${duration}ms`);
    console.log(`[Test] Matches found: ${matches.length}`);
    if (matches.length > 0) {
      console.log(`[Test] Top match: ${matches[0].material_code}`);
      console.log('[Test] ✅ PASS');
    } else {
      console.log('[Test] ❌ FAIL - No materials found');
      allPassed = false;
    }
    console.log('');
  }

  if (allPassed) {
    console.log('[Test] ✅ ALL TESTS PASSED - Material matching is working!');
  } else {
    console.log('[Test] ❌ SOME TESTS FAILED');
  }
  process.exit(allPassed ? 0 : 1);
}

testMaterialMatching().catch(e => { console.error(e); process.exit(1); });
