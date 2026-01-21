require('dotenv').config();
const { getDb } = require('../src/db/supabaseClient');

(async () => {
  const db = await getDb();

  console.log('Checking projects table schema:');
  const result = await db.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'projects'
    ORDER BY ordinal_position
  `);
  console.log('\nProjects table columns:');
  result.rows.forEach(r => console.log(`  - ${r.column_name} (${r.data_type})`));

  console.log('\n\nChecking pricing_runs table schema:');
  const prResult = await db.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'pricing_runs'
    ORDER BY ordinal_position
  `);
  console.log('\nPricing_runs table columns:');
  prResult.rows.forEach(r => console.log(`  - ${r.column_name} (${r.data_type})`));

  process.exit(0);
})();
