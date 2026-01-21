/**
 * Migration: Create document_extractions table
 *
 * Purpose: Store AI extraction results from RFQ documents (PDF, images, DOCX)
 * and track user corrections for feedback loop
 *
 * Part of: Stage 2 - Document Intelligence
 */

async function up(db) {
  console.log('Running migration: 005_create_document_extractions_table');

  // Create document_extractions table
  await db.query(`
    CREATE TABLE IF NOT EXISTS document_extractions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

      -- Upload info
      uploaded_by_user_id TEXT,
      file_name TEXT NOT NULL,
      file_type TEXT NOT NULL CHECK (file_type IN ('pdf', 'docx', 'image', 'jpg', 'png')),
      file_size_bytes INTEGER,

      -- Extraction method
      extraction_method TEXT NOT NULL DEFAULT 'azure_doc_intelligence'
        CHECK (extraction_method IN ('azure_doc_intelligence', 'gpt4_enrichment', 'manual')),

      -- Extracted data (JSON)
      extracted_data JSONB NOT NULL,
      confidence_score NUMERIC(3, 2) CHECK (confidence_score >= 0 AND confidence_score <= 1),

      -- Validation
      validation_issues JSONB DEFAULT '[]'::jsonb,
      needs_review BOOLEAN DEFAULT false,

      -- User corrections (for feedback loop)
      corrected_data JSONB,
      reviewed_by_user_id TEXT,
      reviewed_at TIMESTAMP WITH TIME ZONE,
      review_notes TEXT,

      -- Related RFQ (if converted)
      -- Note: FK constraint will be added later when rfqs table exists
      related_rfq_id UUID,
      converted_to_rfq BOOLEAN DEFAULT false,
      converted_at TIMESTAMP WITH TIME ZONE,

      -- Timestamps
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
  `);

  // Create indexes for common queries
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_document_extractions_user
      ON document_extractions(uploaded_by_user_id, created_at DESC);
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_document_extractions_needs_review
      ON document_extractions(needs_review, created_at DESC)
      WHERE needs_review = true;
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_document_extractions_rfq
      ON document_extractions(related_rfq_id)
      WHERE related_rfq_id IS NOT NULL;
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_document_extractions_confidence
      ON document_extractions(confidence_score DESC);
  `);

  // Create trigger to update updated_at timestamp
  await db.query(`
    CREATE OR REPLACE FUNCTION update_document_extractions_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await db.query(`
    DROP TRIGGER IF EXISTS trigger_update_document_extractions_updated_at
      ON document_extractions;
  `);

  await db.query(`
    CREATE TRIGGER trigger_update_document_extractions_updated_at
      BEFORE UPDATE ON document_extractions
      FOR EACH ROW
      EXECUTE FUNCTION update_document_extractions_updated_at();
  `);

  // Add FK constraint to rfqs if rfqs table exists
  const rfqsExists = await db.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'rfqs'
    );
  `);
  
  if (rfqsExists.rows[0].exists) {
    // Check if FK constraint already exists
    const fkExists = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.table_constraints
        WHERE table_name = 'document_extractions'
        AND constraint_name = 'document_extractions_related_rfq_id_fkey'
        AND constraint_type = 'FOREIGN KEY'
      );
    `);
    
    if (!fkExists.rows[0].exists) {
      await db.query(`
        ALTER TABLE document_extractions
        ADD CONSTRAINT document_extractions_related_rfq_id_fkey
        FOREIGN KEY (related_rfq_id) REFERENCES rfqs(id) ON DELETE SET NULL;
      `);
      console.log('✅ Added FK constraint: document_extractions.related_rfq_id → rfqs.id');
    }
  } else {
    console.log('⚠️  rfqs table does not exist yet, FK constraint will be added when rfqs is created');
  }

  console.log('✅ Migration completed: document_extractions table created');
}

async function down(db) {
  console.log('Rolling back migration: 005_create_document_extractions_table');

  // Drop trigger and function
  await db.query(`
    DROP TRIGGER IF EXISTS trigger_update_document_extractions_updated_at
      ON document_extractions;
  `);

  await db.query(`
    DROP FUNCTION IF EXISTS update_document_extractions_updated_at();
  `);

  // Drop table (cascade to remove indexes automatically)
  await db.query(`
    DROP TABLE IF EXISTS document_extractions CASCADE;
  `);

  console.log('✅ Migration rolled back: document_extractions table dropped');
}

module.exports = { up, down };
