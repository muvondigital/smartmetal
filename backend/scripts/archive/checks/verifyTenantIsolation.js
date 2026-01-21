/**
 * Tenant Isolation Verification Script
 * 
 * This script verifies that RLS and app.tenant_id are working correctly:
 * 1. Login as NSC → check RFQs, KB articles
 * 2. Login as MetaSteel → verify:
 *    - Don't see NSC RFQs
 *    - Do see Global KB articles (tenant_id NULL)
 *    - Do see MetaSteel-specific KB articles
 */

require('dotenv').config();
const { withTenantContext } = require('../src/db/tenantContext');
const { getPool } = require('../src/db/supabaseClient');

async function verifyTenantIsolation() {
  console.log('========================================');
  console.log('  Tenant Isolation Verification');
  console.log('========================================');
  console.log('');

  const pool = getPool();

  try {
    // Get tenant IDs (prefer lowercase 'nsc' over 'NSC' if both exist)
    const tenantResult = await pool.query(`
      SELECT id, code, name FROM tenants WHERE code IN ('NSC', 'nsc', 'metasteel') ORDER BY code
    `);

    if (tenantResult.rows.length < 2) {
      console.error('❌ Error: Both NSC and MetaSteel tenants must exist');
      console.error('   Found tenants:', tenantResult.rows.map(r => r.code).join(', '));
      process.exit(1);
    }

    // Prefer lowercase 'nsc' if both exist, otherwise use 'NSC'
    const nscTenant = tenantResult.rows.find(r => r.code === 'nsc') || tenantResult.rows.find(r => r.code === 'NSC');
    const metaSteelTenant = tenantResult.rows.find(r => r.code === 'metasteel');

    if (!nscTenant || !metaSteelTenant) {
      console.error('❌ Error: Could not find both tenants');
      process.exit(1);
    }

    console.log('✓ Found tenants:');
    console.log(`  - NSC: ${nscTenant.name} (${nscTenant.id})`);
    console.log(`  - MetaSteel: ${metaSteelTenant.name} (${metaSteelTenant.id})`);
    console.log('');

    // ============================================================
    // STEP 1: Login as NSC → check RFQs, KB articles
    // ============================================================
    console.log('========================================');
    console.log('STEP 1: NSC Tenant Verification');
    console.log('========================================');
    console.log('');

    const nscResults = {
      rfqs: [],
      kbArticles: []
    };

    await withTenantContext(nscTenant.id, async (client) => {
      // Check RFQs
      const rfqResult = await client.query(`
        SELECT id, rfq_code, title, status, tenant_id
        FROM rfqs
        ORDER BY created_at DESC
        LIMIT 10
      `);
      nscResults.rfqs = rfqResult.rows;

      // Check KB articles
      const kbResult = await client.query(`
        SELECT id, slug, title, category, tenant_id
        FROM knowledge_base_articles
        WHERE is_latest = TRUE
        ORDER BY updated_at DESC
        LIMIT 10
      `);
      nscResults.kbArticles = kbResult.rows;
    });

    console.log(`✓ NSC RFQs found: ${nscResults.rfqs.length}`);
    if (nscResults.rfqs.length > 0) {
      console.log('  Sample RFQs:');
      nscResults.rfqs.slice(0, 3).forEach(rfq => {
        console.log(`    - ${rfq.rfq_code || rfq.id.substring(0, 8)}: ${rfq.title || 'Untitled'}`);
      });
    }
    console.log('');

    console.log(`✓ NSC KB Articles found: ${nscResults.kbArticles.length}`);
    const nscGlobalArticles = nscResults.kbArticles.filter(a => a.tenant_id === null);
    const nscTenantArticles = nscResults.kbArticles.filter(a => a.tenant_id === nscTenant.id);
    console.log(`  - Global articles (tenant_id NULL): ${nscGlobalArticles.length}`);
    console.log(`  - NSC-specific articles: ${nscTenantArticles.length}`);
    if (nscResults.kbArticles.length > 0) {
      console.log('  Sample articles:');
      nscResults.kbArticles.slice(0, 3).forEach(article => {
        const scope = article.tenant_id === null ? 'GLOBAL' : 'NSC';
        console.log(`    - [${scope}] ${article.title || article.slug}`);
      });
    }
    console.log('');

    // ============================================================
    // STEP 2: Login as MetaSteel → verify isolation
    // ============================================================
    console.log('========================================');
    console.log('STEP 2: MetaSteel Tenant Verification');
    console.log('========================================');
    console.log('');

    const metaSteelResults = {
      rfqs: [],
      kbArticles: []
    };

    await withTenantContext(metaSteelTenant.id, async (client) => {
      // Check RFQs
      const rfqResult = await client.query(`
        SELECT id, rfq_code, title, status, tenant_id
        FROM rfqs
        ORDER BY created_at DESC
        LIMIT 10
      `);
      metaSteelResults.rfqs = rfqResult.rows;

      // Check KB articles
      const kbResult = await client.query(`
        SELECT id, slug, title, category, tenant_id
        FROM knowledge_base_articles
        WHERE is_latest = TRUE
        ORDER BY updated_at DESC
        LIMIT 10
      `);
      metaSteelResults.kbArticles = kbResult.rows;
    });

    console.log(`✓ MetaSteel RFQs found: ${metaSteelResults.rfqs.length}`);
    if (metaSteelResults.rfqs.length > 0) {
      console.log('  Sample RFQs:');
      metaSteelResults.rfqs.slice(0, 3).forEach(rfq => {
        console.log(`    - ${rfq.rfq_code || rfq.id.substring(0, 8)}: ${rfq.title || 'Untitled'}`);
      });
    }
    console.log('');

    console.log(`✓ MetaSteel KB Articles found: ${metaSteelResults.kbArticles.length}`);
    const msGlobalArticles = metaSteelResults.kbArticles.filter(a => a.tenant_id === null);
    const msTenantArticles = metaSteelResults.kbArticles.filter(a => a.tenant_id === metaSteelTenant.id);
    console.log(`  - Global articles (tenant_id NULL): ${msGlobalArticles.length}`);
    console.log(`  - MetaSteel-specific articles: ${msTenantArticles.length}`);
    if (metaSteelResults.kbArticles.length > 0) {
      console.log('  Sample articles:');
      metaSteelResults.kbArticles.slice(0, 3).forEach(article => {
        const scope = article.tenant_id === null ? 'GLOBAL' : 'METASTEEL';
        console.log(`    - [${scope}] ${article.title || article.slug}`);
      });
    }
    console.log('');

    // ============================================================
    // STEP 3: Verify Isolation
    // ============================================================
    console.log('========================================');
    console.log('STEP 3: Isolation Verification');
    console.log('========================================');
    console.log('');

    // Check if MetaSteel can see NSC RFQs (should NOT)
    const nscRfqIds = new Set(nscResults.rfqs.map(r => r.id));
    const metaSteelRfqIds = new Set(metaSteelResults.rfqs.map(r => r.id));
    const crossTenantRfqs = [...metaSteelRfqIds].filter(id => nscRfqIds.has(id));

    if (crossTenantRfqs.length > 0) {
      console.error('❌ ISOLATION BREACH: MetaSteel can see NSC RFQs!');
      console.error(`   Found ${crossTenantRfqs.length} NSC RFQ(s) visible to MetaSteel`);
      process.exit(1);
    } else {
      console.log('✅ PASS: MetaSteel does NOT see NSC RFQs');
    }

    // Check if MetaSteel can see NSC KB articles (should NOT, except global)
    const nscTenantKbIds = new Set(
      nscResults.kbArticles
        .filter(a => a.tenant_id === nscTenant.id)
        .map(a => a.id)
    );
    const metaSteelKbIds = new Set(metaSteelResults.kbArticles.map(a => a.id));
    const crossTenantKb = [...metaSteelKbIds].filter(id => nscTenantKbIds.has(id));

    if (crossTenantKb.length > 0) {
      console.error('❌ ISOLATION BREACH: MetaSteel can see NSC KB articles!');
      console.error(`   Found ${crossTenantKb.length} NSC KB article(s) visible to MetaSteel`);
      process.exit(1);
    } else {
      console.log('✅ PASS: MetaSteel does NOT see NSC KB articles');
    }

    // Check if MetaSteel can see global KB articles (should YES)
    if (msGlobalArticles.length > 0) {
      console.log('✅ PASS: MetaSteel can see global KB articles (tenant_id NULL)');
    } else {
      console.log('⚠️  WARNING: MetaSteel cannot see any global KB articles');
      console.log('   (This is OK if no global articles exist)');
    }

    // Check if MetaSteel can see its own KB articles (should YES)
    if (msTenantArticles.length > 0) {
      console.log('✅ PASS: MetaSteel can see its own KB articles');
    } else {
      console.log('⚠️  INFO: MetaSteel has no tenant-specific KB articles');
      console.log('   (This is OK if none have been created)');
    }

    console.log('');
    console.log('========================================');
    console.log('✅ ALL CHECKS PASSED');
    console.log('========================================');
    console.log('');
    console.log('Summary:');
    console.log(`  - NSC RFQs: ${nscResults.rfqs.length}`);
    console.log(`  - MetaSteel RFQs: ${metaSteelResults.rfqs.length}`);
    console.log(`  - NSC KB Articles: ${nscTenantArticles.length} (plus ${nscGlobalArticles.length} global)`);
    console.log(`  - MetaSteel KB Articles: ${msTenantArticles.length} (plus ${msGlobalArticles.length} global)`);
    console.log('');
    console.log('✅ RLS + app.tenant_id are working correctly!');

  } catch (error) {
    console.error('❌ Error during verification:', error);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run verification
verifyTenantIsolation().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

