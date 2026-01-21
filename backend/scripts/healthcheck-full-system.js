/**
 * Comprehensive System Health Check
 * Verifies that the entire SmartMetal CPQ system is operational
 *
 * Usage: node scripts/healthcheck-full-system.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { Pool } = require('pg');

const TESTS = [];
const RESULTS = {
  passed: [],
  failed: [],
  warnings: [],
};

function test(name, fn) {
  TESTS.push({ name, fn });
}

function pass(name, details = '') {
  RESULTS.passed.push({ name, details });
  console.log(`  ✅ ${name}`);
  if (details) console.log(`     ${details}`);
}

function fail(name, error) {
  RESULTS.failed.push({ name, error });
  console.log(`  ❌ ${name}`);
  console.log(`     Error: ${error}`);
}

function warn(name, message) {
  RESULTS.warnings.push({ name, message });
  console.log(`  ⚠️  ${name}`);
  console.log(`     Warning: ${message}`);
}

// ============================================================================
// DATABASE TESTS
// ============================================================================

test('Database Connection - Migration User', async () => {
  const pool = new Pool({ connectionString: process.env.MIGRATION_DATABASE_URL });
  try {
    const result = await pool.query('SELECT current_user, version()');
    const user = result.rows[0].current_user;
    const version = result.rows[0].version;
    await pool.end();

    if (user !== 'postgres') {
      warn('Database Connection - Migration User', `Expected 'postgres', got '${user}'`);
    } else {
      pass('Database Connection - Migration User', `Connected as ${user}`);
    }
  } catch (error) {
    fail('Database Connection - Migration User', error.message);
  }
});

test('Database Connection - Runtime User', async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const result = await pool.query('SELECT current_user');
    const user = result.rows[0].current_user;
    await pool.end();

    if (user !== 'smartmetal_app') {
      warn('Database Connection - Runtime User', `Expected 'smartmetal_app', got '${user}'`);
    } else {
      pass('Database Connection - Runtime User', `Connected as ${user}`);
    }
  } catch (error) {
    fail('Database Connection - Runtime User', error.message);
  }
});

test('Critical Tables Exist', async () => {
  const pool = new Pool({ connectionString: process.env.MIGRATION_DATABASE_URL });
  try {
    const tables = [
      'tenants', 'users', 'rfqs', 'rfq_items', 'pricing_runs',
      'pricing_run_items', 'price_agreements', 'materials', 'suppliers'
    ];

    const result = await pool.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = ANY($1)`,
      [tables]
    );

    const existing = result.rows.map(r => r.table_name);
    const missing = tables.filter(t => !existing.includes(t));

    await pool.end();

    if (missing.length > 0) {
      fail('Critical Tables Exist', `Missing tables: ${missing.join(', ')}`);
    } else {
      pass('Critical Tables Exist', `All ${tables.length} critical tables found`);
    }
  } catch (error) {
    fail('Critical Tables Exist', error.message);
  }
});

test('Migration 074 Workbench Fields', async () => {
  const pool = new Pool({ connectionString: process.env.MIGRATION_DATABASE_URL });
  try {
    const itemFields = await pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'rfq_items'
       AND column_name IN ('needs_review', 'quantity_source', 'confidence', 'supplier_options', 'supplier_selected_option')`
    );

    const pricingFields = await pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'pricing_runs'
       AND column_name IN ('is_locked', 'locked_at', 'locked_by')`
    );

    await pool.end();

    if (itemFields.rows.length < 5) {
      fail('Migration 074 Workbench Fields', `rfq_items missing ${5 - itemFields.rows.length} columns`);
    } else if (pricingFields.rows.length < 3) {
      fail('Migration 074 Workbench Fields', `pricing_runs missing ${3 - pricingFields.rows.length} columns`);
    } else {
      pass('Migration 074 Workbench Fields', 'All workbench columns exist');
    }
  } catch (error) {
    fail('Migration 074 Workbench Fields', error.message);
  }
});

test('RLS Policies Active', async () => {
  const pool = new Pool({ connectionString: process.env.MIGRATION_DATABASE_URL });
  try {
    const result = await pool.query(
      `SELECT tablename, rowsecurity
       FROM pg_tables
       WHERE schemaname = 'public'
       AND tablename IN ('rfqs', 'rfq_items', 'pricing_runs')
       AND rowsecurity = true`
    );

    await pool.end();

    if (result.rows.length < 3) {
      warn('RLS Policies Active', `Only ${result.rows.length}/3 tables have RLS enabled`);
    } else {
      pass('RLS Policies Active', 'RLS enabled on critical tables');
    }
  } catch (error) {
    fail('RLS Policies Active', error.message);
  }
});

// ============================================================================
// DATA INTEGRITY TESTS
// ============================================================================

test('Test Tenant Exists', async () => {
  const pool = new Pool({ connectionString: process.env.MIGRATION_DATABASE_URL });
  try {
    const result = await pool.query(
      `SELECT id, name, tenant_code, is_active FROM tenants WHERE is_active = true LIMIT 1`
    );

    await pool.end();

    if (result.rows.length === 0) {
      fail('Test Tenant Exists', 'No active tenants found. Run seedTenantsAndUsers.js');
    } else {
      const tenant = result.rows[0];
      pass('Test Tenant Exists', `Found tenant: ${tenant.name} (${tenant.tenant_code})`);
    }
  } catch (error) {
    fail('Test Tenant Exists', error.message);
  }
});

test('Test RFQ Data Exists', async () => {
  const pool = new Pool({ connectionString: process.env.MIGRATION_DATABASE_URL });
  try {
    const rfqCount = await pool.query(`SELECT COUNT(*) FROM rfqs`);
    const itemCount = await pool.query(`SELECT COUNT(*) FROM rfq_items`);

    await pool.end();

    const rfqs = parseInt(rfqCount.rows[0].count);
    const items = parseInt(itemCount.rows[0].count);

    if (rfqs === 0) {
      warn('Test RFQ Data Exists', 'No RFQs found. System needs seed data.');
    } else {
      pass('Test RFQ Data Exists', `${rfqs} RFQs, ${items} items`);
    }
  } catch (error) {
    fail('Test RFQ Data Exists', error.message);
  }
});

test('Materials Catalog Populated', async () => {
  const pool = new Pool({ connectionString: process.env.MIGRATION_DATABASE_URL });
  try {
    const result = await pool.query(`SELECT COUNT(*) FROM materials`);
    const count = parseInt(result.rows[0].count);

    await pool.end();

    if (count === 0) {
      warn('Materials Catalog Populated', 'Materials catalog empty. Run seed scripts.');
    } else {
      pass('Materials Catalog Populated', `${count} materials in catalog`);
    }
  } catch (error) {
    fail('Materials Catalog Populated', error.message);
  }
});

test('Price Agreements Exist', async () => {
  const pool = new Pool({ connectionString: process.env.MIGRATION_DATABASE_URL });
  try {
    const result = await pool.query(`SELECT COUNT(*) FROM price_agreements`);
    const count = parseInt(result.rows[0].count);

    await pool.end();

    if (count === 0) {
      warn('Price Agreements Exist', 'No price agreements. Pricing may not work.');
    } else {
      pass('Price Agreements Exist', `${count} price agreements configured`);
    }
  } catch (error) {
    fail('Price Agreements Exist', error.message);
  }
});

// ============================================================================
// SERVICE LAYER TESTS
// ============================================================================

test('pricingService.assertRfqNotLocked exists', async () => {
  try {
    const pricingService = require('../src/services/pricingService');
    if (typeof pricingService.assertRfqNotLocked !== 'function') {
      fail('pricingService.assertRfqNotLocked exists', 'Function not exported');
    } else {
      pass('pricingService.assertRfqNotLocked exists', 'Lock immutability helper available');
    }
  } catch (error) {
    fail('pricingService.assertRfqNotLocked exists', error.message);
  }
});

test('rfqService exports critical functions', async () => {
  try {
    const rfqService = require('../src/services/rfqService');
    const required = ['getAllRfqs', 'getRfqById', 'createRfqFromPayload', 'updateRfqItem', 'updateRfqItemSupplierSelection'];
    const missing = required.filter(fn => typeof rfqService[fn] !== 'function');

    if (missing.length > 0) {
      fail('rfqService exports critical functions', `Missing: ${missing.join(', ')}`);
    } else {
      pass('rfqService exports critical functions', `All ${required.length} functions exported`);
    }
  } catch (error) {
    fail('rfqService exports critical functions', error.message);
  }
});

test('pricingService exports critical functions', async () => {
  try {
    const pricingService = require('../src/services/pricingService');
    const required = ['createPriceRunForRfq', 'getPricingRunById', 'lockPricingRun', 'assertRfqNotLocked'];
    const missing = required.filter(fn => typeof pricingService[fn] !== 'function');

    if (missing.length > 0) {
      fail('pricingService exports critical functions', `Missing: ${missing.join(', ')}`);
    } else {
      pass('pricingService exports critical functions', `All ${required.length} functions exported`);
    }
  } catch (error) {
    fail('pricingService exports critical functions', error.message);
  }
});

// ============================================================================
// API ROUTE TESTS
// ============================================================================

test('Express App Loads', async () => {
  try {
    const app = require('../src/app');
    if (!app) {
      fail('Express App Loads', 'app.js did not export Express instance');
    } else {
      pass('Express App Loads', 'Express app loaded successfully');
    }
  } catch (error) {
    fail('Express App Loads', error.message);
  }
});

test('Critical Routes Registered', async () => {
  try {
    const app = require('../src/app');
    const routes = app._router.stack
      .filter(r => r.route)
      .map(r => `${Object.keys(r.route.methods)[0].toUpperCase()} ${r.route.path}`);

    const apiRoutes = app._router.stack
      .filter(r => r.name === 'router' && r.regexp.toString().includes('api'))
      .map(r => r.handle.stack || [])
      .flat()
      .filter(r => r.route)
      .map(r => `${Object.keys(r.route.methods)[0].toUpperCase()} ${r.route.path}`);

    if (routes.length === 0 && apiRoutes.length === 0) {
      warn('Critical Routes Registered', 'No routes detected. May need server start.');
    } else {
      pass('Critical Routes Registered', `${routes.length + apiRoutes.length} routes registered`);
    }
  } catch (error) {
    warn('Critical Routes Registered', error.message);
  }
});

// ============================================================================
// ENVIRONMENT CONFIGURATION TESTS
// ============================================================================

test('Environment Variables Set', async () => {
  const required = [
    'DATABASE_URL',
    'MIGRATION_DATABASE_URL',
    'PORT',
    'NODE_ENV'
  ];

  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    fail('Environment Variables Set', `Missing: ${missing.join(', ')}`);
  } else {
    pass('Environment Variables Set', 'All required env vars configured');
  }
});

test('Database URLs Different', async () => {
  const dbUrl = process.env.DATABASE_URL;
  const migUrl = process.env.MIGRATION_DATABASE_URL;

  if (!dbUrl || !migUrl) {
    fail('Database URLs Different', 'One or both URLs not set');
  } else if (dbUrl === migUrl) {
    warn('Database URLs Different', 'Using same URL for both (acceptable for dev)');
  } else {
    // Check if using different roles
    const dbUser = dbUrl.match(/\/\/([^:]+):/)?.[1];
    const migUser = migUrl.match(/\/\/([^:]+):/)?.[1];

    if (dbUser === migUser) {
      warn('Database URLs Different', `Both using same user: ${dbUser}`);
    } else {
      pass('Database URLs Different', `Runtime: ${dbUser}, Migration: ${migUser}`);
    }
  }
});

test('Azure/GCP AI Configuration', async () => {
  const hasAzure = process.env.AZURE_OPENAI_API_KEY && process.env.AZURE_OPENAI_ENDPOINT;
  const hasGcp = process.env.GCP_PROJECT_ID;

  if (!hasAzure && !hasGcp) {
    warn('Azure/GCP AI Configuration', 'No AI provider configured. OCR/extraction will fail.');
  } else if (hasAzure) {
    pass('Azure/GCP AI Configuration', 'Azure OpenAI configured');
  } else {
    pass('Azure/GCP AI Configuration', 'GCP configured');
  }
});

// ============================================================================
// WORKBENCH-SPECIFIC TESTS
// ============================================================================

test('Workbench Lock Enforcement (Unit)', async () => {
  const pool = new Pool({ connectionString: process.env.MIGRATION_DATABASE_URL });
  try {
    // Find an RFQ with a locked pricing run
    const result = await pool.query(`
      SELECT r.id AS rfq_id, r.tenant_id, pr.id AS pricing_run_id
      FROM rfqs r
      JOIN pricing_runs pr ON r.id = pr.rfq_id
      WHERE pr.is_locked = true
      LIMIT 1
    `);

    if (result.rows.length === 0) {
      warn('Workbench Lock Enforcement (Unit)', 'No locked pricing runs to test against');
      await pool.end();
      return;
    }

    const { rfq_id, tenant_id } = result.rows[0];

    // Test the assertRfqNotLocked function
    const { assertRfqNotLocked } = require('../src/services/pricingService');

    try {
      await assertRfqNotLocked(rfq_id, tenant_id);
      fail('Workbench Lock Enforcement (Unit)', 'Should have thrown PRICING_RUN_LOCKED');
    } catch (error) {
      if (error.code === 'PRICING_RUN_LOCKED') {
        pass('Workbench Lock Enforcement (Unit)', 'Lock check works correctly');
      } else {
        fail('Workbench Lock Enforcement (Unit)', `Unexpected error: ${error.message}`);
      }
    }

    await pool.end();
  } catch (error) {
    await pool.end();
    fail('Workbench Lock Enforcement (Unit)', error.message);
  }
});

test('Gate 1: Needs Review Enforcement', async () => {
  try {
    const { validatePricingRunPreflight } = require('../src/services/pricingService');

    // This is a smoke test - actual behavior tested via integration
    if (typeof validatePricingRunPreflight !== 'function') {
      warn('Gate 1: Needs Review Enforcement', 'Preflight validation not exported');
    } else {
      pass('Gate 1: Needs Review Enforcement', 'Preflight validation available');
    }
  } catch (error) {
    warn('Gate 1: Needs Review Enforcement', error.message);
  }
});

// ============================================================================
// RUN ALL TESTS
// ============================================================================

async function runAllTests() {
  console.log('='.repeat(80));
  console.log('SMARTMETAL CPQ - COMPREHENSIVE SYSTEM HEALTH CHECK');
  console.log('='.repeat(80));
  console.log('');

  console.log(`Running ${TESTS.length} tests...\n`);

  for (const { name, fn } of TESTS) {
    console.log(`\n🔍 ${name}`);
    try {
      await fn();
    } catch (error) {
      fail(name, `Unexpected error: ${error.message}`);
    }
  }

  // Summary
  console.log('');
  console.log('='.repeat(80));
  console.log('HEALTH CHECK SUMMARY');
  console.log('='.repeat(80));
  console.log('');

  console.log(`✅ Passed:   ${RESULTS.passed.length}/${TESTS.length}`);
  console.log(`❌ Failed:   ${RESULTS.failed.length}/${TESTS.length}`);
  console.log(`⚠️  Warnings: ${RESULTS.warnings.length}/${TESTS.length}`);
  console.log('');

  if (RESULTS.failed.length > 0) {
    console.log('='.repeat(80));
    console.log('CRITICAL FAILURES');
    console.log('='.repeat(80));
    RESULTS.failed.forEach(({ name, error }) => {
      console.log(`\n❌ ${name}`);
      console.log(`   ${error}`);
    });
    console.log('');
  }

  if (RESULTS.warnings.length > 0) {
    console.log('='.repeat(80));
    console.log('WARNINGS (Non-blocking)');
    console.log('='.repeat(80));
    RESULTS.warnings.forEach(({ name, message }) => {
      console.log(`\n⚠️  ${name}`);
      console.log(`   ${message}`);
    });
    console.log('');
  }

  // Overall verdict
  console.log('='.repeat(80));
  console.log('VERDICT');
  console.log('='.repeat(80));

  const passRate = (RESULTS.passed.length / TESTS.length) * 100;

  if (RESULTS.failed.length === 0) {
    console.log(`\n✅ SYSTEM HEALTHY (${passRate.toFixed(0)}% pass rate)`);
    console.log('\nAll critical systems operational.');
    if (RESULTS.warnings.length > 0) {
      console.log(`${RESULTS.warnings.length} warnings detected - review above.`);
    }
  } else if (RESULTS.failed.length <= 3) {
    console.log(`\n⚠️  SYSTEM DEGRADED (${passRate.toFixed(0)}% pass rate)`);
    console.log(`\n${RESULTS.failed.length} critical failures detected.`);
    console.log('Review failures above and fix before deployment.');
  } else {
    console.log(`\n❌ SYSTEM UNSTABLE (${passRate.toFixed(0)}% pass rate)`);
    console.log(`\n${RESULTS.failed.length} critical failures detected.`);
    console.log('System requires significant fixes. Not production-ready.');
  }

  console.log('');
  console.log('='.repeat(80));

  process.exit(RESULTS.failed.length > 0 ? 1 : 0);
}

runAllTests();
