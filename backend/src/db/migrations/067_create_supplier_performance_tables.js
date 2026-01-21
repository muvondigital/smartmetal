/**
 * Migration 067: Create Supplier Performance Tables
 *
 * Phase E: Supplier Performance Groundwork
 *
 * Goal: Prepare the schema and minimal plumbing required for future supplier
 * performance analytics without fully implementing the engine.
 *
 * This migration creates:
 * 1. `suppliers` table - Basic supplier master data (if it doesn't exist)
 * 2. `supplier_performance` table - Metrics tracking for supplier performance
 *
 * Design Principles:
 * - Schema-only phase: No integration into pricing logic yet
 * - Multi-tenant aware: All tables include tenant_id
 * - Extensible: Can be extended in future phases
 * - Idempotent: Safe to re-run
 *
 * Future Use Cases:
 * - Track on-time delivery rates
 * - Monitor quality scores
 * - Analyze price variance
 * - Supplier selection optimization
 */

async function up(db) {
  if (!db) {
    throw new Error('Migration 067 requires db parameter. Use runAllMigrations.js to run migrations.');
  }

  console.log('');
  console.log('='.repeat(60));
  console.log('Migration 067: Create Supplier Performance Tables');
  console.log('='.repeat(60));
  console.log('');

  try {
    await db.query('BEGIN');

    // ============================================================================
    // STEP 1: Create suppliers table (if it doesn't exist)
    // ============================================================================
    console.log('[1/3] Creating suppliers table (if not exists)...');

    const suppliersTableExists = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'suppliers'
      );
    `);

    if (!suppliersTableExists.rows[0].exists) {
      await db.query(`
        CREATE TABLE suppliers (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id UUID NOT NULL,
          
          -- Basic supplier information
          name TEXT NOT NULL,
          code TEXT, -- Optional supplier code/identifier
          country TEXT,
          category TEXT, -- 'MATERIAL', 'SERVICE', 'FREIGHT', etc.
          supplier_type TEXT, -- 'TRADER', 'STOCKIST', 'FABRICATOR', 'MANUFACTURER', etc.
          origin_type TEXT, -- 'CHINA', 'NON_CHINA', 'MIXED'
          
          -- Contact information
          email TEXT,
          phone TEXT,
          address TEXT,
          
          -- Status
          status TEXT DEFAULT 'ACTIVE', -- 'ACTIVE', 'INACTIVE', 'SUSPENDED'
          notes TEXT,
          
          -- Timestamps
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW(),
          
          -- Constraints
          CONSTRAINT suppliers_tenant_id_fkey FOREIGN KEY (tenant_id)
            REFERENCES tenants(id) ON DELETE CASCADE,
          CONSTRAINT suppliers_status_check CHECK (status IN ('ACTIVE', 'INACTIVE', 'SUSPENDED'))
        );
      `);

      // Create indexes
      await db.query(`
        CREATE INDEX idx_suppliers_tenant_id ON suppliers(tenant_id);
        CREATE INDEX idx_suppliers_code ON suppliers(tenant_id, code) WHERE code IS NOT NULL;
        CREATE INDEX idx_suppliers_status ON suppliers(tenant_id, status);
      `);

      console.log('✓ Created suppliers table');
    } else {
      console.log('✓ Suppliers table already exists, skipping creation');
    }

    // ============================================================================
    // STEP 2: Create supplier_performance table
    // ============================================================================
    console.log('[2/3] Creating supplier_performance table...');

    const performanceTableExists = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'supplier_performance'
      );
    `);

    if (!performanceTableExists.rows[0].exists) {
      await db.query(`
        CREATE TABLE supplier_performance (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id UUID NOT NULL,
          supplier_id UUID NOT NULL,
          
          -- Metric information
          metric_type TEXT NOT NULL,
          metric_value NUMERIC NOT NULL,
          
          -- Period/date tracking
          period_start DATE,
          period_end DATE,
          recorded_at TIMESTAMPTZ DEFAULT NOW(),
          
          -- Additional context
          context JSONB, -- Flexible JSON for metric-specific data
          notes TEXT,
          
          -- Timestamps
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW(),
          
          -- Constraints
          CONSTRAINT supplier_performance_tenant_id_fkey FOREIGN KEY (tenant_id)
            REFERENCES tenants(id) ON DELETE CASCADE,
          CONSTRAINT supplier_performance_supplier_id_fkey FOREIGN KEY (supplier_id)
            REFERENCES suppliers(id) ON DELETE CASCADE,
          CONSTRAINT supplier_performance_period_check CHECK (
            period_end IS NULL OR period_start IS NULL OR period_end >= period_start
          ),
          CONSTRAINT supplier_performance_metric_type_check CHECK (
            metric_type IN (
              'on_time_delivery',
              'quality_score',
              'price_variance',
              'lead_time_variance',
              'defect_rate',
              'response_time',
              'order_fulfillment_rate',
              'custom'
            )
          )
        );
      `);

      // Create indexes for common query patterns
      await db.query(`
        CREATE INDEX idx_supplier_performance_tenant_id ON supplier_performance(tenant_id);
        CREATE INDEX idx_supplier_performance_supplier_id ON supplier_performance(supplier_id);
        CREATE INDEX idx_supplier_performance_metric_type ON supplier_performance(tenant_id, metric_type);
        CREATE INDEX idx_supplier_performance_period ON supplier_performance(tenant_id, period_start, period_end);
        CREATE INDEX idx_supplier_performance_recorded_at ON supplier_performance(tenant_id, recorded_at DESC);
      `);

      console.log('✓ Created supplier_performance table');
    } else {
      console.log('✓ Supplier_performance table already exists, skipping creation');
    }

    // ============================================================================
    // STEP 3: Add updated_at trigger for suppliers table
    // ============================================================================
    console.log('[3/3] Adding updated_at triggers...');

    // Check if trigger function exists (should exist from earlier migrations)
    const triggerFunctionExists = await db.query(`
      SELECT EXISTS (
        SELECT FROM pg_proc
        WHERE proname = 'update_updated_at_column'
      );
    `);

    if (!triggerFunctionExists.rows[0].exists) {
      await db.query(`
        CREATE OR REPLACE FUNCTION update_updated_at_column()
        RETURNS TRIGGER AS $$
        BEGIN
          NEW.updated_at = NOW();
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
      `);
    }

    // Add trigger to suppliers table
    await db.query(`
      DROP TRIGGER IF EXISTS update_suppliers_updated_at ON suppliers;
      CREATE TRIGGER update_suppliers_updated_at
        BEFORE UPDATE ON suppliers
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `);

    // Add trigger to supplier_performance table
    await db.query(`
      DROP TRIGGER IF EXISTS update_supplier_performance_updated_at ON supplier_performance;
      CREATE TRIGGER update_supplier_performance_updated_at
        BEFORE UPDATE ON supplier_performance
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `);

    console.log('✓ Added updated_at triggers');

    await db.query('COMMIT');
    console.log('');
    console.log('[Migration 067] ✅ Completed successfully');
    console.log('');
  } catch (error) {
    await db.query('ROLLBACK');
    console.error('[Migration 067] ❌ Failed:', error.message);
    throw error;
  }
}

