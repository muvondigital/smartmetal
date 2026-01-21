/**
 * Check Price Agreements Multi-Tenancy
 * 
 * This script checks the current state of price agreements in the database
 * to verify tenant isolation.
 * 
 * Usage: node backend/scripts/check-price-agreements-tenancy.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { connectDb } = require('../src/db/supabaseClient');

async function checkPriceAgreementsTenancy() {
  const db = await connectDb();
  
  console.log('='.repeat(80));
  console.log('PRICE AGREEMENTS MULTI-TENANCY CHECK');
  console.log('='.repeat(80));
  console.log();
  
  // 1. List tenants
  console.log('1. TENANTS:');
  console.log('-'.repeat(80));
  const tenantsResult = await db.query(`
    SELECT id, code, name, is_active 
    FROM tenants 
    ORDER BY code
  `);
  
  const tenants = tenantsResult.rows;
  const tenantMap = {};
  
  for (const tenant of tenants) {
    console.log(`  • ${tenant.code} (${tenant.name})`);
    console.log(`    ID: ${tenant.id}`);
    console.log(`    Active: ${tenant.is_active}`);
    console.log();
    tenantMap[tenant.code] = tenant;
  }
  
  // 2. Count price agreements per tenant
  console.log('2. PRICE AGREEMENTS COUNT BY TENANT:');
  console.log('-'.repeat(80));
  const countResult = await db.query(`
    SELECT tenant_id, COUNT(*) as count 
    FROM price_agreements 
    GROUP BY tenant_id
    ORDER BY count DESC
  `);
  
  if (countResult.rows.length === 0) {
    console.log('  ⚠️  No price agreements found in database');
    console.log();
  } else {
    for (const row of countResult.rows) {
      // Find tenant name
      const tenant = tenants.find(t => t.id === row.tenant_id);
      const tenantName = tenant ? `${tenant.code} (${tenant.name})` : `Unknown (${row.tenant_id})`;
      console.log(`  • ${tenantName}: ${row.count} agreement(s)`);
    }
    console.log();
  }
  
  // 3. List agreements for NSC tenant
  if (tenantMap['nsc']) {
    console.log('3. NSC PRICE AGREEMENTS (first 10):');
    console.log('-'.repeat(80));
    const nscAgreements = await db.query(`
      SELECT 
        pa.id, 
        pa.client_id,
        c.name as client_name,
        pa.base_price,
        pa.currency,
        pa.valid_from,
        pa.valid_until,
        pa.status,
        pa.tenant_id
      FROM price_agreements pa
      LEFT JOIN clients c ON pa.client_id = c.id
      WHERE pa.tenant_id = $1
      ORDER BY pa.created_at DESC
      LIMIT 10
    `, [tenantMap['nsc'].id]);
    
    if (nscAgreements.rows.length === 0) {
      console.log('  ⚠️  No NSC price agreements found');
    } else {
      for (const agreement of nscAgreements.rows) {
        console.log(`  • ${agreement.client_name || 'Unknown Client'}`);
        console.log(`    ID: ${agreement.id}`);
        console.log(`    Base Price: ${agreement.base_price} ${agreement.currency}`);
        console.log(`    Valid: ${agreement.valid_from} to ${agreement.valid_until}`);
        console.log(`    Status: ${agreement.status}`);
        console.log(`    Tenant ID: ${agreement.tenant_id}`);
        console.log();
      }
    }
    console.log();
  }
  
  // 4. List agreements for MetaSteel tenant
  if (tenantMap['metasteel']) {
    console.log('4. METASTEEL PRICE AGREEMENTS (first 10):');
    console.log('-'.repeat(80));
    const metaSteelAgreements = await db.query(`
      SELECT 
        pa.id, 
        pa.client_id,
        c.name as client_name,
        pa.base_price,
        pa.currency,
        pa.valid_from,
        pa.valid_until,
        pa.status,
        pa.tenant_id
      FROM price_agreements pa
      LEFT JOIN clients c ON pa.client_id = c.id
      WHERE pa.tenant_id = $1
      ORDER BY pa.created_at DESC
      LIMIT 10
    `, [tenantMap['metasteel'].id]);
    
    if (metaSteelAgreements.rows.length === 0) {
      console.log('  ⚠️  No MetaSteel price agreements found');
    } else {
      for (const agreement of metaSteelAgreements.rows) {
        console.log(`  • ${agreement.client_name || 'Unknown Client'}`);
        console.log(`    ID: ${agreement.id}`);
        console.log(`    Base Price: ${agreement.base_price} ${agreement.currency}`);
        console.log(`    Valid: ${agreement.valid_from} to ${agreement.valid_until}`);
        console.log(`    Status: ${agreement.status}`);
        console.log(`    Tenant ID: ${agreement.tenant_id}`);
        console.log();
      }
    }
    console.log();
  }
  
  // 5. Check for agreements with NULL tenant_id (should not exist)
  console.log('5. CHECKING FOR NULL tenant_id (should be 0):');
  console.log('-'.repeat(80));
  const nullTenantResult = await db.query(`
    SELECT COUNT(*) as count 
    FROM price_agreements 
    WHERE tenant_id IS NULL
  `);
  
  const nullCount = parseInt(nullTenantResult.rows[0].count);
  if (nullCount > 0) {
    console.log(`  ⚠️  WARNING: Found ${nullCount} agreement(s) with NULL tenant_id`);
    console.log('     These need to be fixed!');
  } else {
    console.log('  ✓ No agreements with NULL tenant_id');
  }
  console.log();
  
  // 6. Check for agreements with invalid tenant_id (not in tenants table)
  console.log('6. CHECKING FOR INVALID tenant_id (should be 0):');
  console.log('-'.repeat(80));
  const invalidTenantResult = await db.query(`
    SELECT COUNT(*) as count 
    FROM price_agreements pa
    WHERE pa.tenant_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM tenants t WHERE t.id = pa.tenant_id
      )
  `);
  
  const invalidCount = parseInt(invalidTenantResult.rows[0].count);
  if (invalidCount > 0) {
    console.log(`  ⚠️  WARNING: Found ${invalidCount} agreement(s) with invalid tenant_id`);
    console.log('     These need to be fixed!');
  } else {
    console.log('  ✓ No agreements with invalid tenant_id');
  }
  console.log();
  
  console.log('='.repeat(80));
  console.log('CHECK COMPLETE');
  console.log('='.repeat(80));
  
  process.exit(0);
}

checkPriceAgreementsTenancy().catch(error => {
  console.error('Error checking price agreements tenancy:', error);
  process.exit(1);
});

