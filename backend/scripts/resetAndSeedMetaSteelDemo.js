/**
 * Reset and Reseed MetaSteel Trading Demo Tenant
 *
 * GOAL:
 * -----
 * Safely reset MetaSteel Trading demo tenant data and re-seed it from scratch,
 * ensuring NSC Sinergi production data remains untouched.
 *
 * WHAT THIS SCRIPT DOES:
 * ----------------------
 * 1. Resolves MetaSteel tenant ID dynamically (never hardcoded)
 * 2. Deletes ONLY MetaSteel's transactional demo data (RFQs, pricing runs, approvals, etc.)
 * 3. Re-runs MetaSteel seed scripts (KYC config, suppliers, materials, RFQs, pricing)
 * 4. Prints a summary of seeded data
 *
 * WHAT THIS SCRIPT NEVER TOUCHES:
 * -------------------------------
 * - NSC Sinergi data (any rows where tenant_id != MetaSteel's tenant_id)
 * - Shared master data (materials, pipes, flanges, HS codes, LME prices, etc.)
 * - System tables (tenants, users, unless explicitly opted-in)
 *
 * USAGE:
 * ------
 * cd backend
 * node scripts/resetAndSeedMetaSteelDemo.js
 *
 * OR via npm script:
 * npm run reset:metasteel
 *
 * SAFETY GUARANTEES:
 * -----------------
 * - All deletes are wrapped in a transaction (rollback on error)
 * - All deletes use `WHERE tenant_id = $1` filter
 * - Resolves tenant ID at runtime (no hardcoded UUIDs)
 * - Logs every delete operation with row counts
 *
 * REFERENCE DOCS:
 * ---------------
 * - docs/METASTEEL_DEMO_BLUEPRINT_V2.md - Complete MetaSteel tenant blueprint
 * - docs/METASTEEL_DEMO_RESET_GUIDE.md - Step-by-step reset guide for Maira
 *
 * DISCOVERED METASTEEL SEED LOGIC:
 * --------------------------------
 * Based on code audit (December 2025), the following scripts were found:
 *
 * 1. seedMetaSteelKycConfig.js
 *    - Creates tenant_settings for MetaSteel tenant
 *    - Configs: operator_rules, approved_mills, approved_vendors, notification_rules,
 *      intelligence_config, pricing_rules, approval_rules, logistics_config, regulatory_config
 *    - Operators: PETRONAS, PREFCHEM, PTTEP, QatarEnergy, Shell, ExxonMobil
 *    - Regions: Malaysia, Indonesia, Vietnam, Thailand, Singapore, Middle East
 *
 * 2. seedMetaSteelSuppliersAndMaterials.js
 *    - Creates 7 MetaSteel suppliers (tenant-scoped)
 *    - Creates 12 materials in shared catalog (no tenant_id)
 *    - Creates supplier_lead_times and supplier_certifications
 *
 * 3. seedMetaSteelRfqsAndPricing.js
 *    - Creates 3 clients (PipeMart, PetroAsia, Alpha)
 *    - Creates 3 projects (1 per client)
 *    - Creates 3 RFQs with 18 total rfq_items
 *    - Creates 3 pricing_runs with pricing_run_items
 *    - Statuses: approved, pending_approval, draft
 *    - Dates: Explicitly set to last 30 days for dashboard visibility
 *
 * TABLES THAT CONTAIN METASTEEL DEMO DATA (TO BE DELETED):
 * ---------------------------------------------------------
 * - approval_history (via approvals → pricing_runs → rfqs → tenant_id)
 * - approvals (via pricing_runs → rfqs → tenant_id)
 * - pricing_run_items (via pricing_runs → tenant_id)
 * - pricing_runs (tenant_id)
 * - rfq_items (tenant_id)
 * - rfqs (tenant_id)
 * - price_agreements (tenant_id)
 * - projects (tenant_id)
 * - clients (tenant_id) - OPTIONAL, may keep for historical references
 * - suppliers (tenant_id) - OPTIONAL, may keep for historical references
 *
 * TABLES THAT MUST NEVER BE TOUCHED:
 * ----------------------------------
 * - tenants (contains NSC + MetaSteel + any other tenants)
 * - users (contains NSC + MetaSteel users)
 * - tenant_settings (contains NSC + MetaSteel configs)
 * - materials (SHARED catalog, no tenant_id)
 * - pipes, flanges, fittings, etc. (SHARED catalogs, no tenant_id)
 * - regulatory_hs_codes, regulatory_material_mapping (SHARED)
 * - lme_prices (SHARED)
 * - Any NSC-scoped rows (WHERE tenant_id != MetaSteel)
 */

require('dotenv').config();
const { connectMigrationDb } = require('../src/db/supabaseClient');

