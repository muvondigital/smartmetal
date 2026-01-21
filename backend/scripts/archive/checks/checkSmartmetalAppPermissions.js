/**
 * Checks whether smartmetal_app has required privileges.
 * Run using: node backend/scripts/checkSmartmetalAppPermissions.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { Client } = require('pg');

async function run() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });
  
  try {
    await client.connect();

    console.log('\n=== Checking current_user ===');
    const userResult = await client.query('SELECT current_user');
    console.table(userResult.rows);

    console.log('\n=== Checking table privileges ===');
    const tables = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    for (const row of tables.rows) {
      const name = row.table_name;
      const priv = await client.query(`
        SELECT grantee, privilege_type
        FROM information_schema.role_table_grants
        WHERE table_name = $1 AND grantee = 'smartmetal_app'
        ORDER BY privilege_type
      `, [name]);

      if (priv.rows.length > 0) {
        console.log(`\nTable: ${name}`);
        console.table(priv.rows);
      }
    }

    await client.end();
  } catch (error) {
    console.error('Error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    await client.end().catch(() => {});
    process.exit(1);
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});

