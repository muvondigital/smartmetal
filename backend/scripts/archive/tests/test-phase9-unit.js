/**
 * Phase 9: Landed Cost Engine V2 - Unit Tests (No DB Required)
 * 
 * Tests logistics cost calculations without database dependency.
 */

// Set minimal env to avoid config validation
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.ENABLE_LANDED_COST_V2 = 'true';

const logisticsCostService = require('../src/services/logisticsCostService');
const { defaultLogisticsConfig } = require('../src/config/logisticsCostConfig');

console.log('\n' + '='.repeat(70));
console.log('PHASE 9: LANDED COST ENGINE V2 - UNIT TEST SUITE');
console.log('='.repeat(70));

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, testName) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ ${testName}`);
    return true;
  } else {
    failedTests++;
    console.log(`  ✗ ${testName}`);
    return false;
  }
}

function assertApprox(actual, expected, tolerance, testName) {
  const diff = Math.abs(actual - expected);
  return assert(diff <= tolerance, `${testName} (expected: ${expected.toFixed(2)}, actual: ${actual.toFixed(2)})`);
}

// Test Cases
console.log('\n1. FREIGHT COST ESTIMATION');
console.log('-'.repeat(70));

// Test 1: Weight-based freight from China
const freightTest1 = logisticsCostService.estimateFreightCost(
  { description: 'Pipe', category: 'PIPE' },
  {
    tenantId: 'test',
    originCountry: 'CN',
    category: 'PIPE',
    quantity: 100,
    unitPrice: 500,
    weight: 1800 // 18 kg/m × 100m
  }
);
assertApprox(freightTest1, 1530, 1, 'Weight-based freight (CN, 1800kg @ 0.85/kg)');

// Test 2: Freight minimum charge
const freightTest2 = logisticsCostService.estimateFreightCost(
  { description: 'Fastener', category: 'FASTENER' },
  {
    tenantId: 'test',
    originCountry: 'CN',
    category: 'FASTENER',
    quantity: 10,
    unitPrice: 5,
    weight: 1 // Very light item
  }
);
assert(freightTest2 >= defaultLogisticsConfig.freight.minimumCharge, 
       `Minimum freight charge applied (${freightTest2} >= ${defaultLogisticsConfig.freight.minimumCharge})`);

console.log('\n2. INSURANCE COST ESTIMATION');
console.log('-'.repeat(70));

// Test 3: Insurance calculation (1.5% of CIF)
const freightCost = 1530;
const itemValue = 50000;
const insuranceTest1 = logisticsCostService.estimateInsuranceCost(
  { description: 'Pipe', category: 'PIPE' },
  {
    tenantId: 'test',
    originCountry: 'CN',
    category: 'PIPE',
    quantity: 100,
    unitPrice: 500,
    freightCost: freightCost
  }
);
const expectedInsurance = (itemValue + freightCost) * 0.015; // 1.5% base rate, CN adjustment 1.0, PIPE adjustment 1.0
assertApprox(insuranceTest1, expectedInsurance, 1, 'Insurance (1.5% of CIF)');

// Test 4: Insurance with origin adjustment
const insuranceTest2 = logisticsCostService.estimateInsuranceCost(
  { description: 'Valve', category: 'VALVE' },
  {
    tenantId: 'test',
    originCountry: 'IN', // India has 1.2x adjustment
    category: 'VALVE', // Valve has 1.2x adjustment
    quantity: 10,
    unitPrice: 1000,
    freightCost: 500
  }
);
const expectedInsurance2 = (10000 + 500) * 0.015 * 1.2 * 1.2; // 1.5% × 1.2 (origin) × 1.2 (category)
assertApprox(insuranceTest2, expectedInsurance2, 1, 'Insurance with origin and category adjustments');

console.log('\n3. HANDLING COST ESTIMATION');
console.log('-'.repeat(70));

// Test 5: Weight-based handling
const handlingTest1 = logisticsCostService.estimateHandlingCost(
  { description: 'Pipe', category: 'PIPE' },
  {
    tenantId: 'test',
    category: 'PIPE',
    quantity: 100,
    unitPrice: 500,
    weight: 1800,
    totalItems: 10
  }
);
const expectedHandling1 = (1800 * 0.12) + (150 / 10) + (100 / 10); // weight + port + customs
assertApprox(handlingTest1, expectedHandling1, 1, 'Weight-based handling with distributed charges');

console.log('\n4. LOCAL CHARGES ESTIMATION');
console.log('-'.repeat(70));

// Test 6: Local charges
const localTest1 = logisticsCostService.estimateLocalCharges(
  { description: 'Pipe', category: 'PIPE' },
  {
    tenantId: 'test',
    category: 'PIPE',
    quantity: 100,
    unitPrice: 500,
    totalItems: 10
  }
);
const expectedLocal1 = 25 + (75 / 10) + (50 / 10) + (50000 * 0.01); // flat + doc + bank + misc
assertApprox(localTest1, expectedLocal1, 1, 'Local charges with distributed fees');

console.log('\n5. COMPLETE ITEM CALCULATION');
console.log('-'.repeat(70));

// Test 7: Complete calculation
const completeTest1 = logisticsCostService.calculateItemLogisticsCosts(
  { description: 'Pipe 4" SCH 40', category: 'PIPE', size: '4' },
  {
    tenantId: 'test',
    originCountry: 'CN',
    category: 'PIPE',
    quantity: 100,
    unitPrice: 500,
    weight: 1800,
    totalItems: 10
  }
);

assert(completeTest1.freight_cost > 0, 'Complete calc: Freight cost calculated');
assert(completeTest1.insurance_cost > 0, 'Complete calc: Insurance cost calculated');
assert(completeTest1.handling_cost > 0, 'Complete calc: Handling cost calculated');
assert(completeTest1.local_charges > 0, 'Complete calc: Local charges calculated');

const sumComponents = completeTest1.freight_cost + completeTest1.insurance_cost + 
                      completeTest1.handling_cost + completeTest1.local_charges;
assertApprox(completeTest1.total_logistics_cost, sumComponents, 0.01, 
             'Complete calc: Total equals sum of components');

console.log('\n6. AGGREGATION');
console.log('-'.repeat(70));

// Test 8: Aggregation
const items = [
  { freight_cost: 100, insurance_cost: 50, handling_cost: 30, local_charges: 20 },
  { freight_cost: 200, insurance_cost: 75, handling_cost: 40, local_charges: 25 },
  { freight_cost: 150, insurance_cost: 60, handling_cost: 35, local_charges: 22 }
];

const aggregates = logisticsCostService.aggregateLogisticsCosts(items);

assertApprox(aggregates.total_freight_cost, 450, 0.01, 'Aggregation: Total freight');
assertApprox(aggregates.total_insurance_cost, 185, 0.01, 'Aggregation: Total insurance');
assertApprox(aggregates.total_handling_cost, 105, 0.01, 'Aggregation: Total handling');
assertApprox(aggregates.total_local_charges, 67, 0.01, 'Aggregation: Total local charges');
assertApprox(aggregates.total_logistics_cost, 807, 0.01, 'Aggregation: Total logistics');

console.log('\n7. WEIGHT ESTIMATION');
console.log('-'.repeat(70));

// Test 9: Weight estimation for pipes
const weight1 = logisticsCostService.estimateWeight(
  { size: '4', category: 'PIPE' },
  'PIPE',
  10,
  defaultLogisticsConfig
);
const expected1 = 18 * 10; // 18 kg/m for 4" pipe, qty 10
assertApprox(weight1, expected1, 1, 'Weight estimation: Pipe 4" (size-specific)');

// Test 10: Weight estimation with default
const weight2 = logisticsCostService.estimateWeight(
  { category: 'FITTING' },
  'FITTING',
  20,
  defaultLogisticsConfig
);
const expected2 = 5 * 20; // 5 kg per fitting, qty 20
assertApprox(weight2, expected2, 1, 'Weight estimation: Fitting (category default)');

// Test 11: Weight estimation fallback
const weight3 = logisticsCostService.estimateWeight(
  { category: 'UNKNOWN' },
  'UNKNOWN',
  10,
  defaultLogisticsConfig
);
assert(weight3 > 0, 'Weight estimation: Fallback to global default');

console.log('\n8. EDGE CASES');
console.log('-'.repeat(70));

// Test 12: Zero quantity
try {
  const zeroQty = logisticsCostService.calculateItemLogisticsCosts(
    { description: 'Test' },
    { tenantId: 'test', originCountry: 'CN', category: 'PIPE', quantity: 0, unitPrice: 100, totalItems: 1 }
  );
  assert(zeroQty.total_logistics_cost >= 0, 'Edge case: Zero quantity handled');
} catch (e) {
  assert(false, `Edge case: Zero quantity threw error: ${e.message}`);
}

// Test 13: Missing origin
const missingOrigin = logisticsCostService.calculateItemLogisticsCosts(
  { description: 'Test' },
  { tenantId: 'test', category: 'PIPE', quantity: 10, unitPrice: 100, totalItems: 1 }
);
assert(missingOrigin.freight_cost > 0, 'Edge case: Missing origin uses DEFAULT');

// Test 14: Missing category
const missingCategory = logisticsCostService.calculateItemLogisticsCosts(
  { description: 'Test' },
  { tenantId: 'test', originCountry: 'CN', quantity: 10, unitPrice: 100, totalItems: 1 }
);
assert(missingCategory.freight_cost > 0, 'Edge case: Missing category uses DEFAULT');

console.log('\n' + '='.repeat(70));
console.log('TEST RESULTS');
console.log('='.repeat(70));
console.log(`Total Tests:  ${totalTests}`);
console.log(`Passed:       ${passedTests} ✓`);
console.log(`Failed:       ${failedTests} ✗`);
console.log(`Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);

if (failedTests === 0) {
  console.log('\n🎉 ALL TESTS PASSED! Phase 9 is ready for production! ✅');
  console.log('\nNext steps:');
  console.log('1. Run migration 045: npm run migrate');
  console.log('2. Set ENABLE_LANDED_COST_V2=true in .env');
  console.log('3. Restart backend server');
  console.log('4. Create a pricing run to see logistics costs in action');
  process.exit(0);
} else {
  console.log('\n⚠️  Some tests failed. Please review the failures above.');
  process.exit(1);
}