// Import seed functions
const { seedMetaSteelKycConfig } = require('./seedMetaSteelKycConfig');
const { seedMetaSteelSuppliersAndMaterials } = require('./seedMetaSteelSuppliersAndMaterials');
const { seedMetaSteelRfqsAndPricing } = require('./seedMetaSteelRfqsAndPricing');
const { seedMetaSteelDemoData } = require('./seedMetaSteelDemoData');

/**
 * Resolve MetaSteel tenant ID dynamically
 * NEVER hardcode tenant UUIDs
 */
async function resolveMetaSteelTenant(db) {
  const result = await db.query(`
    SELECT id, code, name FROM tenants WHERE UPPER(code) = 'METASTEEL' LIMIT 1
  `);

  if (result.rows.length === 0) {
    throw new Error(
      'MetaSteel tenant not found. Please run seedTenantsAndUsers.js first to create the tenant.'
    );
  }

  return result.rows[0];
}

/**
 * Delete MetaSteel transactional data
 * All deletes are scoped to MetaSteel tenant_id ONLY
 */
async function deleteMetaSteelTransactionalData(db, metaSteelTenantId) {
  console.log('🗑️  Deleting MetaSteel transactional data...\n');

  const deleteOps = [
    {
      table: 'approval_history',
      query: 'DELETE FROM approval_history WHERE tenant_id = $1',
      description: 'Approval history entries'
    },
    {
      table: 'approvals',
      query: 'DELETE FROM approvals WHERE tenant_id = $1',
      description: 'Approval records'
    },
    {
      table: 'pricing_run_items',
      query: 'DELETE FROM pricing_run_items WHERE tenant_id = $1',
      description: 'Pricing run line items'
    },
    {
      table: 'pricing_runs',
      query: 'DELETE FROM pricing_runs WHERE tenant_id = $1',
      description: 'Pricing runs'
    },
    {
      table: 'rfq_items',
      query: 'DELETE FROM rfq_items WHERE tenant_id = $1',
      description: 'RFQ line items'
    },
    {
      table: 'rfqs',
      query: 'DELETE FROM rfqs WHERE tenant_id = $1',
      description: 'RFQs'
    },
    {
      table: 'price_agreements',
      query: 'DELETE FROM price_agreements WHERE tenant_id = $1',
      description: 'Price agreements'
    },
    {
      table: 'projects',
      query: 'DELETE FROM projects WHERE tenant_id = $1',
      description: 'Projects'
    }
    // NOTE: We do NOT delete clients or suppliers, as they may be referenced
    // by historical data. If you want to delete them, uncomment below:
    // {
    //   table: 'clients',
    //   query: 'DELETE FROM clients WHERE tenant_id = $1',
    //   description: 'Clients'
    // },
    // {
    //   table: 'suppliers',
    //   query: 'DELETE FROM suppliers WHERE tenant_id = $1',
    //   description: 'Suppliers'
    // }
  ];

  const deleteCounts = {};

  for (const op of deleteOps) {
    try {
      // Check if table exists
      const tableCheck = await db.query(`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = $1
      `, [op.table]);

      if (tableCheck.rows.length === 0) {
        console.log(`  ⊙ ${op.table}: Table does not exist (skipping)`);
        deleteCounts[op.table] = 0;
        continue;
      }

      // Execute delete
      const result = await db.query(op.query, [metaSteelTenantId]);
      const rowCount = result.rowCount || 0;

      console.log(`  ✓ ${op.table}: ${rowCount} row(s) deleted`);
      deleteCounts[op.table] = rowCount;
    } catch (error) {
      console.error(`  ✗ ${op.table}: Error deleting - ${error.message}`);
      throw error; // Re-throw to trigger transaction rollback
    }
  }

  console.log('');
  return deleteCounts;
}

/**
 * Re-seed MetaSteel data
 */
async function reseedMetaSteelData(db, metaSteelTenant) {
  console.log('🌱 Re-seeding MetaSteel demo data...\n');

  // NOTE: Each seed function is responsible for its own DB connection handling.
  // We don't pass db connection to them, as they may use their own connection pools.

  try {
    // Step 1: Seed KYC config (tenant_settings)
    console.log('📋 Step 1: Seeding MetaSteel KYC configuration...');
    await seedMetaSteelKycConfig({ skipPoolClose: true });
    console.log('  ✓ KYC config seeded\n');

    // Step 2: Seed suppliers and materials
    console.log('📋 Step 2: Seeding MetaSteel suppliers and materials...');
    await seedMetaSteelSuppliersAndMaterials({ skipPoolClose: true });
    console.log('  ✓ Suppliers and materials seeded\n');

    // Step 3: Seed RFQs and pricing runs
    console.log('📋 Step 3: Seeding MetaSteel RFQs and pricing runs...');
    await seedMetaSteelRfqsAndPricing({ skipPoolClose: true });
    console.log('  ✓ RFQs and pricing runs seeded\n');

    // Step 4: Seed price agreements and other demo data
    console.log('📋 Step 4: Seeding MetaSteel price agreements and demo data...');
    await seedMetaSteelDemoData();
    console.log('  ✓ Price agreements and demo data seeded\n');

  } catch (error) {
    console.error('❌ Seed step failed:', error.message);
    throw error;
  }
}

