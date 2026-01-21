/**
 * Cleanup Duplicate Materials Script
 * 
 * PURPOSE:
 * --------
 * This script identifies and merges duplicate materials in the materials table.
 * 
 * ROOT CAUSE:
 * -----------
 * Duplicates can occur when:
 * - Seed scripts use check-then-insert pattern instead of ON CONFLICT (race conditions)
 * - Materials were created before migration 058 (tenant-scoped) and after, causing conflicts
 * - Multiple seed scripts insert the same material_code without proper conflict handling
 * 
 * HOW IT WORKS:
 * -------------
 * 1. Detects duplicate groups by material_code (if global) or (tenant_id, material_code) (if tenant-scoped)
 * 2. For each duplicate group:
 *    a. Chooses canonical material (oldest by created_at, then by id)
 *    b. Updates all foreign key references from duplicate IDs to canonical ID
 *    c. Deletes duplicate rows
 * 
 * SAFETY:
 * -------
 * - Idempotent: Safe to run multiple times
 * - Only modifies materials table and tables with foreign keys to materials.id
 * - Never deletes RFQs, pricing_runs, approvals, or agreements
 * - Logs every action for audit trail
 * 
 * USAGE:
 * ------
 * node backend/scripts/cleanupDuplicateMaterials.js
 * 
 * TABLES WITH FOREIGN KEYS TO materials.id:
 * -------------------------------------------
 * - rfq_items.material_id
 * - pricing_run_items.material_id
 * - material_price_history.material_id
 * - agreement_conditions.key_material_id
 * - lme_material_mappings.material_id
 */

require('dotenv').config();
const { connectMigrationDb } = require('../src/db/supabaseClient');

/**
 * Find all tables that have foreign keys to materials.id
 */
async function findMaterialReferenceTables(db) {
  const result = await db.query(`
    SELECT
      tc.table_name,
      kcu.column_name,
      ccu.table_name AS foreign_table_name,
      ccu.column_name AS foreign_column_name
    FROM information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
      AND ccu.table_name = 'materials'
      AND ccu.column_name = 'id'
    ORDER BY tc.table_name, kcu.column_name;
  `);

  return result.rows.map(row => ({
    table: row.table_name,
    column: row.column_name
  }));
}

/**
 * Update foreign key references from duplicate material_id to canonical material_id
 */
async function updateMaterialReferences(db, duplicateId, canonicalId, referenceTables) {
  const updateCounts = {};

  for (const ref of referenceTables) {
    try {
      // Check if table exists
      const tableCheck = await db.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = $1
      `, [ref.table]);

      if (tableCheck.rows.length === 0) {
        // Table doesn't exist, skip
        updateCounts[ref.table] = 0;
        continue;
      }

      // Check if column exists
      const columnCheck = await db.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = $1 
          AND column_name = $2
      `, [ref.table, ref.column]);

      if (columnCheck.rows.length === 0) {
        // Column doesn't exist, skip
        updateCounts[ref.table] = 0;
        continue;
      }

      // Update references
      const updateResult = await db.query(
        `UPDATE ${ref.table} 
         SET ${ref.column} = $1 
         WHERE ${ref.column} = $2`,
        [canonicalId, duplicateId]
      );

      updateCounts[ref.table] = updateResult.rowCount || 0;
    } catch (error) {
      console.error(`  ⚠️  Error updating ${ref.table}.${ref.column}:`, error.message);
      updateCounts[ref.table] = -1; // Error indicator
    }
  }

  return updateCounts;
}

/**
 * Main cleanup function
 */
