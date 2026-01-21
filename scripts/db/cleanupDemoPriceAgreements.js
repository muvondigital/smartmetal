/**
 * Dev/Test Utility: Clean up demo price agreements
 *
 * This script removes "fake" or legacy price agreements so that the
 * Price Agreements dashboard reflects only the new auto-generated
 * agreements created from approved pricing runs.
 *
 * Behavior:
 * - Resolves tenant by TENANT_CODE (env) or --tenant=CODE (default: NSC)
 * - Deletes price agreements for that tenant where:
 *     notes DOES NOT contain 'Auto-generated from pricing run'
 * - Leaves auto-generated agreements intact
 *
 * WARNING:
 * - Intended for non-production environments ONLY.
 * - Do NOT run against a production database.
 *
 * Usage (from repo root):
 *   TENANT_CODE=NSC node scripts/db/cleanupDemoPriceAgreements.js
 *   node scripts/db/cleanupDemoPriceAgreements.js --tenant=NSC
 */

require('dotenv').config();
const path = require('path');
const { connectDb } = require('../../backend/src/db/supabaseClient');

function parseArgs(argv) {
  let tenantCode = process.env.TENANT_CODE || 'NSC';

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith('--tenant=')) {
      tenantCode = arg.split('=')[1].trim();
    } else if (arg === '--tenant' && i + 1 < argv.length) {
      tenantCode = argv[i + 1].trim();
    }
  }

  return { tenantCode };
}

function assertNonProduction() {
  const nodeEnv = process.env.NODE_ENV || 'development';
  if (nodeEnv === 'production') {
    console.error('❌ cleanupDemoPriceAgreements is disabled in production.');
    process.exit(1);
  }
}

async function cleanupDemoAgreements() {
  assertNonProduction();

  // Also try loading backend/.env if present
  const backendEnvPath = path.join(__dirname, '..', '..', 'backend', '.env');
  require('dotenv').config({ path: backendEnvPath });

  const { tenantCode } = parseArgs(process.argv);
  const db = await connectDb();

  try {
    const tenantResult = await db.query(
      `SELECT id, code, name FROM tenants WHERE code = $1 LIMIT 1;`,
      [tenantCode]
    );

    if (tenantResult.rows.length === 0) {
      console.error(`❌ Tenant with code ${tenantCode} not found.`);
      process.exit(1);
    }

    const tenant = tenantResult.rows[0];
    console.log(
      `\n📛 Cleaning up demo price agreements for tenant: ${tenant.name} (${tenant.code}) [id=${tenant.id}]`
    );

    // Show current counts
    const beforeResult = await db.query(
      `
        SELECT
          COUNT(*) FILTER (WHERE notes ILIKE '%Auto-generated from pricing run%')::int AS auto_generated,
          COUNT(*) FILTER (WHERE notes IS NULL OR notes NOT ILIKE '%Auto-generated from pricing run%')::int AS non_auto,
          COUNT(*)::int AS total
        FROM price_agreements
        WHERE tenant_id = $1;
      `,
      [tenant.id]
    );

    const before = beforeResult.rows[0];
    console.log('\n📊 Before cleanup:');
    console.log(`  • Total agreements:       ${before.total}`);
    console.log(`  • Auto-generated (keep):  ${before.auto_generated}`);
    console.log(`  • Non-auto (demo/legacy): ${before.non_auto}`);

    if (before.total === 0) {
      console.log('\nℹ️  No price agreements found for this tenant. Nothing to delete.');
      return;
    }

    // Delete non-auto-generated agreements
    console.log('\n🧹 Deleting non-auto-generated agreements...');
    const deleteResult = await db.query(
      `
        DELETE FROM price_agreements
        WHERE tenant_id = $1
          AND (notes IS NULL OR notes NOT ILIKE '%Auto-generated from pricing run%');
      `,
      [tenant.id]
    );

    console.log(`  • Deleted ${deleteResult.rowCount || 0} agreement(s).`);

    // Show after counts
    const afterResult = await db.query(
      `
        SELECT
          COUNT(*) FILTER (WHERE notes ILIKE '%Auto-generated from pricing run%')::int AS auto_generated,
          COUNT(*) FILTER (WHERE notes IS NULL OR notes NOT ILIKE '%Auto-generated from pricing run%')::int AS non_auto,
          COUNT(*)::int AS total
        FROM price_agreements
        WHERE tenant_id = $1;
      `,
      [tenant.id]
    );

    const after = afterResult.rows[0];
    console.log('\n📊 After cleanup:');
    console.log(`  • Total agreements:       ${after.total}`);
    console.log(`  • Auto-generated (keep):  ${after.auto_generated}`);
    console.log(`  • Non-auto (demo/legacy): ${after.non_auto}`);

    console.log(
      '\n✅ Demo/legacy price agreements removed. Dashboard should now only show auto-generated agreements for this tenant.'
    );
  } catch (error) {
    console.error('\n❌ Failed to clean up demo price agreements:', error.message);
    throw error;
  } finally {
    if (db && typeof db.end === 'function') {
      await db.end();
    }
  }
}

if (require.main === module) {
  cleanupDemoAgreements()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}


