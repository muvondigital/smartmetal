/**
 * Check HS Codes in Database for NSC Mapping
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { connectDb } = require('../src/db/supabaseClient');

async function checkHsCodes() {
  const db = await connectDb();

  try {
    console.log('HS Codes in regulatory_hs_codes table:\n');
    
    const categories = ['PIPE', 'FITTING', 'FLANGE', 'VALVE', 'STEEL', 'PLATE'];
    
    for (const category of categories) {
      const result = await db.query(
        `SELECT hs_code, sub_category, description 
         FROM regulatory_hs_codes 
         WHERE is_active = true AND category = $1 
         ORDER BY hs_code 
         LIMIT 10`,
        [category]
      );
      
      if (result.rows.length > 0) {
        console.log(`\n${category}:`);
        console.log('-'.repeat(80));
        result.rows.forEach(r => {
          console.log(`  ${r.hs_code} | ${r.sub_category || 'N/A'} | ${r.description.substring(0, 70)}`);
        });
      }
    }

  } catch (error) {
    console.error('Error:', error);
    throw error;
  } finally {
    await db.end();
  }
}

if (require.main === module) {
  checkHsCodes()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { checkHsCodes };
