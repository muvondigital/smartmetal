/**
 * Demo Seed Script for Stage 8 Regulatory Data
 * 
 * IMPORTANT: This script only runs in development/test environments.
 * It creates minimal demo/placeholder data for testing Stage 8 functionality.
 * 
 * All data is marked with source = 'DEMO' and is_approved = false.
 * 
 * TODO (NSC): Replace this demo data with real data from:
 * - Official HS code tables
 * - MITI/MIDA duty rate tables
 * - Material equivalence mappings from official sources
 * 
 * Usage:
 *   node backend/scripts/seedDemoRegulatoryData.js
 */

require('dotenv').config();
const { connectDb } = require('../src/db/supabaseClient');
const stage8Config = require('../src/config/stage8Config');

async function seedDemoRegulatoryData() {
  // Safety check: Only seed in dev/test or if explicitly allowed
  if (process.env.NODE_ENV === 'production' && !stage8Config.allowDemoRegulatoryData) {
    console.log('❌ Demo regulatory data seeding is disabled in production.');
    console.log('   Set STAGE8_ALLOW_DEMO_DATA=true to override (not recommended).');
    process.exit(1);
  }

  console.log('='.repeat(60));
  console.log('SEEDING DEMO REGULATORY DATA (Stage 8)');
  console.log('='.repeat(60));
  console.log('⚠️  WARNING: This creates DEMO/PLACEHOLDER data only.');
  console.log('   All records are marked with source = "DEMO" and is_approved = false.');
  console.log('   Real data must be entered by NSC later.');
  console.log('');

  const db = await connectDb();

  try {
    await db.query('BEGIN');

    // 1. Seed Material Equivalences (minimal examples)
    console.log('📋 Seeding material equivalences...');
    
    const materialEquivalences = [
      {
        family: 'PIPE',
        astm_spec: 'ASTM A106 Gr.B',
        en_spec: 'EN 10216-2 P235TR2',
        jis_spec: null,
        gb_spec: 'GB/T 8163 Q235B',
        notes: 'Demo equivalence - Carbon steel pipe. NOT VALIDATED.',
        is_approved: false,
        source: 'DEMO'
      },
      {
        family: 'PIPE',
        astm_spec: 'ASTM A312 TP304',
        en_spec: 'EN 10216-5 1.4301',
        jis_spec: 'JIS G3459 SUS304',
        gb_spec: 'GB/T 14976 06Cr19Ni10',
        notes: 'Demo equivalence - Stainless steel pipe. NOT VALIDATED.',
        is_approved: false,
        source: 'DEMO'
      },
      {
        family: 'FLANGE',
        astm_spec: 'ASTM A105',
        en_spec: 'EN 1092-1',
        jis_spec: 'JIS B2220',
        gb_spec: null,
        notes: 'Demo equivalence - Carbon steel flange. NOT VALIDATED.',
        is_approved: false,
        source: 'DEMO'
      }
    ];

    for (const eq of materialEquivalences) {
      await db.query(
        `INSERT INTO material_equivalences 
         (family, astm_spec, en_spec, jis_spec, gb_spec, notes, is_approved, source)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT DO NOTHING`,
        [eq.family, eq.astm_spec, eq.en_spec, eq.jis_spec, eq.gb_spec, eq.notes, eq.is_approved, eq.source]
      );
    }
    console.log(`   ✅ Inserted ${materialEquivalences.length} material equivalence records`);

    // 2. Seed HS Codes (minimal examples)
    console.log('📋 Seeding HS codes...');
    
    const hsCodes = [
      {
        hs_code: '7304.19',
        description: 'Tubes, pipes and hollow profiles, seamless, of iron (other than cast iron) or steel, of circular cross-section, of stainless steel',
        category: 'PIPE',
        material_group: 'STAINLESS_STEEL',
        origin_restrictions: null,
        notes: 'Demo HS code - NOT VALIDATED. Real HS codes must be provided by NSC.',
        source: 'DEMO'
      },
      {
        hs_code: '7304.11',
        description: 'Tubes, pipes and hollow profiles, seamless, of iron (other than cast iron) or steel, of circular cross-section, of carbon steel',
        category: 'PIPE',
        material_group: 'CARBON_STEEL',
        origin_restrictions: null,
        notes: 'Demo HS code - NOT VALIDATED. Real HS codes must be provided by NSC.',
        source: 'DEMO'
      },
      {
        hs_code: '7307.91',
        description: 'Tube or pipe fittings, of iron or steel, flanges',
        category: 'FLANGE',
        material_group: 'CARBON_STEEL',
        origin_restrictions: null,
        notes: 'Demo HS code - NOT VALIDATED. Real HS codes must be provided by NSC.',
        source: 'DEMO'
      }
    ];

    for (const hs of hsCodes) {
      await db.query(
        `INSERT INTO hs_codes 
         (hs_code, description, category, material_group, origin_restrictions, notes, source)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (hs_code) DO NOTHING`,
        [hs.hs_code, hs.description, hs.category, hs.material_group, hs.origin_restrictions, hs.notes, hs.source]
      );
    }
    console.log(`   ✅ Inserted ${hsCodes.length} HS code records`);

    // 3. Seed Duty Rules (minimal examples)
    console.log('📋 Seeding duty rules...');
    
    // Get HS code IDs for duty rules
    const hsCodeResults = await db.query(
      'SELECT id, hs_code FROM hs_codes WHERE source = $1',
      ['DEMO']
    );
    
    if (hsCodeResults.rows.length > 0) {
      const dutyRules = [
        {
          hs_code_id: hsCodeResults.rows.find(h => h.hs_code === '7304.11')?.id,
          origin_country: 'CN',
          destination_country: 'MY',
          duty_rate_pct: 5.0,
          rule_source: 'DEMO',
          valid_from: null,
          valid_to: null,
          notes: 'Demo duty rate - NOT VALIDATED. Real duty rates must be provided by NSC/MITI/MIDA.'
        },
        {
          hs_code_id: hsCodeResults.rows.find(h => h.hs_code === '7304.19')?.id,
          origin_country: 'CN',
          destination_country: 'MY',
          duty_rate_pct: 3.0,
          rule_source: 'DEMO',
          valid_from: null,
          valid_to: null,
          notes: 'Demo duty rate - NOT VALIDATED. Real duty rates must be provided by NSC/MITI/MIDA.'
        },
        {
          hs_code_id: hsCodeResults.rows.find(h => h.hs_code === '7307.91')?.id,
          origin_country: 'TH',
          destination_country: 'MY',
          duty_rate_pct: 0.0,
          rule_source: 'DEMO',
          valid_from: null,
          valid_to: null,
          notes: 'Demo duty rate (FTA example) - NOT VALIDATED. Real duty rates must be provided by NSC/MITI/MIDA.'
        }
      ].filter(dr => dr.hs_code_id); // Only include if HS code ID was found

      for (const dr of dutyRules) {
        await db.query(
          `INSERT INTO duty_rules 
           (hs_code_id, origin_country, destination_country, duty_rate_pct, rule_source, valid_from, valid_to, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT DO NOTHING`,
          [dr.hs_code_id, dr.origin_country, dr.destination_country, dr.duty_rate_pct, dr.rule_source, dr.valid_from, dr.valid_to, dr.notes]
        );
      }
      console.log(`   ✅ Inserted ${dutyRules.length} duty rule records`);
    } else {
      console.log('   ⚠️  No HS codes found, skipping duty rules');
    }

    // 4. Seed Regulatory Rules (minimal examples - all inactive by default)
    console.log('📋 Seeding regulatory rules...');
    
    const regulatoryRules = [
      {
        rule_name: 'Demo Rule - PETRONAS Project Requirement',
        project_type: null,
        operator: 'PETRONAS',
        material_family: 'PIPE',
        standard_spec: null,
        constraint_type: 'WARN',
        message: 'Demo regulatory rule - NOT VALIDATED. Real rules must be provided by NSC.',
        is_active: false, // Inactive by default
        source: 'DEMO'
      },
      {
        rule_name: 'Demo Rule - High-Pressure Project',
        project_type: 'standard',
        operator: null,
        material_family: null,
        standard_spec: null,
        constraint_type: 'ADVISORY',
        message: 'Demo regulatory rule - NOT VALIDATED. Real rules must be provided by NSC.',
        is_active: false, // Inactive by default
        source: 'DEMO'
      }
    ];

    for (const rr of regulatoryRules) {
      await db.query(
        `INSERT INTO regulatory_rules 
         (rule_name, project_type, operator, material_family, standard_spec, constraint_type, message, is_active, source)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT DO NOTHING`,
        [rr.rule_name, rr.project_type, rr.operator, rr.material_family, rr.standard_spec, rr.constraint_type, rr.message, rr.is_active, rr.source]
      );
    }
    console.log(`   ✅ Inserted ${regulatoryRules.length} regulatory rule records (all inactive)`);

    await db.query('COMMIT');

    console.log('');
    console.log('='.repeat(60));
    console.log('✅ DEMO REGULATORY DATA SEEDED SUCCESSFULLY');
    console.log('='.repeat(60));
    console.log('');
    console.log('⚠️  REMINDER:');
    console.log('   - All data is marked as source = "DEMO"');
    console.log('   - All material equivalences have is_approved = false');
    console.log('   - All regulatory rules are inactive (is_active = false)');
    console.log('   - Real data must be entered by NSC before production use');
    console.log('');

  } catch (error) {
    await db.query('ROLLBACK');
    console.error('❌ Error seeding demo regulatory data:', error);
    throw error;
  } finally {
    process.exit(0);
  }
}

// Run the seed script
seedDemoRegulatoryData().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