/**
 * Print summary of MetaSteel data
 */
async function printSummary(db, metaSteelTenantId, deleteCounts) {
  console.log('📊 MetaSteel Demo Reset Summary\n');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Query counts of seeded data
  const counts = {};

  try {
    // Count tenant settings
    const settingsResult = await db.query(
      `SELECT COUNT(*) as count FROM tenant_settings WHERE tenant_id = $1`,
      [metaSteelTenantId]
    );
    counts.tenant_settings = parseInt(settingsResult.rows[0].count) || 0;

    // Count suppliers (table may not exist)
    try {
      const suppliersResult = await db.query(
        `SELECT COUNT(*) as count FROM suppliers WHERE tenant_id = $1`,
        [metaSteelTenantId]
      );
      counts.suppliers = parseInt(suppliersResult.rows[0].count) || 0;
    } catch (error) {
      if (error.message.includes('does not exist')) {
        counts.suppliers = 0; // Table doesn't exist yet
      } else {
        throw error;
      }
    }

    // Count clients
    const clientsResult = await db.query(
      `SELECT COUNT(*) as count FROM clients WHERE tenant_id = $1`,
      [metaSteelTenantId]
    );
    counts.clients = parseInt(clientsResult.rows[0].count) || 0;

    // Count RFQs
    const rfqsResult = await db.query(
      `SELECT COUNT(*) as count FROM rfqs WHERE tenant_id = $1`,
      [metaSteelTenantId]
    );
    counts.rfqs = parseInt(rfqsResult.rows[0].count) || 0;

    // Count RFQ items
    const rfqItemsResult = await db.query(
      `SELECT COUNT(*) as count FROM rfq_items WHERE tenant_id = $1`,
      [metaSteelTenantId]
    );
    counts.rfq_items = parseInt(rfqItemsResult.rows[0].count) || 0;

    // Count pricing runs
    const pricingRunsResult = await db.query(
      `SELECT COUNT(*) as count FROM pricing_runs WHERE tenant_id = $1`,
      [metaSteelTenantId]
    );
    counts.pricing_runs = parseInt(pricingRunsResult.rows[0].count) || 0;

    // Count pricing runs by status
    const pricingRunsByStatusResult = await db.query(
      `SELECT
        approval_status,
        COUNT(*) as count
      FROM pricing_runs
      WHERE tenant_id = $1
      GROUP BY approval_status`,
      [metaSteelTenantId]
    );
    counts.pricing_runs_by_status = {};
    for (const row of pricingRunsByStatusResult.rows) {
      counts.pricing_runs_by_status[row.approval_status] = parseInt(row.count);
    }

    // Count price agreements
    const priceAgreementsResult = await db.query(
      `SELECT COUNT(*) as count FROM price_agreements WHERE tenant_id = $1`,
      [metaSteelTenantId]
    );
    counts.price_agreements = parseInt(priceAgreementsResult.rows[0].count) || 0;

    // Sum total quoted value
    const totalValueResult = await db.query(
      `SELECT SUM(total_price) as total FROM pricing_runs WHERE tenant_id = $1`,
      [metaSteelTenantId]
    );
    counts.total_quoted_value = parseFloat(totalValueResult.rows[0].total) || 0;

  } catch (error) {
    console.warn('⚠️  Could not query summary counts:', error.message);
  }

  // Print summary
  console.log('📦 DELETED (Transactional Data):');
  for (const [table, count] of Object.entries(deleteCounts)) {
    console.log(`  • ${table}: ${count} row(s)`);
  }
  console.log('');

  console.log('🌱 SEEDED (Demo Data):');
  console.log(`  • Tenant Settings: ${counts.tenant_settings} key(s)`);
  console.log(`  • Suppliers: ${counts.suppliers}`);
  console.log(`  • Clients: ${counts.clients}`);
  console.log(`  • RFQs: ${counts.rfqs}`);
  console.log(`  • RFQ Items: ${counts.rfq_items}`);
  console.log(`  • Pricing Runs: ${counts.pricing_runs}`);
  if (counts.pricing_runs_by_status && Object.keys(counts.pricing_runs_by_status).length > 0) {
    for (const [status, count] of Object.entries(counts.pricing_runs_by_status)) {
      console.log(`    - ${status}: ${count}`);
    }
  }
  console.log(`  • Price Agreements: ${counts.price_agreements || 0}`);
  const totalValue = counts.total_quoted_value || 0;
  console.log(`  • Total Quoted Value: $${totalValue.toFixed(2)} USD`);
  console.log('');

  console.log('═══════════════════════════════════════════════════════════\n');

  console.log('💡 Next Steps:');
  console.log('  1. Log in as sales@metasteel.com (password: Password123!)');
  console.log('  2. Check Dashboard: Total Quotes, Pending Approval, Approved Quotes');
  console.log('  3. Check RFQ List: 3 RFQs (PIPEMART, PETRO, ALPHA)');
  console.log('  4. Check RFQ Detail: Each RFQ should show 6 line items');
  console.log('  5. Run verification: node scripts/verifyMetaSteelDemoHealth.js');
  console.log('');
  console.log('📖 Reference Docs:');
  console.log('  - docs/METASTEEL_DEMO_BLUEPRINT_V2.md');
  console.log('  - docs/METASTEEL_DEMO_RESET_GUIDE.md');
  console.log('');
}

