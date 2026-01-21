/**
 * Complete NSC Setup Script
 * Sets up NSC Sinergi with real supplier data (Sunsing) and comprehensive material catalog
 */

const { Pool } = require('pg');
require('dotenv').config();

async function setupNscCompleteData() {
  const pool = new Pool({ connectionString: process.env.MIGRATION_DATABASE_URL });
  const client = await pool.connect();

  try {
    console.log('🚀 Setting up complete NSC data...\n');

    // Get NSC tenant
    const tenantResult = await client.query(
      "SELECT id, name, code FROM tenants WHERE code = 'nsc'"
    );

    if (tenantResult.rows.length === 0) {
      console.log('❌ NSC tenant not found. Run seedTenantsAndUsers.js first.');
      return;
    }

    const tenant = tenantResult.rows[0];
    console.log(`✅ Found tenant: ${tenant.name} (${tenant.id})\n`);

    // ============================================================================
    // 1. SUPPLIERS - Real Malaysian steel suppliers
    // ============================================================================
    console.log('📦 Creating suppliers...');

    const suppliers = [
      {
        name: 'Sunsing Importer & Exporter Sdn Bhd',
        code: 'SUNSING',
        country: 'MY',
        category: 'MATERIAL',
        supplier_type: 'TRADER',
        origin_type: 'BOTH', // They supply both local and imported materials
        status: 'ACTIVE',
        email: 'sales@sunsing.com.my',
        phone: '+60-3-xxxx-xxxx',
        address: 'Malaysia',
        notes: JSON.stringify({
          products: ['Carbon Steel Pipes', 'Stainless Steel Pipes', 'Flanges', 'Fittings'],
          lead_time_days: 14,
          rating: '9/10',
          website: 'https://www.sunsing.com.my'
        })
      },
      {
        name: 'Masteel Industrial Sdn Bhd',
        code: 'MASTEEL',
        country: 'MY',
        category: 'MATERIAL',
        supplier_type: 'STOCKIST',
        origin_type: 'NON_CHINA',
        status: 'ACTIVE',
        email: 'sales@masteel.com.my',
        phone: '+60-3-xxxx-xxxx',
        address: 'Selangor, Malaysia',
        notes: JSON.stringify({
          products: ['Carbon Steel', 'Stainless Steel', 'Alloy Steel'],
          certifications: ['ISO 9001'],
          lead_time_days: 7,
          rating: '9/10'
        })
      },
      {
        name: 'Southern Steel Berhad',
        code: 'SSB',
        country: 'MY',
        category: 'MATERIAL',
        supplier_type: 'MANUFACTURER',
        origin_type: 'NON_CHINA',
        status: 'ACTIVE',
        email: 'enquiry@southernsteel.com.my',
        phone: '+60-4-xxxx-xxxx',
        address: 'Penang, Malaysia',
        notes: JSON.stringify({
          products: ['Steel Bars', 'Wire Rods', 'Billets'],
          certifications: ['ISO 9001', 'MS'],
          lead_time_days: 21,
          rating: '8/10'
        })
      }
    ];

    for (const sup of suppliers) {
      const existing = await client.query(
        'SELECT id FROM suppliers WHERE tenant_id = $1 AND code = $2',
        [tenant.id, sup.code]
      );

      if (existing.rows.length === 0) {
        await client.query(
          `INSERT INTO suppliers (
            tenant_id, name, code, country, category, supplier_type,
            origin_type, status, email, phone, address, notes, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())`,
          [
            tenant.id, sup.name, sup.code, sup.country, sup.category,
            sup.supplier_type, sup.origin_type, sup.status, sup.email,
            sup.phone, sup.address, sup.notes
          ]
        );
        console.log(`  ✅ Created supplier: ${sup.name}`);
      } else {
        console.log(`  ⏭️  Supplier exists: ${sup.name}`);
      }
    }

    // ============================================================================
    // 2. MATERIALS CATALOG - Comprehensive steel materials based on Sunsing products
    // ============================================================================
    console.log('\n🔧 Creating materials catalog...');

    const materials = [
      // PIPES - Carbon Steel Seamless (API 5L / ASTM A106)
      { code: 'M-CS-PIPE-2-SCH40-A106B', category: 'PIPE', origin_type: 'BOTH', base_cost: 45.00, currency: 'USD',
        spec_standard: 'ASTM A106 GR.B', grade: 'GR.B', material_type: 'Carbon Steel Seamless Pipe',
        size_description: '2" SCH 40', notes: JSON.stringify({ nps: '2"', schedule: 'SCH 40', wall_thickness: '3.91mm' }) },

      { code: 'M-CS-PIPE-4-SCH40-A106B', category: 'PIPE', origin_type: 'BOTH', base_cost: 95.00, currency: 'USD',
        spec_standard: 'ASTM A106 GR.B', grade: 'GR.B', material_type: 'Carbon Steel Seamless Pipe',
        size_description: '4" SCH 40', notes: JSON.stringify({ nps: '4"', schedule: 'SCH 40', wall_thickness: '6.02mm' }) },

      { code: 'M-CS-PIPE-6-SCH40-A106B', category: 'PIPE', origin_type: 'BOTH', base_cost: 155.00, currency: 'USD',
        spec_standard: 'ASTM A106 GR.B', grade: 'GR.B', material_type: 'Carbon Steel Seamless Pipe',
        size_description: '6" SCH 40', notes: JSON.stringify({ nps: '6"', schedule: 'SCH 40', wall_thickness: '7.11mm' }) },

      // PIPES - Stainless Steel Seamless (ASTM A312)
      { code: 'M-SS-PIPE-2-SCH10S-TP316', category: 'PIPE', origin_type: 'BOTH', base_cost: 125.00, currency: 'USD',
        spec_standard: 'ASTM A312 TP316', grade: 'TP316', material_type: 'Stainless Steel 316 Seamless Pipe',
        size_description: '2" SCH 10S', notes: JSON.stringify({ nps: '2"', schedule: 'SCH 10S', wall_thickness: '2.11mm' }) },

      { code: 'M-SS-PIPE-4-SCH10S-TP316', category: 'PIPE', origin_type: 'BOTH', base_cost: 285.00, currency: 'USD',
        spec_standard: 'ASTM A312 TP316', grade: 'TP316', material_type: 'Stainless Steel 316 Seamless Pipe',
        size_description: '4" SCH 10S', notes: JSON.stringify({ nps: '4"', schedule: 'SCH 10S', wall_thickness: '2.77mm' }) },

      // FLANGES - Carbon Steel Weld Neck (ASME B16.5)
      { code: 'M-CS-FLANGE-2-150-WN-B16.5', category: 'FLANGE', origin_type: 'BOTH', base_cost: 18.50, currency: 'USD',
        spec_standard: 'ASME B16.5', grade: 'A105', material_type: 'Carbon Steel Weld Neck Flange',
        size_description: '2" 150# WN', notes: JSON.stringify({ nps: '2"', rating: '150#', type: 'WN' }) },

      { code: 'M-CS-FLANGE-4-150-WN-B16.5', category: 'FLANGE', origin_type: 'BOTH', base_cost: 32.00, currency: 'USD',
        spec_standard: 'ASME B16.5', grade: 'A105', material_type: 'Carbon Steel Weld Neck Flange',
        size_description: '4" 150# WN', notes: JSON.stringify({ nps: '4"', rating: '150#', type: 'WN' }) },

      { code: 'M-CS-FLANGE-6-150-WN-B16.5', category: 'FLANGE', origin_type: 'BOTH', base_cost: 48.00, currency: 'USD',
        spec_standard: 'ASME B16.5', grade: 'A105', material_type: 'Carbon Steel Weld Neck Flange',
        size_description: '6" 150# WN', notes: JSON.stringify({ nps: '6"', rating: '150#', type: 'WN' }) },

      // FLANGES - Stainless Steel Weld Neck (ASME B16.5)
      { code: 'M-SS-FLANGE-2-150-WN-F316', category: 'FLANGE', origin_type: 'BOTH', base_cost: 65.00, currency: 'USD',
        spec_standard: 'ASME B16.5', grade: 'F316', material_type: 'Stainless Steel 316 Weld Neck Flange',
        size_description: '2" 150# WN SS316', notes: JSON.stringify({ nps: '2"', rating: '150#', type: 'WN' }) },

      { code: 'M-SS-FLANGE-4-150-WN-F316', category: 'FLANGE', origin_type: 'BOTH', base_cost: 145.00, currency: 'USD',
        spec_standard: 'ASME B16.5', grade: 'F316', material_type: 'Stainless Steel 316 Weld Neck Flange',
        size_description: '4" 150# WN SS316', notes: JSON.stringify({ nps: '4"', rating: '150#', type: 'WN' }) },

      // FITTINGS - Carbon Steel Butt Weld (ASME B16.9)
      { code: 'M-CS-FITTING-2-ELBOW90-B16.9', category: 'FITTING', origin_type: 'BOTH', base_cost: 12.50, currency: 'USD',
        spec_standard: 'ASME B16.9', grade: 'A234 WPB', material_type: 'Carbon Steel 90° Elbow',
        size_description: '2" 90° Elbow', notes: JSON.stringify({ nps: '2"', type: '90° Elbow', end: 'Butt Weld' }) },

      { code: 'M-CS-FITTING-4-ELBOW90-B16.9', category: 'FITTING', origin_type: 'BOTH', base_cost: 28.00, currency: 'USD',
        spec_standard: 'ASME B16.9', grade: 'A234 WPB', material_type: 'Carbon Steel 90° Elbow',
        size_description: '4" 90° Elbow', notes: JSON.stringify({ nps: '4"', type: '90° Elbow', end: 'Butt Weld' }) },

      { code: 'M-CS-FITTING-2-TEE-B16.9', category: 'FITTING', origin_type: 'BOTH', base_cost: 18.00, currency: 'USD',
        spec_standard: 'ASME B16.9', grade: 'A234 WPB', material_type: 'Carbon Steel Equal Tee',
        size_description: '2" Equal Tee', notes: JSON.stringify({ nps: '2"', type: 'Equal Tee', end: 'Butt Weld' }) },

      // FITTINGS - Stainless Steel Butt Weld (ASME B16.9)
      { code: 'M-SS-FITTING-2-ELBOW90-TP316', category: 'FITTING', origin_type: 'BOTH', base_cost: 42.00, currency: 'USD',
        spec_standard: 'ASME B16.9', grade: 'TP316', material_type: 'Stainless Steel 316 90° Elbow',
        size_description: '2" 90° Elbow SS316', notes: JSON.stringify({ nps: '2"', type: '90° Elbow', end: 'Butt Weld' }) },

      { code: 'M-SS-FITTING-4-ELBOW90-TP316', category: 'FITTING', origin_type: 'BOTH', base_cost: 95.00, currency: 'USD',
        spec_standard: 'ASME B16.9', grade: 'TP316', material_type: 'Stainless Steel 316 90° Elbow',
        size_description: '4" 90° Elbow SS316', notes: JSON.stringify({ nps: '4"', type: '90° Elbow', end: 'Butt Weld' }) },
    ];

    let materialsCreated = 0;
    let materialsSkipped = 0;

    for (const mat of materials) {
      const existing = await client.query(
        'SELECT id FROM materials WHERE tenant_id = $1 AND material_code = $2',
        [tenant.id, mat.code]
      );

      if (existing.rows.length === 0) {
        await client.query(
          `INSERT INTO materials (
            tenant_id, material_code, category, origin_type, base_cost, currency,
            spec_standard, grade, material_type, size_description, notes,
            created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())`,
          [
            tenant.id, mat.code, mat.category, mat.origin_type, mat.base_cost, mat.currency,
            mat.spec_standard, mat.grade, mat.material_type, mat.size_description, mat.notes
          ]
        );
        materialsCreated++;
      } else {
        materialsSkipped++;
      }
    }

    console.log(`  ✅ Created ${materialsCreated} materials`);
    console.log(`  ⏭️  Skipped ${materialsSkipped} existing materials`);

    // ============================================================================
    // 3. CLIENTS - Real Malaysian O&G operators
    // ============================================================================
    console.log('\n👥 Creating clients...');

    const clients = [
      {
        code: 'PETRONAS_CARIGALI',
        name: 'PETRONAS Carigali Sdn Bhd',
        country: 'MY',
        industry: 'oil_and_gas',
        payment_terms: 'NET_60',
        email: 'procurement@pcsb.com.my',
        phone: '+60-3-xxxx-xxxx',
        address: 'Kuala Lumpur, Malaysia',
        notes: JSON.stringify({ operator: 'PETRONAS', incoterms: 'DAP/DDP' })
      },
      {
        code: 'PVEP_POC',
        name: 'PetroVietnam Exploration Production Corporation (PVEP-POC)',
        country: 'VN',
        industry: 'oil_and_gas',
        payment_terms: 'NET_30',
        email: 'procurement@pvep.com.vn',
        phone: '+84-xxx-xxxx',
        address: 'Vietnam',
        notes: JSON.stringify({ operator: 'PETROVIETNAM', project: 'Dai Hung Nam Block 05.1(a)' })
      }
    ];

    for (const cl of clients) {
      const existing = await client.query(
        'SELECT id FROM clients WHERE tenant_id = $1 AND code = $2',
        [tenant.id, cl.code]
      );

      if (existing.rows.length === 0) {
        await client.query(
          `INSERT INTO clients (
            tenant_id, code, name, country, industry, payment_terms,
            email, phone, address, notes, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())`,
          [
            tenant.id, cl.code, cl.name, cl.country, cl.industry, cl.payment_terms,
            cl.email, cl.phone, cl.address, cl.notes
          ]
        );
        console.log(`  ✅ Created client: ${cl.name}`);
      } else {
        console.log(`  ⏭️  Client exists: ${cl.name}`);
      }
    }

    // ============================================================================
    // 4. PRICING RULES - NSC standard markups by category/origin
    // ============================================================================
    console.log('\n💰 Creating pricing rules...');

    const pricingRules = [
      { category: 'PIPE', origin_type: 'CHINA', markup_pct: 0.18, logistics_pct: 0.04, risk_pct: 0.02 },
      { category: 'PIPE', origin_type: 'NON_CHINA', markup_pct: 0.20, logistics_pct: 0.05, risk_pct: 0.02 },
      { category: 'FLANGE', origin_type: 'CHINA', markup_pct: 0.20, logistics_pct: 0.05, risk_pct: 0.02 },
      { category: 'FLANGE', origin_type: 'NON_CHINA', markup_pct: 0.22, logistics_pct: 0.06, risk_pct: 0.02 },
      { category: 'FITTING', origin_type: 'CHINA', markup_pct: 0.19, logistics_pct: 0.04, risk_pct: 0.02 },
      { category: 'FITTING', origin_type: 'NON_CHINA', markup_pct: 0.21, logistics_pct: 0.05, risk_pct: 0.02 },
      { category: 'ANY', origin_type: 'ANY', markup_pct: 0.20, logistics_pct: 0.05, risk_pct: 0.02 }, // Fallback
    ];

    for (const rule of pricingRules) {
      const existing = await client.query(
        `SELECT id FROM client_pricing_rules
         WHERE tenant_id = $1 AND client_id IS NULL
         AND category = $2 AND origin_type = $3`,
        [tenant.id, rule.category, rule.origin_type]
      );

      if (existing.rows.length === 0) {
        await client.query(
          `INSERT INTO client_pricing_rules (
            tenant_id, client_id, category, origin_type,
            markup_pct, logistics_pct, risk_pct
          ) VALUES ($1, NULL, $2, $3, $4, $5, $6)`,
          [tenant.id, rule.category, rule.origin_type, rule.markup_pct, rule.logistics_pct, rule.risk_pct]
        );
        console.log(`  ✅ Created rule: ${rule.category}/${rule.origin_type}`);
      } else {
        console.log(`  ⏭️  Rule exists: ${rule.category}/${rule.origin_type}`);
      }
    }

    console.log('\n✅ NSC setup complete!');
    console.log('\nSummary:');
    console.log(`  - Suppliers: ${suppliers.length}`);
    console.log(`  - Materials: ${materials.length}`);
    console.log(`  - Clients: ${clients.length}`);
    console.log(`  - Pricing Rules: ${pricingRules.length}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run the setup
setupNscCompleteData().catch(console.error);
