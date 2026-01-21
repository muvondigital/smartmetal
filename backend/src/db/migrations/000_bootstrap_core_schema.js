/**
 * Migration 000: Bootstrap Core Schema
 *
 * Stage 1.4: Full Database Bootstrap from Empty Schema
 *
 * This migration creates ALL core tables required for SmartMetal Pricer
 * from scratch. It is designed to be run on a completely empty database
 * and is idempotent (safe to run multiple times).
 *
 * Tables Created (in dependency order):
 * 1. Helper Functions (update_updated_at_column)
 * 2. Core Domain Tables:
 *    - clients
 *    - projects
 *    - rfqs
 *    - rfq_items
 *    - materials
 *    - pricing_runs
 *    - pricing_run_items
 *    - approval_history
 *    - price_agreements
 *    - document_extractions
 *
 * All tables include:
 * - Proper snake_case naming
 * - UUID primary keys
 * - Timestamps (created_at, updated_at)
 * - Foreign keys with appropriate CASCADE behavior
 * - Indexes for performance
 * - tenant_id where required (for RLS in Stage 1.2-1.3)
 *
 * This migration does NOT:
 * - Enable RLS (done in migration 049)
 * - Add FORCE RLS (done in migration 051)
 * - Create specialized tables (pipes, flanges, etc. - done in later migrations)
 *
 * Design Decisions:
 * - Uses CREATE TABLE IF NOT EXISTS for idempotence
 * - Creates foreign keys with appropriate ON DELETE behavior
 * - Adds indexes inline with table creation where possible
 * - Separates index creation for clarity on composite indexes
 */

// Load .env from backend directory
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

