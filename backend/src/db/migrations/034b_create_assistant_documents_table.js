/**
 * Migration 034
 *
 * Creates assistant_documents index table to store AI-searchable document
 * metadata and extracted text per tenant. Designed to reuse existing RFQ
 * document uploads without introducing a new upload flow.
 */
async function up(db) {
  if (!db) {
    throw new Error('Migration 034_create_assistant_documents_table requires db parameter. Use runAllMigrations.js to run migrations.');
  }

  console.log('[Migration 034] Creating assistant_documents table...');

  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS assistant_documents (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        rfq_id UUID REFERENCES rfqs(id) ON DELETE CASCADE,
        agreement_id UUID REFERENCES price_agreements(id) ON DELETE CASCADE,
        source_type TEXT NOT NULL,
        source_document_id UUID,
        title TEXT,
        status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
        text_content TEXT,
        metadata JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Unique constraint per source document within tenant/type to keep one live row
    await db.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_assistant_documents_source
      ON assistant_documents(tenant_id, source_type, source_document_id)
      WHERE source_document_id IS NOT NULL;
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_assistant_documents_tenant
      ON assistant_documents(tenant_id);
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_assistant_documents_rfq
      ON assistant_documents(rfq_id);
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_assistant_documents_status
      ON assistant_documents(tenant_id, status);
    `);

    // Optional jsonb index to enable metadata filters later
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_assistant_documents_metadata_gin
      ON assistant_documents
      USING GIN (metadata);
    `);

    // updated_at trigger
    await db.query(`
      CREATE OR REPLACE FUNCTION update_assistant_documents_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await db.query(`
      DROP TRIGGER IF EXISTS trigger_update_assistant_documents_updated_at
      ON assistant_documents;
    `);

    await db.query(`
      CREATE TRIGGER trigger_update_assistant_documents_updated_at
      BEFORE UPDATE ON assistant_documents
      FOR EACH ROW
      EXECUTE FUNCTION update_assistant_documents_updated_at();
    `);

    console.log('[Migration 034] ✅ assistant_documents table created');
  } catch (error) {
    console.error('[Migration 034] ❌ Failed to create assistant_documents table:', error);
    throw error;
  }
}

async function down(db) {
  if (!db) {
    throw new Error('Migration 034_create_assistant_documents_table requires db parameter. Use runAllMigrations.js to run migrations.');
  }

  console.log('[Migration 034] Rolling back assistant_documents table...');

  try {
    await db.query(`
      DROP TRIGGER IF EXISTS trigger_update_assistant_documents_updated_at
      ON assistant_documents;
    `);

    await db.query(`
      DROP FUNCTION IF EXISTS update_assistant_documents_updated_at();
    `);

    await db.query(`
      DROP TABLE IF EXISTS assistant_documents CASCADE;
    `);

    console.log('[Migration 034] ✅ assistant_documents table dropped');
  } catch (error) {
    console.error('[Migration 034] ❌ Failed to drop assistant_documents table:', error);
    throw error;
  }
}

module.exports = {
  up,
  down,
};
