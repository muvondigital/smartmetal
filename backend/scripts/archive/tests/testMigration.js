/**
 * Test script to verify Pricer V2 migration was successful
 *
 * Usage:
 *   node backend/scripts/testMigration.js
 */

require('dotenv').config();
const { connectDb } = require('../src/db/supabaseClient');

async function testMigration() {
  console.log('');
  console.log('='.repeat(70));
  console.log('PRICER V2 MIGRATION TEST');
  console.log('='.repeat(70));
  console.log('');

  const db = await connectDb();

  const tests = [
    {
      name: 'price_agreements table exists',
      query: `SELECT COUNT(*) FROM price_agreements`,
    },
    {
      name: 'users table exists',
      query: `SELECT COUNT(*) FROM users`,
    },
    {
      name: 'approval_history table exists',
      query: `SELECT COUNT(*) FROM approval_history`,
    },
    {
      name: 'pricing_run_versions table exists',
      query: `SELECT COUNT(*) FROM pricing_run_versions`,
    },
    {
      name: 'pricing_runs has approval_status column',
      query: `SELECT approval_status FROM pricing_runs LIMIT 1`,
    },
    {
      name: 'pricing_runs has outcome column',
      query: `SELECT outcome FROM pricing_runs LIMIT 1`,
    },
    {
      name: 'pricing_run_items has price_agreement_id column',
      query: `SELECT price_agreement_id FROM pricing_run_items LIMIT 1`,
    },
    {
      name: 'pricing_run_items has pricing_method column',
      query: `SELECT pricing_method FROM pricing_run_items LIMIT 1`,
    },
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      await db.query(test.query);
      console.log(`✅ ${test.name}`);
      passed++;
    } catch (error) {
      console.log(`❌ ${test.name}`);
      console.log(`   Error: ${error.message}`);
      failed++;
    }
  }

  console.log('');
  console.log('-'.repeat(70));
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('-'.repeat(70));

  // Show detailed statistics
  console.log('');
  console.log('Database Statistics:');
  console.log('-'.repeat(70));

  try {
    const stats = await db.query(`
      SELECT
        (SELECT COUNT(*) FROM price_agreements) as price_agreements,
        (SELECT COUNT(*) FROM users) as users,
        (SELECT COUNT(*) FROM approval_history) as approval_history,
        (SELECT COUNT(*) FROM pricing_run_versions) as pricing_run_versions,
        (SELECT COUNT(*) FROM pricing_runs) as pricing_runs,
        (SELECT COUNT(*) FROM pricing_run_items) as pricing_run_items
    `);

    const data = stats.rows[0];
    console.log(`Price Agreements:     ${data.price_agreements}`);
    console.log(`Users:                ${data.users}`);
    console.log(`Approval History:     ${data.approval_history}`);
    console.log(`Pricing Run Versions: ${data.pricing_run_versions}`);
    console.log(`Pricing Runs:         ${data.pricing_runs}`);
    console.log(`Pricing Run Items:    ${data.pricing_run_items}`);
  } catch (error) {
    console.log('Could not retrieve statistics:', error.message);
  }

  // Sample queries to demonstrate functionality
  console.log('');
  console.log('Sample Data:');
  console.log('-'.repeat(70));

  try {
    // Show users
    const users = await db.query('SELECT name, email, role, can_approve FROM users LIMIT 5');
    if (users.rows.length > 0) {
      console.log('');
      console.log('Users:');
      users.rows.forEach(user => {
        console.log(`  ${user.name} (${user.email}) - ${user.role} [Approver: ${user.can_approve ? 'Yes' : 'No'}]`);
      });
    }

    // Show price agreements
    const agreements = await db.query(`
      SELECT
        pa.id,
        c.name as client_name,
        COALESCE(m.material_code, pa.category) as item,
        pa.base_price,
        pa.currency,
        pa.valid_from,
        pa.valid_until,
        pa.status
      FROM price_agreements pa
      JOIN clients c ON pa.client_id = c.id
      LEFT JOIN materials m ON pa.material_id = m.id
      LIMIT 5
    `);

    if (agreements.rows.length > 0) {
      console.log('');
      console.log('Price Agreements:');
      agreements.rows.forEach(agr => {
        console.log(`  ${agr.client_name} | ${agr.item} | $${agr.base_price} ${agr.currency} | ${agr.valid_from} to ${agr.valid_until} [${agr.status}]`);
      });
    }
  } catch (error) {
    console.log('Could not retrieve sample data:', error.message);
  }

  console.log('');
  console.log('='.repeat(70));

  if (failed === 0) {
    console.log('✅ ALL TESTS PASSED - Migration successful!');
  } else {
    console.log(`⚠️  ${failed} test(s) failed - Please review the migration`);
  }

  console.log('='.repeat(70));
  console.log('');

  process.exit(failed === 0 ? 0 : 1);
}

testMigration().catch(error => {
  console.error('Test script error:', error);
  process.exit(1);
});
