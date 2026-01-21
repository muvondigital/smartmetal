require('dotenv').config();
const { connectDb } = require('../src/db/supabaseClient');

async function check() {
  const db = await connectDb();
  
  console.log('Checking regulatory_hs_codes table...');
  const count = await db.query('SELECT COUNT(*) as count FROM regulatory_hs_codes WHERE is_active = true');
  console.log('Active HS codes:', count.rows[0].count);
  
  const all = await db.query('SELECT COUNT(*) as count FROM regulatory_hs_codes');
  console.log('Total HS codes (including inactive):', all.rows[0].count);
  
  const sample = await db.query('SELECT hs_code, description, category FROM regulatory_hs_codes LIMIT 5');
  console.log('Sample:', sample.rows);
  
  console.log('\nChecking hs_codes table...');
  const hsCount = await db.query('SELECT COUNT(*) as count FROM hs_codes');
  console.log('hs_codes count:', hsCount.rows[0].count);
  
  process.exit(0);
}

check().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});

