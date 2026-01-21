/**
 * Fix Duplicate Pipes
 *
 * This script identifies and fixes pipes with duplicate (nps_display, schedule) combinations.
 * For each duplicate set, it keeps the first one and marks others as inactive.
 *
 * Usage:
 *   cd backend
 *   node scripts/fixDuplicatePipes.js
 */

require('dotenv').config();
const { connectDb } = require('../src/db/supabaseClient');

async function fixDuplicatePipes() {
  const db = await connectDb();

  console.log('============================================================');
  console.log('Fix Duplicate Pipes');
  console.log('============================================================\n');

  try {
    // Find duplicate (nps_display, schedule) combinations
    const duplicatesQuery = `
      SELECT nps_display, schedule, COUNT(*) as count, array_agg(id) as pipe_ids
      FROM pipes
      WHERE is_active = true
      GROUP BY nps_display, schedule
      HAVING COUNT(*) > 1
      ORDER BY count DESC
    `;

    const duplicatesResult = await db.query(duplicatesQuery);

    console.log(`Found ${duplicatesResult.rows.length} duplicate (nps_display, schedule) combinations\n`);

    if (duplicatesResult.rows.length === 0) {
      console.log('✓ No duplicate pipes found. Nothing to fix.');
      await db.end();
      return;
    }

    // Show summary
    let totalDuplicates = 0;
    duplicatesResult.rows.forEach((row, i) => {
      totalDuplicates += row.count - 1; // Subtract 1 because we keep one
      console.log(`  [${i + 1}] ${row.nps_display || 'NULL'} / Sch ${row.schedule}: ${row.count} pipes`);
    });

    console.log(`\nTotal pipes to deactivate: ${totalDuplicates}\n`);
    console.log('Strategy: For each duplicate set, keep the first pipe (oldest) and deactivate the rest.\n');

    // Deactivate duplicates
    let deactivatedCount = 0;

    for (const row of duplicatesResult.rows) {
      const pipeIds = row.pipe_ids;
      const keepId = pipeIds[0]; // Keep the first one
      const deactivateIds = pipeIds.slice(1); // Deactivate the rest

      console.log(`Processing ${row.nps_display || 'NULL'} / Sch ${row.schedule}:`);
      console.log(`  Keeping pipe: ${keepId}`);
      console.log(`  Deactivating: ${deactivateIds.join(', ')}`);

      // Deactivate duplicate pipes
      const deactivateQuery = `
        UPDATE pipes
        SET is_active = false, updated_at = NOW()
        WHERE id = ANY($1)
      `;

      await db.query(deactivateQuery, [deactivateIds]);
      deactivatedCount += deactivateIds.length;
    }

    console.log('\n============================================================');
    console.log('DUPLICATE FIXING COMPLETED');
    console.log('============================================================');
    console.log(`✓ Deactivated ${deactivatedCount} duplicate pipes`);
    console.log(`✓ Active pipes remaining: ${200 - deactivatedCount}`);
    console.log('\nNext step: Re-run cleanup and seed to regenerate materials.');
    console.log('');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  } finally {
    await db.end();
  }
}

fixDuplicatePipes().catch(console.error);
