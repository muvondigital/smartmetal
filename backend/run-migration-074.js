/**
 * Run migration 074 - Workbench fields
 * Usage: node run-migration-074.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { Pool } = require('pg');
const migration = require('./src/db/migrations/074_add_workbench_fields');

async function runMigration074() {
  console.log('='.repeat(60));
  console.log('Running Migration 074: Add Workbench Fields');
  console.log('='.repeat(60));
  console.log('');

  const migrationUrl = process.env.MIGRATION_DATABASE_URL;

  if (!migrationUrl) {
    console.error('❌ ERROR: MIGRATION_DATABASE_URL is required!');
    console.error('Please set it in your .env file.');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: migrationUrl,
    max: 1,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });

  try {
    console.log('Connecting to database...');
    const testClient = await pool.connect();
    const userResult = await testClient.query('SELECT current_user');
    console.log(`Connected as: ${userResult.rows[0].current_user}`);
    testClient.release();

    console.log('');
    await migration.up(pool);

    console.log('');
    console.log('='.repeat(60));
    console.log('✅ Migration 074 completed successfully');
    console.log('='.repeat(60));

    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('');
    console.error('='.repeat(60));
    console.error('❌ Migration 074 failed');
    console.error('='.repeat(60));
    console.error(error);

    await pool.end();
    process.exit(1);
  }
}

runMigration074();
