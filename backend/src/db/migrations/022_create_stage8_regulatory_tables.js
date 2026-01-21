/**
 * Migration 022: Stage 8 Regulatory Integration (Scaffolding)
 * 
 * Purpose: Creates regulatory infrastructure for Stage 8
 * Part of: Stage 8 - Regulatory Integration (scaffolding + advisory mode)
 * 
 * IMPORTANT: This is scaffolding only. Actual data (HS codes, duty rates, 
 * material equivalence mappings) must be entered by NSC later.
 * 
 * Components:
 * - material_equivalences: Maps ASTM ↔ EN ↔ JIS ↔ GB standards
 * - hs_codes: Maps product/material attributes to HS codes
 * - duty_rules: Stores duty percentages per HS code, origin, destination
 * - regulatory_rules: Stores compliance rules (advisory only in current mode)
 * 
 * Stage 8 operates in ADVISORY mode by default:
 * - No blocking behavior
 * - No enforced validation
 * - Only metadata/warnings attached to pricing/approval results
 * 
 * TODO (NSC): Populate material equivalence mappings from official table
 * TODO (NSC): Populate hs_codes and duty_rules with official HS and duty tables (MITI/MIDA)
 * TODO (NSC): Consider enabling ENFORCED mode once rules are validated
 */

async function up(db) {
  console.log('Running migration: 022_create_stage8_regulatory_tables');
  
  try {
    // 1. Create material_equivalences table
    await db.query(`
      CREATE TABLE IF NOT EXISTS material_equivalences (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        family TEXT NOT NULL CHECK (family IN ('PIPE', 'FLANGE', 'FITTING', 'FASTENER', 'GRATING', 'PLATE', 'OTHER')),
        astm_spec TEXT,
        en_spec TEXT,
        jis_spec TEXT,
        gb_spec TEXT,
        notes TEXT,
        is_approved BOOLEAN DEFAULT false,
        source TEXT DEFAULT 'DEMO' CHECK (source IN ('DEMO', 'NSC', 'SYSTEM')),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        CONSTRAINT at_least_one_spec CHECK (
          astm_spec IS NOT NULL OR 
          en_spec IS NOT NULL OR 
          jis_spec IS NOT NULL OR 
          gb_spec IS NOT NULL
        )
      );
    `);
    console.log('✅ Created material_equivalences table');
    
    // Indexes for material_equivalences
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_material_equivalences_family_astm
      ON material_equivalences(family, astm_spec)
      WHERE astm_spec IS NOT NULL;
    `);
    
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_material_equivalences_family_en
      ON material_equivalences(family, en_spec)
      WHERE en_spec IS NOT NULL;
    `);
    
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_material_equivalences_family_jis
      ON material_equivalences(family, jis_spec)
      WHERE jis_spec IS NOT NULL;
    `);
    
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_material_equivalences_family_gb
      ON material_equivalences(family, gb_spec)
      WHERE gb_spec IS NOT NULL;
    `);
    
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_material_equivalences_source
      ON material_equivalences(source, is_approved);
    `);
    
    console.log('✅ Created indexes on material_equivalences');
    
    // 2. Create hs_codes table
    await db.query(`
      CREATE TABLE IF NOT EXISTS hs_codes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        hs_code TEXT NOT NULL UNIQUE,
        description TEXT NOT NULL,
        category TEXT NOT NULL CHECK (category IN ('PIPE', 'FLANGE', 'FITTING', 'FASTENER', 'GRATING', 'PLATE', 'OTHER')),
        material_group TEXT NOT NULL CHECK (material_group IN (
          'CARBON_STEEL', 'STAINLESS_STEEL', 'ALLOY_STEEL', 'DUPLEX_STEEL',
          'NICKEL_ALLOY', 'COPPER_ALLOY', 'ALUMINUM', 'OTHER'
        )),
        origin_restrictions JSONB,
        notes TEXT,
        source TEXT DEFAULT 'DEMO' CHECK (source IN ('DEMO', 'NSC', 'SYSTEM')),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    console.log('✅ Created hs_codes table');
    
    // Indexes for hs_codes
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_hs_codes_category_material_group
      ON hs_codes(category, material_group);
    `);
    
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_hs_codes_source
      ON hs_codes(source);
    `);
    
    console.log('✅ Created indexes on hs_codes');
    
    // 3. Create duty_rules table
    await db.query(`
      CREATE TABLE IF NOT EXISTS duty_rules (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        hs_code_id UUID NOT NULL REFERENCES hs_codes(id) ON DELETE CASCADE,
        origin_country TEXT NOT NULL,
        destination_country TEXT NOT NULL,
        duty_rate_pct NUMERIC(8, 4) DEFAULT 0 CHECK (duty_rate_pct >= 0 AND duty_rate_pct <= 100),
        rule_source TEXT DEFAULT 'DEMO' CHECK (rule_source IN ('MITI', 'MIDA', 'FTA', 'DEMO', 'CUSTOM')),
        valid_from DATE,
        valid_to DATE,
        notes TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    console.log('✅ Created duty_rules table');
    
    // Indexes for duty_rules
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_duty_rules_hs_code_origin_dest
      ON duty_rules(hs_code_id, origin_country, destination_country);
    `);
    
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_duty_rules_validity
      ON duty_rules(valid_from, valid_to)
      WHERE valid_from IS NOT NULL OR valid_to IS NOT NULL;
    `);
    
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_duty_rules_source
      ON duty_rules(rule_source);
    `);
    
    console.log('✅ Created indexes on duty_rules');
    
    // 4. Create regulatory_rules table
    await db.query(`
      CREATE TABLE IF NOT EXISTS regulatory_rules (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        rule_name TEXT NOT NULL,
        project_type TEXT,
        operator TEXT,
        material_family TEXT CHECK (material_family IN ('PIPE', 'FLANGE', 'FITTING', 'FASTENER', 'GRATING', 'PLATE', 'OTHER')),
        standard_spec TEXT,
        constraint_type TEXT NOT NULL CHECK (constraint_type IN ('BLOCK', 'WARN', 'EXTRA_DOCS', 'ADVISORY')),
        message TEXT NOT NULL,
        is_active BOOLEAN DEFAULT false,
        source TEXT DEFAULT 'DEMO' CHECK (source IN ('DEMO', 'NSC', 'SYSTEM')),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    console.log('✅ Created regulatory_rules table');
    
    // Indexes for regulatory_rules
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_regulatory_rules_active
      ON regulatory_rules(is_active, constraint_type)
      WHERE is_active = true;
    `);
    
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_regulatory_rules_project_operator
      ON regulatory_rules(project_type, operator)
      WHERE project_type IS NOT NULL OR operator IS NOT NULL;
    `);
    
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_regulatory_rules_material_family
      ON regulatory_rules(material_family)
      WHERE material_family IS NOT NULL;
    `);
    
    console.log('✅ Created indexes on regulatory_rules');
    
    // 5. Add regulatory_advisory column to pricing_runs (for advisory metadata)
    await db.query(`
      ALTER TABLE pricing_runs
      ADD COLUMN IF NOT EXISTS regulatory_advisory JSONB;
    `);
    console.log('✅ Added regulatory_advisory column to pricing_runs');
    
    // 6. Create updated_at trigger function if it doesn't exist
    await db.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ language 'plpgsql';
    `);
    
    // 7. Add updated_at triggers
    await db.query(`
      DROP TRIGGER IF EXISTS update_material_equivalences_updated_at ON material_equivalences;
      CREATE TRIGGER update_material_equivalences_updated_at
      BEFORE UPDATE ON material_equivalences
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
    `);
    
    await db.query(`
      DROP TRIGGER IF EXISTS update_hs_codes_updated_at ON hs_codes;
      CREATE TRIGGER update_hs_codes_updated_at
      BEFORE UPDATE ON hs_codes
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
    `);
    
    await db.query(`
      DROP TRIGGER IF EXISTS update_duty_rules_updated_at ON duty_rules;
      CREATE TRIGGER update_duty_rules_updated_at
      BEFORE UPDATE ON duty_rules
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
    `);
    
    await db.query(`
      DROP TRIGGER IF EXISTS update_regulatory_rules_updated_at ON regulatory_rules;
      CREATE TRIGGER update_regulatory_rules_updated_at
      BEFORE UPDATE ON regulatory_rules
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
    `);
    
    console.log('✅ Created updated_at triggers');
    
    console.log('✅ Migration completed: Stage 8 regulatory tables created');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

async function down(db) {
  console.log('Rolling back migration: 022_create_stage8_regulatory_tables');
  
  try {
    // Remove triggers
    await db.query(`DROP TRIGGER IF EXISTS update_regulatory_rules_updated_at ON regulatory_rules;`);
    await db.query(`DROP TRIGGER IF EXISTS update_duty_rules_updated_at ON duty_rules;`);
    await db.query(`DROP TRIGGER IF EXISTS update_hs_codes_updated_at ON hs_codes;`);
    await db.query(`DROP TRIGGER IF EXISTS update_material_equivalences_updated_at ON material_equivalences;`);
    
    // Remove column from pricing_runs
    await db.query(`ALTER TABLE pricing_runs DROP COLUMN IF EXISTS regulatory_advisory;`);
    
    // Remove indexes
    await db.query(`DROP INDEX IF EXISTS idx_regulatory_rules_material_family;`);
    await db.query(`DROP INDEX IF EXISTS idx_regulatory_rules_project_operator;`);
    await db.query(`DROP INDEX IF EXISTS idx_regulatory_rules_active;`);
    await db.query(`DROP INDEX IF EXISTS idx_duty_rules_source;`);
    await db.query(`DROP INDEX IF EXISTS idx_duty_rules_validity;`);
    await db.query(`DROP INDEX IF EXISTS idx_duty_rules_hs_code_origin_dest;`);
    await db.query(`DROP INDEX IF EXISTS idx_hs_codes_source;`);
    await db.query(`DROP INDEX IF EXISTS idx_hs_codes_category_material_group;`);
    await db.query(`DROP INDEX IF EXISTS idx_material_equivalences_source;`);
    await db.query(`DROP INDEX IF EXISTS idx_material_equivalences_family_gb;`);
    await db.query(`DROP INDEX IF EXISTS idx_material_equivalences_family_jis;`);
    await db.query(`DROP INDEX IF EXISTS idx_material_equivalences_family_en;`);
    await db.query(`DROP INDEX IF EXISTS idx_material_equivalences_family_astm;`);
    
    // Remove tables (order matters due to foreign keys)
    await db.query(`DROP TABLE IF EXISTS regulatory_rules;`);
    await db.query(`DROP TABLE IF EXISTS duty_rules;`);
    await db.query(`DROP TABLE IF EXISTS hs_codes;`);
    await db.query(`DROP TABLE IF EXISTS material_equivalences;`);
    
    console.log('✅ Migration rolled back: Stage 8 regulatory tables removed');
    
  } catch (error) {
    console.error('❌ Rollback failed:', error);
    throw error;
  }
}

module.exports = { up, down };

