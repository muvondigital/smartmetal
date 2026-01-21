/**
 * Migration 065: Create Quote Candidates Table
 *
 * Purpose: Bridge approved pricing runs (quotes) to Price Agreement dashboard.
 * Approved quotes appear as "candidates" that users can manually convert to
 * Price Agreements (V1) or open in Price Agreement V2 Editor.
 *
 * Changes:
 * 1. Create quote_candidates table with RLS enabled
 * 2. Link to pricing_runs (approved quotes)
 * 3. Track conversion status (pending | converted | dismissed)
 * 4. Enable tenant isolation via RLS policies
 *
 * Safety:
 * - Idempotent: Can be run multiple times safely
 * - RLS enabled: FORCE RLS to prevent cross-tenant access
 * - Tenant-scoped: All queries must use tenant context
 *
 * Created: 2025-01-XX
 */

async function up(db) {
  if (!db) {
    throw new Error('Migration 065 requires db parameter. Use runAllMigrations.js to run migrations.');
  }

  console.log('[Migration 065] Creating quote_candidates table...');

  try {
    await db.query('BEGIN');

    // Step 1: Create quote_candidates table
    const tableCheck = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'quote_candidates'
      );
    `);

    if (!tableCheck.rows[0].exists) {
      await db.query(`
        CREATE TABLE quote_candidates (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          pricing_run_id UUID NOT NULL UNIQUE REFERENCES pricing_runs(id) ON DELETE CASCADE,
          rfq_id UUID NOT NULL REFERENCES rfqs(id) ON DELETE CASCADE,
          client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
          customer_name TEXT,
          total_value NUMERIC,
          approved_at TIMESTAMP WITH TIME ZONE,
          status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'converted', 'dismissed')),
          converted_price_agreement_id UUID REFERENCES price_agreements(id) ON DELETE SET NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
      `);
      console.log('  ✅ Created quote_candidates table');
    } else {
      console.log('  ✓ quote_candidates table already exists');
    }

    // Step 2: Create indexes
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_quote_candidates_tenant_id
      ON quote_candidates(tenant_id);
    `);
    console.log('  ✅ Created index on tenant_id');

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_quote_candidates_pricing_run_id
      ON quote_candidates(pricing_run_id);
    `);
    console.log('  ✅ Created index on pricing_run_id');

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_quote_candidates_rfq_id
      ON quote_candidates(rfq_id);
    `);
    console.log('  ✅ Created index on rfq_id');

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_quote_candidates_status
      ON quote_candidates(tenant_id, status)
      WHERE status = 'pending';
    `);
    console.log('  ✅ Created index on (tenant_id, status) for pending candidates');

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_quote_candidates_created_at
      ON quote_candidates(tenant_id, created_at DESC);
    `);
    console.log('  ✅ Created index on (tenant_id, created_at)');

    // Step 3: Enable RLS
    const rlsCheck = await db.query(`
      SELECT relrowsecurity, relforcerowsecurity
      FROM pg_class
      WHERE relname = 'quote_candidates' AND relnamespace = 'public'::regnamespace;
    `);

    const hasRLS = rlsCheck.rows[0]?.relrowsecurity || false;
    const hasForceRLS = rlsCheck.rows[0]?.relforcerowsecurity || false;

    if (!hasRLS) {
      await db.query(`ALTER TABLE quote_candidates ENABLE ROW LEVEL SECURITY;`);
      console.log('  ✅ Enabled RLS on quote_candidates');
    } else {
      console.log('  ✓ RLS already enabled on quote_candidates');
    }

    if (!hasForceRLS) {
      await db.query(`ALTER TABLE quote_candidates FORCE ROW LEVEL SECURITY;`);
      console.log('  ✅ Enabled FORCE RLS on quote_candidates');
    } else {
      console.log('  ✓ FORCE RLS already enabled on quote_candidates');
    }

    // Step 4: Create RLS policy (tenant isolation)
    const policyCheck = await db.query(`
      SELECT COUNT(*) as count
      FROM pg_policies
      WHERE tablename = 'quote_candidates' AND policyname = 'quote_candidates_tenant_isolation';
    `);

    if (parseInt(policyCheck.rows[0].count) === 0) {
      await db.query(`
        CREATE POLICY quote_candidates_tenant_isolation
        ON quote_candidates
        FOR ALL
        USING (
          tenant_id = current_setting('app.tenant_id', true)::uuid
        );
      `);
      console.log('  ✅ Created RLS policy (tenant isolation)');
    } else {
      console.log('  ✓ RLS policy already exists');
    }

    // Step 5: Create updated_at trigger
    await db.query(`
      DROP TRIGGER IF EXISTS update_quote_candidates_updated_at ON quote_candidates;
      CREATE TRIGGER update_quote_candidates_updated_at
        BEFORE UPDATE ON quote_candidates
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `);
    console.log('  ✅ Created updated_at trigger');

    await db.query('COMMIT');
    console.log('[Migration 065] ✅✅✅ Migration completed successfully');

  } catch (error) {
    await db.query('ROLLBACK');
    console.error('[Migration 065] ❌ Migration failed:', error);
    throw error;
  }
}

async function down(db) {
  if (!db) {
    throw new Error('Migration 065 requires db parameter. Use runAllMigrations.js to run migrations.');
  }

  console.log('[Migration 065] Rolling back quote_candidates table...');

  try {
    await db.query('BEGIN');

    // Drop policy
    await db.query(`DROP POLICY IF EXISTS quote_candidates_tenant_isolation ON quote_candidates;`);

    // Drop trigger
    await db.query(`DROP TRIGGER IF EXISTS update_quote_candidates_updated_at ON quote_candidates;`);

    // Drop indexes
    await db.query(`DROP INDEX IF EXISTS idx_quote_candidates_tenant_id;`);
    await db.query(`DROP INDEX IF EXISTS idx_quote_candidates_pricing_run_id;`);
    await db.query(`DROP INDEX IF EXISTS idx_quote_candidates_rfq_id;`);
    await db.query(`DROP INDEX IF EXISTS idx_quote_candidates_status;`);
    await db.query(`DROP INDEX IF EXISTS idx_quote_candidates_created_at;`);

    // Drop table
    await db.query(`DROP TABLE IF EXISTS quote_candidates;`);

    await db.query('COMMIT');
    console.log('[Migration 065] ✅ Rollback complete');

  } catch (error) {
    await db.query('ROLLBACK');
    console.error('[Migration 065] ❌ Rollback failed:', error);
    throw error;
  }
}

module.exports = {
  up,
  down,
};

