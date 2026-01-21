/**
 * Pricing V2 engine unit tests
 * Covers pricingEngineV2 priceItemWithAgreementsV2 + findApplicableConditions.
 */
console.log('Pricing V2 test suite loaded: unit tests for pricingEngineV2 + integration tests for pricingService.');

const { connectDb, closePool } = require('../../db/supabaseClient');
const { priceItemWithAgreementsV2, findApplicableConditions } = require('../pricingEngineV2');

// Helpers for deterministic seeds
const DEFAULT_VALID_FROM = '2025-01-01';
const DEFAULT_VALID_TO = '2025-12-31';

async function resetTables(db) {
  // Order matters because of FKs; CASCADE for safety
  await db.query(`
    TRUNCATE agreement_scales,
             agreement_conditions,
             agreement_headers,
             pricing_run_items,
             pricing_runs,
             rfq_items,
             rfqs,
             projects,
             clients,
             tenants
    RESTART IDENTITY CASCADE;
  `);
  await db.query(`TRUNCATE materials RESTART IDENTITY CASCADE;`);
}

async function insertTenant(db, code = 'TST') {
  const res = await db.query(
    `INSERT INTO tenants (name, code, is_active) VALUES ($1, $2, true) RETURNING id`,
    [`Tenant ${code}`, code]
  );
  return res.rows[0].id;
}

async function insertClient(db, tenantId, name = 'Client A') {
  const res = await db.query(
    `INSERT INTO clients (tenant_id, name) VALUES ($1, $2) RETURNING id`,
    [tenantId, name]
  );
  return res.rows[0].id;
}

async function insertMaterial(db, materialCode, category = 'PIPE', baseCost = 1000, originType = 'NON_CHINA') {
  const res = await db.query(
    `INSERT INTO materials (material_code, category, origin_type, base_cost, currency)
     VALUES ($1, $2, $3, $4, 'USD')
     RETURNING id`,
    [materialCode, category, originType, baseCost]
  );
  return res.rows[0].id;
}

async function insertAgreementHeader(db, {
  tenantId,
  customerId = null,
  code = 'AG-1',
  status = 'released',
  validFrom = DEFAULT_VALID_FROM,
  validTo = DEFAULT_VALID_TO,
} = {}) {
  const res = await db.query(
    `INSERT INTO agreement_headers (
        tenant_id, customer_id, agreement_code,
        agreement_type, currency, valid_from, valid_to, status
     )
     VALUES ($1, $2, $3, 'STANDARD', 'USD', $4, $5, $6)
     RETURNING id`,
    [tenantId, customerId, code, validFrom, validTo, status]
  );
  return res.rows[0].id;
}

async function insertCondition(db, {
  tenantId,
  agreementId,
  conditionType = 'BASE_PRICE',
  rateType = 'AMOUNT',
  rateValue = 0,
  hasScale = false,
  conditionPriority = 100,
  keyCustomerId = null,
  keyMaterialId = null,
  keyMaterialGroup = null,
  keyRegion = null,
  keyIncoterm = null,
  status = 'active',
  validFrom = DEFAULT_VALID_FROM,
  validTo = DEFAULT_VALID_TO,
} = {}) {
  const res = await db.query(
    `INSERT INTO agreement_conditions (
        tenant_id, agreement_id, condition_type, rate_type, rate_value,
        has_scale, condition_priority, key_customer_id, key_material_id,
        key_material_group, key_region, key_incoterm, status, valid_from, valid_to
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
     RETURNING id`,
    [
      tenantId, agreementId, conditionType, rateType, rateValue,
      hasScale, conditionPriority, keyCustomerId, keyMaterialId,
      keyMaterialGroup, keyRegion, keyIncoterm, status, validFrom, validTo,
    ]
  );
  return res.rows[0].id;
}

