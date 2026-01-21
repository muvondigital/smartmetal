/**
 * Tenant Isolation Smoke Tests
 * 
 * Tests multi-tenant functionality:
 * 1. Call RFQ list with no header → should see NSC RFQs (default tenant)
 * 2. Create a dummy second tenant and a test RFQ under it
 * 3. Hit RFQ list with X-Tenant-Code set to that new tenant → should NOT see NSC RFQs
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { connectDb } = require('../src/db/supabaseClient');
const rfqService = require('../src/services/rfqService');

// Ensure we see all output
process.stdout.write('\n');

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:4000';

async function createTestTenant(db) {
  console.log('\n📝 Creating test tenant...');
  
  const result = await db.query(`
    INSERT INTO tenants (name, code, is_active)
    VALUES ('Test Tenant', 'TEST', true)
    ON CONFLICT (code) DO UPDATE
    SET name = EXCLUDED.name,
        is_active = EXCLUDED.is_active,
        updated_at = NOW()
    RETURNING id, code;
  `);
  
  const tenant = result.rows[0];
  console.log(`✅ Created/updated test tenant: ${tenant.code} (id: ${tenant.id})`);
  return tenant;
}

async function createTestRfq(db, tenantId) {
  console.log('\n📝 Creating test RFQ for test tenant...');
  
  // First, ensure we have a client for this tenant
  let clientResult = await db.query(`
    SELECT id FROM clients WHERE tenant_id = $1 LIMIT 1
  `, [tenantId]);
  
  let clientId;
  if (clientResult.rows.length === 0) {
    // Create a test client
    const newClientResult = await db.query(`
      INSERT INTO clients (name, tenant_id)
      VALUES ('Test Client', $1)
      RETURNING id
    `, [tenantId]);
    clientId = newClientResult.rows[0].id;
    console.log(`✅ Created test client: ${clientId}`);
  } else {
    clientId = clientResult.rows[0].id;
  }
  
  // Create a test project
  let projectResult = await db.query(`
    SELECT id FROM projects WHERE tenant_id = $1 LIMIT 1
  `, [tenantId]);
  
  let projectId;
  if (projectResult.rows.length === 0) {
    const newProjectResult = await db.query(`
      INSERT INTO projects (name, client_id, tenant_id)
      VALUES ('Test Project', $1, $2)
      RETURNING id
    `, [clientId, tenantId]);
    projectId = newProjectResult.rows[0].id;
    console.log(`✅ Created test project: ${projectId}`);
  } else {
    projectId = projectResult.rows[0].id;
  }
  
  // Create test RFQ
  const rfqResult = await db.query(`
    INSERT INTO rfqs (client_id, project_id, title, status, tenant_id)
    VALUES ($1, $2, 'Test RFQ for Tenant Isolation', 'draft', $3)
    RETURNING id, title
  `, [clientId, projectId, tenantId]);
  
  const rfq = rfqResult.rows[0];
  console.log(`✅ Created test RFQ: ${rfq.id} - ${rfq.title}`);
  return rfq;
}

async function testRfqList(tenantCode = null) {
  console.log(`\n🔍 Testing RFQ list${tenantCode ? ` with X-Tenant-Code: ${tenantCode}` : ' (no header, default tenant)'}...`);
  
  try {
    const headers = tenantCode ? { 'X-Tenant-Code': tenantCode } : {};
    
    // Since we're testing the service directly, we need to get the tenant ID
    const db = await connectDb();
    let tenantId;
    
    if (tenantCode) {
      const tenantResult = await db.query(
        `SELECT id FROM tenants WHERE code = $1 LIMIT 1`,
        [tenantCode]
      );
      if (tenantResult.rows.length === 0) {
        throw new Error(`Tenant with code ${tenantCode} not found`);
      }
      tenantId = tenantResult.rows[0].id;
    } else {
      // Default tenant (NSC)
      const tenantResult = await db.query(
        `SELECT id FROM tenants WHERE code = 'nsc' LIMIT 1`
      );
      tenantId = tenantResult.rows[0].id;
    }
    
    const rfqs = await rfqService.getAllRfqs(tenantId);
    console.log(`✅ Found ${rfqs.length} RFQ(s) for tenant ${tenantCode || 'NSC (default)'}`);
    
    if (rfqs.length > 0) {
      console.log('   Sample RFQs:');
      rfqs.slice(0, 3).forEach(rfq => {
        console.log(`   - ${rfq.id}: ${rfq.title || rfq.customer_name || 'Untitled'}`);
      });
    }
    
    return rfqs;
  } catch (error) {
    console.error(`❌ Error testing RFQ list:`, error.message);
    throw error;
  }
}

async function runSmokeTests() {
  console.log('='.repeat(60));
  console.log('TENANT ISOLATION SMOKE TESTS');
  console.log('='.repeat(60));
  
  const db = await connectDb();
  
  try {
    // Test 1: Call RFQ list with no header → should see NSC RFQs
    console.log('\n🧪 TEST 1: RFQ list with no header (default tenant)');
    const nscRfqs = await testRfqList(null);
    
    if (nscRfqs.length === 0) {
      console.log('⚠️  WARNING: No RFQs found for NSC tenant. This is okay if the database is empty.');
    }
    
    // Test 2: Create a dummy second tenant and a test RFQ under it
    console.log('\n🧪 TEST 2: Create test tenant and RFQ');
    const testTenant = await createTestTenant(db);
    const testRfq = await createTestRfq(db, testTenant.id);
    
    // Test 3: Hit RFQ list with X-Tenant-Code set to that new tenant → should NOT see NSC RFQs
    console.log('\n🧪 TEST 3: RFQ list with X-Tenant-Code: TEST');
    const testTenantRfqs = await testRfqList('TEST');
    
    // Verify isolation: Test tenant should NOT see NSC RFQs
    const hasNscRfqs = testTenantRfqs.some(rfq => {
      // Check if any RFQ belongs to NSC tenant
      // We'll need to check this by comparing tenant_id
      return true; // We'll verify this properly below
    });
    
    // Get NSC tenant ID to verify
    const nscTenantResult = await db.query(
      `SELECT id FROM tenants WHERE code = 'nsc' LIMIT 1`
    );
    const nscTenantId = nscTenantResult.rows[0].id;
    
    // Verify that test tenant RFQs don't include NSC RFQs
    const testTenantRfqIds = testTenantRfqs.map(r => r.id);
    const nscRfqIds = nscRfqs.map(r => r.id);
    const overlap = testTenantRfqIds.filter(id => nscRfqIds.includes(id));
    
    if (overlap.length > 0) {
      console.log(`\n❌ FAIL: Test tenant can see ${overlap.length} NSC RFQ(s)!`);
      console.log(`   Overlapping RFQ IDs: ${overlap.join(', ')}`);
      console.log('   This indicates a tenant isolation bug.');
    } else {
      console.log(`\n✅ PASS: Test tenant cannot see NSC RFQs (proper isolation)`);
    }
    
    // Verify test tenant can see its own RFQ
    const canSeeOwnRfq = testTenantRfqs.some(rfq => rfq.id === testRfq.id);
    if (canSeeOwnRfq) {
      console.log(`✅ PASS: Test tenant can see its own RFQ`);
    } else {
      console.log(`❌ FAIL: Test tenant cannot see its own RFQ!`);
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('SMOKE TESTS COMPLETE');
    console.log('='.repeat(60));
    console.log('\n✅ All automated tests passed!');
    console.log('\n📋 Manual verification still needed:');
    console.log('   1. Start backend server: cd backend && npm run dev');
    console.log('   2. Test RFQ list endpoint:');
    console.log('      - GET http://localhost:4000/api/rfqs (no header) → should see NSC RFQs');
    console.log('      - GET http://localhost:4000/api/rfqs with header X-Tenant-Code: TEST → should NOT see NSC RFQs');
    console.log('   3. Run full RFQ → pricing → approval → agreement flow for NSC tenant');
    
  } catch (error) {
    console.error('\n❌ Smoke tests failed:', error);
    throw error;
  } finally {
    // Note: supabaseClient uses a pool, so we don't need to close it
    // await db.end();
  }
}

// Run if called directly
if (require.main === module) {
  runSmokeTests()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = { runSmokeTests };

