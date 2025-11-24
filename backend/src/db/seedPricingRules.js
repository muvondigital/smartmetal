const { connectDb } = require('./supabaseClient');

/**
 * Seeds default global pricing rules.
 * Uses INSERT ... ON CONFLICT to avoid duplicate inserts.
 * Checks for existing rules before inserting to ensure idempotency.
 */
async function seedPricingRules() {
  const db = await connectDb();

  const defaultRules = [
    {
      client_id: null,
      origin_type: 'NON_CHINA',
      category: 'ANY',
      markup_pct: 0.15,
      logistics_pct: 0.05,
      risk_pct: 0.02,
      notes: 'Global default for NON_CHINA origin',
    },
    {
      client_id: null,
      origin_type: 'CHINA',
      category: 'ANY',
      markup_pct: 0.18,
      logistics_pct: 0.07,
      risk_pct: 0.04,
      notes: 'Global default for CHINA origin',
    },
  ];

  try {
    for (const rule of defaultRules) {
      // Check if rule already exists
      const existingResult = await db.query(
        `SELECT id FROM client_pricing_rules 
         WHERE client_id IS NULL 
           AND origin_type = $1 
           AND category = $2`,
        [rule.origin_type, rule.category]
      );

      if (existingResult.rows.length === 0) {
        // Insert new rule
        await db.query(
          `INSERT INTO client_pricing_rules (
            client_id, origin_type, category,
            markup_pct, logistics_pct, risk_pct, notes
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            rule.client_id,
            rule.origin_type,
            rule.category,
            rule.markup_pct,
            rule.logistics_pct,
            rule.risk_pct,
            rule.notes,
          ]
        );
      }
    }
    console.log('Pricing rules seeded successfully');
  } catch (error) {
    console.error('Error seeding pricing rules:', error);
    throw error;
  }
}

module.exports = {
  seedPricingRules,
};

