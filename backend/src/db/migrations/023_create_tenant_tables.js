/**
 * Migration 023: Multi-Tenant Foundation
 * 
 * Creates core tenant tables and tenant_settings for multi-tenant SmartMetal platform.
 * This is Phase 1A of the multi-tenant transformation.
 * 
 * Tables Created:
 * - tenants: Core tenant information
 * - tenant_settings: Tenant-specific configuration (JSONB key-value store)
 * 
 * Design Decision:
 * - Shared database multi-tenant model (explicit tenant_id column)
 * - All tenant-owned data will have tenant_id added in subsequent migrations
 * - NSC will be seeded as the default tenant (tenant_id = 1 or UUID)
 */

async function up(db) {
  if (!db) {
    throw new Error('Migration 023 requires db parameter. Use runAllMigrations.js to run migrations.');
  }
  
  console.log('Running migration 023: Create tenant tables...');
  
  try {
    // 1. Create tenants table
    await db.query(`
      CREATE TABLE IF NOT EXISTS tenants (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        code TEXT NOT NULL UNIQUE,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        
        CONSTRAINT tenants_code_format CHECK (code ~ '^[A-Z0-9_]+$')
      );
    `);
    console.log('✓ Created tenants table');
    
    // 2. Create tenant_settings table
    await db.query(`
      CREATE TABLE IF NOT EXISTS tenant_settings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        key TEXT NOT NULL,
        value JSONB NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        
        UNIQUE(tenant_id, key)
      );
    `);
    console.log('✓ Created tenant_settings table');
    
    // 3. Create indexes for performance
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_tenants_code ON tenants(code);
      CREATE INDEX IF NOT EXISTS idx_tenants_active ON tenants(is_active) WHERE is_active = true;
      CREATE INDEX IF NOT EXISTS idx_tenant_settings_tenant_id ON tenant_settings(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_tenant_settings_key ON tenant_settings(tenant_id, key);
    `);
    console.log('✓ Created indexes for tenant tables');
    
    // 4. Add updated_at trigger for tenants
    await db.query(`
      DROP TRIGGER IF EXISTS update_tenants_updated_at ON tenants;
      CREATE TRIGGER update_tenants_updated_at
        BEFORE UPDATE ON tenants
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `);
    
    // 5. Add updated_at trigger for tenant_settings
    await db.query(`
      DROP TRIGGER IF EXISTS update_tenant_settings_updated_at ON tenant_settings;
      CREATE TRIGGER update_tenant_settings_updated_at
        BEFORE UPDATE ON tenant_settings
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `);
    console.log('✓ Added updated_at triggers');
    
    // 6. Seed default NSC tenant
    const nscTenantResult = await db.query(`
      INSERT INTO tenants (name, code, is_active)
      VALUES ('NSC Sinergi', 'NSC', true)
      ON CONFLICT (code) DO UPDATE
      SET name = EXCLUDED.name,
          is_active = EXCLUDED.is_active,
          updated_at = NOW()
      RETURNING id;
    `);
    
    const nscTenantId = nscTenantResult.rows[0]?.id;
    console.log(`✓ Seeded default NSC tenant (id: ${nscTenantId})`);
    
    // 7. Add comment for RLS (Row-Level Security) future consideration
    await db.query(`
      COMMENT ON TABLE tenants IS 'Core tenant table. Future: Consider Supabase RLS for tenant isolation.';
      COMMENT ON TABLE tenant_settings IS 'Tenant-specific configuration. Key examples: approval_rules, lme_config, stage9_config.';
    `);
    
    console.log('✅ Migration 023 completed: Tenant tables created');
    
  } catch (error) {
    console.error('❌ Migration 023 failed:', error);
    throw error;
  }
}

async function down(db) {
  if (!db) {
    throw new Error('Migration 023 requires db parameter. Use runAllMigrations.js to run migrations.');
  }
  
  console.log('Rolling back migration 023: Drop tenant tables...');
  
  try {
    // Drop in reverse order (settings first, then tenants)
    await db.query(`DROP TABLE IF EXISTS tenant_settings CASCADE;`);
    await db.query(`DROP TABLE IF EXISTS tenants CASCADE;`);
    
    console.log('✅ Rollback completed: Tenant tables dropped');
    
  } catch (error) {
    console.error('❌ Rollback failed:', error);
    throw error;
  }
}

module.exports = {
  up,
  down,
};

