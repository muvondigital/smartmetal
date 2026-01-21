/**
 * Migration 066: Enable RLS on rfqs and price_agreements
 *
 * Goal: Restore table-level RLS enforcement without touching existing policies.
 * - Enable ROW LEVEL SECURITY and FORCE ROW LEVEL SECURITY on rfqs and price_agreements
 * - Idempotent: safe to re-run; skips if already enabled
 * - No changes to policies or other tables
 */

async function enableRls(db, tableName) {
  // Ensure table exists before attempting to change RLS settings
  const tableExists = await db.query(
    `
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = $1
      ) AS exists;
    `,
    [tableName]
  );

  if (!tableExists.rows[0]?.exists) {
    console.log(`[Migration 066] ⚠️  Table ${tableName} does not exist, skipping`);
    return;
  }

  // Check current RLS state
  const rlsState = await db.query(
    `
      SELECT relrowsecurity, relforcerowsecurity
      FROM pg_class
      WHERE relname = $1
        AND relnamespace = 'public'::regnamespace;
    `,
    [tableName]
  );

  const hasRls = rlsState.rows[0]?.relrowsecurity === true;
  const hasForceRls = rlsState.rows[0]?.relforcerowsecurity === true;

  if (!hasRls) {
    await db.query(`ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY;`);
    console.log(`[Migration 066] ✅ Enabled RLS on ${tableName}`);
  } else {
    console.log(`[Migration 066] ✓ RLS already enabled on ${tableName}`);
  }

  if (!hasForceRls) {
    await db.query(`ALTER TABLE ${tableName} FORCE ROW LEVEL SECURITY;`);
    console.log(`[Migration 066] ✅ Enabled FORCE RLS on ${tableName}`);
  } else {
    console.log(`[Migration 066] ✓ FORCE RLS already enabled on ${tableName}`);
  }
}

async function up(db) {
  if (!db) {
    throw new Error('Migration 066 requires a db client');
  }

  console.log('[Migration 066] Enabling RLS on rfqs and price_agreements...');

  try {
    await db.query('BEGIN');

    const targetTables = ['rfqs', 'price_agreements'];
    for (const tableName of targetTables) {
      await enableRls(db, tableName);
    }

    await db.query('COMMIT');
    console.log('[Migration 066] ✅ Completed enabling RLS');
  } catch (error) {
    await db.query('ROLLBACK');
    console.error('[Migration 066] ❌ Failed to enable RLS:', error.message);
    throw error;
  }
}

async function down(db) {
  if (!db) {
    throw new Error('Migration 066 requires a db client');
  }

  console.log('[Migration 066] Rolling back RLS enablement on rfqs and price_agreements...');

  try {
    await db.query('BEGIN');

    const targetTables = ['rfqs', 'price_agreements'];
    for (const tableName of targetTables) {
      // Keep rollback minimal; only disable what this migration enabled
      await db.query(`ALTER TABLE ${tableName} NO FORCE ROW LEVEL SECURITY;`);
      await db.query(`ALTER TABLE ${tableName} DISABLE ROW LEVEL SECURITY;`);
      console.log(`[Migration 066] 🔄 Disabled RLS on ${tableName}`);
    }

    await db.query('COMMIT');
    console.log('[Migration 066] ✅ Rollback complete');
  } catch (error) {
    await db.query('ROLLBACK');
    console.error('[Migration 066] ❌ Rollback failed:', error.message);
    throw error;
  }
}

module.exports = {
  up,
  down,
};