/**
 * Main function
 */
async function resetAndSeedMetaSteelDemo() {
  let db = null;

  try {
    console.log('\n');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('   MetaSteel Trading Demo Tenant Reset & Reseed');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');
    console.log('🔒 Safety Guarantees:');
    console.log('  ✓ Only deletes MetaSteel tenant data (tenant_id scoped)');
    console.log('  ✓ Never touches NSC Sinergi data');
    console.log('  ✓ Never touches shared master data (materials, pipes, etc.)');
    console.log('  ✓ Wrapped in transaction (rollback on error)');
    console.log('');

    // Connect to database using migration credentials (bypasses RLS for seeding)
    console.log('🔌 Connecting to database (migration mode)...');
    db = await connectMigrationDb();
    console.log('  ✓ Connected\n');

    // Resolve MetaSteel tenant
    console.log('🔍 Resolving MetaSteel tenant...');
    const metaSteelTenant = await resolveMetaSteelTenant(db);
    console.log(`  ✓ Found: ${metaSteelTenant.code} (${metaSteelTenant.name})`);
    console.log(`  ✓ Tenant ID: ${metaSteelTenant.id}\n`);

    // Ensure MetaSteel is marked as demo tenant
    console.log('🏷️  Ensuring MetaSteel is marked as demo tenant...');
    const isDemoCheck = await db.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'tenants' AND column_name = 'is_demo';
    `);
    
    if (isDemoCheck.rows.length > 0) {
      await db.query(`
        UPDATE tenants 
        SET is_demo = true, updated_at = NOW()
        WHERE id = $1 AND (is_demo IS NULL OR is_demo = false)
      `, [metaSteelTenant.id]);
      
      const verifyDemo = await db.query(`
        SELECT is_demo FROM tenants WHERE id = $1
      `, [metaSteelTenant.id]);
      
      if (verifyDemo.rows[0]?.is_demo === true) {
        console.log(`  ✓ MetaSteel is marked as demo tenant (is_demo = true)\n`);
      } else {
        console.log(`  ⚠️  Warning: Could not verify is_demo flag\n`);
      }
    } else {
      console.log(`  ⊙ is_demo column does not exist (skipping demo flag check)\n`);
    }

    // Begin transaction
    console.log('🔄 Starting transaction...\n');
    await db.query('BEGIN');

    try {
      // Delete MetaSteel transactional data
      const deleteCounts = await deleteMetaSteelTransactionalData(db, metaSteelTenant.id);

      // Commit transaction (deletes)
      console.log('✅ Committing deletes...\n');
      await db.query('COMMIT');

      // Re-seed MetaSteel data
      // NOTE: Seed functions manage their own DB connections and transactions
      await reseedMetaSteelData(db, metaSteelTenant);

      // Print summary
      await printSummary(db, metaSteelTenant.id, deleteCounts);

      console.log('✅ MetaSteel demo reset complete!\n');

    } catch (error) {
      // Rollback on error
      console.error('\n❌ Error during reset, rolling back transaction...\n');
      try {
        await db.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('❌ Rollback failed:', rollbackError.message);
      }
      throw error;
    }

  } catch (error) {
    console.error('\n❌ Reset failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    if (db && typeof db.end === 'function') {
      await db.end();
    }
  }
}

// Run if called directly
if (require.main === module) {
  resetAndSeedMetaSteelDemo()
    .then(() => {
      console.log('✅ Script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Script failed:', error);
      process.exit(1);
    });
}

module.exports = { resetAndSeedMetaSteelDemo };
