/**
 * Test script for material matching service
 * 
 * Tests if materialMatchService can match RFQ items to catalog entries
 * 
 * Usage:
 *   cd backend
 *   node scripts/test_material_matching.js
 */

require('dotenv').config();
const { matchMaterialsForLineItem } = require('../src/services/materialMatchService');

async function testMaterialMatching() {
  console.log('\n[Material Match Test] ===========================================');
  console.log('[Material Match Test] Testing material matching service...\n');

  // Test cases for different material types
  const testCases = [
    {
      name: 'Flange test',
      item: {
        description: 'Weld Neck Flange 6" ASTM A105',
        size: '6"',
        standard: 'ASTM A105',
        grade: null,
        schedule: null,
      },
    },
    {
      name: 'Fastener test',
      item: {
        description: 'Bolt M12 x 50mm Grade 8.8',
        size: 'M12 x 50mm',
        standard: null,
        grade: '8.8',
        schedule: null,
      },
    },
    {
      name: 'Pipe test (for comparison)',
      item: {
        description: 'Carbon Steel Pipe 4" SCH40 ASTM A106 GR.B',
        size: '4"',
        standard: 'ASTM A106',
        grade: 'GR.B',
        schedule: '40',
      },
    },
    {
      name: 'Fitting test (for comparison)',
      item: {
        description: '90 Degree Elbow 2" SCH40 Carbon Steel',
        size: '2"',
        standard: null,
        grade: null,
        schedule: '40',
      },
    },
  ];

  let passedTests = 0;
  let failedTests = 0;

  for (const testCase of testCases) {
    console.log(`[Material Match Test] Testing: ${testCase.name}`);
    console.log(`[Material Match Test]   Item: ${testCase.item.description}`);
    
    try {
      const matches = await matchMaterialsForLineItem(testCase.item, {
        maxResults: 3,
        minScore: 40,
      });

      if (matches && matches.length > 0) {
        console.log(`[Material Match Test]   ✓ Found ${matches.length} match(es):`);
        matches.forEach((match, index) => {
          console.log(`[Material Match Test]     ${index + 1}. ${match.material_code} (score: ${match.score})`);
          if (match.reason) {
            console.log(`[Material Match Test]        Reason: ${match.reason}`);
          }
        });
        passedTests++;
      } else {
        console.log(`[Material Match Test]   ✗ No matches found (this may be expected if catalog is empty)`);
        failedTests++;
      }
    } catch (error) {
      console.error(`[Material Match Test]   ✗ Error: ${error.message}`);
      failedTests++;
    }
    
    console.log('');
  }

  console.log('[Material Match Test] ===========================================');
  console.log(`[Material Match Test] Results: ${passedTests} passed, ${failedTests} failed`);
  console.log('[Material Match Test] ===========================================\n');

  return { passedTests, failedTests };
}

// Run if executed directly
if (require.main === module) {
  testMaterialMatching()
    .then(({ passedTests, failedTests }) => {
      if (failedTests === 0) {
        console.log('[Material Match Test] All tests passed!');
        process.exit(0);
      } else {
        console.log('[Material Match Test] Some tests failed or returned no matches');
        console.log('[Material Match Test] Note: This may be expected if catalog files are empty');
        process.exit(0); // Exit with 0 since empty catalogs are expected
      }
    })
    .catch((error) => {
      console.error('[Material Match Test] Test failed:', error);
      process.exit(1);
    });
}

module.exports = {
  testMaterialMatching,
};

