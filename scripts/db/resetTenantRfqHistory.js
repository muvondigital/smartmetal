/**
 * Reset RFQ history for a specific tenant (DEV/TEST ONLY)
 *
 * This script deletes RFQs and all directly related records for a single tenant,
 * so you can run the full RFQ → AI extraction → Pricing → Approval → Price Agreement
 * workflow from a clean slate for that tenant.
 *
 * WARNING:
 * - This is intended for non-production environments ONLY.
 * - It performs hard deletes of tenant-scoped RFQ data.
 * - Do NOT run this against a production database.
 *
 * Usage:
 *   # From backend directory, with TENANT_CODE env:
 *   TENANT_CODE=NSC npm run reset:rfq-history
 *
 *   # Or directly from repo root:
 *   node scripts/db/resetTenantRfqHistory.js --tenant=NSC
 *   node scripts/db/resetTenantRfqHistory.js --tenant NSC
 *
 * Optional (dev-only) flags:
 *   --include-agreements    Also delete auto-generated price agreements for this tenant
 */

require('dotenv').config();
const path = require('path');
const { connectDb } = require('../../backend/src/db/supabaseClient');

/**
 * Simple CLI arg parser for:
 *   --tenant=CODE or --tenant CODE
 *   --include-agreements
 */
function parseArgs(argv) {
  const args = {
    tenantCode: process.env.TENANT_CODE || null,
    includeAgreements: false,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg.startsWith('--tenant=')) {
      args.tenantCode = arg.split('=')[1].trim();
    } else if (arg === '--tenant' && i + 1 < argv.length) {
      args.tenantCode = argv[i + 1].trim();
    } else if (arg === '--include-agreements') {
      args.includeAgreements = true;
    }
  }

  return args;
}

/**
 * Safety guard to avoid accidental use in production.
 * We treat NODE_ENV=production as a hard stop.
 */
function assertNonProduction() {
  const nodeEnv = process.env.NODE_ENV || 'development';
  if (nodeEnv === 'production') {
    console.error('❌ RFQ history reset is disabled in production environments.');
    console.error('   NODE_ENV=production detected. Aborting.');
    process.exit(1);
  }
}

async function resolveTenant(db, tenantCode) {
  if (!tenantCode) {
    console.error('❌ Missing tenant code.');
    console.error('   Provide TENANT_CODE env or --tenant=CODE CLI argument.');
    process.exit(1);
  }

  const result = await db.query(
    `
      SELECT id, code, name
      FROM tenants
      WHERE code = $1
      LIMIT 1;
    `,
    [tenantCode]
  );

  if (result.rows.length === 0) {
    console.error(`❌ Tenant not found for code: ${tenantCode}`);
    process.exit(1);
  }

  const tenant = result.rows[0];
  console.log(
    `\n📛 Preparing to reset RFQ history for tenant: ${tenant.name} (${tenant.code}) [id=${tenant.id}]`
  );

  return tenant;
}

async function getCounts(db, tenantId, includeAgreements) {
  const queries = [
    {
      key: 'rfqs',
      sql: 'SELECT COUNT(*)::int AS count FROM rfqs WHERE tenant_id = $1',
    },
    {
      key: 'rfq_items',
      sql: 'SELECT COUNT(*)::int AS count FROM rfq_items WHERE tenant_id = $1',
    },
    {
      key: 'pricing_runs',
      sql: 'SELECT COUNT(*)::int AS count FROM pricing_runs WHERE tenant_id = $1',
    },
    {
      key: 'pricing_run_items',
      sql: 'SELECT COUNT(*)::int AS count FROM pricing_run_items WHERE tenant_id = $1',
    },
    {
      key: 'approval_history',
      sql: 'SELECT COUNT(*)::int AS count FROM approval_history WHERE tenant_id = $1',
    },
    {
      key: 'approval_events',
      sql: 'SELECT COUNT(*)::int AS count FROM approval_events WHERE tenant_id = $1',
    },
  ];

  if (includeAgreements) {
    queries.push({
      key: 'price_agreements',
      sql: `
        SELECT COUNT(*)::int AS count
        FROM price_agreements
        WHERE tenant_id = $1
          AND notes ILIKE '%Auto-generated from pricing run%'
      `,
    });
  }

  const counts = {};

  // Run sequentially for simplicity; counts are small.
  for (const q of queries) {
    try {
      const res = await db.query(q.sql, [tenantId]);
      counts[q.key] = res.rows[0]?.count || 0;
    } catch (err) {
      console.warn(
        `⚠️  Failed to get count for ${q.key} (table may not exist in this environment):`,
        err.message
      );
      counts[q.key] = 0;
    }
  }

  return counts;
}

