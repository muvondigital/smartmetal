/**
 * Check RLS State for Tenant-Scoped Tables
 *
 * Queries the database to check:
 * 1. RLS enabled/forced status
 * 2. RLS policies
 * 3. tenant_id column presence
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { connectDb } = require('../src/db/supabaseClient');

async function checkRlsState() {
  console.log('='.repeat(80));
  console.log('TENANT ISOLATION AUDIT: RLS STATE CHECK');
  console.log('='.repeat(80));
  console.log('');

  try {
    const db = await connectDb();

    // =========================================================================
    // 1. Check RLS Status on tenant-scoped tables
    // =========================================================================
    console.log('1. RLS STATUS (ENABLED & FORCE RLS)');
    console.log('-'.repeat(80));

    const rlsStatusQuery = `
      SELECT
        pt.tablename,
        pt.rowsecurity AS rls_enabled,
        pc.relforcerowsecurity AS force_rls_enabled,
        CASE
          WHEN EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public'
            AND table_name = pt.tablename
            AND column_name = 'tenant_id'
          ) THEN 'YES'
          ELSE 'NO'
        END AS has_tenant_id_column
      FROM pg_tables pt
      JOIN pg_class pc ON pc.relname = pt.tablename
      JOIN pg_namespace pn ON pn.oid = pc.relnamespace AND pn.nspname = pt.schemaname
      WHERE pt.schemaname = 'public'
        AND pt.tablename IN (
          'price_agreements', 'agreement_headers', 'agreement_conditions', 'agreement_scales',
          'rfqs', 'rfq_items', 'pricing_runs', 'pricing_run_items', 'approval_history',
          'clients', 'projects', 'document_extractions', 'mto_extractions',
          'ai_predictions', 'ai_api_usage', 'client_pricing_rules', 'users',
          'tenant_onboarding_status', 'approval_events'
        )
      ORDER BY pt.tablename;
    `;

    const rlsStatusResult = await db.query(rlsStatusQuery);

    console.table(rlsStatusResult.rows);
    console.log('');

    // =========================================================================
    // 2. Check RLS Policies
    // =========================================================================
    console.log('2. RLS POLICIES');
    console.log('-'.repeat(80));

    const policiesQuery = `
      SELECT
        schemaname,
        tablename,
        policyname,
        permissive,
        cmd,
        CASE
          WHEN LENGTH(qual) > 60 THEN SUBSTRING(qual FROM 1 FOR 60) || '...'
          ELSE qual
        END AS qual_preview
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename IN (
          'price_agreements', 'agreement_headers', 'agreement_conditions', 'agreement_scales',
          'rfqs', 'rfq_items', 'pricing_runs', 'pricing_run_items', 'approval_history'
        )
      ORDER BY tablename, cmd, policyname;
    `;

    const policiesResult = await db.query(policiesQuery);

    if (policiesResult.rows.length === 0) {
      console.log('⚠️  NO RLS POLICIES FOUND!');
    } else {
      console.table(policiesResult.rows);
    }
    console.log('');

    // =========================================================================
    // 3. Summary & Issues
    // =========================================================================
    console.log('3. SUMMARY & ISSUES');
    console.log('-'.repeat(80));

    const issues = [];

    // Check for tables without RLS
    const tablesWithoutRls = rlsStatusResult.rows.filter(r => !r.rls_enabled);
    if (tablesWithoutRls.length > 0) {
      issues.push({
        severity: 'CRITICAL',
        issue: 'Tables without RLS enabled',
        tables: tablesWithoutRls.map(r => r.tablename).join(', ')
      });
    }

    // Check for tables without FORCE RLS
    const tablesWithoutForceRls = rlsStatusResult.rows.filter(r => r.rls_enabled && !r.force_rls_enabled);
    if (tablesWithoutForceRls.length > 0) {
      issues.push({
        severity: 'HIGH',
        issue: 'Tables without FORCE RLS (can be bypassed by table owner)',
        tables: tablesWithoutForceRls.map(r => r.tablename).join(', ')
      });
    }

    // Check for tables without tenant_id column
    const tablesWithoutTenantId = rlsStatusResult.rows.filter(r => r.has_tenant_id_column === 'NO');
    if (tablesWithoutTenantId.length > 0) {
      issues.push({
        severity: 'CRITICAL',
        issue: 'Tables without tenant_id column',
        tables: tablesWithoutTenantId.map(r => r.tablename).join(', ')
      });
    }

    // Check for tables without policies
    const tablesWithPolicies = new Set(policiesResult.rows.map(r => r.tablename));
    const tenantTables = [
      'price_agreements', 'agreement_headers', 'agreement_conditions', 'agreement_scales',
      'rfqs', 'rfq_items', 'pricing_runs', 'pricing_run_items', 'approval_history'
    ];
    const tablesWithoutPolicies = tenantTables.filter(t => !tablesWithPolicies.has(t));
    if (tablesWithoutPolicies.length > 0) {
      issues.push({
        severity: 'CRITICAL',
        issue: 'Tables without RLS policies',
        tables: tablesWithoutPolicies.join(', ')
      });
    }

    if (issues.length === 0) {
      console.log('✅ NO ISSUES FOUND - All tenant-scoped tables have proper RLS configuration');
    } else {
      console.log('❌ ISSUES FOUND:');
      console.table(issues);
    }

    console.log('');
    console.log('='.repeat(80));
    console.log('RLS STATE CHECK COMPLETE');
    console.log('='.repeat(80));

    process.exit(0);

  } catch (error) {
    console.error('❌ Error checking RLS state:', error);
    process.exit(1);
  }
}

checkRlsState();
