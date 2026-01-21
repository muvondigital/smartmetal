require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { connectDb } = require('../src/db/supabaseClient');
const { findDuplicates } = require('./find-duplicate-materials');

/**
 * Script to remove duplicate materials from the database
 * Strategy:
 * 1. For duplicate material_codes: Keep the oldest record (by created_at), delete the rest
 * 2. For exact duplicates: Keep the oldest record, delete the rest
 * 
 * Before deleting, checks if any rfq_items reference the materials to be deleted
 * and updates them to point to the kept material.
 */

async function removeDuplicates(dryRun = true) {
  const db = await connectDb();

  console.log(dryRun ? '=== DRY RUN MODE ===\n' : '=== REMOVING DUPLICATES ===\n');

  // Find all duplicates
  const { duplicateCodes, exactDuplicates } = await findDuplicates();

  const materialsToDelete = new Set();
  const materialIdMapping = new Map(); // Maps deleted ID to kept ID

  // Process duplicate material_codes
  if (duplicateCodes.length > 0) {
    console.log('\n=== Processing duplicate material_codes ===');
    for (const row of duplicateCodes) {
      const ids = row.ids; // Already sorted by created_at
      const keepId = ids[0]; // Keep the oldest
      const deleteIds = ids.slice(1); // Delete the rest

      console.log(`\nMaterial Code: ${row.material_code}`);
      console.log(`  Keeping: ${keepId} (oldest)`);
      console.log(`  Deleting: ${deleteIds.join(', ')}`);

      for (const deleteId of deleteIds) {
        materialsToDelete.add(deleteId);
        materialIdMapping.set(deleteId, keepId);
      }
    }
  }

  // Process exact duplicates
  if (exactDuplicates.length > 0) {
    console.log('\n=== Processing exact duplicate rows ===');
    for (const row of exactDuplicates) {
      const ids = row.ids; // Already sorted by created_at
      const keepId = ids[0]; // Keep the oldest
      const deleteIds = ids.slice(1); // Delete the rest

      console.log(`\nMaterial Code: ${row.material_code}`);
      console.log(`  Keeping: ${keepId} (oldest)`);
      console.log(`  Deleting: ${deleteIds.join(', ')}`);

      for (const deleteId of deleteIds) {
        // Only add if not already marked for deletion
        if (!materialsToDelete.has(deleteId)) {
          materialsToDelete.add(deleteId);
          materialIdMapping.set(deleteId, keepId);
        }
      }
    }
  }

  if (materialsToDelete.size === 0) {
    console.log('\n✓ No duplicates to remove');
    return { deleted: 0, updated: 0 };
  }

  console.log(`\n=== Summary ===`);
  console.log(`Total materials to delete: ${materialsToDelete.size}`);
  console.log(`Total ID mappings: ${materialIdMapping.size}`);

  if (dryRun) {
    console.log('\n⚠️  DRY RUN: No changes made. Run with --execute to apply changes.');
    return { deleted: materialsToDelete.size, updated: 0, dryRun: true };
  }

  // Check for rfq_items references
  console.log('\n=== Checking rfq_items references ===');
  const deleteIdsArray = Array.from(materialsToDelete);
  const references = await db.query(`
    SELECT material_id, COUNT(*) as count
    FROM rfq_items
    WHERE material_id = ANY($1)
    GROUP BY material_id;
  `, [deleteIdsArray]);

  if (references.rows.length > 0) {
    console.log(`Found ${references.rows.length} materials referenced by rfq_items:`);
    references.rows.forEach(ref => {
      console.log(`  Material ${ref.material_id}: ${ref.count} references`);
    });
  } else {
    console.log('✓ No rfq_items references found');
  }

  // Update rfq_items to point to kept materials
  let updatedItems = 0;
  if (references.rows.length > 0) {
    console.log('\n=== Updating rfq_items references ===');
    for (const ref of references.rows) {
      const deleteId = ref.material_id;
      const keepId = materialIdMapping.get(deleteId);
      
      if (keepId) {
        const updateResult = await db.query(`
          UPDATE rfq_items
          SET material_id = $1
          WHERE material_id = $2
        `, [keepId, deleteId]);
        
        updatedItems += updateResult.rowCount;
        console.log(`  Updated ${updateResult.rowCount} rfq_items: ${deleteId} -> ${keepId}`);
      }
    }
  }

  // Delete duplicate materials
  console.log('\n=== Deleting duplicate materials ===');
  const deleteResult = await db.query(`
    DELETE FROM materials
    WHERE id = ANY($1)
    RETURNING id, material_code;
  `, [deleteIdsArray]);

  console.log(`\n✓ Deleted ${deleteResult.rows.length} duplicate materials:`);
  deleteResult.rows.forEach(row => {
    console.log(`  - ${row.material_code} (${row.id})`);
  });

  return {
    deleted: deleteResult.rows.length,
    updated: updatedItems,
    dryRun: false,
  };
}

if (require.main === module) {
  const dryRun = !process.argv.includes('--execute');
  
  removeDuplicates(dryRun)
    .then((result) => {
      console.log('\n=== Final Summary ===');
      console.log(`Materials deleted: ${result.deleted}`);
      console.log(`rfq_items updated: ${result.updated}`);
      if (result.dryRun) {
        console.log('\n⚠️  This was a dry run. Use --execute to apply changes.');
      }
      process.exit(0);
    })
    .catch((error) => {
      console.error('Error removing duplicates:', error);
      process.exit(1);
    });
}

module.exports = { removeDuplicates };

