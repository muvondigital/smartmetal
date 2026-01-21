/**
 * Migration: Add Blob Storage columns to document_extractions table
 *
 * Purpose: Store Azure Blob Storage URLs and blob names for uploaded documents
 * Part of: Azure Phase 1 - Blob Storage Integration
 */

async function up(db) {
  console.log('Running migration: 070_add_blob_storage_to_document_extractions');

  // Add blob_url and blob_name columns
  await db.query(`
    ALTER TABLE document_extractions
    ADD COLUMN IF NOT EXISTS blob_url TEXT,
    ADD COLUMN IF NOT EXISTS blob_name TEXT;
  `);

  // Create index on blob_name for faster lookups
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_document_extractions_blob_name
    ON document_extractions(blob_name)
    WHERE blob_name IS NOT NULL;
  `);

  console.log('✅ Migration completed: Added blob_url and blob_name columns to document_extractions');
}

async function down(db) {
  console.log('Rolling back migration: 070_add_blob_storage_to_document_extractions');

  // Drop index
  await db.query(`
    DROP INDEX IF EXISTS idx_document_extractions_blob_name;
  `);

  // Drop columns
  await db.query(`
    ALTER TABLE document_extractions
    DROP COLUMN IF EXISTS blob_url,
    DROP COLUMN IF EXISTS blob_name;
  `);

  console.log('✅ Migration rolled back: Removed blob_url and blob_name columns from document_extractions');
}

module.exports = { up, down };

