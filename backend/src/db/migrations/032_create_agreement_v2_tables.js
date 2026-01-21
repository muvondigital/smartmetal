/**
 * Migration 032: Price Agreement V2 core tables (additive)
 *
 * Creates tenant-scoped V2 structures:
 *  - agreement_headers
 *  - agreement_conditions
 *  - agreement_scales
 *
 * Notes:
 *  - Does NOT modify existing price_agreements (V1) – coexistence is required.
 *  - Uses CHECK constraints for enums (no new DB types introduced).
 *  - Includes helpful indexes and updated_at triggers.
 *  - customer_id maps to clients(id) for now (tenant-scoped).
 *
 * Future mapping plan (comment-only):
 *  - V1 price_agreements can be cross-referenced later via a bridge table or
 *    by writing a one-time migration that seeds agreement_headers + conditions
 *    from V1 rows. No changes are made here to keep V1 intact.
 */

async function up(db) {
  if (!db) {
    throw new Error('Migration 032 requires db parameter. Use runAllMigrations.js to run migrations.');
  }

  console.log('[Migration 032] Creating Price Agreement V2 tables...');

  try {
    await db.query('BEGIN');

    // -----------------------------------------------------------------------
    // agreement_headers
    // -----------------------------------------------------------------------
    await db.query(`
      CREATE TABLE IF NOT EXISTS agreement_headers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        customer_id UUID REFERENCES clients(id) ON DELETE SET NULL,
        agreement_code TEXT NOT NULL,
        agreement_type TEXT NOT NULL CHECK (agreement_type IN (
          'STANDARD', 'CUSTOMER_SPECIFIC', 'MATERIAL_GROUP', 'PROMOTIONAL'
        )),
        currency TEXT NOT NULL DEFAULT 'USD',
        valid_from DATE NOT NULL,
        valid_to   DATE NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
          'draft', 'pending_approval', 'approved', 'released', 'expired'
        )),
        owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        -- Prevent inverted dates
        CONSTRAINT agreement_headers_valid_dates CHECK (valid_to >= valid_from),
        -- Ensure code uniqueness per tenant
        UNIQUE(tenant_id, agreement_code)
      );
    `);
    console.log('[Migration 032] ✓ Created agreement_headers');

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_agreement_headers_tenant_status
        ON agreement_headers(tenant_id, status);
      CREATE INDEX IF NOT EXISTS idx_agreement_headers_tenant_customer
        ON agreement_headers(tenant_id, customer_id);
      CREATE INDEX IF NOT EXISTS idx_agreement_headers_validity
        ON agreement_headers(valid_from, valid_to);
    `);

    await db.query(`
      DROP TRIGGER IF EXISTS trg_agreement_headers_updated_at ON agreement_headers;
      CREATE TRIGGER trg_agreement_headers_updated_at
        BEFORE UPDATE ON agreement_headers
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `);

    // -----------------------------------------------------------------------
    // agreement_conditions
    // -----------------------------------------------------------------------
    await db.query(`
      CREATE TABLE IF NOT EXISTS agreement_conditions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        agreement_id UUID NOT NULL REFERENCES agreement_headers(id) ON DELETE CASCADE,
        condition_type TEXT NOT NULL CHECK (condition_type IN (
          'BASE_PRICE', 'DISCOUNT', 'SURCHARGE', 'FREIGHT', 'TAX', 'LME_ADJUSTMENT'
        )),
        key_customer_id UUID REFERENCES clients(id) ON DELETE SET NULL,
        key_material_id UUID REFERENCES materials(id) ON DELETE SET NULL,
        key_material_group TEXT,
        key_region TEXT,
        key_incoterm TEXT,
        rate_type TEXT NOT NULL CHECK (rate_type IN ('AMOUNT', 'PERCENTAGE')),
        rate_value NUMERIC(18,6) NOT NULL,
        has_scale BOOLEAN NOT NULL DEFAULT false,
        condition_priority INTEGER NOT NULL DEFAULT 100,
        valid_from DATE,
        valid_to   DATE,
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'blocked')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    console.log('[Migration 032] ✓ Created agreement_conditions');

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_agreement_conditions_tenant
        ON agreement_conditions(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_agreement_conditions_agreement
        ON agreement_conditions(agreement_id, condition_priority);
      CREATE INDEX IF NOT EXISTS idx_agreement_conditions_lookup
        ON agreement_conditions(
          tenant_id,
          key_customer_id,
          key_material_id,
          key_material_group,
          key_region,
          condition_type,
          status
        );
      CREATE INDEX IF NOT EXISTS idx_agreement_conditions_validity
        ON agreement_conditions(valid_from, valid_to);
    `);

    await db.query(`
      DROP TRIGGER IF EXISTS trg_agreement_conditions_updated_at ON agreement_conditions;
      CREATE TRIGGER trg_agreement_conditions_updated_at
        BEFORE UPDATE ON agreement_conditions
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `);

    // -----------------------------------------------------------------------
    // agreement_scales
    // -----------------------------------------------------------------------
    await db.query(`
      CREATE TABLE IF NOT EXISTS agreement_scales (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        condition_id UUID NOT NULL REFERENCES agreement_conditions(id) ON DELETE CASCADE,
        scale_from NUMERIC(18,6) NOT NULL,
        scale_to   NUMERIC(18,6),
        scale_rate_type TEXT NOT NULL CHECK (scale_rate_type IN ('AMOUNT', 'PERCENTAGE')),
        scale_rate_value NUMERIC(18,6) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT agreement_scales_range CHECK (
          scale_to IS NULL OR scale_to > scale_from
        )
      );
    `);
    console.log('[Migration 032] ✓ Created agreement_scales');

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_agreement_scales_condition
        ON agreement_scales(condition_id, scale_from);
      CREATE INDEX IF NOT EXISTS idx_agreement_scales_tenant
        ON agreement_scales(tenant_id);
    `);

    await db.query(`
      DROP TRIGGER IF EXISTS trg_agreement_scales_updated_at ON agreement_scales;
      CREATE TRIGGER trg_agreement_scales_updated_at
        BEFORE UPDATE ON agreement_scales
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `);

    await db.query('COMMIT');
    console.log('[Migration 032] ✅ Completed Price Agreement V2 tables');
  } catch (error) {
    await db.query('ROLLBACK');
    console.error('[Migration 032] ❌ Failed:', error);
    throw error;
  }
}

async function down(db) {
  if (!db) {
    throw new Error('Migration 032 requires db parameter. Use runAllMigrations.js to run migrations.');
  }

  console.log('[Migration 032] Rolling back Price Agreement V2 tables...');

  try {
    await db.query('BEGIN');

    await db.query('DROP TABLE IF EXISTS agreement_scales;');
    await db.query('DROP TABLE IF EXISTS agreement_conditions;');
    await db.query('DROP TABLE IF EXISTS agreement_headers;');

    await db.query('COMMIT');
    console.log('[Migration 032] ✅ Rollback complete');
  } catch (error) {
    await db.query('ROLLBACK');
    console.error('[Migration 032] ❌ Rollback failed:', error);
    throw error;
  }
}

module.exports = {
  up,
  down,
};