async function up(db) {
  console.log('Running migration 000: Bootstrap Core Schema');
  console.log('Creating all core tables from scratch...');
  console.log('');

  try {
    // =========================================================================
    // STEP 1: CREATE HELPER FUNCTIONS
    // =========================================================================

    console.log('[1/11] Creating helper functions...');

    // Check if function already exists
    const functionCheck = await db.query(`
      SELECT EXISTS (
        SELECT FROM pg_proc
        WHERE proname = 'update_updated_at_column'
      );
    `);

    if (functionCheck.rows[0].exists) {
      console.log('✓ Helper function already exists (skipping creation)');
    } else {
      await db.query(`
        -- Create updated_at trigger function (idempotent)
        CREATE OR REPLACE FUNCTION update_updated_at_column()
        RETURNS TRIGGER AS $$
        BEGIN
          NEW.updated_at = NOW();
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
      `);
      console.log('✓ Helper functions created');
    }

    // =========================================================================
    // STEP 2: CREATE CLIENTS TABLE
    // =========================================================================

    console.log('[2/11] Creating clients table...');

    await db.query(`
      CREATE TABLE IF NOT EXISTS clients (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        name TEXT NOT NULL,
        code TEXT,
        industry TEXT,
        email TEXT,
        phone TEXT,
        address TEXT,
        credit_limit NUMERIC,
        payment_terms TEXT,
        notes TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

        UNIQUE(tenant_id, code)
      );

      CREATE INDEX IF NOT EXISTS idx_clients_tenant_id ON clients(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_clients_code ON clients(tenant_id, code);
      CREATE INDEX IF NOT EXISTS idx_clients_name ON clients(tenant_id, name);

      DROP TRIGGER IF EXISTS update_clients_updated_at ON clients;
      CREATE TRIGGER update_clients_updated_at
        BEFORE UPDATE ON clients
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `);

    console.log('✓ Clients table created');

    // =========================================================================
    // STEP 3: CREATE PROJECTS TABLE
    // =========================================================================

    console.log('[3/11] Creating projects table...');

    await db.query(`
      CREATE TABLE IF NOT EXISTS projects (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        code TEXT,
        description TEXT,
        project_type TEXT,
        start_date DATE,
        end_date DATE,
        status TEXT DEFAULT 'active',
        notes TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

        UNIQUE(tenant_id, code)
      );

      CREATE INDEX IF NOT EXISTS idx_projects_tenant_id ON projects(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_projects_client_id ON projects(client_id);
      CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(tenant_id, status);

      DROP TRIGGER IF EXISTS update_projects_updated_at ON projects;
      CREATE TRIGGER update_projects_updated_at
        BEFORE UPDATE ON projects
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `);

    console.log('✓ Projects table created');

    // =========================================================================
    // STEP 4: CREATE RFQS TABLE
    // =========================================================================

    console.log('[4/11] Creating rfqs table...');

    await db.query(`
      CREATE TABLE IF NOT EXISTS rfqs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
        client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
        rfq_number TEXT,
        rfq_name TEXT,
        status TEXT DEFAULT 'draft',
        due_date DATE,
        notes TEXT,
        created_by TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

        UNIQUE(tenant_id, rfq_number)
      );

      CREATE INDEX IF NOT EXISTS idx_rfqs_tenant_id ON rfqs(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_rfqs_project_id ON rfqs(project_id);
      CREATE INDEX IF NOT EXISTS idx_rfqs_client_id ON rfqs(client_id);
      CREATE INDEX IF NOT EXISTS idx_rfqs_status ON rfqs(tenant_id, status);
      CREATE INDEX IF NOT EXISTS idx_rfqs_created_at ON rfqs(tenant_id, created_at DESC);

      DROP TRIGGER IF EXISTS update_rfqs_updated_at ON rfqs;
      CREATE TRIGGER update_rfqs_updated_at
        BEFORE UPDATE ON rfqs
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `);

    console.log('✓ RFQs table created');

    // =========================================================================
    // STEP 5: CREATE MATERIALS TABLE
    // =========================================================================

    console.log('[5/11] Creating materials table...');

    await db.query(`
      CREATE TABLE IF NOT EXISTS materials (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        material_code TEXT UNIQUE NOT NULL,
        category TEXT NOT NULL,
        spec_standard TEXT,
        grade TEXT,
        material_type TEXT,
        origin_type TEXT NOT NULL,
        size_description TEXT,
        base_cost NUMERIC NOT NULL,
        currency TEXT NOT NULL DEFAULT 'USD',
        notes TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_materials_material_code ON materials(material_code);
      CREATE INDEX IF NOT EXISTS idx_materials_category ON materials(category);
      CREATE INDEX IF NOT EXISTS idx_materials_origin_type ON materials(origin_type);
      CREATE INDEX IF NOT EXISTS idx_materials_grade ON materials(grade);

      DROP TRIGGER IF EXISTS update_materials_updated_at ON materials;
      CREATE TRIGGER update_materials_updated_at
        BEFORE UPDATE ON materials
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `);

    console.log('✓ Materials table created');

    // =========================================================================
    // STEP 6: CREATE RFQ_ITEMS TABLE
    // =========================================================================

    console.log('[6/11] Creating rfq_items table...');

    await db.query(`
      CREATE TABLE IF NOT EXISTS rfq_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        rfq_id UUID NOT NULL REFERENCES rfqs(id) ON DELETE CASCADE,
        material_id UUID REFERENCES materials(id) ON DELETE SET NULL,
        material_code TEXT,
        line_number INTEGER,
        description TEXT,
        quantity NUMERIC NOT NULL,
        unit TEXT,
        size TEXT,
        grade TEXT,
        spec TEXT,
        notes TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_rfq_items_tenant_id ON rfq_items(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_rfq_items_rfq_id ON rfq_items(rfq_id);
      CREATE INDEX IF NOT EXISTS idx_rfq_items_material_id ON rfq_items(material_id);
      CREATE INDEX IF NOT EXISTS idx_rfq_items_material_code ON rfq_items(material_code);

      DROP TRIGGER IF EXISTS update_rfq_items_updated_at ON rfq_items;
      CREATE TRIGGER update_rfq_items_updated_at
        BEFORE UPDATE ON rfq_items
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `);

    console.log('✓ RFQ items table created');

    // =========================================================================
    // STEP 7: CREATE PRICING_RUNS TABLE
    // =========================================================================

    console.log('[7/11] Creating pricing_runs table...');

    await db.query(`
      CREATE TABLE IF NOT EXISTS pricing_runs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        rfq_id UUID NOT NULL REFERENCES rfqs(id) ON DELETE CASCADE,
        run_number INTEGER,
        version INTEGER DEFAULT 1,
        parent_version_id UUID REFERENCES pricing_runs(id) ON DELETE SET NULL,
        pricing_strategy TEXT,
        total_cost NUMERIC,
        total_price NUMERIC,
        margin_percentage NUMERIC,
        approval_status TEXT DEFAULT 'pending',
        approved_by TEXT,
        approved_at TIMESTAMP WITH TIME ZONE,
        notes TEXT,
        created_by TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

        UNIQUE(tenant_id, rfq_id, run_number)
      );

      CREATE INDEX IF NOT EXISTS idx_pricing_runs_tenant_id ON pricing_runs(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_pricing_runs_rfq_id ON pricing_runs(rfq_id);
      CREATE INDEX IF NOT EXISTS idx_pricing_runs_approval_status ON pricing_runs(tenant_id, approval_status);
      CREATE INDEX IF NOT EXISTS idx_pricing_runs_created_at ON pricing_runs(tenant_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_pricing_runs_parent_version ON pricing_runs(parent_version_id);

      DROP TRIGGER IF EXISTS update_pricing_runs_updated_at ON pricing_runs;
      CREATE TRIGGER update_pricing_runs_updated_at
        BEFORE UPDATE ON pricing_runs
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `);

    console.log('✓ Pricing runs table created');

    // =========================================================================
    // STEP 8: CREATE PRICING_RUN_ITEMS TABLE
    // =========================================================================

    console.log('[8/11] Creating pricing_run_items table...');

    await db.query(`
      CREATE TABLE IF NOT EXISTS pricing_run_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        pricing_run_id UUID NOT NULL REFERENCES pricing_runs(id) ON DELETE CASCADE,
        rfq_item_id UUID NOT NULL REFERENCES rfq_items(id) ON DELETE CASCADE,
        material_id UUID REFERENCES materials(id) ON DELETE SET NULL,
        quantity NUMERIC NOT NULL,
        unit_cost NUMERIC,
        total_cost NUMERIC,
        markup_percentage NUMERIC,
        unit_price NUMERIC,
        total_price NUMERIC,
        margin_percentage NUMERIC,
        notes TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_pricing_run_items_tenant_id ON pricing_run_items(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_pricing_run_items_pricing_run_id ON pricing_run_items(pricing_run_id);
      CREATE INDEX IF NOT EXISTS idx_pricing_run_items_rfq_item_id ON pricing_run_items(rfq_item_id);
      CREATE INDEX IF NOT EXISTS idx_pricing_run_items_material_id ON pricing_run_items(material_id);

      DROP TRIGGER IF EXISTS update_pricing_run_items_updated_at ON pricing_run_items;
      CREATE TRIGGER update_pricing_run_items_updated_at
        BEFORE UPDATE ON pricing_run_items
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `);

    console.log('✓ Pricing run items table created');

    // =========================================================================
    // STEP 9: CREATE APPROVAL_HISTORY TABLE
    // =========================================================================

    console.log('[9/11] Creating approval_history table...');

    await db.query(`
      CREATE TABLE IF NOT EXISTS approval_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        pricing_run_id UUID NOT NULL REFERENCES pricing_runs(id) ON DELETE CASCADE,
        approver_name TEXT,
        approver_email TEXT,
        action TEXT NOT NULL,
        comments TEXT,
        previous_status TEXT,
        new_status TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_approval_history_tenant_id ON approval_history(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_approval_history_pricing_run_id ON approval_history(pricing_run_id);
      CREATE INDEX IF NOT EXISTS idx_approval_history_created_at ON approval_history(created_at DESC);
    `);

    console.log('✓ Approval history table created');

    // =========================================================================
    // STEP 10: CREATE PRICE_AGREEMENTS TABLE
    // =========================================================================

    console.log('[10/11] Creating price_agreements table...');

    await db.query(`
      CREATE TABLE IF NOT EXISTS price_agreements (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        material_id UUID REFERENCES materials(id) ON DELETE SET NULL,
        category TEXT,
        base_price NUMERIC NOT NULL,
        currency TEXT NOT NULL DEFAULT 'USD',
        volume_tiers JSONB,
        valid_from DATE NOT NULL,
        valid_until DATE NOT NULL,
        payment_terms TEXT,
        delivery_terms TEXT,
        notes TEXT,
        status TEXT DEFAULT 'draft',
        created_by TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_price_agreements_tenant_id ON price_agreements(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_price_agreements_client_id ON price_agreements(client_id);
      CREATE INDEX IF NOT EXISTS idx_price_agreements_material_id ON price_agreements(material_id);
      CREATE INDEX IF NOT EXISTS idx_price_agreements_status ON price_agreements(tenant_id, status);
      CREATE INDEX IF NOT EXISTS idx_price_agreements_valid_dates ON price_agreements(valid_from, valid_until);

      DROP TRIGGER IF EXISTS update_price_agreements_updated_at ON price_agreements;
      CREATE TRIGGER update_price_agreements_updated_at
        BEFORE UPDATE ON price_agreements
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `);

    console.log('✓ Price agreements table created');

    // =========================================================================
    // STEP 11: CREATE DOCUMENT_EXTRACTIONS TABLE
    // =========================================================================

    console.log('[11/11] Creating document_extractions table...');

    // Check if table already exists (might be from migration 005)
    const docExtractionsCheck = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'document_extractions'
      );
    `);

    if (docExtractionsCheck.rows[0].exists) {
      console.log('✓ Document extractions table already exists (skipping creation)');
      console.log('   Note: tenant_id column will be added by migration 024 if not present');
    } else {
      await db.query(`
        CREATE TABLE document_extractions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id UUID NOT NULL,
          rfq_id UUID NOT NULL REFERENCES rfqs(id) ON DELETE CASCADE,
          document_url TEXT,
          extraction_type TEXT,
          raw_text TEXT,
          structured_data JSONB,
          confidence_score NUMERIC,
          status TEXT DEFAULT 'pending',
          error_message TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_document_extractions_tenant_id ON document_extractions(tenant_id);
        CREATE INDEX IF NOT EXISTS idx_document_extractions_rfq_id ON document_extractions(rfq_id);
        CREATE INDEX IF NOT EXISTS idx_document_extractions_status ON document_extractions(status);
        CREATE INDEX IF NOT EXISTS idx_document_extractions_created_at ON document_extractions(created_at DESC);

        DROP TRIGGER IF EXISTS update_document_extractions_updated_at ON document_extractions;
        CREATE TRIGGER update_document_extractions_updated_at
          BEFORE UPDATE ON document_extractions
          FOR EACH ROW
          EXECUTE FUNCTION update_updated_at_column();
      `);
      console.log('✓ Document extractions table created');
    }

    // =========================================================================
    // SUMMARY
    // =========================================================================

    console.log('');
    console.log('='.repeat(60));
    console.log('✅ Migration 000 completed successfully');
    console.log('='.repeat(60));
    console.log('');
    console.log('Core tables created:');
    console.log('  ✓ clients (tenant-scoped)');
    console.log('  ✓ projects (tenant-scoped)');
    console.log('  ✓ rfqs (tenant-scoped)');
    console.log('  ✓ rfq_items (tenant-scoped)');
    console.log('  ✓ materials (global)');
    console.log('  ✓ pricing_runs (tenant-scoped)');
    console.log('  ✓ pricing_run_items (tenant-scoped)');
    console.log('  ✓ approval_history (tenant-scoped)');
    console.log('  ✓ price_agreements (tenant-scoped)');
    console.log('  ✓ document_extractions (tenant-scoped)');
    console.log('');
    console.log('All tables include:');
    console.log('  ✓ Proper snake_case naming');
    console.log('  ✓ UUID primary keys');
    console.log('  ✓ Timestamps (created_at, updated_at)');
    console.log('  ✓ tenant_id for RLS (where required)');
    console.log('  ✓ Foreign keys with CASCADE behavior');
    console.log('  ✓ Indexes for performance');
    console.log('');
    console.log('Next steps:');
    console.log('  1. Run remaining migrations (002-051) for feature additions');
    console.log('  2. Migration 023 will create tenants table');
    console.log('  3. Migration 049 will enable RLS policies');
    console.log('  4. Migration 051 will add FORCE RLS');
    console.log('');

  } catch (error) {
    console.error('❌ Migration 000 failed:', error);
    console.error('');
    console.error('Error details:', error.message);
    if (error.stack) {
      console.error('');
      console.error('Stack trace:');
      console.error(error.stack);
    }
    throw error;
  }
}

/**
 * Rollback migration 000
 *
 * CAUTION: This will drop ALL core tables and DELETE ALL DATA.
 * Only use for development/testing purposes.
 */
async function down(db) {
  console.log('Rolling back migration 000: Bootstrap Core Schema');
  console.log('⚠️  WARNING: This will drop ALL core tables and DELETE ALL DATA');
  console.log('');

  try {
    // Drop tables in reverse dependency order
    await db.query(`
      DROP TABLE IF EXISTS document_extractions CASCADE;
      DROP TABLE IF EXISTS price_agreements CASCADE;
      DROP TABLE IF EXISTS approval_history CASCADE;
      DROP TABLE IF EXISTS pricing_run_items CASCADE;
      DROP TABLE IF EXISTS pricing_runs CASCADE;
      DROP TABLE IF EXISTS rfq_items CASCADE;
      DROP TABLE IF EXISTS materials CASCADE;
      DROP TABLE IF EXISTS rfqs CASCADE;
      DROP TABLE IF EXISTS projects CASCADE;
      DROP TABLE IF EXISTS clients CASCADE;
      DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;
    `);

    console.log('✅ Rollback completed: All core tables dropped');
  } catch (error) {
    console.error('❌ Rollback failed:', error);
    throw error;
  }
}

module.exports = {
  up,
  down,
};
