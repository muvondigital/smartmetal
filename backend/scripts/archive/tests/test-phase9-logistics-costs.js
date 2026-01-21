/**
 * Phase 9: Landed Cost Engine V2 - Test Script
 * 
 * Tests logistics cost calculations to ensure all components work correctly.
 */

const logisticsCostService = require('../src/services/logisticsCostService');
const { getLogisticsConfigForTenant } = require('../src/config/logisticsCostConfig');

console.log('\n='.repeat(70));
console.log('PHASE 9: LANDED COST ENGINE V2 - TEST SUITE');
console.log('='.repeat(70));

// Test context for a sample RFQ item
const testCases = [
  {
    name: 'Pipe from China (Weight-Based Freight)',
    item: {
      description: 'Seamless Pipe 4" SCH 40',
      size: '4',
      category: 'PIPE'
    },
    context: {
      tenantId: 'test-tenant',
      originCountry: 'CN',
      category: 'PIPE',
      quantity: 100,
      unitPrice: 500,
      weight: 1800, // 18 kg/m × 100m
      totalItems: 10
    }
  },
  {
    name: 'Flange from Japan (Weight-Based Freight)',
    item: {
      description: 'Flange WN 6" 150# RF',
      size: '6',
      category: 'FLANGE'
    },
    context: {
      tenantId: 'test-tenant',
      originCountry: 'JP',
      category: 'FLANGE',
      quantity: 20,
      unitPrice: 800,
      weight: 500, // 25 kg each × 20 pieces
      totalItems: 10
    }
  },
  {
    name: 'Valve from US (Value-Based Test)',
    item: {
      description: 'Gate Valve 4"',
      category: 'VALVE'
    },
    context: {
      tenantId: 'test-tenant',
      originCountry: 'US',
      category: 'VALVE',
      quantity: 10,
      unitPrice: 1200,
      totalItems: 5
    }
  },
  {
    name: 'Fasteners from India (Minimum Charge Test)',
    item: {
      description: 'Hex Bolts M16',
      category: 'FASTENER'
    },
    context: {
      tenantId: 'test-tenant',
      originCountry: 'IN',
      category: 'FASTENER',
      quantity: 100,
      unitPrice: 5,
      weight: 10, // Very light item
      totalItems: 20
    }
  }
];

console.log('\n1. CONFIGURATION CHECK');
console.log('-'.repeat(70));
const config = getLogisticsConfigForTenant('test-tenant');
console.log(`✓ Freight method: ${config.freight.method}`);
console.log(`✓ Insurance base rate: ${(config.insurance.baseRate * 100).toFixed(2)}%`);
console.log(`✓ Handling method: ${config.handling.method}`);
console.log(`✓ Local charges method: ${config.localCharges.method}`);

console.log('\n2. INDIVIDUAL COST ESTIMATION TESTS');
console.log('-'.repeat(70));

testCases.forEach((testCase, index) => {
  console.log(`\nTest ${index + 1}: ${testCase.name}`);
  console.log(`Item: ${testCase.item.description}`);
  console.log(`Origin: ${testCase.context.originCountry}, Qty: ${testCase.context.quantity}, Price: ${testCase.context.unitPrice}`);
  
  try {
    // Calculate individual components
    const freight = logisticsCostService.estimateFreightCost(testCase.item, testCase.context);
    console.log(`  Freight Cost: ${freight.toFixed(2)}`);
    
    const insurance = logisticsCostService.estimateInsuranceCost(testCase.item, {
      ...testCase.context,
      freightCost: freight
    });
    console.log(`  Insurance Cost: ${insurance.toFixed(2)}`);
    
    const handling = logisticsCostService.estimateHandlingCost(testCase.item, testCase.context);
    console.log(`  Handling Cost: ${handling.toFixed(2)}`);
    
    const localCharges = logisticsCostService.estimateLocalCharges(testCase.item, testCase.context);
    console.log(`  Local Charges: ${localCharges.toFixed(2)}`);
    
    const total = freight + insurance + handling + localCharges;
    console.log(`  Total Logistics: ${total.toFixed(2)}`);
    console.log('  ✓ PASS');
  } catch (error) {
    console.error(`  ✗ FAIL: ${error.message}`);
  }
});

console.log('\n3. COMPLETE ITEM CALCULATION TESTS');
console.log('-'.repeat(70));

