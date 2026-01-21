/**
 * Migration 034: Create onboarding_activity_log table
 *
 * Purpose: capture onboarding step activity for analytics/heatmap work
 * Columns:
 * - id (uuid, PK)
 * - tenant_id (fk)
 * - step (limited to allowed onboarding steps)
 * - event_type ('ENTER_STEP', 'COMPLETE_STEP')
 * - timestamp (when the event occurred)
 */

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

const ALLOWED_EVENT_TYPES = ['ENTER_STEP', 'COMPLETE_STEP'];

async function up(db) {
  if (!db) {
    throw new Error('Migration 034_create_onboarding_activity_log requires db parameter. Use runAllMigrations.js to run migrations.');
  }

  console.log('[Migration 034] Creating onboarding_activity_log table...');

  try {
    await db.query('BEGIN');

    await db.query(`
      CREATE TABLE IF NOT EXISTS onboarding_activity_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        step TEXT NOT NULL CHECK (step IN (
          'profile',
          'approval_rules',
          'operator_rules',
          'pricing',
          'catalog',
          'notifications',
          'regulatory',
          'review'
        )),
        event_type TEXT NOT NULL CHECK (event_type IN ('ENTER_STEP', 'COMPLETE_STEP')),
        "timestamp" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_onboarding_activity_log_tenant_time
        ON onboarding_activity_log (tenant_id, "timestamp" DESC);
    `);

    await db.query('COMMIT');
    console.log('[Migration 034] ✅ onboarding_activity_log created');
  } catch (error) {
    await db.query('ROLLBACK');
    console.error('[Migration 034] ❌ Failed:', error);
    throw error;
  }
}

async function down(db) {
  if (!db) {
    throw new Error('Migration 034_create_onboarding_activity_log requires db parameter. Use runAllMigrations.js to run migrations.');
  }

  console.log('[Migration 034] Dropping onboarding_activity_log table...');

  try {
    await db.query('BEGIN');
    await db.query('DROP TABLE IF EXISTS onboarding_activity_log;');
    await db.query('COMMIT');
    console.log('[Migration 034] ✅ Rollback complete');
  } catch (error) {
    await db.query('ROLLBACK');
    console.error('[Migration 034] ❌ Rollback failed:', error);
    throw error;
  }
}

module.exports = {
  ALLOWED_STEPS,
  ALLOWED_EVENT_TYPES,
  up,
  down,
};
