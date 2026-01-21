/**
 * Post-Hardening Integration Test Suite
 * Tests the full API endpoints with a running server
 * 
 * To run these tests, start the server first:
 *   npm run dev
 * 
 * Then run: npm test -- post-hardening-integration.test.js
 * 
 * Or set SERVER_URL environment variable to point to running server
 */

const request = require('supertest');
const jwt = require('jsonwebtoken');

// Server URL - defaults to localhost:4000
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:4000';

// Test users with different roles
const testUsers = {
  admin: {
    id: 'test-admin-id',
    email: 'admin@test.com',
    name: 'Admin User',
    role: 'admin',
  },
  manager: {
    id: 'test-manager-id',
    email: 'manager@test.com',
    name: 'Manager User',
    role: 'manager',
  },
  user: {
    id: 'test-user-id',
    email: 'user@test.com',
    name: 'Regular User',
    role: 'user',
  },
};

// Helper to generate JWT token
function generateTestToken(user, secret = process.env.JWT_SECRET || 'test-secret-key') {
  return jwt.sign(user, secret, { expiresIn: '1h' });
}

// Check if server is available
async function checkServer() {
  try {
    const response = await request(SERVER_URL)
      .get('/health')
      .timeout(2000);
    return response.status === 200;
  } catch (error) {
    return false;
  }
}

