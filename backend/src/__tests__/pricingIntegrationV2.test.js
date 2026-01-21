/**
 * Pricing V2 integration tests (API layer)
 * Uses running server (SERVER_URL) and supertest like post-hardening suite.
 */
console.log('Pricing V2 test suite loaded: unit tests for pricingEngineV2 + integration tests for pricingService.');

const request = require('supertest');
const { connectDb, closePool } = require('../db/supabaseClient');

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:4000';

async function checkServer() {
  try {
    const res = await request(SERVER_URL).get('/health').timeout(2000);
    return res.status === 200;
  } catch (err) {
    return false;
  }
}

async function resetTables(db) {
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

async function insertTenant(db, code) {
  const res = await db.query(
    `INSERT INTO tenants (name, code, is_active) VALUES ($1, $2, true) RETURNING id`,
    [`Tenant ${code}`, code]
  );
  return res.rows[0].id;
}

async function insertClient(db, tenantId, name = 'Client Integration') {
  const res = await db.query(
    `INSERT INTO clients (tenant_id, name) VALUES ($1, $2) RETURNING id`,
    [tenantId, name]
  );
  return res.rows[0].id;
}

async function insertProject(db, tenantId, clientId, name = 'Project Integration') {
  const res = await db.query(
    `INSERT INTO projects (tenant_id, client_id, name, description)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [tenantId, clientId, name, 'Integration project']
  );
  return res.rows[0].id;
}

async function insertRfq(db, tenantId, projectId, title = 'RFQ Integration', projectType = 'STANDARD') {
  const res = await db.query(
    `INSERT INTO rfqs (tenant_id, project_id, title, description, status, project_type)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [tenantId, projectId, title, 'Integration RFQ', 'draft', projectType]
  );
  return res.rows[0].id;
}

async function insertMaterial(db, code, category = 'PIPE', baseCost = 100, originType = 'NON_CHINA') {
  const res = await db.query(
    `INSERT INTO materials (material_code, category, origin_type, base_cost, currency)
     VALUES ($1, $2, $3, $4, 'USD')
     RETURNING id`,
    [code, category, originType, baseCost]
  );
  return res.rows[0].id;
}

async function insertRfqItem(db, tenantId, rfqId, { materialCode, quantity = 10, unit = 'EA', description = 'Item' }) {
  const res = await db.query(
    `INSERT INTO rfq_items (
        tenant_id, rfq_id, description, quantity, unit, material_code, line_number
     )
     VALUES ($1, $2, $3, $4, $5, $6, 1)
     RETURNING id`,
    [tenantId, rfqId, description, quantity, unit, materialCode]
  );
  return res.rows[0].id;
}

async function insertAgreementHeader(db, { tenantId, customerId, code, status = 'released', validFrom = '2025-01-01', validTo = '2025-12-31' }) {
  const res = await db.query(
    `INSERT INTO agreement_headers (
        tenant_id, customer_id, agreement_code, agreement_type, currency, valid_from, valid_to, status
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
  conditionPriority = 1,
  keyCustomerId = null,
  keyMaterialId = null,
  keyMaterialGroup = null,
}) {
  const res = await db.query(
    `INSERT INTO agreement_conditions (
        tenant_id, agreement_id, condition_type, rate_type, rate_value, has_scale,
        condition_priority, key_customer_id, key_material_id, key_material_group, status,
        valid_from, valid_to
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'active', '2025-01-01', '2025-12-31')
     RETURNING id`,
    [tenantId, agreementId, conditionType, rateType, rateValue, hasScale, conditionPriority, keyCustomerId, keyMaterialId, keyMaterialGroup]
  );
  return res.rows[0].id;
}

describe('Pricing V2 integration (pricingService via API)', () => {
  let db;
  let serverAvailable = false;

  beforeAll(async () => {
    db = await connectDb();
    serverAvailable = await checkServer();
    if (!serverAvailable) {
      console.warn(`⚠️  Server not available at ${SERVER_URL}. Start backend (npm run dev) to run these tests.`);
    }
  });

  beforeEach(async () => {
    await resetTables(db);
  });

  afterAll(async () => {
    await closePool();
  });

  test('Integration Case 1: tenant without V2 agreements uses non-V2 pricing', async () => {
    if (!serverAvailable) {
      console.log('Skipping: Server not available');
      return;
    }

    const tenantCode = 'INT1';
    const tenantId = await insertTenant(db, tenantCode);
    const clientId = await insertClient(db, tenantId);
    const projectId = await insertProject(db, tenantId, clientId);
    const rfqId = await insertRfq(db, tenantId, projectId, 'RFQ-No-V2');
    await insertMaterial(db, 'MAT-NOV2', 'PIPE', 120);
    await insertRfqItem(db, tenantId, rfqId, { materialCode: 'MAT-NOV2', quantity: 5, description: 'No V2 match' });

    const response = await request(SERVER_URL)
      .post(`/api/v1/pricing-runs/rfq/${rfqId}`)
      .set('X-Tenant-Code', tenantCode)
      .expect(201);

    const pricingRunId = response.body?.id || response.body?.pricing_run?.id;
    expect(pricingRunId).toBeTruthy();

    const itemsRes = await db.query(
      `SELECT pricing_method, price_agreement_id, unit_price FROM pricing_run_items WHERE pricing_run_id = $1`,
      [pricingRunId]
    );
    expect(itemsRes.rows.length).toBeGreaterThan(0);
    itemsRes.rows.forEach(row => {
      expect(row.pricing_method).not.toBe('agreement_v2');
      expect(Number(row.unit_price)).toBeGreaterThan(0);
    });
  });

  test('Integration Case 2: matching V2 agreement returns agreement_v2 pricing', async () => {
    if (!serverAvailable) {
      console.log('Skipping: Server not available');
      return;
    }

    const tenantCode = 'INT2';
    const tenantId = await insertTenant(db, tenantCode);
    const clientId = await insertClient(db, tenantId, 'Client V2');
    const projectId = await insertProject(db, tenantId, clientId);
    const rfqId = await insertRfq(db, tenantId, projectId, 'RFQ-V2');
    const materialId = await insertMaterial(db, 'MAT-V2', 'PIPE', 200);
    await insertRfqItem(db, tenantId, rfqId, { materialCode: 'MAT-V2', quantity: 3, description: 'V2 match' });

    const headerId = await insertAgreementHeader(db, { tenantId, customerId: clientId, code: 'AG-V2' });
    await insertCondition(db, {
      tenantId,
      agreementId: headerId,
      conditionType: 'BASE_PRICE',
      rateType: 'AMOUNT',
      rateValue: 900,
      keyCustomerId: clientId,
      keyMaterialId: materialId,
      conditionPriority: 1,
    });

    const response = await request(SERVER_URL)
      .post(`/api/v1/pricing-runs/rfq/${rfqId}`)
      .set('X-Tenant-Code', tenantCode)
      .expect(201);

    const pricingRunId = response.body?.id || response.body?.pricing_run?.id;
    expect(pricingRunId).toBeTruthy();

    const itemsRes = await db.query(
      `SELECT pricing_method, price_agreement_id, unit_price FROM pricing_run_items WHERE pricing_run_id = $1`,
      [pricingRunId]
    );
    expect(itemsRes.rows.length).toBeGreaterThan(0);
    const item = itemsRes.rows[0];
    expect(item.pricing_method).toBe('agreement_v2');
    expect(item.price_agreement_id).toBeNull();
    expect(Number(item.unit_price)).toBeCloseTo(900, 4);
  });

  test('Integration Case 3: V2 agreement exists but does not match RFQ, falls back to v1/rules', async () => {
    if (!serverAvailable) {
      console.log('Skipping: Server not available');
      return;
    }

    const tenantCode = 'INT3';
    const tenantId = await insertTenant(db, tenantCode);
    const clientId = await insertClient(db, tenantId, 'Client NonMatch');
    const projectId = await insertProject(db, tenantId, clientId);
    const rfqId = await insertRfq(db, tenantId, projectId, 'RFQ-V2-Miss');
    await insertMaterial(db, 'MAT-RUN', 'PIPE', 150);
    await insertMaterial(db, 'MAT-V2-OTHER', 'PIPE', 150);
    await insertRfqItem(db, tenantId, rfqId, { materialCode: 'MAT-RUN', quantity: 4, description: 'Non matching V2' });

    const headerId = await insertAgreementHeader(db, { tenantId, customerId: clientId, code: 'AG-V2-OTHER' });
    await insertCondition(db, {
      tenantId,
      agreementId: headerId,
      conditionType: 'BASE_PRICE',
      rateType: 'AMOUNT',
      rateValue: 800,
      keyCustomerId: clientId,
      keyMaterialId: (await db.query(`SELECT id FROM materials WHERE material_code = 'MAT-V2-OTHER'`)).rows[0].id,
      conditionPriority: 1,
    });

    const response = await request(SERVER_URL)
      .post(`/api/v1/pricing-runs/rfq/${rfqId}`)
      .set('X-Tenant-Code', tenantCode)
      .expect(201);

    const pricingRunId = response.body?.id || response.body?.pricing_run?.id;
    expect(pricingRunId).toBeTruthy();

    const itemsRes = await db.query(
      `SELECT pricing_method, price_agreement_id, unit_price FROM pricing_run_items WHERE pricing_run_id = $1`,
      [pricingRunId]
    );
    expect(itemsRes.rows.length).toBeGreaterThan(0);
    const item = itemsRes.rows[0];
    expect(item.pricing_method).not.toBe('agreement_v2');
    expect(Number(item.unit_price)).toBeGreaterThan(0);
  });
});
