/**
 * Migration 033: Tenant Onboarding Status
 *
 * Stores onboarding progress per tenant and enforces allowed status/step values.
 */

const ALLOWED_STATUSES = ['not_started', 'in_progress', 'completed'];
const ALLOWED_STEPS = [
  'profile',
  'approval_rules',
  'operator_rules',
  'pricing',
  'catalog',
  'notifications',
  'regulatory',
  'review',
];

async function up(db) {
  if (!db) {
    throw new Error('Migration 033_create_tenant_onboarding_status requires db parameter. Use runAllMigrations.js to run migrations.');
  }

  console.log('[Migration 033] Creating tenant_onboarding_status table...');

  try {
    await db.query('BEGIN');

    await db.query(`
      CREATE TABLE IF NOT EXISTS tenant_onboarding_status (
        tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'completed')),
        current_step TEXT CHECK (current_step IN (
          'profile',
          'approval_rules',
          'operator_rules',
          'pricing',
          'catalog',
          'notifications',
          'regulatory',
          'review'
        )),
        completed_steps JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        completed_at TIMESTAMPTZ NULL
      );
    `);

    await db.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'tenant_onboarding_completed_steps_array'
        ) THEN
          ALTER TABLE tenant_onboarding_status
          ADD CONSTRAINT tenant_onboarding_completed_steps_array
          CHECK (jsonb_typeof(completed_steps) = 'array');
        END IF;
      END;
      $$;
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_tenant_onboarding_status_status
        ON tenant_onboarding_status(status);
    `);

    await db.query(`
      DROP TRIGGER IF EXISTS trg_tenant_onboarding_status_updated_at ON tenant_onboarding_status;
      CREATE TRIGGER trg_tenant_onboarding_status_updated_at
        BEFORE UPDATE ON tenant_onboarding_status
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `);

    await db.query('COMMIT');
    console.log('[Migration 033] ✅ tenant_onboarding_status created');
  } catch (error) {
    await db.query('ROLLBACK');
    console.error('[Migration 033] ❌ Failed:', error);
    throw error;
  }
}

async function down(db) {
  if (!db) {
    throw new Error('Migration 033_create_tenant_onboarding_status requires db parameter. Use runAllMigrations.js to run migrations.');
  }

  console.log('[Migration 033] Dropping tenant_onboarding_status table...');

  try {
    await db.query('BEGIN');
    await db.query('DROP TRIGGER IF EXISTS trg_tenant_onboarding_status_updated_at ON tenant_onboarding_status;');
    await db.query('DROP TABLE IF EXISTS tenant_onboarding_status;');
    await db.query('COMMIT');
    console.log('[Migration 033] ✅ Rollback complete');
  } catch (error) {
    await db.query('ROLLBACK');
    console.error('[Migration 033] ❌ Rollback failed:', error);
    throw error;
  }
}

module.exports = {
  ALLOWED_STATUSES,
  ALLOWED_STEPS,
  up,
  down,
};
