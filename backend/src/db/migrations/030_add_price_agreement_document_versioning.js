/**
 * Migration 030
 * 
 * Adds basic document versioning support for price agreements:
 * - price_agreements.document_version (integer, default 0)
 * - price_agreement_document_versions table to store version history
 */

async function up(db) {
  if (!db) {
    throw new Error('Migration 030 requires db parameter. Use runAllMigrations.js to run migrations.');
  }

  console.log('[Migration 030] Adding document versioning for price agreements...');

  try {
    // 1) Add document_version column to price_agreements (if not exists)
    await db.query(`
      ALTER TABLE price_agreements
      ADD COLUMN IF NOT EXISTS document_version INTEGER DEFAULT 0
    `);
    console.log('[Migration 030] ✓ Added price_agreements.document_version');

    // 2) Create price_agreement_document_versions table (if not exists)
    await db.query(`
      CREATE TABLE IF NOT EXISTS price_agreement_document_versions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        price_agreement_id UUID NOT NULL REFERENCES price_agreements(id) ON DELETE CASCADE,
        tenant_id UUID,
        version INTEGER NOT NULL,
        format TEXT NOT NULL, -- 'html' | 'pdf' | other future formats
        html_snapshot TEXT,   -- optional HTML snapshot for audit / regeneration
        generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    console.log('[Migration 030] ✓ Created price_agreement_document_versions table');

    // 3) Helpful indexes
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_price_agreement_document_versions_agreement
      ON price_agreement_document_versions(price_agreement_id, version DESC)
    `);
    console.log('[Migration 030] ✓ Created index on price_agreement_document_versions(price_agreement_id, version)');
  } catch (error) {
    console.error('[Migration 030] Migration failed:', error);
    throw error;
  }
}

async function down(db) {
  if (!db) {
    throw new Error('Migration 030 requires db parameter. Use runAllMigrations.js to run migrations.');
  }

  console.log('[Migration 030] Rolling back document versioning for price agreements...');

  try {
    await db.query(`
      DROP TABLE IF EXISTS price_agreement_document_versions
    `);
    console.log('[Migration 030] ✓ Dropped price_agreement_document_versions table');

    await db.query(`
      ALTER TABLE price_agreements
      DROP COLUMN IF EXISTS document_version
    `);
    console.log('[Migration 030] ✓ Dropped price_agreements.document_version');
  } catch (error) {
    console.error('[Migration 030] Rollback failed:', error);
    throw error;
  }
}

module.exports = {
  up,
  down,
};


