const { connectDb } = require('./supabaseClient');

/**
 * Creates the materials table if it doesn't exist.
 * Idempotent - safe to run multiple times.
 *
 * NOTE: This function is now redundant with migrations.
 * If migrations have run, table already exists.
 * We simply verify the table exists rather than trying to modify it.
 */
async function initMaterialsTable() {
  const db = await connectDb();

  try {
    // Check if materials table exists
    const result = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'materials'
      );
    `);

    if (result.rows[0].exists) {
      console.log('✓ Materials table already exists (initialized by migrations)');
      return;
    }

    // If table doesn't exist, migrations haven't run yet
    // Create minimal table structure (full structure created by migrations)
    console.log('Creating materials table (migrations not yet run)...');
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
    `;

    await db.query(createTableSQL);
    console.log('Materials table initialized successfully');
  } catch (error) {
    // If error is permissions-related and table exists, that's okay
    if (error.code === '42501') {
      console.log('⚠️  Materials table exists but cannot be modified (permissions). This is expected if migrations have run.');
      return;
    }
    console.error('Error initializing materials table:', error);
    throw error;
  }
}

module.exports = {
  initMaterialsTable,
};