async function insertScale(db, {
  tenantId,
  conditionId,
  scaleFrom,
  scaleTo = null,
  rateType = 'AMOUNT',
  rateValue,
}) {
  await db.query(
    `INSERT INTO agreement_scales (
        tenant_id, condition_id, scale_from, scale_to, scale_rate_type, scale_rate_value
     )
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [tenantId, conditionId, scaleFrom, scaleTo, rateType, rateValue]
  );
}

describe('pricingEngineV2', () => {
  let db;

  beforeAll(async () => {
    db = await connectDb();
  });

  beforeEach(async () => {
    await resetTables(db);
  });

  afterAll(async () => {
    await closePool();
  });

  test('Case 1: simple base price only', async () => {
    const tenantId = await insertTenant(db, 'C1');
    const customerId = await insertClient(db, tenantId, 'Client One');
    const materialId = await insertMaterial(db, 'MAT-BASE');

    const headerId = await insertAgreementHeader(db, { tenantId, customerId, code: 'AG-C1' });
    const conditionId = await insertCondition(db, {
      tenantId,
      agreementId: headerId,
      conditionType: 'BASE_PRICE',
      rateType: 'AMOUNT',
      rateValue: 1000,
      keyCustomerId: customerId,
      keyMaterialId: materialId,
      conditionPriority: 1,
    });

    const result = await priceItemWithAgreementsV2({
      tenantId,
      customerId,
      materialId,
      materialGroup: null,
      quantity: 5,
      date: '2025-06-15',
    });

    expect(result).not.toBeNull();
    expect(result.base_price).toBe(1000);
    expect(result.net_price).toBe(1000);
    expect(result.applied_conditions).toEqual([conditionId]);
  });

  test('Case 2: base price with percentage discount and amount surcharge', async () => {
    const tenantId = await insertTenant(db, 'C2');
    const customerId = await insertClient(db, tenantId, 'Client Two');
    const materialId = await insertMaterial(db, 'MAT-DISC');

    const headerId = await insertAgreementHeader(db, { tenantId, customerId, code: 'AG-C2' });
    const baseId = await insertCondition(db, {
      tenantId,
      agreementId: headerId,
      conditionType: 'BASE_PRICE',
      rateType: 'AMOUNT',
      rateValue: 1000,
      keyCustomerId: customerId,
      keyMaterialId: materialId,
      conditionPriority: 1,
    });
    const discountId = await insertCondition(db, {
      tenantId,
      agreementId: headerId,
      conditionType: 'DISCOUNT',
      rateType: 'PERCENTAGE',
      rateValue: 10,
      keyCustomerId: customerId,
      keyMaterialId: materialId,
      conditionPriority: 2,
    });
    const surchargeId = await insertCondition(db, {
      tenantId,
      agreementId: headerId,
      conditionType: 'SURCHARGE',
      rateType: 'AMOUNT',
      rateValue: 50,
      keyCustomerId: customerId,
      keyMaterialId: materialId,
      conditionPriority: 3,
    });

    const result = await priceItemWithAgreementsV2({
      tenantId,
      customerId,
      materialId,
      materialGroup: null,
      quantity: 20,
      date: '2025-06-15',
    });

    expect(result.base_price).toBe(1000);
    expect(result.discounts).toBe(100); // 10% of base
    expect(result.surcharges).toBe(50);
    expect(result.net_price).toBe(950);
    expect(result.applied_conditions).toEqual([baseId, discountId, surchargeId]);
  });

  test('Case 3: scaled base price with three tiers', async () => {
    const tenantId = await insertTenant(db, 'C3');
    const customerId = await insertClient(db, tenantId, 'Client Three');
    const materialId = await insertMaterial(db, 'MAT-SCALE');

    const headerId = await insertAgreementHeader(db, { tenantId, customerId, code: 'AG-C3' });
    const conditionId = await insertCondition(db, {
      tenantId,
      agreementId: headerId,
      conditionType: 'BASE_PRICE',
      rateType: 'AMOUNT',
      rateValue: 1000,
      hasScale: true,
      keyCustomerId: customerId,
      keyMaterialId: materialId,
      conditionPriority: 1,
    });

    await insertScale(db, { tenantId, conditionId, scaleFrom: 0, scaleTo: 10, rateValue: 1000 });
    await insertScale(db, { tenantId, conditionId, scaleFrom: 10, scaleTo: 50, rateValue: 900 });
    await insertScale(db, { tenantId, conditionId, scaleFrom: 50, scaleTo: null, rateValue: 800 });

    const qty5 = await priceItemWithAgreementsV2({
      tenantId, customerId, materialId, materialGroup: null, quantity: 5, date: '2025-06-15',
    });
    const qty20 = await priceItemWithAgreementsV2({
      tenantId, customerId, materialId, materialGroup: null, quantity: 20, date: '2025-06-15',
    });
    const qty80 = await priceItemWithAgreementsV2({
      tenantId, customerId, materialId, materialGroup: null, quantity: 80, date: '2025-06-15',
    });

    expect(qty5.base_price).toBe(1000);
    expect(qty20.base_price).toBe(900);
    expect(qty80.base_price).toBe(800);
    expect(qty80.applied_conditions).toEqual([conditionId]);
  });

  test('Case 4: access sequence priority across customer/material combinations', async () => {
    const tenantId = await insertTenant(db, 'C4');
    const customerA = await insertClient(db, tenantId, 'Customer A');
    const customerB = await insertClient(db, tenantId, 'Customer B');
    const materialX = await insertMaterial(db, 'MAT-X', 'GROUP_G');
    const materialY = await insertMaterial(db, 'MAT-Y', 'GROUP_G');
    const materialZ = await insertMaterial(db, 'MAT-Z', 'OTHER');

    const headerCustomer = await insertAgreementHeader(db, { tenantId, customerId: customerA, code: 'AG-C4A' });
    const headerGeneric = await insertAgreementHeader(db, { tenantId, customerId: null, code: 'AG-C4G' });

    const conditionA = await insertCondition(db, {
      tenantId, agreementId: headerCustomer, conditionType: 'BASE_PRICE',
      rateType: 'AMOUNT', rateValue: 1000, keyCustomerId: customerA, keyMaterialId: materialX, conditionPriority: 1,
    });
    const conditionB = await insertCondition(db, {
      tenantId, agreementId: headerCustomer, conditionType: 'BASE_PRICE',
      rateType: 'AMOUNT', rateValue: 1100, keyCustomerId: customerA, keyMaterialGroup: 'GROUP_G', conditionPriority: 2,
    });
    const conditionC = await insertCondition(db, {
      tenantId, agreementId: headerGeneric, conditionType: 'BASE_PRICE',
      rateType: 'AMOUNT', rateValue: 1200, keyMaterialGroup: 'GROUP_G', conditionPriority: 3,
    });
    const conditionD = await insertCondition(db, {
      tenantId, agreementId: headerGeneric, conditionType: 'BASE_PRICE',
      rateType: 'AMOUNT', rateValue: 1300, keyMaterialId: materialZ, conditionPriority: 4,
    });

    const scenario1 = await priceItemWithAgreementsV2({
      tenantId, customerId: customerA, materialId: materialX, materialGroup: 'GROUP_G', quantity: 1, date: '2025-06-15',
    });
    expect(scenario1.base_price).toBe(1000);
    expect(scenario1.applied_conditions).toEqual([conditionA]);

    const scenario2 = await priceItemWithAgreementsV2({
      tenantId, customerId: customerA, materialId: materialY, materialGroup: 'GROUP_G', quantity: 1, date: '2025-06-15',
    });
    expect(scenario2.base_price).toBe(1100);
    expect(scenario2.applied_conditions).toEqual([conditionB]);
    const conditionsFromFinder = await findApplicableConditions({
      tenantId,
      customerId: customerA,
      materialId: materialY,
      materialGroup: 'GROUP_G',
      date: '2025-06-15',
      db,
    });
    expect(conditionsFromFinder[0].id).toBe(conditionB);

    const scenario3 = await priceItemWithAgreementsV2({
      tenantId, customerId: customerB, materialId: materialY, materialGroup: 'GROUP_G', quantity: 1, date: '2025-06-15',
    });
    expect(scenario3.base_price).toBe(1200);
    expect(scenario3.applied_conditions).toEqual([conditionC]);

    const scenario4 = await priceItemWithAgreementsV2({
      tenantId, customerId: customerB, materialId: materialZ, materialGroup: 'OTHER', quantity: 1, date: '2025-06-15',
    });
    expect(scenario4.base_price).toBe(1300);
    expect(scenario4.applied_conditions).toEqual([conditionD]);
  });

  test('Case 5: validity and status filtering skips expired or blocked conditions', async () => {
    const tenantId = await insertTenant(db, 'C5');
    const customerId = await insertClient(db, tenantId, 'Client Five');
    const materialId = await insertMaterial(db, 'MAT-VALID');

    const headerId = await insertAgreementHeader(db, { tenantId, customerId, code: 'AG-C5' });
    await insertCondition(db, {
      tenantId, agreementId: headerId, conditionType: 'BASE_PRICE', rateType: 'AMOUNT',
      rateValue: 500, keyCustomerId: customerId, keyMaterialId: materialId,
      conditionPriority: 1, validFrom: '2024-01-01', validTo: '2024-06-01',
    });
    await insertCondition(db, {
      tenantId, agreementId: headerId, conditionType: 'BASE_PRICE', rateType: 'AMOUNT',
      rateValue: 600, keyCustomerId: customerId, keyMaterialId: materialId,
      conditionPriority: 2, status: 'blocked',
    });
    const validId = await insertCondition(db, {
      tenantId, agreementId: headerId, conditionType: 'BASE_PRICE', rateType: 'AMOUNT',
      rateValue: 700, keyCustomerId: customerId, keyMaterialId: materialId,
      conditionPriority: 3,
    });

    const result = await priceItemWithAgreementsV2({
      tenantId, customerId, materialId, materialGroup: null, quantity: 1, date: '2025-07-01',
    });

    expect(result.base_price).toBe(700);
    expect(result.applied_conditions).toEqual([validId]);

    // No valid conditions should return null
    await resetTables(db);
    const tenantId2 = await insertTenant(db, 'C5B');
    const customerId2 = await insertClient(db, tenantId2, 'Client Five B');
    const materialId2 = await insertMaterial(db, 'MAT-INVALID');
    const headerId2 = await insertAgreementHeader(db, { tenantId: tenantId2, customerId: customerId2, code: 'AG-C5B' });
    await insertCondition(db, {
      tenantId: tenantId2, agreementId: headerId2, conditionType: 'BASE_PRICE', rateType: 'AMOUNT',
      rateValue: 400, keyCustomerId: customerId2, keyMaterialId: materialId2,
      conditionPriority: 1, validFrom: '2023-01-01', validTo: '2023-12-31',
    });

    const noPricing = await priceItemWithAgreementsV2({
      tenantId: tenantId2, customerId: customerId2, materialId: materialId2, materialGroup: null, quantity: 1, date: '2025-06-15',
    });
    expect(noPricing).toBeNull();
  });

  test('Case 6: region and incoterm matching applies freight only when matched', async () => {
    const tenantId = await insertTenant(db, 'C6');
    const customerId = await insertClient(db, tenantId, 'Client Six');
    const materialId = await insertMaterial(db, 'MAT-FREIGHT');

    const headerId = await insertAgreementHeader(db, { tenantId, customerId, code: 'AG-C6' });
    const baseId = await insertCondition(db, {
      tenantId, agreementId: headerId, conditionType: 'BASE_PRICE', rateType: 'AMOUNT',
      rateValue: 1000, keyCustomerId: customerId, keyMaterialId: materialId, conditionPriority: 1,
    });
    const freightId = await insertCondition(db, {
      tenantId, agreementId: headerId, conditionType: 'FREIGHT', rateType: 'AMOUNT',
      rateValue: 75, keyCustomerId: customerId, keyMaterialId: materialId,
      keyRegion: 'SEA', keyIncoterm: 'FOB', conditionPriority: 2,
    });

    const matched = await priceItemWithAgreementsV2({
      tenantId, customerId, materialId, materialGroup: null, quantity: 10, date: '2025-06-15', region: 'SEA', incoterm: 'FOB',
    });
    expect(matched.freight).toBe(75);
    expect(matched.net_price).toBe(1075);
    expect(matched.applied_conditions).toEqual([baseId, freightId]);

    const mismatched = await priceItemWithAgreementsV2({
      tenantId, customerId, materialId, materialGroup: null, quantity: 10, date: '2025-06-15', region: 'LAND', incoterm: 'EXW',
    });
    expect(mismatched.freight).toBe(0);
    expect(mismatched.net_price).toBe(1000);
    expect(mismatched.applied_conditions).toEqual([baseId]);
  });
});
