/**
 * RLS (Row-Level Security) Tests
 *
 * Tests to verify that RLS policies are working correctly and enforcing
 * tenant isolation at the database level.
 *
 * These tests verify:
 * 1. Tenant isolation: Tenant A cannot see Tenant B's data
 * 2. Global+tenant tables: Can see global rows (tenant_id IS NULL) + own tenant rows
 * 3. Global tables: Remain accessible to all tenants (no RLS)
 */

const { withTenantContext } = require('../src/db/tenantContext');
const { getPool } = require('../src/db/supabaseClient');

// Skip tests if DATABASE_URL is not set
const shouldRunTests = process.env.DATABASE_URL || process.env.PG_CONNECTION_STRING || process.env.SUPABASE_DB_URL;

describe('RLS Tenant Isolation Tests', () => {
  let tenantAId;
  let tenantBId;
  let tenantARfqId;
  let tenantBRfqId;
  let tenantAKbArticleId;
  let tenantBKbArticleId;
  let globalKbArticleId;

  beforeAll(async () => {
    if (!shouldRunTests) {
      console.log('⚠️  Skipping RLS tests: DATABASE_URL not set');
      return;
    }

    const pool = getPool();

    // Get or create test tenants
    // Try to find existing tenants first
    const tenantResult = await pool.query(`
      SELECT id, code FROM tenants WHERE code IN ('NSC', 'METASTEEL') ORDER BY code
    `);

    if (tenantResult.rows.length >= 2) {
      tenantAId = tenantResult.rows[0].id;
      tenantBId = tenantResult.rows[1].id;
    } else {
      // Create test tenants if they don't exist
      const createTenantA = await pool.query(`
        INSERT INTO tenants (code, name, is_active)
        VALUES ('TEST_A', 'Test Tenant A', true)
        ON CONFLICT (code) DO UPDATE SET is_active = true
        RETURNING id
      `);
      tenantAId = createTenantA.rows[0].id;

      const createTenantB = await pool.query(`
        INSERT INTO tenants (code, name, is_active)
        VALUES ('TEST_B', 'Test Tenant B', true)
        ON CONFLICT (code) DO UPDATE SET is_active = true
        RETURNING id
      `);
      tenantBId = createTenantB.rows[0].id;
    }

    // Create test data for Tenant A
    await withTenantContext(tenantAId, async (client) => {
      // Create a client for Tenant A
      const clientA = await client.query(`
        INSERT INTO clients (name, tenant_id)
        VALUES ('Test Client A', $1)
        ON CONFLICT DO NOTHING
        RETURNING id
      `, [tenantAId]);
      const clientAId = clientA.rows[0]?.id || (await client.query(`SELECT id FROM clients WHERE tenant_id = $1 LIMIT 1`, [tenantAId])).rows[0].id;

      // Create a project for Tenant A
      const projectA = await client.query(`
        INSERT INTO projects (client_id, name, tenant_id)
        VALUES ($1, 'Test Project A', $2)
        ON CONFLICT DO NOTHING
        RETURNING id
      `, [clientAId, tenantAId]);
      const projectAId = projectA.rows[0]?.id || (await client.query(`SELECT id FROM projects WHERE tenant_id = $1 LIMIT 1`, [tenantAId])).rows[0].id;

      // Create an RFQ for Tenant A
      const rfqA = await client.query(`
        INSERT INTO rfqs (project_id, title, status, tenant_id)
        VALUES ($1, 'Test RFQ A', 'draft', $2)
        RETURNING id
      `, [projectAId, tenantAId]);
      tenantARfqId = rfqA.rows[0].id;

      // Create a knowledge base article for Tenant A
      const kbA = await client.query(`
        INSERT INTO knowledge_base_articles (tenant_id, slug, title, category, summary, content)
        VALUES ($1, 'test-article-a', 'Test Article A', 'test', 'Summary A', 'Content A')
        RETURNING id
      `, [tenantAId]);
      tenantAKbArticleId = kbA.rows[0].id;
    });

    // Create test data for Tenant B
    await withTenantContext(tenantBId, async (client) => {
      // Create a client for Tenant B
      const clientB = await client.query(`
        INSERT INTO clients (name, tenant_id)
        VALUES ('Test Client B', $1)
        ON CONFLICT DO NOTHING
        RETURNING id
      `, [tenantBId]);
      const clientBId = clientB.rows[0]?.id || (await client.query(`SELECT id FROM clients WHERE tenant_id = $1 LIMIT 1`, [tenantBId])).rows[0].id;

      // Create a project for Tenant B
      const projectB = await client.query(`
        INSERT INTO projects (client_id, name, tenant_id)
        VALUES ($1, 'Test Project B', $2)
        ON CONFLICT DO NOTHING
        RETURNING id
      `, [clientBId, tenantBId]);
      const projectBId = projectB.rows[0]?.id || (await client.query(`SELECT id FROM projects WHERE tenant_id = $1 LIMIT 1`, [tenantBId])).rows[0].id;

      // Create an RFQ for Tenant B
      const rfqB = await client.query(`
        INSERT INTO rfqs (project_id, title, status, tenant_id)
        VALUES ($1, 'Test RFQ B', 'draft', $2)
        RETURNING id
      `, [projectBId, tenantBId]);
      tenantBRfqId = rfqB.rows[0].id;

      // Create a knowledge base article for Tenant B
      const kbB = await client.query(`
        INSERT INTO knowledge_base_articles (tenant_id, slug, title, category, summary, content)
        VALUES ($1, 'test-article-b', 'Test Article B', 'test', 'Summary B', 'Content B')
        RETURNING id
      `, [tenantBId]);
      tenantBKbArticleId = kbB.rows[0].id;
    });

    // Create a global knowledge base article (tenant_id IS NULL)
    const globalKb = await pool.query(`
      INSERT INTO knowledge_base_articles (tenant_id, slug, title, category, summary, content)
      VALUES (NULL, 'global-article', 'Global Article', 'test', 'Global Summary', 'Global Content')
      RETURNING id
    `);
    globalKbArticleId = globalKb.rows[0].id;
  });

  describe('Tenant Isolation - Standard Tables', () => {
    test('Tenant A should only see their own RFQs', async () => {
      if (!shouldRunTests) {
        return;
      }

      const result = await withTenantContext(tenantAId, async (client) => {
        return await client.query('SELECT id FROM rfqs');
      });

      // Should see Tenant A's RFQ
      const rfqIds = result.rows.map(r => r.id);
      expect(rfqIds).toContain(tenantARfqId);
      // Should NOT see Tenant B's RFQ
      expect(rfqIds).not.toContain(tenantBRfqId);
    });

    test('Tenant B should only see their own RFQs', async () => {
      if (!shouldRunTests) {
        return;
      }

      const result = await withTenantContext(tenantBId, async (client) => {
        return await client.query('SELECT id FROM rfqs');
      });

      // Should see Tenant B's RFQ
      const rfqIds = result.rows.map(r => r.id);
      expect(rfqIds).toContain(tenantBRfqId);
      // Should NOT see Tenant A's RFQ
      expect(rfqIds).not.toContain(tenantARfqId);
    });
  });

  describe('Global + Tenant Tables', () => {
    test('Tenant A should see global articles + own articles, but not Tenant B articles', async () => {
      if (!shouldRunTests) {
        return;
      }

      const result = await withTenantContext(tenantAId, async (client) => {
        return await client.query('SELECT id, tenant_id FROM knowledge_base_articles');
      });

      const articleIds = result.rows.map(r => r.id);
      // Should see global article (tenant_id IS NULL)
      expect(articleIds).toContain(globalKbArticleId);
      // Should see own article
      expect(articleIds).toContain(tenantAKbArticleId);
      // Should NOT see Tenant B's article
      expect(articleIds).not.toContain(tenantBKbArticleId);
    });

    test('Tenant B should see global articles + own articles, but not Tenant A articles', async () => {
      if (!shouldRunTests) {
        return;
      }

      const result = await withTenantContext(tenantBId, async (client) => {
        return await client.query('SELECT id, tenant_id FROM knowledge_base_articles');
      });

      const articleIds = result.rows.map(r => r.id);
      // Should see global article (tenant_id IS NULL)
      expect(articleIds).toContain(globalKbArticleId);
      // Should see own article
      expect(articleIds).toContain(tenantBKbArticleId);
      // Should NOT see Tenant A's article
      expect(articleIds).not.toContain(tenantAKbArticleId);
    });
  });

  describe('Global Tables (No RLS)', () => {
    test('All tenants should be able to query global tables', async () => {
      if (!shouldRunTests) {
        return;
      }

      // Query materials table (global, no RLS)
      const resultA = await withTenantContext(tenantAId, async (client) => {
        return await client.query('SELECT COUNT(*) as count FROM materials');
      });

      const resultB = await withTenantContext(tenantBId, async (client) => {
        return await client.query('SELECT COUNT(*) as count FROM materials');
      });

      // Both should see the same count (global table)
      expect(parseInt(resultA.rows[0].count)).toBeGreaterThanOrEqual(0);
      expect(parseInt(resultB.rows[0].count)).toBe(parseInt(resultA.rows[0].count));
    });
  });

  afterAll(async () => {
    if (!shouldRunTests) {
      return;
    }

    // Clean up test data
    const pool = getPool();
    try {
      // Delete test RFQs
      if (tenantARfqId) {
        await pool.query('DELETE FROM rfqs WHERE id = $1', [tenantARfqId]);
      }
      if (tenantBRfqId) {
        await pool.query('DELETE FROM rfqs WHERE id = $1', [tenantBRfqId]);
      }

      // Delete test knowledge base articles
      if (tenantAKbArticleId) {
        await pool.query('DELETE FROM knowledge_base_articles WHERE id = $1', [tenantAKbArticleId]);
      }
      if (tenantBKbArticleId) {
        await pool.query('DELETE FROM knowledge_base_articles WHERE id = $1', [tenantBKbArticleId]);
      }
      if (globalKbArticleId) {
        await pool.query('DELETE FROM knowledge_base_articles WHERE id = $1', [globalKbArticleId]);
      }
    } catch (error) {
      console.error('Error cleaning up test data:', error);
    }
  });
});

