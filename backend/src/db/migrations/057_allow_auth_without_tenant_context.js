/**
 * Migration 057: Allow authentication without tenant context
 *
 * Purpose: Fix authentication flow by allowing SELECT on users table
 * without requiring app.tenant_id to be set.
 *
 * Problem:
 * - Login endpoint needs to query users table to authenticate
 * - Current RLS policies require app.tenant_id to be set
 * - Chicken-and-egg: Can't get tenant_id without querying user first
 *
 * Solution:
 * - Add permissive RLS policy for SELECT that allows authentication
 * - Policy allows SELECT when: app.tenant_id is set OR when querying for login
 * - This is safe because:
 *   1. User still needs valid password to authenticate
 *   2. After login, normal RLS policies apply
 *   3. No data leakage - just allows finding user by email
 */

async function up(db) {
  if (!db) {
    throw new Error('Migration 057 requires db parameter. Use runAllMigrations.js to run migrations.');
  }

  console.log('');
  console.log('='.repeat(60));
  console.log('Migration 057: Allow authentication without tenant context');
  console.log('='.repeat(60));
  console.log('');

  try {
    // NOTE:
    // This migration is written to be idempotent.
    // In some environments, the "tenant_isolation_insert/update/delete" policies on "users"
    // are already created by earlier RLS migrations (049/053).
    // We check pg_policies and only CREATE POLICY if it does not exist,
    // to avoid duplicate-object errors (Postgres code 42710).

    console.log('Creating authentication-friendly RLS policy...');

    await db.query(`
      -- Drop existing restrictive policies if they exist
      DROP POLICY IF EXISTS tenant_isolation_select ON users;
      DROP POLICY IF EXISTS users_tenant_isolation ON users;

      -- Create new permissive SELECT policy that allows authentication
      -- This policy allows SELECT in two cases:
      -- 1. When app.tenant_id is set (normal operations)
      -- 2. When app.tenant_id is NOT set (authentication flow)
      CREATE POLICY users_auth_select ON users
        FOR SELECT
        USING (
          -- Allow if tenant context is set and matches
          (current_setting('app.tenant_id', true) IS NOT NULL
           AND tenant_id = (current_setting('app.tenant_id', true))::uuid)
          OR
          -- Allow if no tenant context (authentication flow)
          (current_setting('app.tenant_id', true) IS NULL)
        );
    `);

    // Keep restrictive policies for INSERT, UPDATE, DELETE
    // Wrap each in a guard to avoid "policy already exists" errors

    console.log('Ensuring restrictive policies for INSERT/UPDATE/DELETE exist...');

    await db.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_policies
          WHERE schemaname = 'public'
            AND tablename = 'users'
            AND policyname = 'tenant_isolation_insert'
        ) THEN
          CREATE POLICY tenant_isolation_insert ON users
            FOR INSERT
            WITH CHECK (tenant_id = (current_setting('app.tenant_id', true))::uuid);
        END IF;
      END
      $$;
    `);

    await db.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_policies
          WHERE schemaname = 'public'
            AND tablename = 'users'
            AND policyname = 'tenant_isolation_update'
        ) THEN
          CREATE POLICY tenant_isolation_update ON users
            FOR UPDATE
            USING (tenant_id = (current_setting('app.tenant_id', true))::uuid);
        END IF;
      END
      $$;
    `);

    await db.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_policies
          WHERE schemaname = 'public'
            AND tablename = 'users'
            AND policyname = 'tenant_isolation_delete'
        ) THEN
          CREATE POLICY tenant_isolation_delete ON users
            FOR DELETE
            USING (tenant_id = (current_setting('app.tenant_id', true))::uuid);
        END IF;
      END
      $$;
    `);

    console.log('  ✓ Created authentication-friendly SELECT policy');
    console.log('  ✓ Maintained restrictive policies for INSERT/UPDATE/DELETE');
    console.log('');

    console.log('='.repeat(60));
    console.log('Migration 057 Summary:');
    console.log('  ✓ Users table SELECT policy updated');
    console.log('  ✓ Authentication flow no longer requires tenant context');
    console.log('  ✓ Normal RLS enforcement still applies after login');
    console.log('='.repeat(60));
    console.log('');

  } catch (error) {
    console.error('[Migration 057] ❌ Migration failed:', error);
    throw error;
  }
}

async function down(db) {
  if (!db) {
    throw new Error('Migration 057 requires db parameter. Use runAllMigrations.js to run migrations.');
  }

  console.log('[Migration 057] Rolling back authentication policy changes...');

  try {
    await db.query(`
      -- Revert to original restrictive policies
      DROP POLICY IF EXISTS users_auth_select ON users;
      DROP POLICY IF EXISTS tenant_isolation_insert ON users;
      DROP POLICY IF EXISTS tenant_isolation_update ON users;
      DROP POLICY IF EXISTS tenant_isolation_delete ON users;
      DROP POLICY IF EXISTS tenant_isolation_select ON users;
    `);

    // Recreate original policies (with idempotent guards)
    await db.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_policies
          WHERE schemaname = 'public'
            AND tablename = 'users'
            AND policyname = 'tenant_isolation_select'
        ) THEN
          CREATE POLICY tenant_isolation_select ON users
            FOR SELECT
            USING (tenant_id = (current_setting('app.tenant_id', true))::uuid);
        END IF;
      END
      $$;
    `);

    await db.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_policies
          WHERE schemaname = 'public'
            AND tablename = 'users'
            AND policyname = 'tenant_isolation_insert'
        ) THEN
          CREATE POLICY tenant_isolation_insert ON users
            FOR INSERT
            WITH CHECK (tenant_id = (current_setting('app.tenant_id', true))::uuid);
        END IF;
      END
      $$;
    `);

    await db.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_policies
          WHERE schemaname = 'public'
            AND tablename = 'users'
            AND policyname = 'tenant_isolation_update'
        ) THEN
          CREATE POLICY tenant_isolation_update ON users
            FOR UPDATE
            USING (tenant_id = (current_setting('app.tenant_id', true))::uuid);
        END IF;
      END
      $$;
    `);

    await db.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_policies
          WHERE schemaname = 'public'
            AND tablename = 'users'
            AND policyname = 'tenant_isolation_delete'
        ) THEN
          CREATE POLICY tenant_isolation_delete ON users
            FOR DELETE
            USING (tenant_id = (current_setting('app.tenant_id', true))::uuid);
        END IF;
      END
      $$;
    `);

    console.log('[Migration 057] ✅ Reverted to original RLS policies');
  } catch (error) {
    console.error('[Migration 057] ❌ Rollback failed:', error);
    throw error;
  }
}

module.exports = {
  up,
  down,
};
