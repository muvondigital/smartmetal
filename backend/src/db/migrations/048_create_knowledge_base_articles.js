/**
 * Migration 048
 *
 * Creates knowledge_base_articles table to store curated domain knowledge
 * for the AI Assistant. Supports multi-tenancy with global and tenant-scoped
 * articles, versioning, full-text search, and temporal validity.
 */
async function up(db) {
  if (!db) {
    throw new Error('Migration 048 requires db parameter. Use runAllMigrations.js to run migrations.');
  }

  console.log('[Migration 048] Creating knowledge_base_articles table...');

  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS knowledge_base_articles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NULL,
        slug TEXT NOT NULL,
        title TEXT NOT NULL,
        category TEXT NOT NULL,
        subcategory TEXT NULL,
        tags TEXT[] NOT NULL DEFAULT '{}',
        language TEXT NOT NULL DEFAULT 'en',
        summary TEXT NOT NULL,
        content TEXT NOT NULL,
        importance_weight NUMERIC(5,2) NOT NULL DEFAULT 1.0,
        version INTEGER NOT NULL DEFAULT 1,
        is_latest BOOLEAN NOT NULL DEFAULT TRUE,
        source_type TEXT NOT NULL DEFAULT 'manual',
        source_ref TEXT NULL,
        cutoff_date DATE NULL,
        valid_from DATE NULL,
        valid_until DATE NULL,
        created_by TEXT NULL,
        updated_by TEXT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        search_vector tsvector
      );
    `);

    // Unique constraint: slug must be unique within (tenant_id, slug)
    // For global articles (tenant_id = NULL), slug must be globally unique
    await db.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_kb_articles_slug_tenant
      ON knowledge_base_articles(COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), slug);
    `);

    // Index for filtering by tenant + category + subcategory
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_kb_articles_tenant_category
      ON knowledge_base_articles(tenant_id, category, subcategory);
    `);

    // Index for latest version queries
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_kb_articles_is_latest
      ON knowledge_base_articles(tenant_id, is_latest)
      WHERE is_latest = TRUE;
    `);

    // GIN index for full-text search on search_vector
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_kb_articles_search_vector
      ON knowledge_base_articles
      USING GIN (search_vector);
    `);

    // Function to update search_vector from title, summary, content, tags, category, subcategory
    await db.query(`
      CREATE OR REPLACE FUNCTION update_kb_articles_search_vector()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.search_vector :=
          setweight(to_tsvector('simple', COALESCE(NEW.title, '')), 'A') ||
          setweight(to_tsvector('simple', COALESCE(NEW.category, '')), 'B') ||
          setweight(to_tsvector('simple', COALESCE(NEW.subcategory, '')), 'B') ||
          setweight(to_tsvector('simple', COALESCE(array_to_string(NEW.tags, ' '), '')), 'C') ||
          setweight(to_tsvector('simple', COALESCE(NEW.summary, '')), 'C') ||
          setweight(to_tsvector('simple', COALESCE(NEW.content, '')), 'D');
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // Trigger to auto-update search_vector on INSERT or UPDATE
    await db.query(`
      DROP TRIGGER IF EXISTS trigger_update_kb_articles_search_vector
      ON knowledge_base_articles;
    `);

    await db.query(`
      CREATE TRIGGER trigger_update_kb_articles_search_vector
      BEFORE INSERT OR UPDATE ON knowledge_base_articles
      FOR EACH ROW
      EXECUTE FUNCTION update_kb_articles_search_vector();
    `);

    // updated_at trigger
    await db.query(`
      CREATE OR REPLACE FUNCTION update_kb_articles_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await db.query(`
      DROP TRIGGER IF EXISTS trigger_update_kb_articles_updated_at
      ON knowledge_base_articles;
    `);

    await db.query(`
      CREATE TRIGGER trigger_update_kb_articles_updated_at
      BEFORE UPDATE ON knowledge_base_articles
      FOR EACH ROW
      EXECUTE FUNCTION update_kb_articles_updated_at();
    `);

    console.log('[Migration 048] ✅ knowledge_base_articles table created with search capabilities');
  } catch (error) {
    console.error('[Migration 048] ❌ Failed to create knowledge_base_articles table:', error);
    throw error;
  }
}

async function down(db) {
  if (!db) {
    throw new Error('Migration 048 requires db parameter. Use runAllMigrations.js to run migrations.');
  }

  console.log('[Migration 048] Rolling back knowledge_base_articles table...');

  try {
    await db.query(`
      DROP TRIGGER IF EXISTS trigger_update_kb_articles_updated_at
      ON knowledge_base_articles;
    `);

    await db.query(`
      DROP TRIGGER IF EXISTS trigger_update_kb_articles_search_vector
      ON knowledge_base_articles;
    `);

    await db.query(`
      DROP FUNCTION IF EXISTS update_kb_articles_updated_at();
    `);

    await db.query(`
      DROP FUNCTION IF EXISTS update_kb_articles_search_vector();
    `);

    await db.query(`
      DROP TABLE IF EXISTS knowledge_base_articles CASCADE;
    `);

    console.log('[Migration 048] ✅ knowledge_base_articles table dropped');
  } catch (error) {
    console.error('[Migration 048] ❌ Failed to drop knowledge_base_articles table:', error);
    throw error;
  }
}

module.exports = {
  up,
  down,
};
