const { connectDb } = require('./supabaseClient');

/**
 * Creates the client_pricing_rules table if it doesn't exist.
 * Idempotent - safe to run multiple times.
 *
 * NOTE: This table is deprecated/optional and not used in current system.
 * Checking if it exists rather than creating it.
 */
async function initPricingRulesTable() {
  const db = await connectDb();

  try {
    // Check if table exists
    const result = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'client_pricing_rules'
      );
    `);

    if (result.rows[0].exists) {
      console.log('✓ client_pricing_rules table already exists');
      return;
    }

    // Table doesn't exist - try to create it
    console.log('Creating client_pricing_rules table...');
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS client_pricing_rules (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        client_id UUID NULL,
        origin_type TEXT NOT NULL DEFAULT 'ANY',
        category TEXT NOT NULL DEFAULT 'ANY',
        markup_pct NUMERIC NOT NULL,
        logistics_pct NUMERIC NOT NULL,
        risk_pct NUMERIC NOT NULL,
        notes TEXT NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_pricing_rules_client_id ON client_pricing_rules(client_id);
      CREATE INDEX IF NOT EXISTS idx_pricing_rules_origin_type ON client_pricing_rules(origin_type);
      CREATE INDEX IF NOT EXISTS idx_pricing_rules_category ON client_pricing_rules(category);
      CREATE INDEX IF NOT EXISTS idx_pricing_rules_composite ON client_pricing_rules(client_id, origin_type, category);
    `;

    await db.query(createTableSQL);
    console.log('✓ client_pricing_rules table initialized successfully');
  } catch (error) {
    // If error is permissions-related, that's okay
    if (error.code === '42501') {
      console.log('⚠️  Cannot create/modify client_pricing_rules (permissions). Skipping.');
      return;
    }
    console.error('Error initializing client_pricing_rules table:', error);
    throw error;
  }
}

module.exports = {
  initPricingRulesTable,
};

