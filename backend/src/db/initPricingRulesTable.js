const { connectDb } = require('./supabaseClient');

/**
 * Creates the client_pricing_rules table if it doesn't exist.
 * Idempotent - safe to run multiple times.
 */
async function initPricingRulesTable() {
  const db = await connectDb();

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

  try {
    await db.query(createTableSQL);
    console.log('client_pricing_rules table initialized successfully');
  } catch (error) {
    console.error('Error initializing client_pricing_rules table:', error);
    throw error;
  }
}

module.exports = {
  initPricingRulesTable,
};