function logCounts(label, counts) {
  console.log(`\n📊 ${label} (per-tenant row counts)`);
  console.log('----------------------------------------------');
  Object.entries(counts).forEach(([key, value]) => {
    console.log(`- ${key}: ${value}`);
  });
}

async function resetTenantRfqHistory() {
  assertNonProduction();

  const args = parseArgs(process.argv);
  const includeAgreements = args.includeAgreements;

  // Ensure we load backend/.env if present (for DATABASE_URL etc.)
  // but don't crash if it doesn't exist; dotenv at top already loaded root .env.
  const backendEnvPath = path.join(__dirname, '..', '..', 'backend', '.env');
  require('dotenv').config({ path: backendEnvPath });

  const db = await connectDb();

  try {
    const tenant = await resolveTenant(db, args.tenantCode);

    const beforeCounts = await getCounts(db, tenant.id, includeAgreements);
    logCounts('Before reset', beforeCounts);

    if (beforeCounts.rfqs === 0 && beforeCounts.pricing_runs === 0) {
      console.log(
        '\nℹ️  No RFQs or pricing runs found for this tenant. Nothing to delete. Exiting.'
      );
      return;
    }

    console.log('\n🚨 Starting RFQ history reset transaction...');

    // Use a single transaction so we don't leave partial deletions.
    await db.query('BEGIN');

    // a) approval_events – need to temporarily disable immutability trigger in this session.
    try {
      console.log('  ➤ Deleting approval_events for this tenant...');
      await db.query(
        `
          ALTER TABLE approval_events
          DISABLE TRIGGER approval_events_immutable_trigger;
        `
      );

      const res = await db.query(
        `
          DELETE FROM approval_events
          WHERE tenant_id = $1
            AND pricing_run_id IN (
              SELECT id FROM pricing_runs WHERE tenant_id = $1
            );
        `,
        [tenant.id]
      );
      console.log(`    • approval_events deleted: ${res.rowCount}`);
    } catch (err) {
      // If table or trigger doesn't exist (older schema), log and continue.
      console.warn(
        '    ⚠️  Skipping approval_events cleanup (table or trigger may not exist):',
        err.message
      );
    }

    // b) approval_history
    try {
      console.log('  ➤ Deleting approval_history for this tenant...');
      const res = await db.query(
        `
          DELETE FROM approval_history
          WHERE tenant_id = $1
            AND pricing_run_id IN (
              SELECT id FROM pricing_runs WHERE tenant_id = $1
            );
        `,
        [tenant.id]
      );
      console.log(`    • approval_history deleted: ${res.rowCount}`);
    } catch (err) {
      console.warn(
        '    ⚠️  Skipping approval_history cleanup (table may not exist):',
        err.message
      );
    }

    // c) pricing_run_items
    try {
      console.log('  ➤ Deleting pricing_run_items for this tenant...');
      const res = await db.query(
        `
          DELETE FROM pricing_run_items
          WHERE tenant_id = $1
            AND pricing_run_id IN (
              SELECT id FROM pricing_runs WHERE tenant_id = $1
            );
        `,
        [tenant.id]
      );
      console.log(`    • pricing_run_items deleted: ${res.rowCount}`);
    } catch (err) {
      console.warn(
        '    ⚠️  Skipping pricing_run_items cleanup (table may not exist):',
        err.message
      );
    }

    // d) pricing_runs
    try {
      console.log('  ➤ Deleting pricing_runs for this tenant...');
      const res = await db.query(
        `
          DELETE FROM pricing_runs
          WHERE tenant_id = $1
            AND rfq_id IN (
              SELECT id FROM rfqs WHERE tenant_id = $1
            );
        `,
        [tenant.id]
      );
      console.log(`    • pricing_runs deleted: ${res.rowCount}`);
    } catch (err) {
      console.warn('    ⚠️  Skipping pricing_runs cleanup:', err.message);
    }

    // e) rfq_items
    try {
      console.log('  ➤ Deleting rfq_items for this tenant...');
      const res = await db.query(
        `
          DELETE FROM rfq_items
          WHERE tenant_id = $1
            AND rfq_id IN (
              SELECT id FROM rfqs WHERE tenant_id = $1
            );
        `,
        [tenant.id]
      );
      console.log(`    • rfq_items deleted: ${res.rowCount}`);
    } catch (err) {
      console.warn('    ⚠️  Skipping rfq_items cleanup:', err.message);
    }

    // f) rfqs
    try {
      console.log('  ➤ Deleting rfqs for this tenant...');
      const res = await db.query(
        `
          DELETE FROM rfqs
          WHERE tenant_id = $1;
        `,
        [tenant.id]
      );
      console.log(`    • rfqs deleted: ${res.rowCount}`);
    } catch (err) {
      console.warn('    ⚠️  Skipping rfqs cleanup:', err.message);
    }

    // g) Optional: price_agreements that were auto-generated from pricing runs
    if (includeAgreements) {
      try {
        console.log(
          '  ➤ Deleting auto-generated price_agreements for this tenant (--include-agreements)...'
        );
        const res = await db.query(
          `
            DELETE FROM price_agreements
            WHERE tenant_id = $1
              AND notes ILIKE '%Auto-generated from pricing run%';
          `,
          [tenant.id]
        );
        console.log(`    • price_agreements deleted: ${res.rowCount}`);
      } catch (err) {
        console.warn(
          '    ⚠️  Skipping price_agreements cleanup (table may not exist or schema differs):',
          err.message
        );
      }
    } else {
      console.log(
        '  ➤ Skipping price_agreements cleanup (run with --include-agreements to delete auto-generated agreements).'
      );
    }

    // Re-enable approval_events trigger (within the same transaction) if it exists.
    try {
      await db.query(
        `
          ALTER TABLE approval_events
          ENABLE TRIGGER approval_events_immutable_trigger;
        `
      );
    } catch (err) {
      // Ignore if table/trigger missing.
    }

    await db.query('COMMIT');
    console.log('\n✅ RFQ history reset transaction committed successfully.');

    const afterCounts = await getCounts(db, tenant.id, includeAgreements);
    logCounts('After reset', afterCounts);

    if (afterCounts.rfqs === 0 && afterCounts.pricing_runs === 0) {
      console.log(
        `\n🎯 RFQ history for tenant ${tenant.code} is now fully cleared. RFQ dashboard should start from 0 for this tenant.`
      );
    } else {
      console.log(
        `\n⚠️  Some RFQ-related records remain for tenant ${tenant.code}. ` +
          'Check foreign key constraints or additional tables not covered by this script.'
      );
    }
  } catch (error) {
    try {
      await db.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('❌ Failed to rollback transaction:', rollbackError.message);
    }
    console.error('\n❌ RFQ history reset failed:', error.message);
    throw error;
  } finally {
    if (db && typeof db.end === 'function') {
      await db.end();
    }
  }
}

if (require.main === module) {
  resetTenantRfqHistory()
    .then(() => {
      process.exit(0);
    })
    .catch(() => {
      process.exit(1);
    });
}

module.exports = {
  resetTenantRfqHistory,
};


