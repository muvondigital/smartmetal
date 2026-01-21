require('dotenv').config();
const { getDb } = require('../src/db/supabaseClient');

(async () => {
  const db = await getDb();
  const result = await db.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'rfqs'
    ORDER BY ordinal_position
  `);
  console.log('RFQs table columns:');
  result.rows.forEach(r => console.log(`  - ${r.column_name} (${r.data_type})`));
  process.exit(0);
})();
