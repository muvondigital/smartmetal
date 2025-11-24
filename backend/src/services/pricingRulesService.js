const { connectDb } = require('../db/supabaseClient');

/**
 * Finds the best matching pricing rule for a given client, origin type, and category.
 * Uses specificity scoring to prefer more specific rules over generic ones.
 * 
 * Priority order:
 * 1. Client-specific rules over global rules
 * 2. Specific origin_type over 'ANY'
 * 3. Specific category over 'ANY'
 * 
 * @param {Object} params - Search parameters
 * @param {string|null} params.clientId - Client UUID (null for global rules)
 * @param {string} params.originType - Origin type ('CHINA', 'NON_CHINA', etc.)
 * @param {string} params.category - Material category ('PIPE', 'PLATE', etc.)
 * @returns {Promise<Object|null>} Best matching rule or null if none found
 */
async function findBestPricingRule({ clientId, originType, category }) {
  const db = await connectDb();

  // Build query to find matching rules
  // Rules match if:
  // - client_id = given clientId OR client_id IS NULL (global)
  // - origin_type = given originType OR origin_type = 'ANY'
  // - category = given category OR category = 'ANY'
  const query = `
    SELECT 
      id,
      client_id,
      origin_type,
      category,
      markup_pct,
      logistics_pct,
      risk_pct,
      notes
    FROM client_pricing_rules
    WHERE 
      (client_id = $1 OR client_id IS NULL)
      AND (origin_type = $2 OR origin_type = 'ANY')
      AND (category = $3 OR category = 'ANY')
    ORDER BY
      (client_id IS NOT NULL)::int DESC,
      (origin_type != 'ANY')::int DESC,
      (category != 'ANY')::int DESC
    LIMIT 1
  `;

  const result = await db.query(query, [clientId, originType, category]);

  if (result.rows.length === 0) {
    return null;
  }

  const rule = result.rows[0];
  
  return {
    markup_pct: parseFloat(rule.markup_pct),
    logistics_pct: parseFloat(rule.logistics_pct),
    risk_pct: parseFloat(rule.risk_pct),
    origin_type: rule.origin_type,
    category: rule.category,
    rule_level: rule.client_id ? 'CLIENT_SPECIFIC' : 'GLOBAL',
    notes: rule.notes,
  };
}

module.exports = {
  findBestPricingRule,
};

