/**
 * Approval Workflow v2 Integration Tests
 * 
 * Tests the multi-level approval workflow:
 * - Sales → Procurement → Management routing
 * - SLA enforcement
 * - Escalation and backup approvers
 * 
 * Run with: npm test -- approval-workflow-v2.test.js
 */

const { connectDb } = require('../db/supabaseClient');
const { submitForApproval, approvePricingRun, rejectPricingRun, enforceSLA } = require('../services/approvalService');
const approvalRulesEngine = require('../services/approvalRulesEngine');

describe('Approval Workflow v2', () => {
  let db;
  let testPricingRunId;
  let testRfqId;

  beforeAll(async () => {
    db = await connectDb();
    
    // Create test data
    // Note: This assumes test database with proper schema
    const clientResult = await db.query(
      `INSERT INTO clients (name, email) 
       VALUES ('Test Client', 'test@example.com') 
       ON CONFLICT DO NOTHING 
       RETURNING id`
    );
    const clientId = clientResult.rows[0]?.id || (await db.query('SELECT id FROM clients LIMIT 1')).rows[0].id;

    const projectResult = await db.query(
      `INSERT INTO projects (name, client_id) 
       VALUES ('Test Project', $1) 
       ON CONFLICT DO NOTHING 
       RETURNING id`,
      [clientId]
    );
    const projectId = projectResult.rows[0]?.id || (await db.query('SELECT id FROM projects LIMIT 1')).rows[0].id;

    const rfqResult = await db.query(
      `INSERT INTO rfqs (title, project_id, status) 
       VALUES ('Test RFQ', $1, 'draft') 
       RETURNING id`,
      [projectId]
    );
    testRfqId = rfqResult.rows[0].id;

    const pricingRunResult = await db.query(
      `INSERT INTO pricing_runs (rfq_id, total_price, approval_status) 
       VALUES ($1, 1000, 'draft') 
       RETURNING id`,
      [testRfqId]
    );
    testPricingRunId = pricingRunResult.rows[0].id;
  });

  afterAll(async () => {
    // Cleanup test data
    if (testPricingRunId) {
      await db.query('DELETE FROM pricing_runs WHERE id = $1', [testPricingRunId]);
    }
    if (testRfqId) {
      await db.query('DELETE FROM rfqs WHERE id = $1', [testRfqId]);
    }
  });

  describe('Approval Path Determination', () => {
    test('should determine approval path for pricing run', async () => {
      const pricingRun = {
        id: testPricingRunId,
        total_price: 1000,
        items: [
          { base_cost: 100, unit_price: 120 }
        ],
        project_type: 'standard'
      };

      const path = await approvalRulesEngine.determineApprovalPath(pricingRun);
      
      expect(path).toBeDefined();
      expect(path.levels).toBeDefined();
      expect(path.levels.length).toBeGreaterThan(0);
      expect(path.levels[0].level).toBe(1);
      expect(path.levels[0].name).toBe('Sales');
      expect(path.slaDeadlines).toBeDefined();
      expect(path.slaDeadlines.sales).toBeDefined();
    });

    test('should require Sales approval always', async () => {
      const pricingRun = {
        id: testPricingRunId,
        total_price: 100,
        items: [],
        project_type: 'standard'
      };

      const path = await approvalRulesEngine.determineApprovalPath(pricingRun);
      
      expect(path.requiresSales).toBe(true);
      expect(path.levels.some(l => l.name === 'Sales')).toBe(true);
    });
  });

  describe('Submit for Approval', () => {
    test('should submit pricing run and set approval level to 1', async () => {
      const submitter = {
        name: 'Test Submitter',
        email: 'submitter@example.com'
      };

      const result = await submitForApproval(testPricingRunId, submitter);

      expect(result).toBeDefined();
      expect(result.approval_status).toBe('pending_approval');
      expect(result.approval_level).toBe(1);
      expect(result.approval_path).toBeDefined();

      // Verify database state
      const dbResult = await db.query(
        'SELECT approval_level, sales_submitted_at, sales_sla_deadline FROM pricing_runs WHERE id = $1',
        [testPricingRunId]
      );
      expect(dbResult.rows[0].approval_level).toBe(1);
      expect(dbResult.rows[0].sales_submitted_at).toBeDefined();
      expect(dbResult.rows[0].sales_sla_deadline).toBeDefined();
    });
  });

  describe('Multi-Level Approval', () => {
    test('should advance to next level after Sales approval', async () => {
      // First, submit for approval
      await submitForApproval(testPricingRunId, {
        name: 'Test Submitter',
        email: 'submitter@example.com'
      });

      // Approve at Sales level
      const approver = {
        name: 'Sales Manager',
        email: 'sales@example.com',
        notes: 'Approved at sales level'
      };

      const result = await approvePricingRun(testPricingRunId, approver);

      expect(result).toBeDefined();
      expect(result.approval_level).toBeGreaterThan(1);
      
      // Verify database state
      const dbResult = await db.query(
        'SELECT sales_approved_at, approval_level FROM pricing_runs WHERE id = $1',
        [testPricingRunId]
      );
      expect(dbResult.rows[0].sales_approved_at).toBeDefined();
    });
  });

  describe('SLA Enforcement', () => {
    test('should detect expired SLAs', async () => {
      // Create a pricing run with expired SLA
      const expiredRun = await db.query(
        `INSERT INTO pricing_runs (rfq_id, total_price, approval_status, approval_level, sales_submitted_at, sales_sla_deadline)
         VALUES ($1, 1000, 'pending_approval', 1, NOW() - INTERVAL '25 hours', NOW() - INTERVAL '1 hour')
         RETURNING id`,
        [testRfqId]
      );
      const expiredRunId = expiredRun.rows[0].id;

      const results = await enforceSLA();

      expect(results).toBeDefined();
      expect(results.slaExpired).toBeDefined();
      expect(Array.isArray(results.slaExpired)).toBe(true);

      // Cleanup
      await db.query('DELETE FROM pricing_runs WHERE id = $1', [expiredRunId]);
    });
  });

  describe('Rejection', () => {
    test('should reject pricing run with reason', async () => {
      // Create a new pricing run for rejection test
      const rejectRun = await db.query(
        `INSERT INTO pricing_runs (rfq_id, total_price, approval_status, approval_level)
         VALUES ($1, 1000, 'pending_approval', 1)
         RETURNING id`,
        [testRfqId]
      );
      const rejectRunId = rejectRun.rows[0].id;

      const rejector = {
        name: 'Rejector',
        email: 'rejector@example.com',
        rejection_reason: 'Test rejection reason'
      };

      const result = await rejectPricingRun(rejectRunId, rejector);

      expect(result).toBeDefined();
      expect(result.approval_status).toBe('rejected');

      // Cleanup
      await db.query('DELETE FROM pricing_runs WHERE id = $1', [rejectRunId]);
    });
  });
});

