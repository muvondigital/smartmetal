/**
 * Migration: Add document_type field to rfqs table
 * 
 * Purpose: Support multiple commercial request types (RFQ, PO, MTO, BOQ, Budget, Tender, Change Order, Re-quote)
 * 
 * This migration:
 * 1. Adds document_type column to rfqs table with default 'RFQ' for backward compatibility
 * 2. Creates index for filtering by document type
 * 3. Updates existing records to have document_type = 'RFQ' (backward compatibility)
 * 
 * Part of: Commercial Request Type Support
 */

async function up(db) {
  console.log('Running migration: 068_add_document_type_to_rfqs');

  // Step 1: Add document_type column with default 'RFQ' for backward compatibility
  console.log('  Adding document_type column to rfqs table...');
  await db.query(`
    ALTER TABLE rfqs
    ADD COLUMN IF NOT EXISTS document_type TEXT DEFAULT 'RFQ'
      CHECK (document_type IN ('RFQ', 'PO', 'MTO', 'BOQ', 'Budget', 'Tender', 'Change Order', 'Re-quote'));
  `);

  // Step 2: Update existing records to have document_type = 'RFQ' (if NULL)
  console.log('  Updating existing records to default to RFQ...');
  await db.query(`
    UPDATE rfqs
    SET document_type = 'RFQ'
    WHERE document_type IS NULL;
  `);

  // Step 3: Make document_type NOT NULL after setting defaults
  console.log('  Making document_type NOT NULL...');
  await db.query(`
    ALTER TABLE rfqs
    ALTER COLUMN document_type SET NOT NULL;
  `);

  // Step 4: Create index for filtering by document type
  console.log('  Creating index on document_type...');
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_rfqs_document_type 
    ON rfqs(tenant_id, document_type);
  `);

  console.log('✓ Migration 068 completed: document_type field added to rfqs');
}

async function down(db) {
  console.log('Rolling back migration: 068_add_document_type_to_rfqs');

  // Drop index first
  await db.query(`DROP INDEX IF EXISTS idx_rfqs_document_type;`);

  // Remove column
  await db.query(`ALTER TABLE rfqs DROP COLUMN IF EXISTS document_type;`);

  console.log('✓ Migration 068 rolled back');
}

module.exports = { up, down };
