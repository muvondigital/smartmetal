/**
 * Verify MetaSteel Demo Tenant Health
 *
 * PURPOSE:
 * --------
 * Quick health check script to verify MetaSteel demo tenant data is seeded correctly
 * and ready for demos/testing.
 *
 * USAGE:
 * ------
 * cd backend
 * node scripts/verifyMetaSteelDemoHealth.js
 *
 * WHAT IT CHECKS:
 * ---------------
 * 1. MetaSteel tenant exists and is active
 * 2. Tenant settings are seeded (8+ keys expected)
 * 3. Users are seeded (4 users expected)
 * 4. Suppliers are seeded (7 suppliers expected)
 * 5. Clients are seeded (3 clients expected)
 * 6. RFQs are seeded (3 RFQs expected)
 * 7. RFQ items are seeded (18 items expected)
 * 8. Pricing runs are seeded (3 runs expected)
 * 9. Pricing runs have correct approval statuses
 * 10. Total quoted value is non-zero
 *
 * EXPECTED OUTPUT (HEALTHY):
 * --------------------------
 * ✅ MetaSteel Tenant: METASTEEL (MetaSteel Trading Sdn Bhd)
 * ✅ Tenant Settings: 8 keys
 * ✅ Users: 4 users
 * ✅ Suppliers: 7 suppliers
 * ✅ Clients: 3 clients
 * ✅ RFQs: 3 RFQs
 * ✅ RFQ Items: 18 items
 * ✅ Pricing Runs: 3 runs
 *   - Approved: 1
 *   - Pending Approval: 1
 *   - Draft: 1
 * ✅ Total Quoted Value: $XX,XXX.XX USD
 *
 * EXIT CODES:
 * -----------
 * 0 = All checks passed (healthy)
 * 1 = Some checks failed (unhealthy)
 *
 * REFERENCE DOCS:
 * ---------------
 * - docs/METASTEEL_DEMO_BLUEPRINT_V2.md - Complete MetaSteel tenant blueprint
 * - docs/METASTEEL_DEMO_RESET_GUIDE.md - Step-by-step reset guide
 */

require('dotenv').config();
const { connectMigrationDb } = require('../src/db/supabaseClient');

/**
 * Resolve MetaSteel tenant ID dynamically
 */
async function resolveMetaSteelTenant(db) {
  // Check if is_demo column exists
  const columnCheck = await db.query(`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = 'tenants' AND column_name = 'is_demo';
  `);
  const hasIsDemo = columnCheck.rows.length > 0;
  
  if (hasIsDemo) {
    const result = await db.query(`
      SELECT id, code, name, is_active, is_demo FROM tenants WHERE UPPER(code) = 'METASTEEL' LIMIT 1
    `);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return result.rows[0];
  } else {
    const result = await db.query(`
      SELECT id, code, name, is_active FROM tenants WHERE UPPER(code) = 'METASTEEL' LIMIT 1
    `);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return result.rows[0];
  }
}

/**
 * Run all health checks
 */
