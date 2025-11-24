/**
 * Quick database check script to verify categories exist
 * 
 * Usage:
 *   cd backend
 *   node scripts/check_categories.js
 */

require('dotenv').config();
const { connectDb } = require('../src/db/supabaseClient');

async function checkCategories() {
  const db = await connectDb();

  const requiredCategories = ['pipe', 'fitting', 'flange', 'fastener', 'grating'];

  try {
    console.log('\n[Category Check] Checking database for required categories...\n');

    for (const category of requiredCategories) {
      const result = await db.query(
        `SELECT COUNT(*) as count FROM materials WHERE category = $1`,
        [category]
      );

      const count = parseInt(result.rows[0].count);
      const status = count > 0 ? '✓' : '✗';
      
      console.log(`${status} category = '${category}': ${count} entries`);
    }

    console.log('\n[Category Check] ===========================================');
    
    // Get all unique categories
    const allCategoriesResult = await db.query(
      `SELECT DISTINCT category, COUNT(*) as count 
       FROM materials 
       GROUP BY category 
       ORDER BY category`
    );

    console.log('\n[Category Check] All categories in database:');
    allCategoriesResult.rows.forEach(row => {
      console.log(`  - ${row.category}: ${row.count} entries`);
    });

    console.log('\n[Category Check] ===========================================\n');

  } catch (error) {
    console.error('[Category Check] Error:', error);
    throw error;
  } finally {
    await db.end();
  }
}

// Run if executed directly
if (require.main === module) {
  checkCategories()
    .then(() => {
      console.log('[Category Check] Check completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('[Category Check] Check failed:', error);
      process.exit(1);
    });
}

module.exports = {
  checkCategories,
};