async function cleanupDuplicateMaterials() {
  const db = await connectMigrationDb();

  try {
    console.log('🔧 Starting duplicate materials cleanup...\n');

    // Check if materials table has tenant_id column (migration 058)
    const tenantIdCheck = await db.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'materials' AND column_name = 'tenant_id';
    `);
    const hasTenantId = tenantIdCheck.rows.length > 0;

    // Find all reference tables
    console.log('📋 Finding tables with foreign keys to materials.id...');
    const referenceTables = await findMaterialReferenceTables(db);
    console.log(`  ✓ Found ${referenceTables.length} reference table(s):`);
    for (const ref of referenceTables) {
      console.log(`    - ${ref.table}.${ref.column}`);
    }
    console.log('');

    // Find duplicate groups
    let duplicates = [];
    if (hasTenantId) {
      console.log('📋 Materials are tenant-scoped (migration 058+)');
      console.log('   Checking for duplicates by (tenant_id, material_code)...\n');

      const result = await db.query(`
        SELECT 
          tenant_id,
          material_code,
          COUNT(*) as duplicate_count,
          array_agg(id ORDER BY created_at ASC, id ASC) as material_ids,
          array_agg(created_at ORDER BY created_at ASC, id ASC) as created_dates
        FROM materials
        GROUP BY tenant_id, material_code
        HAVING COUNT(*) > 1
        ORDER BY duplicate_count DESC, tenant_id, material_code;
      `);

      duplicates = result.rows;
    } else {
      console.log('📋 Materials are global (pre-migration 058)');
      console.log('   Checking for duplicates by material_code...\n');

      const result = await db.query(`
        SELECT 
          material_code,
          COUNT(*) as duplicate_count,
          array_agg(id ORDER BY created_at ASC, id ASC) as material_ids,
          array_agg(created_at ORDER BY created_at ASC, id ASC) as created_dates
        FROM materials
        GROUP BY material_code
        HAVING COUNT(*) > 1
        ORDER BY duplicate_count DESC, material_code;
      `);

      duplicates = result.rows;
    }

    if (duplicates.length === 0) {
      console.log('✅ No duplicates found. Materials table is clean.\n');
      return { processed: 0, deleted: 0, updated: {} };
    }

    console.log(`⚠️  Found ${duplicates.length} duplicate group(s) to process\n`);

    // Process each duplicate group
    let totalProcessed = 0;
    let totalDeleted = 0;
    const totalUpdated = {};

    await db.query('BEGIN');

    try {
      for (const dup of duplicates) {
        const materialIds = dup.material_ids;
        const canonicalId = materialIds[0]; // Oldest material (first in sorted array)
        const duplicateIds = materialIds.slice(1); // All other materials

        // Get tenant info if applicable
        let tenantInfo = '';
        if (hasTenantId && dup.tenant_id) {
          const tenantResult = await db.query(
            'SELECT code, name FROM tenants WHERE id = $1',
            [dup.tenant_id]
          );
          if (tenantResult.rows.length > 0) {
            tenantInfo = ` (Tenant: ${tenantResult.rows[0].code})`;
          }
        }

        console.log(`📦 Processing: ${dup.material_code}${tenantInfo}`);
        console.log(`   Canonical ID: ${canonicalId}`);
        console.log(`   Duplicate IDs: ${duplicateIds.join(', ')}`);
        console.log(`   Total duplicates: ${dup.duplicate_count}`);

        // Update all foreign key references
        let groupUpdated = {};
        for (const duplicateId of duplicateIds) {
          const updateCounts = await updateMaterialReferences(db, duplicateId, canonicalId, referenceTables);
          
          // Merge update counts
          for (const [table, count] of Object.entries(updateCounts)) {
            if (count > 0) {
              groupUpdated[table] = (groupUpdated[table] || 0) + count;
              totalUpdated[table] = (totalUpdated[table] || 0) + count;
            }
          }
        }

        // Log updates
        if (Object.keys(groupUpdated).length > 0) {
          console.log(`   Updated references:`);
          for (const [table, count] of Object.entries(groupUpdated)) {
            console.log(`     - ${table}: ${count} row(s)`);
          }
        } else {
          console.log(`   No references to update`);
        }

        // Delete duplicate materials
        for (const duplicateId of duplicateIds) {
          const deleteResult = await db.query(
            'DELETE FROM materials WHERE id = $1',
            [duplicateId]
          );
          if (deleteResult.rowCount > 0) {
            totalDeleted++;
          }
        }

        console.log(`   ✓ Deleted ${duplicateIds.length} duplicate material(s)\n`);
        totalProcessed++;
      }

      // Commit transaction
      await db.query('COMMIT');
      console.log('✅ Transaction committed successfully\n');

    } catch (error) {
      // Rollback on error
      await db.query('ROLLBACK');
      console.error('❌ Error during cleanup, transaction rolled back:', error);
      throw error;
    }

    // Summary
    console.log('═══════════════════════════════════════════════════════');
    console.log('📊 CLEANUP SUMMARY');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`  • Duplicate groups processed: ${totalProcessed}`);
    console.log(`  • Duplicate materials deleted: ${totalDeleted}`);
    if (Object.keys(totalUpdated).length > 0) {
      console.log(`  • Foreign key references updated:`);
      for (const [table, count] of Object.entries(totalUpdated)) {
        console.log(`    - ${table}: ${count} row(s)`);
      }
    }
    console.log('═══════════════════════════════════════════════════════\n');

    // Verify no duplicates remain
    console.log('🔍 Verifying cleanup...');
    let remainingDuplicates = [];
    if (hasTenantId) {
      const verifyResult = await db.query(`
        SELECT tenant_id, material_code, COUNT(*) as cnt
        FROM materials
        GROUP BY tenant_id, material_code
        HAVING COUNT(*) > 1
      `);
      remainingDuplicates = verifyResult.rows;
    } else {
      const verifyResult = await db.query(`
        SELECT material_code, COUNT(*) as cnt
        FROM materials
        GROUP BY material_code
        HAVING COUNT(*) > 1
      `);
      remainingDuplicates = verifyResult.rows;
    }

    if (remainingDuplicates.length === 0) {
      console.log('✅ Verification passed: No duplicates remain\n');
    } else {
      console.warn(`⚠️  Warning: ${remainingDuplicates.length} duplicate group(s) still remain`);
      console.warn('   This may indicate a constraint issue or concurrent inserts\n');
    }

    return {
      processed: totalProcessed,
      deleted: totalDeleted,
      updated: totalUpdated
    };

  } catch (error) {
    console.error('❌ Cleanup failed:', error);
    throw error;
  } finally {
    await db.end();
  }
}

// Run if called directly
if (require.main === module) {
  cleanupDuplicateMaterials()
    .then(() => {
      console.log('✅ Script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Script failed:', error);
      process.exit(1);
    });
}

module.exports = { cleanupDuplicateMaterials };

