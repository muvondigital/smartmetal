/**
 * Quick check for V2 tables - ensures output is visible
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { connectDb, query } = require('../src/db/supabaseClient');

(async () => {
  try {
    console.log('Checking tables...');
    const db = await connectDb();
    
    const tables = ['agreement_headers', 'agreement_conditions', 'agreement_scales'];
    for (const table of tables) {
      try {
        const result = await query(`SELECT COUNT(*) as count FROM ${table}`);
        console.log(`✅ ${table} EXISTS (${result.rows[0].count} rows)`);
      } catch (err) {
        if (err.code === '42P01') {
          console.log(`❌ ${table} DOES NOT EXIST`);
        } else {
          console.log(`❌ ${table} ERROR: ${err.message}`);
        }
      }
    }
    
    process.exit(0);
  } catch (err) {
    console.error('FATAL:', err.message);
    process.exit(1);
  }
})();
