/**
 * Test script for material parsers
 * 
 * Tests parsers with examples from client documents
 */

const materialParsers = require('../src/services/materialParsers');
const typeIdentifier = require('../src/services/materialParsers/typeIdentifier');

console.log('');
console.log('='.repeat(70));
console.log('MATERIAL PARSER TEST SUITE');
console.log('='.repeat(70));
console.log('');

const testCases = [
  // Structural Beams
  { input: "W36X194", type: 'BEAM' },
  { input: "W14x38", type: 'BEAM' },
  { input: "HEA 1000 x 300 x 272", type: 'BEAM' },
  { input: "BEAM W36X194", type: 'BEAM' },
  
  // Tubulars
  { input: "30000x25", type: 'TUBULAR' },
  { input: "1828.80x44.5", type: 'TUBULAR' },
  { input: "457 x 39.61 x 11800", type: 'TUBULAR' },
  { input: "TUBULAR 30000x25", type: 'TUBULAR' },
  
  // Plates
  { input: "PL60", type: 'PLATE' },
  { input: "PL50", type: 'PLATE' },
  { input: "PL40", type: 'PLATE' },
  { input: "PLATE PL60", type: 'PLATE' },
  
  // European Standards
  { input: "EN10210 S355 K2H", type: null },
  { input: "EN10225 S355 MLO", type: null },
  { input: "PIPE, SEAMLESS, TYPE I, 457 x 39.61 x 11800, EN10210 S355 K2H", type: 'TUBULAR' },
];

let passed = 0;
let failed = 0;

testCases.forEach((test, index) => {
  console.log(`Test ${index + 1}: "${test.input}"`);
  console.log('-'.repeat(70));
  
  try {
    // Test type identification
    const typeInfo = typeIdentifier.identifyMaterialType(test.input);
    console.log(`Type identified: ${typeInfo.type || 'null'} (pattern: ${typeInfo.pattern}, confidence: ${typeInfo.confidence})`);
    
    // Test full extraction
    const extracted = materialParsers.extractAllAttributes(test.input);
    
    if (extracted) {
      console.log(`Material type: ${extracted.material_type}`);
      console.log(`Attributes:`, JSON.stringify(extracted.attributes, null, 2));
      console.log(`Confidence: ${extracted.confidence}`);
      
      // Check if type matches expected
      if (test.type === null || extracted.material_type === test.type) {
        console.log('✅ PASS');
        passed++;
      } else {
        console.log(`❌ FAIL - Expected type: ${test.type}, Got: ${extracted.material_type}`);
        failed++;
      }
    } else {
      if (test.type === null) {
        console.log('✅ PASS (no type expected)');
        passed++;
      } else {
        console.log(`❌ FAIL - Expected type: ${test.type}, Got: null`);
        failed++;
      }
    }
  } catch (error) {
    console.log(`❌ ERROR: ${error.message}`);
    failed++;
  }
  
  console.log('');
});

console.log('='.repeat(70));
console.log('TEST SUMMARY');
console.log('='.repeat(70));
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total: ${testCases.length}`);
console.log('='.repeat(70));
console.log('');

if (failed === 0) {
  console.log('✅ All tests passed!');
  process.exit(0);
} else {
  console.log('❌ Some tests failed');
  process.exit(1);
}

