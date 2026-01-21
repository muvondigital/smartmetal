/**
 * Migration 055: Grant table ownership to smartmetal_app
 *
 * Purpose: Grant ownership of key tables to smartmetal_app user so that
 * runtime initialization functions can modify tables without permission errors.
 *
 * Background:
 * - Tables are created by migrations using postgres superuser
 * - Backend runs as smartmetal_app user (non-superuser)
 * - Runtime initialization functions try to modify tables (CREATE INDEX IF NOT EXISTS, etc.)
 * - This causes "must be owner of table" errors
 *
 * Solution:
 * - Transfer ownership of all tables to smartmetal_app
 * - Grant necessary privileges
 */

async function up(db) {
  if (!db) {
    throw new Error('Migration 055 requires db parameter. Use runAllMigrations.js to run migrations.');
  }

  console.log('');
  console.log('='.repeat(60));
  console.log('Migration 055: Grant table ownership to smartmetal_app');
  console.log('='.repeat(60));
  console.log('');

  try {
    // Get all table names in public schema
    console.log('Fetching all tables in public schema...');
    const result = await db.query(`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename;
    `);

    const tables = result.rows.map(r => r.tablename);
    console.log(`Found ${tables.length} tables to update`);
    console.log('');

    // Transfer ownership of each table to smartmetal_app
    console.log('Transferring ownership to smartmetal_app...');
    for (const table of tables) {
      try {
        await db.query(`ALTER TABLE public.${table} OWNER TO smartmetal_app;`);
        console.log(`  ✓ ${table}`);
      } catch (error) {
        // If smartmetal_app doesn't exist yet, that's okay
        if (error.code === '42704') {
          console.log(`  ⚠️  smartmetal_app role does not exist, skipping ${table}`);
        } else {
          console.log(`  ⚠️  Could not transfer ownership of ${table}: ${error.message}`);
        }
      }
    }
    console.log('');

    // Transfer ownership of sequences
    console.log('Transferring ownership of sequences...');
    const seqResult = await db.query(`
      SELECT sequence_name
      FROM information_schema.sequences
      WHERE sequence_schema = 'public';
    `);

    for (const row of seqResult.rows) {
      try {
        await db.query(`ALTER SEQUENCE public.${row.sequence_name} OWNER TO smartmetal_app;`);
        console.log(`  ✓ ${row.sequence_name}`);
      } catch (error) {
        if (error.code !== '42704') {
          console.log(`  ⚠️  Could not transfer ownership of ${row.sequence_name}: ${error.message}`);
        }
      }
    }
    console.log('');

    // Grant additional privileges
    console.log('Granting additional privileges...');
    await db.query(`
      GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO smartmetal_app;
      GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO smartmetal_app;
      GRANT USAGE ON SCHEMA public TO smartmetal_app;
    `);
    console.log('  ✓ Granted ALL PRIVILEGES on tables and sequences');
    console.log('  ✓ Granted USAGE on schema public');
    console.log('');

    console.log('='.repeat(60));
    console.log('Migration 055 Summary:');
    console.log(`  ✓ Transferred ownership of ${tables.length} tables to smartmetal_app`);
    console.log(`  ✓ Transferred ownership of ${seqResult.rows.length} sequences to smartmetal_app`);
    console.log('  ✓ Granted ALL PRIVILEGES on all objects');
    console.log('='.repeat(60));
    console.log('');

  } catch (error) {
    console.error('[Migration 055] ❌ Migration failed:', error);
    throw error;
  }
}

async function down(db) {
  if (!db) {
    throw new Error('Migration 055 requires db parameter. Use runAllMigrations.js to run migrations.');
  }

  console.log('[Migration 055] Rolling back ownership changes...');
  console.log('⚠️  Note: Ownership will be transferred back to postgres superuser');

  try {
    // Get all tables
    const result = await db.query(`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public';
    `);

    // Transfer ownership back to postgres
    for (const row of result.rows) {
      await db.query(`ALTER TABLE public.${row.tablename} OWNER TO postgres;`);
    }

    // Transfer sequences back
    const seqResult = await db.query(`
      SELECT sequence_name
      FROM information_schema.sequences
      WHERE sequence_schema = 'public';
    `);

    for (const row of seqResult.rows) {
      await db.query(`ALTER SEQUENCE public.${row.sequence_name} OWNER TO postgres;`);
    }

    console.log('[Migration 055] ✅ Ownership transferred back to postgres');
  } catch (error) {
    console.error('[Migration 055] ❌ Rollback failed:', error);
    throw error;
  }
}

module.exports = {
  up,
  down,
};