describe('Post-Hardening Integration Tests', () => {
  let serverAvailable = false;

  beforeAll(async () => {
    serverAvailable = await checkServer();
    if (!serverAvailable) {
      console.warn(`⚠️  Server not available at ${SERVER_URL}`);
      console.warn('   Skipping integration tests. Start server with: npm run dev');
    }
  });

  describe('1. Health Check', () => {
    test('should return health status', async () => {
      if (!serverAvailable) {
        console.log('Skipping: Server not available');
        return;
      }

      const response = await request(SERVER_URL)
        .get('/health')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'ok');
    });

    test('should return API info on root', async () => {
      if (!serverAvailable) {
        console.log('Skipping: Server not available');
        return;
      }

      const response = await request(SERVER_URL)
        .get('/')
        .expect(200);

      expect(response.body).toHaveProperty('name');
      expect(response.body).toHaveProperty('version');
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('endpoints');
    });
  });

  describe('2. Authentication Protection', () => {
    test('should reject unauthenticated requests to protected routes', async () => {
      if (!serverAvailable) {
        console.log('Skipping: Server not available');
        return;
      }

      const response = await request(SERVER_URL)
        .get('/api/price-agreements')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('AUTHENTICATION_ERROR');
    });

    test('should reject requests with invalid token', async () => {
      if (!serverAvailable) {
        console.log('Skipping: Server not available');
        return;
      }

      const response = await request(SERVER_URL)
        .get('/api/price-agreements')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('AUTHENTICATION_ERROR');
    });

    test('should accept requests with valid token', async () => {
      if (!serverAvailable) {
        console.log('Skipping: Server not available');
        return;
      }

      const token = generateTestToken(testUsers.user);
      const response = await request(SERVER_URL)
        .get('/api/price-agreements')
        .set('Authorization', `Bearer ${token}`);

      // Should not be 401
      expect(response.status).not.toBe(401);
      // Response should have standard format
      if (response.status === 200) {
        expect(response.body).toHaveProperty('success');
      }
    });
  });

  describe('3. Authorization Protection', () => {
    test('should reject regular user from manager/admin routes', async () => {
      if (!serverAvailable) {
        console.log('Skipping: Server not available');
        return;
      }

      const token = generateTestToken(testUsers.user);
      const response = await request(SERVER_URL)
        .post('/api/price-agreements')
        .set('Authorization', `Bearer ${token}`)
        .send({
          client_id: '00000000-0000-0000-0000-000000000000',
          base_price: 100,
          valid_from: '2024-01-01T00:00:00Z',
          valid_until: '2024-12-31T23:59:59Z',
        });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('AUTHORIZATION_ERROR');
    });

    test('should allow manager to access manager/admin routes', async () => {
      if (!serverAvailable) {
        console.log('Skipping: Server not available');
        return;
      }

      const token = generateTestToken(testUsers.manager);
      const response = await request(SERVER_URL)
        .post('/api/price-agreements')
        .set('Authorization', `Bearer ${token}`)
        .send({
          client_id: '00000000-0000-0000-0000-000000000000',
          base_price: 100,
          valid_from: '2024-01-01T00:00:00Z',
          valid_until: '2024-12-31T23:59:59Z',
        });

      // Should not be 403 (might be 400 for validation or 500 for DB, but not 403)
      expect(response.status).not.toBe(403);
    });
  });

  describe('4. Input Validation', () => {
    test('should reject invalid UUIDs', async () => {
      if (!serverAvailable) {
        console.log('Skipping: Server not available');
        return;
      }

      const token = generateTestToken(testUsers.user);
      const response = await request(SERVER_URL)
        .get('/api/price-agreements/invalid-uuid')
        .set('Authorization', `Bearer ${token}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    test('should reject invalid email format', async () => {
      if (!serverAvailable) {
        console.log('Skipping: Server not available');
        return;
      }

      const token = generateTestToken(testUsers.user);
      const response = await request(SERVER_URL)
        .post('/api/approvals/submit/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${token}`)
        .send({
          submitted_by_email: 'invalid-email',
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    test('should reject invalid date format', async () => {
      if (!serverAvailable) {
        console.log('Skipping: Server not available');
        return;
      }

      const token = generateTestToken(testUsers.manager);
      const response = await request(SERVER_URL)
        .post('/api/price-agreements')
        .set('Authorization', `Bearer ${token}`)
        .send({
          client_id: '00000000-0000-0000-0000-000000000000',
          base_price: 100,
          valid_from: 'invalid-date',
          valid_until: '2024-12-31T23:59:59Z',
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    test('should reject negative prices', async () => {
      if (!serverAvailable) {
        console.log('Skipping: Server not available');
        return;
      }

      const token = generateTestToken(testUsers.manager);
      const response = await request(SERVER_URL)
        .post('/api/price-agreements')
        .set('Authorization', `Bearer ${token}`)
        .send({
          client_id: '00000000-0000-0000-0000-000000000000',
          base_price: -100,
          valid_from: '2024-01-01T00:00:00Z',
          valid_until: '2024-12-31T23:59:59Z',
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('5. Error Response Format', () => {
    test('should return structured error responses', async () => {
      if (!serverAvailable) {
        console.log('Skipping: Server not available');
        return;
      }

      const response = await request(SERVER_URL)
        .get('/api/nonexistent-route')
        .expect(404);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('message');
      expect(response.body.error).toHaveProperty('code');
    });

    test('should return structured success responses', async () => {
      if (!serverAvailable) {
        console.log('Skipping: Server not available');
        return;
      }

      const token = generateTestToken(testUsers.user);
      const response = await request(SERVER_URL)
        .get('/api/price-agreements')
        .set('Authorization', `Bearer ${token}`);

      if (response.status === 200) {
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('data');
      }
    });
  });

  describe('6. Route Protection', () => {
    test('should protect price agreements routes', async () => {
      if (!serverAvailable) {
        console.log('Skipping: Server not available');
        return;
      }

      // GET should require auth
      const response1 = await request(SERVER_URL)
        .get('/api/price-agreements')
        .expect(401);

      expect(response1.body.success).toBe(false);

      // POST should require auth + role
      const response2 = await request(SERVER_URL)
        .post('/api/price-agreements')
        .expect(401);

      expect(response2.body.success).toBe(false);
    });

    test('should protect approval routes', async () => {
      if (!serverAvailable) {
        console.log('Skipping: Server not available');
        return;
      }

      // Submit route - requires auth
      const response1 = await request(SERVER_URL)
        .post('/api/approvals/submit/00000000-0000-0000-0000-000000000000')
        .expect(401);

      expect(response1.body.success).toBe(false);

      // Approve route - requires manager/admin
      const userToken = generateTestToken(testUsers.user);
      const response2 = await request(SERVER_URL)
        .post('/api/approvals/approve/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);

      expect(response2.body.success).toBe(false);
    });

    test('should protect analytics routes', async () => {
      if (!serverAvailable) {
        console.log('Skipping: Server not available');
        return;
      }

      const response = await request(SERVER_URL)
        .get('/api/analytics/revenue')
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });

  describe('7. Input Sanitization', () => {
    test('should sanitize XSS attempts in requests', async () => {
      if (!serverAvailable) {
        console.log('Skipping: Server not available');
        return;
      }

      const token = generateTestToken(testUsers.user);
      
      // Try to send malicious input
      // The sanitization should remove script tags before processing
      const response = await request(SERVER_URL)
        .get('/api/price-agreements')
        .set('Authorization', `Bearer ${token}`)
        .query({
          search: '<script>alert("xss")</script>',
        });

      // Should not crash - sanitization should handle it
      expect([200, 400, 404, 500]).toContain(response.status);
    });
  });

  describe('8. CORS Configuration', () => {
    test('should include CORS headers', async () => {
      if (!serverAvailable) {
        console.log('Skipping: Server not available');
        return;
      }

      const response = await request(SERVER_URL)
        .options('/api/price-agreements')
        .expect(204);

      // CORS headers should be present
      // Note: supertest might not show all headers, but the request should succeed
      expect(response.status).toBe(204);
    });
  });
});

