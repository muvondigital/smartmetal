/**
 * Diagnostic Script: Find Duplicate Materials
 * 
 * PURPOSE:
 * --------
 * This script identifies duplicate materials in the materials table.
 * It checks for duplicates by:
 * - material_code (if materials are global/pre-migration 058)
 * - (tenant_id, material_code) (if materials are tenant-scoped/post-migration 058)
 * 
 * USAGE:
 * ------
 * node backend/scripts/diagnoseDuplicateMaterials.js
 * 
 * OUTPUT:
 * -------
 * Lists all material codes (or tenant_id + material_code combinations) that have duplicates,
 * along with the count of duplicates and their IDs.
 */

require('dotenv').config();
const { connectMigrationDb } = require('../src/db/supabaseClient');

async function diagnoseDuplicates() {
  const db = await connectMigrationDb();

  try {
    console.log('🔍 Diagnosing duplicate materials...\n');

    // Check if materials table has tenant_id column (migration 058)
    const tenantIdCheck = await db.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'materials' AND column_name = 'tenant_id';
    `);
    const hasTenantId = tenantIdCheck.rows.length > 0;

    let duplicates = [];

    if (hasTenantId) {
      // Materials are tenant-scoped (migration 058+)
      // Check for duplicates by (tenant_id, material_code)
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

      if (duplicates.length === 0) {
        console.log('✅ No duplicates found by (tenant_id, material_code)');
      } else {
        console.log(`⚠️  Found ${duplicates.length} duplicate group(s):\n`);
        
        for (const dup of duplicates) {
          const tenantResult = await db.query(
            'SELECT code, name FROM tenants WHERE id = $1',
            [dup.tenant_id]
          );
          const tenantName = tenantResult.rows.length > 0 
            ? `${tenantResult.rows[0].code} (${tenantResult.rows[0].name})`
            : `Unknown (${dup.tenant_id})`;

          console.log(`  Material Code: ${dup.material_code}`);
          console.log(`  Tenant: ${tenantName}`);
          console.log(`  Duplicate Count: ${dup.duplicate_count}`);
          console.log(`  Material IDs: ${dup.material_ids.join(', ')}`);
          console.log(`  Created Dates: ${dup.created_dates.join(', ')}`);
          console.log('');
        }
      }
    } else {
      // Materials are global (pre-migration 058)
      // Check for duplicates by material_code
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

      if (duplicates.length === 0) {
        console.log('✅ No duplicates found by material_code');
      } else {
        console.log(`⚠️  Found ${duplicates.length} duplicate group(s):\n`);
        
        for (const dup of duplicates) {
          console.log(`  Material Code: ${dup.material_code}`);
          console.log(`  Duplicate Count: ${dup.duplicate_count}`);
          console.log(`  Material IDs: ${dup.material_ids.join(', ')}`);
          console.log(`  Created Dates: ${dup.created_dates.join(', ')}`);
          console.log('');
        }
      }
    }

    // Summary
    console.log('═══════════════════════════════════════════════════════');
    if (duplicates.length === 0) {
      console.log('✅ DIAGNOSIS: No duplicate materials found.');
      console.log('   Materials table is clean.');
    } else {
      const totalDuplicates = duplicates.reduce((sum, dup) => sum + (parseInt(dup.duplicate_count) - 1), 0);
      console.log(`⚠️  DIAGNOSIS: Found ${duplicates.length} duplicate group(s)`);
      console.log(`   Total duplicate rows to clean: ${totalDuplicates}`);
      console.log('');
      console.log('   Next step: Run cleanupDuplicateMaterials.js to merge duplicates');
    }
    console.log('═══════════════════════════════════════════════════════\n');

    return duplicates;
  } catch (error) {
    console.error('❌ Error diagnosing duplicates:', error);
    throw error;
  } finally {
    await db.end();
  }
}

// Run if called directly
if (require.main === module) {
  diagnoseDuplicates()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Script failed:', error);
      process.exit(1);
    });
}

module.exports = { diagnoseDuplicates };

