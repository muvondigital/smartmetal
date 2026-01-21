/**
 * Debug Routes (Development Only)
 *
 * Provides debugging endpoints for tenant isolation verification.
 * These routes should ONLY be enabled in development/staging environments.
 */

const express = require('express');
const router = express.Router();
const { withTenantContext } = require('../db/tenantContext');
const { config } = require('../config/env');

/**
 * GET /api/debug/tenant-smoke
 *
 * Returns row counts for all critical tenant-scoped tables.
 * Used to verify tenant isolation is working correctly.
 *
 * Response:
 * {
 *   tenantId: "uuid",
 *   tenantCode: "NSC" | "MetaSteel",
 *   timestamp: "2025-12-12T...",
 *   counts: {
 *     rfqs: 10,
 *     rfq_items: 50,
 *     pricing_runs: 5,
 *     pricing_run_items: 50,
 *     price_agreements: 3,
 *     agreement_headers: 3,
 *     agreement_conditions: 10,
 *     agreement_scales: 15,
 *     client_pricing_rules: 5
 *   }
 * }
 */
router.get('/tenant-smoke', async (req, res, next) => {
  try {
    // Require tenant context
    const tenantId = req.tenantId;

    if (!tenantId) {
      return res.status(400).json({
        error: 'tenantId is required. This endpoint requires tenant resolution middleware.',
      });
    }

    // Get tenant info
    const { getPool } = require('../db/supabaseClient');
    const pool = getPool();
    const tenantResult = await pool.query(
      'SELECT id, tenant_code, name FROM tenants WHERE id = $1',
      [tenantId]
    );

    if (tenantResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Tenant not found',
        tenantId,
      });
    }

    const tenant = tenantResult.rows[0];

    // Query counts within tenant context
    const counts = await withTenantContext(tenantId, async (client) => {
      // Define tables to check
      const tables = [
        'rfqs',
        'rfq_items',
        'pricing_runs',
        'pricing_run_items',
        'price_agreements',
        'quote_candidates',
        'agreement_headers',
        'agreement_conditions',
        'agreement_scales',
        'client_pricing_rules',
      ];

      const result = {};

      // Query each table count
      for (const tableName of tables) {
        try {
          const countResult = await client.query(
            `SELECT COUNT(*) as count FROM ${tableName}`
          );
          result[tableName] = parseInt(countResult.rows[0].count);
        } catch (error) {
          // Table might not exist
          result[tableName] = `ERROR: ${error.message}`;
        }
      }

      return result;
    });

    // Return response
    return res.json({
      tenantId: tenant.id,
      tenantCode: tenant.tenant_code,
      tenantName: tenant.name,
      timestamp: new Date().toISOString(),
      counts,
    });

  } catch (error) {
    console.error('[Debug Endpoint] tenant-smoke error:', error);
    next(error);
  }
});

/**
 * GET /api/debug/rls-status
 *
 * Returns RLS status for critical tables.
 * Shows which tables have RLS enabled, FORCE RLS enabled, and lists policies.
 *
 * Response:
 * {
 *   timestamp: "2025-12-12T...",
 *   tables: [
 *     {
 *       table_name: "rfqs",
 *       rls_enabled: true,
 *       force_rls_enabled: true,
 *       policies: ["rfqs_tenant_isolation"]
 *     },
 *     ...
 *   ]
 * }
 */
router.get('/rls-status', async (req, res, next) => {
  try {
    const { getPool } = require('../db/supabaseClient');
    const pool = getPool();

    // Get RLS status for all tables
    const rlsStatus = await pool.query(`
      SELECT
        c.relname AS table_name,
        c.relrowsecurity AS rls_enabled,
        c.relforcerowsecurity AS force_rls_enabled
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind = 'r'
        AND c.relname IN (
          'rfqs', 'rfq_items', 'pricing_runs', 'pricing_run_items',
          'price_agreements', 'agreement_headers', 'agreement_conditions', 'agreement_scales',
          'client_pricing_rules', 'clients', 'projects', 'users'
        )
      ORDER BY c.relname
    `);

    // Get policies for each table
    const policiesResult = await pool.query(`
      SELECT
        tablename,
        policyname,
        cmd,
        qual
      FROM pg_policies
      WHERE tablename IN (
        'rfqs', 'rfq_items', 'pricing_runs', 'pricing_run_items',
        'price_agreements', 'agreement_headers', 'agreement_conditions', 'agreement_scales',
        'client_pricing_rules', 'clients', 'projects', 'users'
      )
      ORDER BY tablename, policyname
    `);

    // Group policies by table
    const policiesByTable = {};
    for (const row of policiesResult.rows) {
      if (!policiesByTable[row.tablename]) {
        policiesByTable[row.tablename] = [];
      }
      policiesByTable[row.tablename].push({
        policy_name: row.policyname,
        command: row.cmd,
        definition: row.qual,
      });
    }

    // Combine RLS status with policies
    const tables = rlsStatus.rows.map(row => ({
      table_name: row.table_name,
      rls_enabled: row.rls_enabled,
      force_rls_enabled: row.force_rls_enabled,
      policies: policiesByTable[row.table_name] || [],
    }));

    return res.json({
      timestamp: new Date().toISOString(),
      tables,
    });

  } catch (error) {
    console.error('[Debug Endpoint] rls-status error:', error);
    next(error);
  }
});

module.exports = router;
