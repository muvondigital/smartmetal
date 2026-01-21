/**
 * Verify NSC Catalog
 * Quick verification script to check NSC materials count by category
 */

require('dotenv').config();
const { connectMigrationDb } = require('../src/db/supabaseClient');

async function verifyNscCatalog() {
  const db = await connectMigrationDb();
  
  try {
    const tenantResult = await db.query(
      "SELECT id FROM tenants WHERE LOWER(code) = 'nsc'"
    );
    
    if (tenantResult.rows.length === 0) {
      console.log('NSC tenant not found');
      return;
    }
    
    const tenantId = tenantResult.rows[0].id;
    
    const categoryResult = await db.query(
      `SELECT category, COUNT(*) as count 
       FROM materials 
       WHERE tenant_id = $1 
       GROUP BY category 
       ORDER BY category`,
      [tenantId]
    );
    
    console.log('NSC Catalog - Category Breakdown:');
    console.log('='.repeat(50));
    let total = 0;
    categoryResult.rows.forEach(row => {
      console.log(`  ${row.category.padEnd(25)}: ${row.count}`);
      total += parseInt(row.count, 10);
    });
    console.log('='.repeat(50));
    console.log(`  TOTAL: ${total}`);
    console.log('');
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await db.end();
  }
}

if (require.main === module) {
  verifyNscCatalog()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { verifyNscCatalog };
