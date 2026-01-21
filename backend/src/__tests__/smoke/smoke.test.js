/**
 * Smoke tests for critical endpoints (Phase 0)
 * - Minimal expectations: status codes + basic shape
 * - Uses tenant header; optional auth token if provided
 * - Skips gracefully if server is not reachable
 */

const request = require('supertest');

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:4000';
const TENANT_CODE = process.env.SMOKE_TENANT_CODE || 'NSC';
const AUTH_TOKEN = process.env.SMOKE_AUTH_TOKEN;

async function isServerAvailable() {
  try {
    const res = await request(SERVER_URL).get('/health').timeout(2000);
    return res.status === 200;
  } catch {
    return false;
  }
}

function withTenant(req) {
  const headers = { 'X-Tenant-Code': TENANT_CODE };
  if (AUTH_TOKEN) {
    headers.Authorization = `Bearer ${AUTH_TOKEN}`;
  }
  return req.set(headers);
}

describe('Smoke: core API endpoints', () => {
  let serverAvailable = false;

  beforeAll(async () => {
    serverAvailable = await isServerAvailable();
    if (!serverAvailable) {
      console.warn(`⚠️  Skipping smoke tests: server not reachable at ${SERVER_URL}`);
    }
  });

  test('health endpoint returns ok', async () => {
    if (!serverAvailable) {
      console.warn('Skipping health smoke - server unavailable');
      return;
    }

    const res = await request(SERVER_URL).get('/health').expect(200);
    expect(res.body).toHaveProperty('status', 'ok');
  });

  test('rfq list responds with array', async () => {
    if (!serverAvailable) {
      console.warn('Skipping RFQ smoke - server unavailable');
      return;
    }

    const res = await withTenant(request(SERVER_URL).get('/api/rfqs')).expect(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('analytics dashboard responds with success payload', async () => {
    if (!serverAvailable) {
      console.warn('Skipping analytics smoke - server unavailable');
      return;
    }

    const res = await withTenant(request(SERVER_URL).get('/api/analytics/dashboard')).expect(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('data');
  });

  test('price agreements list responds or reports auth requirement', async () => {
    if (!serverAvailable) {
      console.warn('Skipping price agreements smoke - server unavailable');
      return;
    }

    const res = await withTenant(request(SERVER_URL).get('/api/price-agreements'));

    if (res.status === 401) {
      console.warn('Price agreements smoke: auth required (provide SMOKE_AUTH_TOKEN to exercise endpoint)');
      return;
    }

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('agreements');
  });
});

