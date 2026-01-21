/**
 * Migration 044: Phase 6 - Regulatory Learning and Intelligence Tables
 *
 * Creates tables for the Regulatory Intelligence Layer:
 * - regulatory_learning_events: Captures low confidence, overrides, no matches
 * - regulatory_keyword_mappings_tenant: Tenant-specific learned mappings
 *
 * Purpose:
 * - Enable SmartMetal to learn from user behavior and improve HS mapping accuracy
 * - Track classification events for analytics and continuous improvement
 * - Support tenant-specific mapping overrides based on learned patterns
 *
 * Multi-tenancy: Both tables support tenant_id (nullable for global context)
 */

async function up(db) {
  if (!db) {
    throw new Error('Migration 044 requires db parameter. Use runAllMigrations.js to run migrations.');
  }

  console.log('[Migration 044] Creating regulatory learning tables...');

  try {
    await db.query('BEGIN');

    // 1. Create regulatory_learning_events table
    // Drop constraint if it exists (for idempotency)
    await db.query(`
      DO $$ 
      BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'regulatory_learning_events') THEN
          ALTER TABLE regulatory_learning_events DROP CONSTRAINT IF EXISTS regulatory_learning_events_confidence_check;
        END IF;
      END $$;
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS regulatory_learning_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID,
        rfq_id UUID,
        rfq_item_id UUID,
        material_description TEXT NOT NULL,
        material_description_normalized TEXT,
        hs_code_suggested TEXT,
        hs_code_final TEXT,
        match_source TEXT CHECK (match_source IN ('DIRECT_HS', 'RULE', 'MAPPING', 'NONE')),
        confidence NUMERIC(3, 2),
        origin_country VARCHAR(10),
        trade_agreement VARCHAR(50),
        event_type TEXT NOT NULL CHECK (event_type IN ('LOW_CONFIDENCE', 'OVERRIDDEN', 'NO_MATCH', 'MANUAL_CORRECTION')),
        metadata JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Add named constraint separately (idempotent)
    await db.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints 
          WHERE constraint_name = 'regulatory_learning_events_confidence_check'
        ) THEN
          ALTER TABLE regulatory_learning_events 
          ADD CONSTRAINT regulatory_learning_events_confidence_check 
          CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1));
        END IF;
      END $$;
    `);
    console.log('[Migration 044] ✓ Created regulatory_learning_events table');

    // 2. Create indexes for regulatory_learning_events
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_regulatory_learning_events_tenant_id
        ON regulatory_learning_events(tenant_id)
        WHERE tenant_id IS NOT NULL;
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_regulatory_learning_events_event_type
        ON regulatory_learning_events(event_type);
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_regulatory_learning_events_hs_code_final
        ON regulatory_learning_events(hs_code_final)
        WHERE hs_code_final IS NOT NULL;
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_regulatory_learning_events_created_at
        ON regulatory_learning_events(created_at DESC);
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_regulatory_learning_events_tenant_event
        ON regulatory_learning_events(tenant_id, event_type, created_at DESC);
    `);

    console.log('[Migration 044] ✓ Created indexes on regulatory_learning_events');

    // 3. Create regulatory_keyword_mappings_tenant table
    await db.query(`
      CREATE TABLE IF NOT EXISTS regulatory_keyword_mappings_tenant (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        keyword TEXT NOT NULL,
        keyword_normalized TEXT NOT NULL,
        hs_code_id UUID NOT NULL REFERENCES regulatory_hs_codes(id) ON DELETE CASCADE,
        priority INTEGER NOT NULL DEFAULT 10,
        source TEXT NOT NULL DEFAULT 'LEARNED' CHECK (source IN ('SYSTEM', 'ADMIN', 'LEARNED')),
        confidence_score NUMERIC(3, 2) CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1)),
        usage_count INTEGER NOT NULL DEFAULT 0,
        last_used_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT regulatory_keyword_mappings_tenant_unique UNIQUE (tenant_id, keyword_normalized, hs_code_id)
      );
    `);
    console.log('[Migration 044] ✓ Created regulatory_keyword_mappings_tenant table');

    // 4. Create indexes for regulatory_keyword_mappings_tenant
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_regulatory_keyword_mappings_tenant_tenant_id
        ON regulatory_keyword_mappings_tenant(tenant_id);
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_regulatory_keyword_mappings_tenant_keyword
        ON regulatory_keyword_mappings_tenant(keyword_normalized);
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_regulatory_keyword_mappings_tenant_priority
        ON regulatory_keyword_mappings_tenant(tenant_id, priority ASC);
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_regulatory_keyword_mappings_tenant_source
        ON regulatory_keyword_mappings_tenant(source);
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_regulatory_keyword_mappings_tenant_hs_code
        ON regulatory_keyword_mappings_tenant(hs_code_id);
    `);

    console.log('[Migration 044] ✓ Created indexes on regulatory_keyword_mappings_tenant');

    // 5. Create updated_at trigger for tenant mappings
    await db.query(`
      DROP TRIGGER IF EXISTS trg_regulatory_keyword_mappings_tenant_updated_at ON regulatory_keyword_mappings_tenant;
      CREATE TRIGGER trg_regulatory_keyword_mappings_tenant_updated_at
        BEFORE UPDATE ON regulatory_keyword_mappings_tenant
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `);
    console.log('[Migration 044] ✓ Created updated_at trigger');

    await db.query('COMMIT');
    console.log('[Migration 044] ✅ Completed regulatory learning tables');
  } catch (error) {
    await db.query('ROLLBACK');
    console.error('[Migration 044] ❌ Failed:', error);
    throw error;
  }
}

