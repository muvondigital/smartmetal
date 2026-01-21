/**
 * COMPLETE NSC DATA SETUP
 * Fills in ALL missing data needed for pricing system to work
 */

const { Pool } = require('pg');
require('dotenv').config();

async function completeNscDataSetup() {
  const pool = new Pool({ connectionString: process.env.MIGRATION_DATABASE_URL });
  const client = await pool.connect();

  try {
    console.log('🚀 COMPLETING NSC DATA SETUP...\n');

    // Get NSC tenant
    const tenantResult = await client.query("SELECT id FROM tenants WHERE code = 'nsc'");
    const tenantId = tenantResult.rows[0].id;
    console.log(`✅ NSC Tenant ID: ${tenantId}\n`);

    // ============================================================================
    // 1. LOGISTICS CONFIGURATION
    // ============================================================================
    console.log('📦 Setting up LOGISTICS CONFIGURATION...');

    const logisticsConfig = {
      // Freight rates (USD per kg) - Based on typical Malaysian import/export rates
      freight_rates: {
        MY: 0.45,   // Domestic Malaysia - lowest cost
        SG: 0.60,   // Singapore - close neighbor
        CN: 0.75,   // China - main import source
        KR: 0.95,   // South Korea
        JP: 1.15,   // Japan
        TH: 0.55,   // Thailand
        VN: 0.65,   // Vietnam
        IN: 0.85,   // India
        US: 1.50,   // USA
        EU: 1.80,   // Europe
      },

      // Insurance rates (% of CIF value)
      insurance_rates: {
        base: 0.015,  // 1.5% base insurance
        origin_adjustments: {
          MY: -0.003,   // Local = lower risk (-0.3%)
          SG: -0.002,   // Singapore = very reliable
          CN: 0.003,    // China = slightly higher risk
          IN: 0.005,    // India = higher risk
          US: 0.000,    // USA = standard
          EU: 0.000,    // Europe = standard
        },
        category_adjustments: {
          PIPE: 0.001,      // Standard items
          FLANGE: 0.002,    // Higher value items
          FITTING: 0.001,   // Standard items
          FASTENER: 0.000,  // Low value
          PLATE: 0.002,     // Heavy, high value
          STRUCTURAL_BEAM: 0.003,  // Very heavy, high value
        }
      },

      // Handling charges (USD per item/package)
      handling_charges: {
        PIPE: {
          small: { max_weight_kg: 25, charge_usd: 12 },
          medium: { max_weight_kg: 100, charge_usd: 25 },
          large: { max_weight_kg: 500, charge_usd: 60 },
          xlarge: { max_weight_kg: 9999, charge_usd: 120 }
        },
        FLANGE: {
          small: { max_weight_kg: 10, charge_usd: 8 },
          medium: { max_weight_kg: 50, charge_usd: 18 },
          large: { max_weight_kg: 200, charge_usd: 35 },
          xlarge: { max_weight_kg: 9999, charge_usd: 70 }
        },
        FITTING: {
          small: { max_weight_kg: 5, charge_usd: 5 },
          medium: { max_weight_kg: 25, charge_usd: 12 },
          large: { max_weight_kg: 100, charge_usd: 25 },
          xlarge: { max_weight_kg: 9999, charge_usd: 50 }
        },
        FASTENER: {
          small: { max_weight_kg: 1, charge_usd: 2 },
          medium: { max_weight_kg: 10, charge_usd: 5 },
          large: { max_weight_kg: 50, charge_usd: 12 },
          xlarge: { max_weight_kg: 9999, charge_usd: 25 }
        },
        PLATE: {
          small: { max_weight_kg: 50, charge_usd: 20 },
          medium: { max_weight_kg: 200, charge_usd: 45 },
          large: { max_weight_kg: 1000, charge_usd: 100 },
          xlarge: { max_weight_kg: 9999, charge_usd: 200 }
        },
        STRUCTURAL_BEAM: {
          small: { max_weight_kg: 100, charge_usd: 30 },
          medium: { max_weight_kg: 500, charge_usd: 75 },
          large: { max_weight_kg: 2000, charge_usd: 150 },
          xlarge: { max_weight_kg: 9999, charge_usd: 300 }
        }
      },

      // Port charges (USD per shipment) - Malaysian ports
      port_charges: {
        malaysia: 180,      // Port Klang, Penang, Johor
        singapore: 220,     // Singapore port
        china: 150,         // Chinese ports (lower cost)
        korea: 240,         // Korean ports
        japan: 280,         // Japanese ports
        thailand: 160,      // Thai ports
        vietnam: 140,       // Vietnamese ports
        india: 200,         // Indian ports
        usa: 350,           // US ports
        europe: 400,        // European ports
      },

      // Local charges (customs clearance, documentation, etc.)
      local_charges: {
        customs_clearance_usd: 150,
        documentation_fee_usd: 50,
        warehousing_per_day_usd: 25,
        inland_transport_base_usd: 100,
      }
    };

    // Check if logistics config exists
    const existingLogistics = await client.query(
      `SELECT id FROM tenant_settings WHERE tenant_id = $1 AND key = 'logistics_config'`,
      [tenantId]
    );

    if (existingLogistics.rows.length === 0) {
      await client.query(
        `INSERT INTO tenant_settings (tenant_id, key, value, created_at, updated_at)
         VALUES ($1, 'logistics_config', $2, NOW(), NOW())`,
        [tenantId, JSON.stringify(logisticsConfig)]
      );
      console.log('  ✅ Created logistics configuration');
    } else {
      await client.query(
        `UPDATE tenant_settings SET value = $1, updated_at = NOW()
         WHERE tenant_id = $2 AND key = 'logistics_config'`,
        [JSON.stringify(logisticsConfig), tenantId]
      );
      console.log('  ✅ Updated logistics configuration');
    }

    // ============================================================================
    // 2. MATERIAL-TO-HS CODE MAPPINGS
    // ============================================================================
    console.log('\n🏷️  Setting up MATERIAL-TO-HS CODE MAPPINGS...');

    // HS codes that actually exist in the database
    const hsMappings = [
      // PIPES
      { keyword: 'PIPE', hs_code: '7305.31.1000', priority: 7 },
      { keyword: 'STAINLESS STEEL PIPE', hs_code: '7305.31.1000', priority: 9 },
      { keyword: 'STAINLESS', hs_code: '7305.31.1000', priority: 6 },
      { keyword: 'TP304', hs_code: '7305.31.1000', priority: 8 },
      { keyword: 'TP316', hs_code: '7305.31.1000', priority: 8 },
      { keyword: 'A312', hs_code: '7305.31.1000', priority: 7 },
      { keyword: 'SEAMLESS', hs_code: '7306.40.2000', priority: 8 },

      // FLANGES
      { keyword: 'FLANGE', hs_code: '7307.21.0000', priority: 8 },
      { keyword: 'WELD NECK', hs_code: '7307.21.0000', priority: 9 },
      { keyword: 'SLIP ON', hs_code: '7307.21.0000', priority: 9 },
      { keyword: 'BLIND', hs_code: '7307.21.0000', priority: 10 },
      { keyword: 'B16.5', hs_code: '7307.21.0000', priority: 7 },
      { keyword: 'A105', hs_code: '7307.21.0000', priority: 6 },
      { keyword: 'F304', hs_code: '7307.91.0000', priority: 8 },
      { keyword: 'F316', hs_code: '7307.91.0000', priority: 8 },

      // FITTINGS
      { keyword: 'FITTING', hs_code: '7307.11.1000', priority: 5 },
      { keyword: 'ELBOW', hs_code: '7307.11.1000', priority: 8 },
      { keyword: 'TEE', hs_code: '7307.11.1000', priority: 8 },
      { keyword: 'REDUCER', hs_code: '7307.11.1000', priority: 8 },
      { keyword: 'CAP', hs_code: '7307.11.1000', priority: 8 },
      { keyword: 'B16.9', hs_code: '7307.11.1000', priority: 7 },

      // Generic fallbacks
      { keyword: 'CARBON STEEL', hs_code: '7307.21.0000', priority: 3 },
      { keyword: 'STEEL', hs_code: '7307.21.0000', priority: 2 },
    ];

    let mappingsCreated = 0;
    for (const mapping of hsMappings) {
      // Get HS code ID from regulatory_hs_codes table
      const hsCodeResult = await client.query(
        `SELECT id FROM regulatory_hs_codes WHERE hs_code = $1 LIMIT 1`,
        [mapping.hs_code]
      );

      if (hsCodeResult.rows.length === 0) {
        console.log(`  ⚠️  HS code ${mapping.hs_code} not found, skipping mapping for "${mapping.keyword}"`);
        continue;
      }

      const hsCodeId = hsCodeResult.rows[0].id;

      const existing = await client.query(
        `SELECT id FROM regulatory_material_mapping WHERE keyword = $1 AND hs_code_id = $2`,
        [mapping.keyword, hsCodeId]
      );

      if (existing.rows.length === 0) {
        await client.query(
          `INSERT INTO regulatory_material_mapping (keyword, hs_code_id, priority, created_at)
           VALUES ($1, $2, $3, NOW())`,
          [mapping.keyword, hsCodeId, mapping.priority]
        );
        mappingsCreated++;
      }
    }

    console.log(`  ✅ Created ${mappingsCreated} HS code mappings`);
    console.log(`  ℹ️  Total mappings: ${hsMappings.length}`);

    // ============================================================================
    // 3. VERIFY & SUMMARY
    // ============================================================================
    console.log('\n📊 VERIFICATION...');

    const logCheck = await client.query(
      `SELECT value FROM tenant_settings WHERE tenant_id = $1 AND key = 'logistics_config'`,
      [tenantId]
    );

    if (logCheck.rows.length > 0) {
      const config = logCheck.rows[0].value;
      console.log(`  ✅ Logistics: ${Object.keys(config.freight_rates).length} countries, ${Object.keys(config.handling_charges).length} categories`);
    }

    const mapCheck = await client.query('SELECT COUNT(*) FROM regulatory_material_mapping');
    console.log(`  ✅ HS Mappings: ${mapCheck.rows[0].count} total`);

    const suppCheck = await client.query('SELECT COUNT(*) FROM suppliers WHERE tenant_id = $1', [tenantId]);
    console.log(`  ✅ Suppliers: ${suppCheck.rows[0].count}`);

    const matCheck = await client.query('SELECT COUNT(*) FROM materials WHERE tenant_id = $1', [tenantId]);
    console.log(`  ✅ Materials: ${matCheck.rows[0].count}`);

    const clientCheck = await client.query('SELECT COUNT(*) FROM clients WHERE tenant_id = $1', [tenantId]);
    console.log(`  ✅ Clients: ${clientCheck.rows[0].count}`);

    console.log('\n✅ NSC DATA SETUP COMPLETE!');
    console.log('\n🎯 READY FOR PRICING SYSTEM!');

  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run the setup
completeNscDataSetup().catch(console.error);
