/**
 * Migration 024: Add tenant_id to Domain Tables
 * 
 * Adds tenant_id column to all tenant-bound domain tables.
 * This is Phase 1B of the multi-tenant transformation.
 * 
 * Tables Updated:
 * - clients
 * - projects
 * - rfqs
 * - rfq_items
 * - pricing_runs
 * - pricing_run_items
 * - price_agreements
 * - approval_history
 * - document_extractions
 * - mto_extractions
 * - ai_predictions
 * - client_pricing_rules
 * 
 * Design Decision:
 * - Materials catalog: Keep as GLOBAL (shared across tenants) for now
 * - Tax rules: Keep as GLOBAL (shared across tenants) for now
 * - LME prices: Keep as GLOBAL (shared across tenants) for now
 * - All business data (RFQs, pricing, approvals) is tenant-scoped
 * 
 * Data Migration:
 * - All existing data is assigned to the default NSC tenant
 */

async function up(db) {
  if (!db) {
    throw new Error('Migration 024 requires db parameter. Use runAllMigrations.js to run migrations.');
  }
  
  console.log('Running migration 024: Add tenant_id to domain tables...');
  
  try {
    // Get the default NSC tenant ID (case-insensitive)
    const nscTenantResult = await db.query(`
      SELECT id FROM tenants WHERE code = 'nsc' LIMIT 1;
    `);
    
    if (nscTenantResult.rows.length === 0) {
      throw new Error('NSC tenant not found. Please run migration 023 first.');
    }
    
    const nscTenantId = nscTenantResult.rows[0].id;
    console.log(`Using NSC tenant ID: ${nscTenantId}`);
    
    // 1. Add tenant_id to clients
    await db.query(`
      ALTER TABLE clients
      ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
    `);
    
    // Set all existing clients to NSC tenant
    await db.query(`
      UPDATE clients
      SET tenant_id = $1
      WHERE tenant_id IS NULL;
    `, [nscTenantId]);
    
    // Make tenant_id NOT NULL and add index
    await db.query(`
      ALTER TABLE clients
      ALTER COLUMN tenant_id SET NOT NULL;
      
      CREATE INDEX IF NOT EXISTS idx_clients_tenant_id ON clients(tenant_id);
    `);
    console.log('✓ Added tenant_id to clients');
    
    // 2. Add tenant_id to projects (via client relationship, but also direct for performance)
    await db.query(`
      ALTER TABLE projects
      ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
    `);
    
    // Set tenant_id from parent client
    await db.query(`
      UPDATE projects p
      SET tenant_id = c.tenant_id
      FROM clients c
      WHERE p.client_id = c.id AND p.tenant_id IS NULL;
    `);
    
    await db.query(`
      ALTER TABLE projects
      ALTER COLUMN tenant_id SET NOT NULL;
      
      CREATE INDEX IF NOT EXISTS idx_projects_tenant_id ON projects(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_projects_tenant_client ON projects(tenant_id, client_id);
    `);
    console.log('✓ Added tenant_id to projects');
    
    // 3. Add tenant_id to rfqs (via project relationship)
    await db.query(`
      ALTER TABLE rfqs
      ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
    `);
    
    await db.query(`
      UPDATE rfqs r
      SET tenant_id = p.tenant_id
      FROM projects p
      WHERE r.project_id = p.id AND r.tenant_id IS NULL;
    `);
    
    await db.query(`
      ALTER TABLE rfqs
      ALTER COLUMN tenant_id SET NOT NULL;
      
      CREATE INDEX IF NOT EXISTS idx_rfqs_tenant_id ON rfqs(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_rfqs_tenant_status ON rfqs(tenant_id, status);
    `);
    console.log('✓ Added tenant_id to rfqs');
    
    // 4. Add tenant_id to rfq_items (via rfq relationship)
    await db.query(`
      ALTER TABLE rfq_items
      ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
    `);
    
    await db.query(`
      UPDATE rfq_items ri
      SET tenant_id = r.tenant_id
      FROM rfqs r
      WHERE ri.rfq_id = r.id AND ri.tenant_id IS NULL;
    `);
    
    await db.query(`
      ALTER TABLE rfq_items
      ALTER COLUMN tenant_id SET NOT NULL;
      
      CREATE INDEX IF NOT EXISTS idx_rfq_items_tenant_id ON rfq_items(tenant_id);
    `);
    console.log('✓ Added tenant_id to rfq_items');
    
    // 5. Add tenant_id to pricing_runs (via rfq relationship)
    await db.query(`
      ALTER TABLE pricing_runs
      ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
    `);
    
    await db.query(`
      UPDATE pricing_runs pr
      SET tenant_id = r.tenant_id
      FROM rfqs r
      WHERE pr.rfq_id = r.id AND pr.tenant_id IS NULL;
    `);
    
    await db.query(`
      ALTER TABLE pricing_runs
      ALTER COLUMN tenant_id SET NOT NULL;
      
      CREATE INDEX IF NOT EXISTS idx_pricing_runs_tenant_id ON pricing_runs(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_pricing_runs_tenant_status ON pricing_runs(tenant_id, approval_status);
    `);
    console.log('✓ Added tenant_id to pricing_runs');
    
    // 6. Add tenant_id to pricing_run_items (via pricing_run relationship)
    await db.query(`
      ALTER TABLE pricing_run_items
      ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
    `);
    
    await db.query(`
      UPDATE pricing_run_items pri
      SET tenant_id = pr.tenant_id
      FROM pricing_runs pr
      WHERE pri.pricing_run_id = pr.id AND pri.tenant_id IS NULL;
    `);
    
    await db.query(`
      ALTER TABLE pricing_run_items
      ALTER COLUMN tenant_id SET NOT NULL;
      
      CREATE INDEX IF NOT EXISTS idx_pricing_run_items_tenant_id ON pricing_run_items(tenant_id);
    `);
    console.log('✓ Added tenant_id to pricing_run_items');
    
    // 7. Add tenant_id to price_agreements (via client relationship)
    await db.query(`
      ALTER TABLE price_agreements
      ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
    `);
    
    await db.query(`
      UPDATE price_agreements pa
      SET tenant_id = c.tenant_id
      FROM clients c
      WHERE pa.client_id = c.id AND pa.tenant_id IS NULL;
    `);
    
    await db.query(`
      ALTER TABLE price_agreements
      ALTER COLUMN tenant_id SET NOT NULL;
      
      CREATE INDEX IF NOT EXISTS idx_price_agreements_tenant_id ON price_agreements(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_price_agreements_tenant_status ON price_agreements(tenant_id, status);
    `);
    console.log('✓ Added tenant_id to price_agreements');
    
    // 8. Add tenant_id to approval_history (via pricing_run relationship)
    await db.query(`
      ALTER TABLE approval_history
      ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
    `);
    
    await db.query(`
      UPDATE approval_history ah
      SET tenant_id = pr.tenant_id
      FROM pricing_runs pr
      WHERE ah.pricing_run_id = pr.id AND ah.tenant_id IS NULL;
    `);
    
    await db.query(`
      ALTER TABLE approval_history
      ALTER COLUMN tenant_id SET NOT NULL;
      
      CREATE INDEX IF NOT EXISTS idx_approval_history_tenant_id ON approval_history(tenant_id);
    `);
    console.log('✓ Added tenant_id to approval_history');
    
    // 9. Add tenant_id to document_extractions
    await db.query(`
      ALTER TABLE document_extractions
      ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
    `);
    
    // Set tenant_id from related_rfq_id if available
    await db.query(`
      UPDATE document_extractions de
      SET tenant_id = r.tenant_id
      FROM rfqs r
      WHERE de.related_rfq_id = r.id AND de.tenant_id IS NULL;
    `);
    
    // For extractions without RFQ, set to NSC
    await db.query(`
      UPDATE document_extractions
      SET tenant_id = $1
      WHERE tenant_id IS NULL;
    `, [nscTenantId]);
    
    await db.query(`
      ALTER TABLE document_extractions
      ALTER COLUMN tenant_id SET NOT NULL;
      
      CREATE INDEX IF NOT EXISTS idx_document_extractions_tenant_id ON document_extractions(tenant_id);
    `);
    console.log('✓ Added tenant_id to document_extractions');
    
    // 10. Add tenant_id to mto_extractions (via document_extraction relationship)
    await db.query(`
      ALTER TABLE mto_extractions
      ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
    `);
    
    await db.query(`
      UPDATE mto_extractions mto
      SET tenant_id = de.tenant_id
      FROM document_extractions de
      WHERE mto.document_extraction_id = de.id AND mto.tenant_id IS NULL;
    `);
    
    await db.query(`
      ALTER TABLE mto_extractions
      ALTER COLUMN tenant_id SET NOT NULL;
      
      CREATE INDEX IF NOT EXISTS idx_mto_extractions_tenant_id ON mto_extractions(tenant_id);
    `);
    console.log('✓ Added tenant_id to mto_extractions');
    
    // 11. Add tenant_id to ai_predictions (via pricing_run relationship)
    await db.query(`
      ALTER TABLE ai_predictions
      ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
    `);
    
    await db.query(`
      UPDATE ai_predictions ap
      SET tenant_id = pr.tenant_id
      FROM pricing_runs pr
      WHERE ap.pricing_run_id = pr.id AND ap.tenant_id IS NULL;
    `);
    
    await db.query(`
      ALTER TABLE ai_predictions
      ALTER COLUMN tenant_id SET NOT NULL;
      
      CREATE INDEX IF NOT EXISTS idx_ai_predictions_tenant_id ON ai_predictions(tenant_id);
    `);
    console.log('✓ Added tenant_id to ai_predictions');
    
    // 12. Add tenant_id to client_pricing_rules (via client relationship) - if table exists
    const clientPricingRulesCheck = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'client_pricing_rules'
      );
    `);

    if (clientPricingRulesCheck.rows[0].exists) {
      try {
        await db.query(`
          ALTER TABLE client_pricing_rules
          ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
        `);

        await db.query(`
          UPDATE client_pricing_rules cpr
          SET tenant_id = c.tenant_id
          FROM clients c
          WHERE cpr.client_id = c.id AND cpr.tenant_id IS NULL;
        `);

        // For global rules (client_id IS NULL), set to NSC
        await db.query(`
          UPDATE client_pricing_rules
          SET tenant_id = $1
          WHERE tenant_id IS NULL;
        `, [nscTenantId]);

        await db.query(`
          ALTER TABLE client_pricing_rules
          ALTER COLUMN tenant_id SET NOT NULL;

          CREATE INDEX IF NOT EXISTS idx_pricing_rules_tenant_id ON client_pricing_rules(tenant_id);
        `);
        console.log('✓ Added tenant_id to client_pricing_rules');
      } catch (permError) {
        if (permError.code === '42501') {
          console.log('⚠️  Cannot modify client_pricing_rules (permissions). This is expected if table was created by init script.');
        } else {
          throw permError;
        }
      }
    } else {
      console.log('⚠️  Table client_pricing_rules does not exist, skipping');
    }
    
    console.log('✅ Migration 024 completed: tenant_id added to all domain tables');
    
  } catch (error) {
    console.error('❌ Migration 024 failed:', error);
    throw error;
  }
}

async function down(db) {
  if (!db) {
    throw new Error('Migration 024 requires db parameter. Use runAllMigrations.js to run migrations.');
  }
  
  console.log('Rolling back migration 024: Remove tenant_id from domain tables...');
  
  try {
    // Remove indexes first
    await db.query(`DROP INDEX IF EXISTS idx_pricing_rules_tenant_id;`);
    await db.query(`DROP INDEX IF EXISTS idx_ai_predictions_tenant_id;`);
    await db.query(`DROP INDEX IF EXISTS idx_mto_extractions_tenant_id;`);
    await db.query(`DROP INDEX IF EXISTS idx_document_extractions_tenant_id;`);
    await db.query(`DROP INDEX IF EXISTS idx_approval_history_tenant_id;`);
    await db.query(`DROP INDEX IF EXISTS idx_price_agreements_tenant_status;`);
    await db.query(`DROP INDEX IF EXISTS idx_price_agreements_tenant_id;`);
    await db.query(`DROP INDEX IF EXISTS idx_pricing_run_items_tenant_id;`);
    await db.query(`DROP INDEX IF EXISTS idx_pricing_runs_tenant_status;`);
    await db.query(`DROP INDEX IF EXISTS idx_pricing_runs_tenant_id;`);
    await db.query(`DROP INDEX IF EXISTS idx_rfq_items_tenant_id;`);
    await db.query(`DROP INDEX IF EXISTS idx_rfqs_tenant_status;`);
    await db.query(`DROP INDEX IF EXISTS idx_rfqs_tenant_id;`);
    await db.query(`DROP INDEX IF EXISTS idx_projects_tenant_client;`);
    await db.query(`DROP INDEX IF EXISTS idx_projects_tenant_id;`);
    await db.query(`DROP INDEX IF EXISTS idx_clients_tenant_id;`);
    
    // Remove columns
    await db.query(`ALTER TABLE client_pricing_rules DROP COLUMN IF EXISTS tenant_id;`);
    await db.query(`ALTER TABLE ai_predictions DROP COLUMN IF EXISTS tenant_id;`);
    await db.query(`ALTER TABLE mto_extractions DROP COLUMN IF EXISTS tenant_id;`);
    await db.query(`ALTER TABLE document_extractions DROP COLUMN IF EXISTS tenant_id;`);
    await db.query(`ALTER TABLE approval_history DROP COLUMN IF EXISTS tenant_id;`);
    await db.query(`ALTER TABLE price_agreements DROP COLUMN IF EXISTS tenant_id;`);
    await db.query(`ALTER TABLE pricing_run_items DROP COLUMN IF EXISTS tenant_id;`);
    await db.query(`ALTER TABLE pricing_runs DROP COLUMN IF EXISTS tenant_id;`);
    await db.query(`ALTER TABLE rfq_items DROP COLUMN IF EXISTS tenant_id;`);
    await db.query(`ALTER TABLE rfqs DROP COLUMN IF EXISTS tenant_id;`);
    await db.query(`ALTER TABLE projects DROP COLUMN IF EXISTS tenant_id;`);
    await db.query(`ALTER TABLE clients DROP COLUMN IF EXISTS tenant_id;`);
    
    console.log('✅ Rollback completed: tenant_id removed from domain tables');
    
  } catch (error) {
    console.error('❌ Rollback failed:', error);
    throw error;
  }
}

module.exports = {
  up,
  down,
};