async function down(db) {
  if (!db) {
    throw new Error('Migration 044 requires db parameter. Use runAllMigrations.js to run migrations.');
  }

  console.log('[Migration 044] Rolling back regulatory learning tables...');

  try {
    await db.query('BEGIN');

    // Drop triggers
    await db.query(`DROP TRIGGER IF EXISTS trg_regulatory_keyword_mappings_tenant_updated_at ON regulatory_keyword_mappings_tenant;`);

    // Drop indexes (order doesn't matter for drops, but being explicit)
    await db.query(`DROP INDEX IF EXISTS idx_regulatory_keyword_mappings_tenant_hs_code;`);
    await db.query(`DROP INDEX IF EXISTS idx_regulatory_keyword_mappings_tenant_source;`);
    await db.query(`DROP INDEX IF EXISTS idx_regulatory_keyword_mappings_tenant_priority;`);
    await db.query(`DROP INDEX IF EXISTS idx_regulatory_keyword_mappings_tenant_keyword;`);
    await db.query(`DROP INDEX IF EXISTS idx_regulatory_keyword_mappings_tenant_tenant_id;`);
    await db.query(`DROP INDEX IF EXISTS idx_regulatory_learning_events_tenant_event;`);
    await db.query(`DROP INDEX IF EXISTS idx_regulatory_learning_events_created_at;`);
    await db.query(`DROP INDEX IF EXISTS idx_regulatory_learning_events_hs_code_final;`);
    await db.query(`DROP INDEX IF EXISTS idx_regulatory_learning_events_event_type;`);
    await db.query(`DROP INDEX IF EXISTS idx_regulatory_learning_events_tenant_id;`);

    // Drop tables (order matters due to foreign keys)
    await db.query(`DROP TABLE IF EXISTS regulatory_keyword_mappings_tenant CASCADE;`);
    await db.query(`DROP TABLE IF EXISTS regulatory_learning_events CASCADE;`);

    await db.query('COMMIT');
    console.log('[Migration 044] ✅ Rollback complete');
  } catch (error) {
    await db.query('ROLLBACK');
    console.error('[Migration 044] ❌ Rollback failed:', error);
    throw error;
  }
}

module.exports = {
  up,
  down,
};

