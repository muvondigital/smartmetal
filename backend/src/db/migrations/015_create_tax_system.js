/**
 * Migration 015: Tax Compliance System
 *
 * Creates comprehensive tax infrastructure for:
 * - Malaysia SST (Sales and Service Tax) 6%
 * - Indonesia VAT (PPN - Pajak Pertambahan Nilai) 11%
 * - Tax-exempt categories
 * - Tax calculation rules
 *
 * Supports multi-jurisdiction tax compliance.
 */

async function up(db) {
  if (!db) {
    throw new Error('Migration 015 requires db parameter. Use runAllMigrations.js to run migrations.');
  }

  console.log('Running migration 015: Create tax system...');

  try {
    // 1. Create tax_rules table
    await db.query(`
      CREATE TABLE IF NOT EXISTS tax_rules (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        country TEXT NOT NULL,
        tax_type TEXT NOT NULL,
        tax_name TEXT NOT NULL,
        tax_rate NUMERIC(5, 4) NOT NULL,
        is_active BOOLEAN DEFAULT true,
        effective_from DATE NOT NULL,
        effective_until DATE,
        applies_to_category TEXT,
        exemption_codes TEXT[],
        description TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        CONSTRAINT tax_rules_country_check CHECK (country IN ('MY', 'ID', 'SG')),
        CONSTRAINT tax_rules_type_check CHECK (tax_type IN ('SST', 'VAT', 'GST', 'WHT'))
      );
    `);

    console.log('✓ Created tax_rules table');

    // 2. Add tax columns to pricing_runs
    await db.query(`
      ALTER TABLE pricing_runs
      ADD COLUMN IF NOT EXISTS subtotal NUMERIC(12, 2),
      ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(12, 2),
      ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(5, 4),
      ADD COLUMN IF NOT EXISTS tax_country TEXT,
      ADD COLUMN IF NOT EXISTS tax_type TEXT,
      ADD COLUMN IF NOT EXISTS total_with_tax NUMERIC(12, 2);
    `);

    console.log('✓ Added tax columns to pricing_runs');

    // 3. Add tax columns to pricing_run_items
    await db.query(`
      ALTER TABLE pricing_run_items
      ADD COLUMN IF NOT EXISTS subtotal NUMERIC(12, 2),
      ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(12, 2),
      ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(5, 4),
      ADD COLUMN IF NOT EXISTS tax_exempt BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS exemption_reason TEXT,
      ADD COLUMN IF NOT EXISTS total_with_tax NUMERIC(12, 2);
    `);

    console.log('✓ Added tax columns to pricing_run_items');

    // 4. Add country to clients table (if not exists)
    await db.query(`
      ALTER TABLE clients
      ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'MY',
      ADD COLUMN IF NOT EXISTS tax_id TEXT,
      ADD COLUMN IF NOT EXISTS tax_exempt BOOLEAN DEFAULT false;
    `);

    console.log('✓ Added country/tax columns to clients');

    // 5. Seed default tax rules for Malaysia and Indonesia
    await db.query(`
      INSERT INTO tax_rules (
        country, tax_type, tax_name, tax_rate,
        effective_from, description, is_active
      ) VALUES
      -- Malaysia SST
      (
        'MY', 'SST', 'Sales and Service Tax', 0.06,
        '2018-09-01', 'Malaysia Sales and Service Tax at 6%', true
      ),
      -- Indonesia VAT
      (
        'ID', 'VAT', 'PPN (Pajak Pertambahan Nilai)', 0.11,
        '2022-04-01', 'Indonesia Value Added Tax at 11%', true
      ),
      -- Singapore GST (for future expansion)
      (
        'SG', 'GST', 'Goods and Services Tax', 0.09,
        '2024-01-01', 'Singapore GST at 9%', true
      )
      ON CONFLICT DO NOTHING;
    `);

    console.log('✓ Seeded default tax rules');

    // 6. Create indexes for performance
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_tax_rules_country_active
      ON tax_rules(country, is_active)
      WHERE is_active = true;
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_pricing_runs_tax_country
      ON pricing_runs(tax_country);
    `);

    console.log('✓ Created tax indexes');

    // 7. Create tax exemption categories table
    await db.query(`
      CREATE TABLE IF NOT EXISTS tax_exemption_categories (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        country TEXT NOT NULL,
        category_code TEXT NOT NULL,
        category_name TEXT NOT NULL,
        description TEXT,
        requires_certificate BOOLEAN DEFAULT false,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(country, category_code)
      );
    `);

    console.log('✓ Created tax_exemption_categories table');

    // 8. Seed common exemptions
    await db.query(`
      INSERT INTO tax_exemption_categories (
        country, category_code, category_name, description, requires_certificate
      ) VALUES
      -- Malaysia exemptions
      ('MY', 'EXPORT', 'Export Sales', 'Sales for export purposes', false),
      ('MY', 'RAW_MATERIALS', 'Raw Materials for Manufacturing', 'Exempt raw materials', true),
      ('MY', 'ESSENTIAL_GOODS', 'Essential Goods', 'Food, medicine, etc.', false),
      -- Indonesia exemptions
      ('ID', 'EXPORT', 'Export Sales', 'Sales for export purposes', false),
      ('ID', 'MINING_EQUIPMENT', 'Mining Equipment', 'Strategic mining equipment', true),
      ('ID', 'EDUCATION', 'Educational Materials', 'Books, educational equipment', false)
      ON CONFLICT DO NOTHING;
    `);

    console.log('✓ Seeded tax exemption categories');

    console.log('Migration 015 completed successfully!');

  } catch (error) {
    console.error('Migration 015 failed:', error);
    throw error;
  }
}

async function down(db) {
  if (!db) {
    throw new Error('Migration 015 requires db parameter. Use runAllMigrations.js to run migrations.');
  }

  console.log('Rolling back migration 015...');

  try {
    // Remove columns from pricing_runs
    await db.query(`
      ALTER TABLE pricing_runs
      DROP COLUMN IF EXISTS subtotal,
      DROP COLUMN IF EXISTS tax_amount,
      DROP COLUMN IF EXISTS tax_rate,
      DROP COLUMN IF EXISTS tax_country,
      DROP COLUMN IF EXISTS tax_type,
      DROP COLUMN IF EXISTS total_with_tax;
    `);

    // Remove columns from pricing_run_items
    await db.query(`
      ALTER TABLE pricing_run_items
      DROP COLUMN IF EXISTS subtotal,
      DROP COLUMN IF EXISTS tax_amount,
      DROP COLUMN IF EXISTS tax_rate,
      DROP COLUMN IF EXISTS tax_exempt,
      DROP COLUMN IF EXISTS exemption_reason,
      DROP COLUMN IF EXISTS total_with_tax;
    `);

    // Remove columns from clients
    await db.query(`
      ALTER TABLE clients
      DROP COLUMN IF EXISTS country,
      DROP COLUMN IF EXISTS tax_id,
      DROP COLUMN IF EXISTS tax_exempt;
    `);

    // Drop tables
    await db.query(`DROP TABLE IF EXISTS tax_exemption_categories;`);
    await db.query(`DROP TABLE IF EXISTS tax_rules;`);

    console.log('Migration 015 rolled back successfully!');

  } catch (error) {
    console.error('Rollback failed:', error);
    throw error;
  }
}

module.exports = { up, down };
