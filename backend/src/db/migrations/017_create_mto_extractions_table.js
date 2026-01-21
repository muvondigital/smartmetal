/**
 * Migration: Create mto_extractions table
 *
 * Purpose: Store hierarchical MTO (Material Take-Off) extraction results
 * Links to document_extractions and rfqs for full context
 *
 * Part of: Phase 0.5 - Enhanced MTO Extraction
 */

async function up(db) {
  console.log('Running migration: 017_create_mto_extractions_table');

  // Create mto_extractions table
  await db.query(`
    CREATE TABLE IF NOT EXISTS mto_extractions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

      -- Links to other tables
      document_extraction_id UUID REFERENCES document_extractions(id) ON DELETE CASCADE,
      rfq_id UUID REFERENCES rfqs(id) ON DELETE SET NULL,

      -- Hierarchical MTO structure (full JSON)
      mto_structure JSONB NOT NULL,
      
      -- Weight verification results
      weight_verification JSONB,
      
      -- Pricing readiness statistics
      pricing_readiness JSONB,
      
      -- Extraction metadata
      confidence_score NUMERIC(3, 2) CHECK (confidence_score >= 0 AND confidence_score <= 1),
      extraction_notes TEXT,

      -- Timestamps
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      linked_at TIMESTAMP WITH TIME ZONE
    );
  `);

  // Create indexes for common queries
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_mto_extractions_document
      ON mto_extractions(document_extraction_id);
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_mto_extractions_rfq
      ON mto_extractions(rfq_id)
      WHERE rfq_id IS NOT NULL;
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_mto_extractions_confidence
      ON mto_extractions(confidence_score DESC);
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_mto_extractions_created
      ON mto_extractions(created_at DESC);
  `);

  // Create GIN index for JSONB queries on mto_structure
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_mto_extractions_structure
      ON mto_extractions USING GIN (mto_structure);
  `);

  // Create trigger to update updated_at timestamp
  await db.query(`
    CREATE OR REPLACE FUNCTION update_mto_extractions_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await db.query(`
    DROP TRIGGER IF EXISTS trigger_update_mto_extractions_updated_at
      ON mto_extractions;
  `);

  await db.query(`
    CREATE TRIGGER trigger_update_mto_extractions_updated_at
      BEFORE UPDATE ON mto_extractions
      FOR EACH ROW
      EXECUTE FUNCTION update_mto_extractions_updated_at();
  `);

  console.log('✅ Migration completed: mto_extractions table created');
}

async function down(db) {
  console.log('Rolling back migration: 017_create_mto_extractions_table');

  // Drop trigger and function
  await db.query(`
    DROP TRIGGER IF EXISTS trigger_update_mto_extractions_updated_at
      ON mto_extractions;
  `);

  await db.query(`
    DROP FUNCTION IF EXISTS update_mto_extractions_updated_at();
  `);

  // Drop table (cascade to remove indexes automatically)
  await db.query(`
    DROP TABLE IF EXISTS mto_extractions CASCADE;
  `);

  console.log('✅ Migration rolled back: mto_extractions table dropped');
}

module.exports = { up, down };

