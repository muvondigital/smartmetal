const { connectDb } = require('../supabaseClient');
const { withTenantContext } = require('../tenantContext');
const { getDefaultTenant } = require('../../middleware/tenant');

/**
 * Seeds default global pricing rules.
 * Uses INSERT ... ON CONFLICT to avoid duplicate inserts.
 * Checks for existing rules before inserting to ensure idempotency.
 */
async function seedPricingRules() {
  // Ensure database is reachable (kept for symmetry with other seeds)
  await connectDb();

  // Resolve the default tenant (NSC or dev fallback)
  const tenant = await getDefaultTenant();

  if (!tenant || !tenant.id) {
    console.warn(
      '[seedPricingRules] Skipping pricing rules seed because default tenant could not be resolved.'
    );
    return;
  }

  const tenantId = tenant.id;

  const defaultRules = [
    {
      client_id: null,
      origin_type: 'NON_CHINA',
      category: 'ANY',
      markup_pct: 0.15,
      logistics_pct: 0.05,
      risk_pct: 0.02,
      notes: 'Global default for NON_CHINA origin (per-tenant)',
    },
    {
      client_id: null,
      origin_type: 'CHINA',
      category: 'ANY',
      markup_pct: 0.18,
      logistics_pct: 0.07,
      risk_pct: 0.04,
      notes: 'Global default for CHINA origin (per-tenant)',
    },
  ];

  try {
    await withTenantContext(tenantId, async (db) => {
      for (const rule of defaultRules) {
        // Check if rule already exists for this tenant
        const existingResult = await db.query(
          `SELECT id FROM client_pricing_rules 
           WHERE client_id IS NULL 
             AND origin_type = $1 
             AND category = $2
             AND tenant_id = $3`,
          [rule.origin_type, rule.category, tenantId]
        );

        if (existingResult.rows.length === 0) {
          // Insert new rule with tenant_id, within tenant context
          await db.query(
            `INSERT INTO client_pricing_rules (
              client_id, origin_type, category,
              markup_pct, logistics_pct, risk_pct, notes, tenant_id
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              rule.client_id,
              rule.origin_type,
              rule.category,
              rule.markup_pct,
              rule.logistics_pct,
              rule.risk_pct,
              rule.notes,
              tenantId,
            ]
          );
        }
      }
    });

    console.log('Pricing rules seeded successfully (tenant-scoped).');
  } catch (error) {
    console.error('Error seeding pricing rules:', error);
    throw error;
  }
}

module.exports = {
  seedPricingRules,
};