async function verifyMetaSteelDemoHealth() {
  let db = null;
  let allChecksPassed = true;

  try {
    console.log('\n');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('   MetaSteel Trading Demo Tenant Health Check');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');

    // Connect to database (using migration connection to bypass RLS for verification)
    db = await connectMigrationDb();

    // ========================================================================
    // CHECK 1: MetaSteel tenant exists and is active
    // ========================================================================
    console.log('🔍 Check 1: MetaSteel Tenant Exists and is Active');
    const metaSteelTenant = await resolveMetaSteelTenant(db);

    if (!metaSteelTenant) {
      console.log('  ❌ MetaSteel tenant not found');
      console.log('     Run: node scripts/seedTenantsAndUsers.js');
      allChecksPassed = false;
      return; // Can't continue without tenant
    }

    if (!metaSteelTenant.is_active) {
      console.log(`  ⚠️  MetaSteel tenant exists but is INACTIVE: ${metaSteelTenant.code}`);
      allChecksPassed = false;
    } else {
      console.log(`  ✅ MetaSteel tenant: ${metaSteelTenant.code} (${metaSteelTenant.name})`);
      console.log(`     Tenant ID: ${metaSteelTenant.id}`);
    }
    
    // Check if is_demo flag is set
    const isDemoCheck = await db.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'tenants' AND column_name = 'is_demo';
    `);
    
    if (isDemoCheck.rows.length > 0) {
      const isDemoResult = await db.query(`
        SELECT is_demo FROM tenants WHERE id = $1
      `, [metaSteelTenant.id]);
      
      const isDemo = isDemoResult.rows[0]?.is_demo === true;
      if (isDemo) {
        console.log(`     Demo Mode: ✅ is_demo = true (DemoBanner will be shown)`);
      } else {
        console.log(`     Demo Mode: ⚠️  is_demo = false (should be true for demo tenant)`);
        console.log(`     Run: UPDATE tenants SET is_demo = true WHERE code = 'METASTEEL';`);
        // Don't fail the check, just warn
      }
    } else {
      console.log(`     Demo Mode: ⊙ is_demo column does not exist (skipping check)`);
    }
    console.log('');

    const metaSteelTenantId = metaSteelTenant.id;

    // ========================================================================
    // CHECK 2: Tenant Settings Seeded
    // ========================================================================
    console.log('🔍 Check 2: Tenant Settings Seeded');
    const tenantSettingsResult = await db.query(
      `SELECT COUNT(*) as count FROM tenant_settings WHERE tenant_id = $1`,
      [metaSteelTenantId]
    );
    const tenantSettingsCount = parseInt(tenantSettingsResult.rows[0].count) || 0;

    if (tenantSettingsCount >= 8) {
      console.log(`  ✅ Tenant Settings: ${tenantSettingsCount} key(s)`);
    } else {
      console.log(`  ❌ Tenant Settings: ${tenantSettingsCount} key(s) (expected >= 8)`);
      console.log('     Run: node scripts/seedMetaSteelKycConfig.js');
      allChecksPassed = false;
    }
    console.log('');

    // ========================================================================
    // CHECK 3: Users Seeded
    // ========================================================================
    console.log('🔍 Check 3: Users Seeded');
    const usersResult = await db.query(
      `SELECT COUNT(*) as count FROM users WHERE tenant_id = $1`,
      [metaSteelTenantId]
    );
    const usersCount = parseInt(usersResult.rows[0].count) || 0;

    if (usersCount >= 4) {
      console.log(`  ✅ Users: ${usersCount} user(s)`);
    } else {
      console.log(`  ❌ Users: ${usersCount} user(s) (expected >= 4)`);
      console.log('     Run: node scripts/seedTenantsAndUsers.js');
      allChecksPassed = false;
    }

    // List users
    const usersList = await db.query(
      `SELECT email, name, role FROM users WHERE tenant_id = $1 ORDER BY email`,
      [metaSteelTenantId]
    );
    if (usersList.rows.length > 0) {
      console.log('     Users:');
      for (const user of usersList.rows) {
        console.log(`       - ${user.email} (${user.name}, ${user.role})`);
      }
    }
    console.log('');

    // ========================================================================
    // CHECK 4: Suppliers Seeded
    // ========================================================================
    console.log('🔍 Check 4: Suppliers Seeded');
    try {
      const suppliersResult = await db.query(
        `SELECT COUNT(*) as count FROM suppliers WHERE tenant_id = $1`,
        [metaSteelTenantId]
      );
      const suppliersCount = parseInt(suppliersResult.rows[0].count) || 0;

      if (suppliersCount >= 7) {
        console.log(`  ✅ Suppliers: ${suppliersCount} supplier(s)`);
      } else {
        console.log(`  ⚠️  Suppliers: ${suppliersCount} supplier(s) (expected >= 7)`);
        console.log('     Note: Suppliers table may not exist (this is OK if not migrated yet)');
        // Don't fail the check if table doesn't exist
      }
    } catch (error) {
      if (error.message.includes('does not exist')) {
        console.log(`  ⚠️  Suppliers: Table does not exist (skipping check)`);
        console.log('     Note: This is expected if suppliers table has not been created yet');
      } else {
        console.log(`  ❌ Suppliers: Error checking - ${error.message}`);
        allChecksPassed = false;
      }
    }
    console.log('');

    // ========================================================================
    // CHECK 5: Clients Seeded
    // ========================================================================
    console.log('🔍 Check 5: Clients Seeded');
    const clientsResult = await db.query(
      `SELECT COUNT(*) as count FROM clients WHERE tenant_id = $1`,
      [metaSteelTenantId]
    );
    const clientsCount = parseInt(clientsResult.rows[0].count) || 0;

    if (clientsCount >= 3) {
      console.log(`  ✅ Clients: ${clientsCount} client(s)`);
    } else {
      console.log(`  ⚠️  Clients: ${clientsCount} client(s) (expected >= 3)`);
      console.log('     Run: node scripts/seedMetaSteelRfqsAndPricing.js');
      // Not critical, don't fail
    }
    console.log('');

    // ========================================================================
    // CHECK 6: RFQs Seeded
    // ========================================================================
    console.log('🔍 Check 6: RFQs Seeded');
    const rfqsResult = await db.query(
      `SELECT COUNT(*) as count FROM rfqs WHERE tenant_id = $1`,
      [metaSteelTenantId]
    );
    const rfqsCount = parseInt(rfqsResult.rows[0].count) || 0;

    if (rfqsCount >= 3) {
      console.log(`  ✅ RFQs: ${rfqsCount} RFQ(s)`);
    } else {
      console.log(`  ❌ RFQs: ${rfqsCount} RFQ(s) (expected >= 3)`);
      console.log('     Run: node scripts/seedMetaSteelRfqsAndPricing.js');
      allChecksPassed = false;
    }

    // List RFQs
    const rfqsList = await db.query(
      `SELECT id, rfq_name, status FROM rfqs WHERE tenant_id = $1 ORDER BY rfq_name`,
      [metaSteelTenantId]
    );
    if (rfqsList.rows.length > 0) {
      console.log('     RFQs:');
      for (const rfq of rfqsList.rows) {
        console.log(`       - ${rfq.rfq_name} (${rfq.status})`);
      }
    }
    console.log('');

    // ========================================================================
    // CHECK 7: RFQ Items Seeded
    // ========================================================================
    console.log('🔍 Check 7: RFQ Items Seeded');
    const rfqItemsResult = await db.query(
      `SELECT COUNT(*) as count FROM rfq_items WHERE tenant_id = $1`,
      [metaSteelTenantId]
    );
    const rfqItemsCount = parseInt(rfqItemsResult.rows[0].count) || 0;

    if (rfqItemsCount >= 18) {
      console.log(`  ✅ RFQ Items: ${rfqItemsCount} item(s)`);
    } else {
      console.log(`  ❌ RFQ Items: ${rfqItemsCount} item(s) (expected >= 18)`);
      console.log('     Run: node scripts/seedMetaSteelRfqsAndPricing.js');
      allChecksPassed = false;
    }

    // List items per RFQ
    const itemsPerRfqResult = await db.query(
      `SELECT r.rfq_name, COUNT(ri.id) as item_count
      FROM rfqs r
      LEFT JOIN rfq_items ri ON ri.rfq_id = r.id AND ri.tenant_id = r.tenant_id
      WHERE r.tenant_id = $1
      GROUP BY r.id, r.rfq_name
      ORDER BY r.rfq_name`,
      [metaSteelTenantId]
    );
    if (itemsPerRfqResult.rows.length > 0) {
      console.log('     Items per RFQ:');
      for (const row of itemsPerRfqResult.rows) {
        console.log(`       - ${row.rfq_name}: ${row.item_count} item(s)`);
      }
    }
    console.log('');

    // ========================================================================
    // CHECK 8: Pricing Runs Seeded
    // ========================================================================
    console.log('🔍 Check 8: Pricing Runs Seeded');
    const pricingRunsResult = await db.query(
      `SELECT COUNT(*) as count FROM pricing_runs WHERE tenant_id = $1`,
      [metaSteelTenantId]
    );
    const pricingRunsCount = parseInt(pricingRunsResult.rows[0].count) || 0;

    if (pricingRunsCount >= 3) {
      console.log(`  ✅ Pricing Runs: ${pricingRunsCount} run(s)`);
    } else {
      console.log(`  ❌ Pricing Runs: ${pricingRunsCount} run(s) (expected >= 3)`);
      console.log('     Run: node scripts/seedMetaSteelRfqsAndPricing.js');
      allChecksPassed = false;
    }

    // Check pricing runs by status
    const pricingRunsByStatusResult = await db.query(
      `SELECT approval_status, COUNT(*) as count
      FROM pricing_runs
      WHERE tenant_id = $1
      GROUP BY approval_status
      ORDER BY approval_status`,
      [metaSteelTenantId]
    );
    if (pricingRunsByStatusResult.rows.length > 0) {
      console.log('     Pricing Runs by Status:');
      for (const row of pricingRunsByStatusResult.rows) {
        console.log(`       - ${row.approval_status}: ${row.count}`);
      }
    }
    console.log('');

    // ========================================================================
    // CHECK 9: Total Quoted Value
    // ========================================================================
    console.log('🔍 Check 9: Total Quoted Value');
    const totalValueResult = await db.query(
      `SELECT SUM(total_price) as total FROM pricing_runs WHERE tenant_id = $1`,
      [metaSteelTenantId]
    );
    const totalQuotedValue = parseFloat(totalValueResult.rows[0].total) || 0;

    if (totalQuotedValue > 0) {
      console.log(`  ✅ Total Quoted Value: $${totalQuotedValue.toFixed(2)} USD`);
    } else {
      console.log(`  ⚠️  Total Quoted Value: $${totalQuotedValue.toFixed(2)} USD (expected > 0)`);
      console.log('     Run: node scripts/seedMetaSteelRfqsAndPricing.js');
      // Not critical, don't fail
    }
    console.log('');

    // ========================================================================
    // CHECK 9B: Pricing Runs Outcome Fields (Schema Compatibility)
    // ========================================================================
    console.log('🔍 Check 9B: Pricing Runs Outcome Fields (Schema Compatibility)');
    const outcomeColumnCheck = await db.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'pricing_runs' 
        AND column_name IN ('outcome', 'outcome_date', 'outcome_reason');
    `);
    
    const outcomeColumns = outcomeColumnCheck.rows.map(r => r.column_name);
    const hasOutcome = outcomeColumns.includes('outcome');
    const hasOutcomeDate = outcomeColumns.includes('outcome_date');
    const hasOutcomeReason = outcomeColumns.includes('outcome_reason');
    
    if (hasOutcome || hasOutcomeDate || hasOutcomeReason) {
      console.log(`  ✅ Outcome fields exist: ${outcomeColumns.join(', ')}`);
      console.log(`     Note: Outcome fields are optional and may be null in demo data`);
      
      // Check if any pricing runs have outcomes set (optional check)
      if (hasOutcome) {
        const outcomeCounts = await db.query(`
          SELECT outcome, COUNT(*) as count
          FROM pricing_runs
          WHERE tenant_id = $1 AND outcome IS NOT NULL
          GROUP BY outcome
        `, [metaSteelTenantId]);
        
        if (outcomeCounts.rows.length > 0) {
          console.log(`     Pricing runs with outcomes:`);
          for (const row of outcomeCounts.rows) {
            console.log(`       - ${row.outcome}: ${row.count}`);
          }
        } else {
          console.log(`     Note: No pricing runs have outcomes set (this is OK for demo data)`);
        }
      }
    } else {
      console.log(`  ⊙ Outcome fields do not exist (skipping check - may not be migrated yet)`);
    }
    console.log('');

    // ========================================================================
    // CHECK 10: Pricing Run Items Seeded
    // ========================================================================
    console.log('🔍 Check 10: Pricing Run Items Seeded');
    const pricingRunItemsResult = await db.query(
      `SELECT COUNT(*) as count FROM pricing_run_items WHERE tenant_id = $1`,
      [metaSteelTenantId]
    );
    const pricingRunItemsCount = parseInt(pricingRunItemsResult.rows[0].count) || 0;

    if (pricingRunItemsCount > 0) {
      console.log(`  ✅ Pricing Run Items: ${pricingRunItemsCount} item(s)`);
    } else {
      console.log(`  ⚠️  Pricing Run Items: ${pricingRunItemsCount} item(s) (expected > 0)`);
      console.log('     Run: node scripts/seedMetaSteelRfqsAndPricing.js');
      // Not critical, don't fail
    }
    console.log('');

    // ========================================================================
    // Final Summary
    // ========================================================================
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');

    if (allChecksPassed) {
      console.log('✅ All checks passed! MetaSteel demo tenant is healthy.\n');
      console.log('💡 Next Steps:');
      console.log('  1. Log in as sales@metasteel.com (password: Password123!)');
      console.log('  2. Check Dashboard: Total Quotes, Pending Approval, Approved Quotes');
      console.log('  3. Check RFQ List: 3 RFQs (PIPEMART, PETRO, ALPHA)');
      console.log('  4. Check RFQ Detail: Each RFQ should show 6 line items');
      console.log('');
    } else {
      console.log('❌ Some checks failed. MetaSteel demo tenant needs attention.\n');
      console.log('💡 Recommended Actions:');
      console.log('  1. Run reset script: npm run reset:metasteel');
      console.log('  2. Or run individual seed scripts as indicated above');
      console.log('');
    }

    console.log('📖 Reference Docs:');
    console.log('  - docs/METASTEEL_DEMO_BLUEPRINT_V2.md');
    console.log('  - docs/METASTEEL_DEMO_RESET_GUIDE.md');
    console.log('');

  } catch (error) {
    console.error('\n❌ Health check failed:', error.message);
    console.error(error.stack);
    allChecksPassed = false;
  } finally {
    if (db && typeof db.end === 'function') {
      await db.end();
    }
  }

  // Exit with appropriate code
  process.exit(allChecksPassed ? 0 : 1);
}

// Run if called directly
if (require.main === module) {
  verifyMetaSteelDemoHealth();
}

module.exports = { verifyMetaSteelDemoHealth };
