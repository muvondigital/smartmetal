#!/usr/bin/env node

/**
 * Stage 3: Data Integrity Gap Export (read-only)
 *
 * Executes the tenant-scoped diagnostics defined in docs/DATA_INTEGRITY_GAP_REPORT.md
 * using the runtime smartmetal_app role (DATABASE_URL) and app.tenant_id context.
 * Outputs CSVs and a JSON summary per tenant. No database writes are performed.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const { withTenantContext } = require('../src/db/tenantContext');
const { getPool, closePool } = require('../src/db/supabaseClient');

// Check if is_current column exists, build queries accordingly
async function buildQueries(pool) {
  const hasIsCurrent = await pool.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.columns
      WHERE table_name = 'pricing_runs' AND column_name = 'is_current'
    );
  `);
  const useIsCurrent = hasIsCurrent.rows[0].exists;
  
  const hasQuoteCandidates = await pool.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'quote_candidates'
    );
  `);
  const useQuoteCandidates = hasQuoteCandidates.rows[0].exists;

  if (useIsCurrent) {
    return [
      {
        key: 'rfqsDraftWithApprovedRuns',
        description: 'RFQs stuck in draft but with approved current runs',
        filename: '01_rfq_draft_with_approved_runs.csv',
        sql: `
          SELECT r.id AS rfq_id, r.rfq_code, r.status, pr.id AS pricing_run_id
          FROM rfqs r
          JOIN pricing_runs pr ON pr.rfq_id = r.id
          WHERE r.tenant_id = $1
            AND r.status = 'draft'
            AND pr.approval_status = 'approved'
            AND pr.is_current = true;
        `,
      },
      {
        key: 'multipleCurrentRuns',
        description: 'Multiple current runs per RFQ',
        filename: '02_multiple_current_runs.csv',
        sql: `
          SELECT rfq_id, COUNT(*) AS current_runs, ARRAY_AGG(id) AS run_ids
          FROM pricing_runs
          WHERE tenant_id = $1 AND is_current = true
          GROUP BY rfq_id
          HAVING COUNT(*) > 1;
        `,
      },
      {
        key: 'approvedRunsMissingQuoteCandidates',
        description: 'Approved runs missing quote_candidates',
        filename: '03_approved_missing_quote_candidates.csv',
        sql: useQuoteCandidates ? `
          SELECT pr.id AS pricing_run_id, pr.rfq_id
          FROM pricing_runs pr
          LEFT JOIN quote_candidates qc ON qc.pricing_run_id = pr.id
          WHERE pr.tenant_id = $1
            AND pr.approval_status = 'approved'
            AND pr.is_current = true
            AND qc.id IS NULL;
        ` : `
          SELECT pr.id AS pricing_run_id, pr.rfq_id
          FROM pricing_runs pr
          WHERE pr.tenant_id = $1
            AND pr.approval_status = 'approved'
            AND pr.is_current = true
            AND false;
        `,
      },
      {
        key: 'badPriceAgreements',
        description: 'price_agreements missing client_id',
        filename: '04_bad_price_agreements.csv',
        sql: `
          SELECT id, tenant_id, client_id, created_at
          FROM price_agreements
          WHERE tenant_id = $1
            AND client_id IS NULL;
        `,
      },
    ];
  } else {
    // Fallback: use latest run per RFQ (by created_at DESC) as "current"
    return [
      {
        key: 'rfqsDraftWithApprovedRuns',
        description: 'RFQs stuck in draft but with approved runs (latest per RFQ)',
        filename: '01_rfq_draft_with_approved_runs.csv',
        sql: `
          SELECT r.id AS rfq_id, r.rfq_code, r.status, pr.id AS pricing_run_id
          FROM rfqs r
          JOIN pricing_runs pr ON pr.rfq_id = r.id
          WHERE r.tenant_id = $1
            AND r.status = 'draft'
            AND pr.approval_status = 'approved'
            AND pr.id = (
              SELECT pr2.id FROM pricing_runs pr2
              WHERE pr2.rfq_id = r.id AND pr2.tenant_id = $1
              ORDER BY pr2.created_at DESC, pr2.version DESC NULLS LAST
              LIMIT 1
            );
        `,
      },
      {
        key: 'multipleCurrentRuns',
        description: 'Multiple latest runs per RFQ (potential duplicates)',
        filename: '02_multiple_current_runs.csv',
        sql: `
          WITH latest_runs AS (
            SELECT rfq_id, MAX(created_at) AS max_created_at
            FROM pricing_runs
            WHERE tenant_id = $1
            GROUP BY rfq_id
          )
          SELECT lr.rfq_id, COUNT(*) AS current_runs, ARRAY_AGG(pr.id) AS run_ids
          FROM latest_runs lr
          JOIN pricing_runs pr ON pr.rfq_id = lr.rfq_id
            AND pr.created_at = lr.max_created_at
            AND pr.tenant_id = $1
          GROUP BY lr.rfq_id
          HAVING COUNT(*) > 1;
        `,
      },
      {
        key: 'approvedRunsMissingQuoteCandidates',
        description: 'Approved runs missing quote_candidates (latest per RFQ)',
        filename: '03_approved_missing_quote_candidates.csv',
        sql: useQuoteCandidates ? `
          SELECT pr.id AS pricing_run_id, pr.rfq_id
          FROM pricing_runs pr
          LEFT JOIN quote_candidates qc ON qc.pricing_run_id = pr.id
          WHERE pr.tenant_id = $1
            AND pr.approval_status = 'approved'
            AND pr.id = (
              SELECT pr2.id FROM pricing_runs pr2
              WHERE pr2.rfq_id = pr.rfq_id AND pr2.tenant_id = $1
              ORDER BY pr2.created_at DESC, pr2.version DESC NULLS LAST
              LIMIT 1
            )
            AND qc.id IS NULL;
        ` : `
          SELECT pr.id AS pricing_run_id, pr.rfq_id
          FROM pricing_runs pr
          WHERE pr.tenant_id = $1
            AND pr.approval_status = 'approved'
            AND pr.id = (
              SELECT pr2.id FROM pricing_runs pr2
              WHERE pr2.rfq_id = pr.rfq_id AND pr2.tenant_id = $1
              ORDER BY pr2.created_at DESC, pr2.version DESC NULLS LAST
              LIMIT 1
            )
            AND false;
        `,
      },
      {
        key: 'badPriceAgreements',
        description: 'price_agreements missing client_id',
        filename: '04_bad_price_agreements.csv',
        sql: `
          SELECT id, tenant_id, client_id, created_at
          FROM price_agreements
          WHERE tenant_id = $1
            AND client_id IS NULL;
        `,
      },
    ];
  }
}

function parseArgs() {
  const args = {
    tenantId: null,
    tenantCode: null,
    outDir: 'docs',
  };

  for (let i = 2; i < process.argv.length; i += 1) {
    const arg = process.argv[i];
    const next = process.argv[i + 1];
    if (arg === '--tenant-id' && next) {
      args.tenantId = next;
      i += 1;
    } else if (arg === '--tenant-code' && next) {
      args.tenantCode = next;
      i += 1;
    } else if (arg === '--out-dir' && next) {
      args.outDir = next;
      i += 1;
    }
  }

  if (!args.tenantId) {
    throw new Error('Missing required argument: --tenant-id <uuid>');
  }

  return args;
}

function sanitizeSegment(value) {
  return (value || 'unknown')
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-');
}

function ensureDirExists(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function escapeCsvValue(value) {
  if (value === null || value === undefined) return '';
  const str = value instanceof Date ? value.toISOString() : String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function resultToCsv(result) {
  const headers = result.fields?.map((f) => f.name) || [];
  if (headers.length === 0) return '';

  const lines = [headers.join(',')];
  for (const row of result.rows) {
    const values = headers.map((h) => escapeCsvValue(row[h]));
    lines.push(values.join(','));
  }
  return lines.join('\n');
}

async function run() {
  const { tenantId, tenantCode, outDir } = parseArgs();
  const tenantSegment = sanitizeSegment(tenantCode || tenantId);
  const baseDir = path.resolve(outDir, 'data-integrity', tenantSegment);
  ensureDirExists(baseDir);

  const pool = getPool();

  try {
    const roleInfo = await pool.query(
      `SELECT current_user, current_setting('app.tenant_id', true) AS app_tenant_id`
    );
    const roleRow = roleInfo.rows[0] || {};
    console.log(
      `[info] Connected as ${roleRow.current_user || 'unknown'} (app.tenant_id=${roleRow.app_tenant_id || 'null'})`
    );
  } catch (err) {
    console.warn('[warn] Unable to verify current_user/app.tenant_id:', err.message);
  }

  const summary = {
    tenantId,
    tenantCode: tenantCode || null,
    generatedAt: new Date().toISOString(),
    counts: {},
  };

  try {
    const QUERIES = await buildQueries(pool);
    
    for (const query of QUERIES) {
      const result = await withTenantContext(tenantId, async (client) => {
        return client.query(query.sql, [tenantId]);
      });

      const csv = resultToCsv(result);
      const filePath = path.join(baseDir, query.filename);
      fs.writeFileSync(filePath, `${csv}\n`);

      summary.counts[query.key] = result.rowCount;

      console.log(
        `[ok] ${query.description}: ${result.rowCount} row(s) -> ${path.relative(process.cwd(), filePath)}`
      );
    }

    const summaryPath = path.join(baseDir, 'summary.json');
    fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
    console.log(`[ok] Summary written -> ${path.relative(process.cwd(), summaryPath)}`);
  } catch (error) {
    console.error('[error] Export failed:', error.message);
    throw error;
  } finally {
    await closePool();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

