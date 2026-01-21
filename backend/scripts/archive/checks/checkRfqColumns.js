require('dotenv').config();
const { connectMigrationDb } = require('../src/db/supabaseClient');

async function checkColumns() {
  const db = await connectMigrationDb();
  
  const result = await db.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'rfqs' 
    ORDER BY ordinal_position
  `);
  
  console.log('\nrfqs table columns:\n');
  result.rows.forEach(row => {
    console.log(`  ${row.column_name.padEnd(30)} ${row.data_type}`);
  });
  
  await db.end();
}

checkColumns().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});