async function down(db) {
  if (!db) {
    throw new Error('Migration 067 requires db parameter. Use runAllMigrations.js to run migrations.');
  }

  console.log('');
  console.log('='.repeat(60));
  console.log('Migration 067: Rollback - Drop Supplier Performance Tables');
  console.log('='.repeat(60));
  console.log('');

  try {
    await db.query('BEGIN');

    // Drop tables in reverse order (due to foreign key constraints)
    console.log('[1/2] Dropping supplier_performance table...');
    await db.query('DROP TABLE IF EXISTS supplier_performance CASCADE;');
    console.log('✓ Dropped supplier_performance table');

    // Note: We do NOT drop the suppliers table in rollback because:
    // 1. It may have been created by other migrations or scripts
    // 2. Other tables may depend on it
    // 3. This migration only creates it if it doesn't exist
    console.log('[2/2] Skipping suppliers table drop (may be used by other systems)');
    console.log('  → If you need to drop suppliers table, do it manually after checking dependencies');

    await db.query('COMMIT');
    console.log('');
    console.log('[Migration 067] ✅ Rollback completed');
    console.log('');
  } catch (error) {
    await db.query('ROLLBACK');
    console.error('[Migration 067] ❌ Rollback failed:', error.message);
    throw error;
  }
}

module.exports = {
  up,
  down,
};
