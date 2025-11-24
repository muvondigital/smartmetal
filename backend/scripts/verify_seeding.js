/**
 * Verification script to check database seeding results
 * 
 * Usage:
 *   cd backend
 *   node scripts/verify_seeding.js
 */

require('dotenv').config();
const { connectDb } = require('../src/db/supabaseClient');

async function verifySeeding() {
  const db = await connectDb();

  try {
    console.log('\n[Verification] ===========================================');
    console.log('[Verification] Verifying database entries...\n');

    // Check flanges
    const flangesResult = await db.query(
      `SELECT COUNT(*) as count FROM materials WHERE LOWER(category) = 'flange'`
    );
    const flangeCount = parseInt(flangesResult.rows[0].count);
    console.log(`[Verification] Flange entries: ${flangeCount}`);
    if (flangeCount >= 150 && flangeCount <= 250) {
      console.log(`[Verification] ✓ Flange count is within expected range (150-250)`);
    } else {
      console.log(`[Verification] ✗ Flange count is outside expected range (150-250)`);
    }

    // Check fasteners
    const fastenersResult = await db.query(
      `SELECT COUNT(*) as count FROM materials WHERE LOWER(category) = 'fastener'`
    );
    const fastenerCount = parseInt(fastenersResult.rows[0].count);
    console.log(`[Verification] Fastener entries: ${fastenerCount}`);
    if (fastenerCount >= 150 && fastenerCount <= 260) {
      console.log(`[Verification] ✓ Fastener count is within expected range (150-260)`);
    } else {
      console.log(`[Verification] ✗ Fastener count is outside expected range (150-260)`);
    }

    // Check for unique material codes
    const uniqueCodesResult = await db.query(
      `SELECT material_code, COUNT(*) as count 
       FROM materials 
       GROUP BY material_code 
       HAVING COUNT(*) > 1`
    );
    const duplicateCount = uniqueCodesResult.rows.length;
    console.log(`\n[Verification] Duplicate material codes: ${duplicateCount}`);
    if (duplicateCount === 0) {
      console.log(`[Verification] ✓ All material codes are unique`);
    } else {
      console.log(`[Verification] ✗ Found ${duplicateCount} duplicate material codes:`);
      uniqueCodesResult.rows.forEach(row => {
        console.log(`[Verification]   - ${row.material_code} (appears ${row.count} times)`);
      });
    }

    // Get total material count
    const totalResult = await db.query(
      `SELECT COUNT(*) as count FROM materials`
    );
    const totalCount = parseInt(totalResult.rows[0].count);
    console.log(`\n[Verification] Total materials in database: ${totalCount}`);

    // Get category breakdown
    const categoryResult = await db.query(
      `SELECT category, COUNT(*) as count 
       FROM materials 
       GROUP BY category 
       ORDER BY category`
    );
    console.log(`\n[Verification] Category breakdown:`);
    categoryResult.rows.forEach(row => {
      console.log(`[Verification]   - ${row.category}: ${row.count} entries`);
    });

    console.log('\n[Verification] ===========================================\n');

  } catch (error) {
    console.error('[Verification] Error:', error);
    throw error;
  } finally {
    await db.end();
  }
}

// Run if executed directly
if (require.main === module) {
  verifySeeding()
    .then(() => {
      console.log('[Verification] Verification completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('[Verification] Verification failed:', error);
      process.exit(1);
    });
}

module.exports = {
  verifySeeding,
};

