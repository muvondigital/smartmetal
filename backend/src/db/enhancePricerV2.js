const { connectDb } = require('./supabaseClient');

/**
 * VENDAVO-INSPIRED ENHANCEMENT V2
 *
 * This migration adds support for:
 * - Phase 1: Price Agreements Module
 * - Phase 2: Approval Workflow System
 * - Phase 3: Analytics & Reporting
 *
 * Idempotent - safe to run multiple times.
 */
async function enhancePricerV2() {
  const db = await connectDb();

  console.log('Starting Pricer V2 Enhancement Migration...');

  try {
    await db.query('BEGIN');

    // ============================================================================
    // PHASE 1: PRICE AGREEMENTS MODULE
    // ============================================================================

    console.log('Creating price_agreements table...');
    await db.query(`
      CREATE TABLE IF NOT EXISTS price_agreements (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

        -- Material specificity (either material_id OR category)
        material_id UUID REFERENCES materials(id) ON DELETE SET NULL,
        category TEXT, -- 'FLANGES', 'PIPES', 'FITTINGS', 'VALVES', 'ANY'

        -- Pricing details
        base_price NUMERIC(12,2) NOT NULL,
        currency TEXT NOT NULL DEFAULT 'USD',

        -- Volume tiers (JSON array)
        -- Example: [{"min_qty": 0, "max_qty": 100, "price": 95.00}, {"min_qty": 101, "max_qty": 500, "price": 90.00}]
        volume_tiers JSONB,

        -- Validity period
        valid_from DATE NOT NULL,
        valid_until DATE NOT NULL,

        -- Terms
        payment_terms TEXT,
        delivery_terms TEXT,
        notes TEXT,

        -- Metadata
        created_by TEXT, -- user name/id (will be UUID later when auth is added)
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),

        -- Status
        status TEXT NOT NULL DEFAULT 'active', -- 'active', 'expired', 'cancelled'

        CONSTRAINT check_material_or_category CHECK (
          (material_id IS NOT NULL AND category IS NULL) OR
          (material_id IS NULL AND category IS NOT NULL)
        ),
        CONSTRAINT check_valid_dates CHECK (valid_until >= valid_from),
        CONSTRAINT check_status CHECK (status IN ('active', 'expired', 'cancelled'))
      );
    `);

    console.log('Creating indexes for price_agreements...');
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_agreements_client ON price_agreements(client_id);
      CREATE INDEX IF NOT EXISTS idx_agreements_material ON price_agreements(material_id);
      CREATE INDEX IF NOT EXISTS idx_agreements_category ON price_agreements(category);
      CREATE INDEX IF NOT EXISTS idx_agreements_dates ON price_agreements(valid_from, valid_until);
      CREATE INDEX IF NOT EXISTS idx_agreements_status ON price_agreements(status);
      CREATE INDEX IF NOT EXISTS idx_agreements_active ON price_agreements(client_id, status)
        WHERE status = 'active';
    `);

    console.log('Adding updated_at trigger for price_agreements...');
    await db.query(`
      DROP TRIGGER IF EXISTS update_price_agreements_updated_at ON price_agreements;
      CREATE TRIGGER update_price_agreements_updated_at
        BEFORE UPDATE ON price_agreements
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `);

    // ============================================================================
    // PHASE 2: APPROVAL WORKFLOW SYSTEM
    // ============================================================================

    console.log('Creating users table for approval workflow...');
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        role TEXT NOT NULL DEFAULT 'sales_rep', -- 'sales_rep', 'manager', 'admin'
        can_approve BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),

        CONSTRAINT check_role CHECK (role IN ('sales_rep', 'manager', 'admin'))
      );
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_can_approve ON users(can_approve) WHERE can_approve = true;
    `);

    console.log('Enhancing pricing_runs table for approval workflow...');

    // Add approval workflow columns
    await db.query(`
      ALTER TABLE pricing_runs
        ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'draft',
        ADD COLUMN IF NOT EXISTS submitted_for_approval_at TIMESTAMP WITH TIME ZONE,
        ADD COLUMN IF NOT EXISTS submitted_by TEXT, -- user name or id
        ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP WITH TIME ZONE,
        ADD COLUMN IF NOT EXISTS approved_by TEXT, -- user name or id
        ADD COLUMN IF NOT EXISTS approval_notes TEXT,
        ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
    `);

    // Add constraint for approval_status
    await db.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'check_approval_status'
          AND conrelid = 'pricing_runs'::regclass
        ) THEN
          ALTER TABLE pricing_runs
            ADD CONSTRAINT check_approval_status
            CHECK (approval_status IN (
              'draft',
              'pending_approval',
              'approved',
              'rejected',
              'sent_to_client',
              'won',
              'lost'
            ));
        END IF;
      END $$;
    `);

    // Add analytics columns to pricing_runs
    console.log('Adding analytics columns to pricing_runs...');
    await db.query(`
      ALTER TABLE pricing_runs
        ADD COLUMN IF NOT EXISTS outcome TEXT, -- 'won', 'lost', 'pending'
        ADD COLUMN IF NOT EXISTS won_lost_date DATE,
        ADD COLUMN IF NOT EXISTS won_lost_notes TEXT,
        ADD COLUMN IF NOT EXISTS competitor_price NUMERIC(12,2);
    `);

    // Add constraint for outcome
    await db.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'check_outcome'
          AND conrelid = 'pricing_runs'::regclass
        ) THEN
          ALTER TABLE pricing_runs
            ADD CONSTRAINT check_outcome
            CHECK (outcome IS NULL OR outcome IN ('won', 'lost', 'pending'));
        END IF;
      END $$;
    `);

    // Add versioning columns to pricing_runs
    console.log('Adding versioning columns to pricing_runs...');
    await db.query(`
      ALTER TABLE pricing_runs
        ADD COLUMN IF NOT EXISTS version_number INTEGER DEFAULT 1,
        ADD COLUMN IF NOT EXISTS parent_version_id UUID REFERENCES pricing_runs(id);
    `);

    console.log('Creating approval_history table...');
    await db.query(`
      CREATE TABLE IF NOT EXISTS approval_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        pricing_run_id UUID NOT NULL REFERENCES pricing_runs(id) ON DELETE CASCADE,

        action TEXT NOT NULL, -- 'submitted', 'approved', 'rejected', 'revision_requested'
        actor_id TEXT, -- user id or name
        actor_name TEXT NOT NULL,
        actor_email TEXT,

        notes TEXT,
        previous_status TEXT,
        new_status TEXT,

        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),

        CONSTRAINT check_action CHECK (action IN (
          'submitted',
          'approved',
          'rejected',
          'revision_requested',
          'sent_to_client',
          'marked_won',
          'marked_lost'
        ))
      );
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_approval_history_pricing_run ON approval_history(pricing_run_id);
      CREATE INDEX IF NOT EXISTS idx_approval_history_created ON approval_history(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_approval_history_action ON approval_history(action);
    `);

    // ============================================================================
    // PHASE 1 & 2 INTEGRATION: Enhance pricing_run_items
    // ============================================================================

    console.log('Enhancing pricing_run_items table...');
    await db.query(`
      ALTER TABLE pricing_run_items
        ADD COLUMN IF NOT EXISTS price_agreement_id UUID REFERENCES price_agreements(id),
        ADD COLUMN IF NOT EXISTS pricing_method TEXT DEFAULT 'rule_based';
    `);

    await db.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'check_pricing_method'
          AND conrelid = 'pricing_run_items'::regclass
        ) THEN
          ALTER TABLE pricing_run_items
            ADD CONSTRAINT check_pricing_method
            CHECK (pricing_method IN ('agreement', 'rule_based', 'manual_override'));
        END IF;
      END $$;
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_pricing_run_items_agreement ON pricing_run_items(price_agreement_id);
      CREATE INDEX IF NOT EXISTS idx_pricing_run_items_method ON pricing_run_items(pricing_method);
    `);

    // ============================================================================
    // PHASE 3: VERSIONING SUPPORT
    // ============================================================================

    console.log('Creating pricing_run_versions table...');
    await db.query(`
      CREATE TABLE IF NOT EXISTS pricing_run_versions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        pricing_run_id UUID NOT NULL REFERENCES pricing_runs(id) ON DELETE CASCADE,
        version_number INTEGER NOT NULL,

        -- Snapshot of pricing data (complete pricing_run + items as JSON)
        snapshot_data JSONB NOT NULL,

        -- Revision info
        revision_reason TEXT,
        created_by TEXT, -- user name or id
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),

        UNIQUE(pricing_run_id, version_number)
      );
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_versions_pricing_run ON pricing_run_versions(pricing_run_id);
      CREATE INDEX IF NOT EXISTS idx_versions_created ON pricing_run_versions(created_at DESC);
    `);

    // ============================================================================
    // ADDITIONAL INDEXES FOR ANALYTICS PERFORMANCE
    // ============================================================================

    console.log('Creating analytics performance indexes...');
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_pricing_runs_approval_status ON pricing_runs(approval_status);
      CREATE INDEX IF NOT EXISTS idx_pricing_runs_outcome ON pricing_runs(outcome);
      CREATE INDEX IF NOT EXISTS idx_pricing_runs_created_date ON pricing_runs(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_pricing_runs_won_lost_date ON pricing_runs(won_lost_date)
        WHERE won_lost_date IS NOT NULL;
    `);

    await db.query('COMMIT');
    console.log('✅ Pricer V2 Enhancement Migration completed successfully!');
    console.log('');
    console.log('Summary of changes:');
    console.log('- ✅ price_agreements table created');
    console.log('- ✅ users table created');
    console.log('- ✅ approval_history table created');
    console.log('- ✅ pricing_run_versions table created');
    console.log('- ✅ pricing_runs table enhanced with approval & analytics columns');
    console.log('- ✅ pricing_run_items table enhanced with agreement tracking');
    console.log('- ✅ All indexes and constraints created');
    console.log('');
    console.log('Next steps:');
    console.log('1. Run seedPricerV2.js to populate test data');
    console.log('2. Test the new tables with sample queries');

  } catch (error) {
    await db.query('ROLLBACK');
    console.error('❌ Error during Pricer V2 Enhancement Migration:', error);
    throw error;
  }
}

module.exports = {
  enhancePricerV2,
};
