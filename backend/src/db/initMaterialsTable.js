const { connectDb } = require('./supabaseClient');

/**
 * Creates the materials table if it doesn't exist.
 * Idempotent - safe to run multiple times.
 */
async function initMaterialsTable() {
  const db = await connectDb();

  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS materials (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      material_code TEXT UNIQUE NOT NULL,
      category TEXT NOT NULL,
      spec_standard TEXT NULL,
      grade TEXT NULL,
      material_type TEXT NULL,
      origin_type TEXT NOT NULL,
      size_description TEXT NULL,
      base_cost NUMERIC NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD',
      notes TEXT NULL,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_materials_material_code ON materials(material_code);
    CREATE INDEX IF NOT EXISTS idx_materials_category ON materials(category);
    CREATE INDEX IF NOT EXISTS idx_materials_origin_type ON materials(origin_type);

    -- Create updated_at trigger function if it doesn't exist
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    -- Add updated_at trigger for materials table
    DROP TRIGGER IF EXISTS update_materials_updated_at ON materials;
    CREATE TRIGGER update_materials_updated_at 
      BEFORE UPDATE ON materials
      FOR EACH ROW 
      EXECUTE FUNCTION update_updated_at_column();
  `;

  try {
    await db.query(createTableSQL);
    console.log('Materials table initialized successfully');
  } catch (error) {
    // In production, the table may already exist and be owned by a different user
    // This is expected when using Supabase with RLS and limited permissions
    if (error.code === '42501') { // insufficient_privilege
      console.log('Materials table already exists (owned by another user) - skipping initialization');
      return; // Not a fatal error, table exists and works
    }
    console.error('Error initializing materials table:', error);
    throw error;
  }
}

module.exports = {
  initMaterialsTable,
};