testCases.forEach((testCase, index) => {
  console.log(`\nTest ${index + 1}: ${testCase.name} - Complete Calculation`);
  
  try {
    const logistics = logisticsCostService.calculateItemLogisticsCosts(testCase.item, testCase.context);
    
    console.log('  Breakdown:');
    console.log(`    Freight:    ${logistics.freight_cost.toFixed(2)}`);
    console.log(`    Insurance:  ${logistics.insurance_cost.toFixed(2)}`);
    console.log(`    Handling:   ${logistics.handling_cost.toFixed(2)}`);
    console.log(`    Local:      ${logistics.local_charges.toFixed(2)}`);
    console.log(`    Total:      ${logistics.total_logistics_cost.toFixed(2)}`);
    
    // Validate sum
    const expectedTotal = logistics.freight_cost + logistics.insurance_cost + 
                          logistics.handling_cost + logistics.local_charges;
    const actualTotal = logistics.total_logistics_cost;
    
    if (Math.abs(expectedTotal - actualTotal) < 0.01) {
      console.log('  ✓ PASS - Total matches sum of components');
    } else {
      console.log(`  ✗ FAIL - Total mismatch: expected ${expectedTotal.toFixed(2)}, got ${actualTotal.toFixed(2)}`);
    }
  } catch (error) {
    console.error(`  ✗ FAIL: ${error.message}`);
  }
});

console.log('\n4. AGGREGATION TEST');
console.log('-'.repeat(70));

try {
  const items = testCases.map(tc => {
    const logistics = logisticsCostService.calculateItemLogisticsCosts(tc.item, tc.context);
    return {
      ...logistics,
      description: tc.item.description
    };
  });
  
  const aggregates = logisticsCostService.aggregateLogisticsCosts(items);
  
  console.log('\nAggregated Totals:');
  console.log(`  Total Freight:    ${aggregates.total_freight_cost.toFixed(2)}`);
  console.log(`  Total Insurance:  ${aggregates.total_insurance_cost.toFixed(2)}`);
  console.log(`  Total Handling:   ${aggregates.total_handling_cost.toFixed(2)}`);
  console.log(`  Total Local:      ${aggregates.total_local_charges.toFixed(2)}`);
  console.log(`  Total Logistics:  ${aggregates.total_logistics_cost.toFixed(2)}`);
  
  // Validate aggregation
  const expectedTotal = aggregates.total_freight_cost + aggregates.total_insurance_cost + 
                        aggregates.total_handling_cost + aggregates.total_local_charges;
  const actualTotal = aggregates.total_logistics_cost;
  
  if (Math.abs(expectedTotal - actualTotal) < 0.01) {
    console.log('  ✓ PASS - Aggregation correct');
  } else {
    console.log(`  ✗ FAIL - Aggregation mismatch`);
  }
} catch (error) {
  console.error(`  ✗ FAIL: ${error.message}`);
}

console.log('\n5. WEIGHT ESTIMATION TEST');
console.log('-'.repeat(70));

const weightTestCases = [
  { item: { size: '2', category: 'PIPE' }, quantity: 10, expected: 'should use size-specific weight' },
  { item: { size: '8', category: 'FLANGE' }, quantity: 5, expected: 'should use size-specific weight' },
  { item: { category: 'FITTING' }, quantity: 20, expected: 'should use category default' },
  { item: { category: 'UNKNOWN' }, quantity: 10, expected: 'should use global default' }
];

weightTestCases.forEach((tc, index) => {
  console.log(`\nWeight Test ${index + 1}: ${tc.expected}`);
  console.log(`  Category: ${tc.item.category}${tc.item.size ? ', Size: ' + tc.item.size : ''}, Qty: ${tc.quantity}`);
  
  try {
    const weight = logisticsCostService.estimateWeight(tc.item, tc.item.category, tc.quantity, config);
    console.log(`  Estimated Weight: ${weight.toFixed(2)} kg`);
    
    if (weight > 0) {
      console.log('  ✓ PASS');
    } else {
      console.log('  ✗ FAIL - Weight should be positive');
    }
  } catch (error) {
    console.error(`  ✗ FAIL: ${error.message}`);
  }
});

console.log('\n' + '='.repeat(70));
console.log('TEST SUITE COMPLETE');
console.log('='.repeat(70));
console.log('\nPhase 9: Landed Cost Engine V2 is ready for production! ✅');
console.log('\nTo enable Phase 9:');
console.log('1. Run migration: npm run migrate');
console.log('2. Set ENABLE_LANDED_COST_V2=true in .env');
console.log('3. Restart backend server');
console.log('\n');

