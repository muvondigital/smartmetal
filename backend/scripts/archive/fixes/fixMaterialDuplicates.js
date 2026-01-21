// Load environment variables first - try multiple paths
const path = require('path');
const dotenv = require('dotenv');

// Try loading from project root first, then backend directory
const envPaths = [
  path.join(__dirname, '../../.env'),
  path.join(__dirname, '../.env'),
  '.env'
];

for (const envPath of envPaths) {
  const result = dotenv.config({ path: envPath });
  if (!result.error) {
    console.log(`✓ Loaded .env from: ${envPath}`);
    break;
  }
}

// Initialize config (validates env vars) - must be loaded after dotenv
const { config } = require('../src/config/env');

const { connectMigrationDb } = require('../src/db/supabaseClient');

/**
 * Script to identify and remove duplicate materials
 * 
 * Strategy:
 * 1. Find duplicates by material_code (if tenant_id doesn't exist) or (tenant_id, material_code)
 * 2. For each duplicate group, keep the oldest material (by created_at)
 * 3. Update any references (rfq_items, pricing_run_items) to point to the kept material
 * 4. Delete the duplicate materials
 */

async function findDuplicates(db) {
  // Check if tenant_id column exists
  const tenantIdCheck = await db.query(`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = 'materials' AND column_name = 'tenant_id';
  `);
  const hasTenantId = tenantIdCheck.rows.length > 0;

  if (!hasTenantId) {
    // Legacy: Find duplicates by material_code only
    const duplicates = await db.query(`
      SELECT 
        NULL::uuid as tenant_id,
        material_code,
        COUNT(*) as count,
        array_agg(id ORDER BY created_at) as material_ids,
        array_agg(created_at ORDER BY created_at) as created_dates
      FROM materials
      GROUP BY material_code
      HAVING COUNT(*) > 1
      ORDER BY material_code;
    `);
  return duplicates.rows;
}

async function processDuplicates(db, keepId, deleteIds) {
  // Update rfq_items that reference duplicate materials
  const rfqItemsUpdated = await db.query(`
    UPDATE rfq_items
    SET material_id = $1
    WHERE material_id = ANY($2::uuid[])
    RETURNING id;
  `, [keepId, deleteIds]);

  // Update pricing_run_items that reference duplicate materials
  const pricingItemsUpdated = await db.query(`
    UPDATE pricing_run_items
    SET material_id = $1
    WHERE material_id = ANY($2::uuid[])
    RETURNING id;
  `, [keepId, deleteIds]);

  const updatedCount = rfqItemsUpdated.rowCount + pricingItemsUpdated.rowCount;

  if (updatedCount > 0) {
    console.log(`   ✓ Updated ${updatedCount} references (${rfqItemsUpdated.rowCount} rfq_items, ${pricingItemsUpdated.rowCount} pricing_run_items)`);
  }

  // Delete duplicate materials
  const deleteResult = await db.query(`
    DELETE FROM materials
    WHERE id = ANY($1::uuid[])
    RETURNING id;
  `, [deleteIds]);

  console.log(`   ✓ Deleted ${deleteResult.rowCount} duplicate(s)`);

  return { updated: updatedCount, deleted: deleteResult.rowCount };
}

  // Get MetaSteel tenant ID
  const metaSteelResult = await db.query(`
    SELECT id FROM tenants WHERE code = 'metasteel' LIMIT 1
  `);
  const metaSteelTenantId = metaSteelResult.rows[0]?.id;

  // Find duplicates within same tenant (by tenant_id + material_code)
  const sameTenantDups = await db.query(`
    SELECT 
      tenant_id,
      material_code,
      COUNT(*) as count,
      array_agg(id ORDER BY created_at) as material_ids,
      array_agg(created_at ORDER BY created_at) as created_dates
    FROM materials
    GROUP BY tenant_id, material_code
    HAVING COUNT(*) > 1
    ORDER BY tenant_id, material_code;
  `);

  // Find cross-tenant duplicates (same material_code in different tenants)
  // For MetaSteel materials (starting with 'M-'), keep only in MetaSteel tenant
  const crossTenantDups = await db.query(`
    SELECT 
      material_code,
      COUNT(DISTINCT tenant_id) as tenant_count,
      COUNT(*) as total_count,
      array_agg(id ORDER BY 
        CASE 
          WHEN tenant_id = $1 THEN 0  -- MetaSteel tenant first
          ELSE 1 
        END, created_at
      ) as material_ids,
      array_agg(tenant_id ORDER BY 
        CASE 
          WHEN tenant_id = $1 THEN 0
          ELSE 1 
        END, created_at
      ) as tenant_ids,
      array_agg(created_at ORDER BY 
        CASE 
          WHEN tenant_id = $1 THEN 0
          ELSE 1 
        END, created_at
      ) as created_dates
    FROM materials
    WHERE material_code LIKE 'M-%'  -- Only MetaSteel materials
    GROUP BY material_code
    HAVING COUNT(DISTINCT tenant_id) > 1
    ORDER BY material_code;
  `, [metaSteelTenantId]);

  return {
    sameTenant: sameTenantDups.rows,
    crossTenant: crossTenantDups.rows,
    metaSteelTenantId
  };
}

async function processDuplicates(db, keepId, deleteIds) {
  // Update rfq_items that reference duplicate materials
  const rfqItemsUpdated = await db.query(`
    UPDATE rfq_items
    SET material_id = $1
    WHERE material_id = ANY($2::uuid[])
    RETURNING id;
  `, [keepId, deleteIds]);

  // Update pricing_run_items that reference duplicate materials
  const pricingItemsUpdated = await db.query(`
    UPDATE pricing_run_items
    SET material_id = $1
    WHERE material_id = ANY($2::uuid[])
    RETURNING id;
  `, [keepId, deleteIds]);

  const updatedCount = rfqItemsUpdated.rowCount + pricingItemsUpdated.rowCount;

  if (updatedCount > 0) {
    console.log(`   ✓ Updated ${updatedCount} references (${rfqItemsUpdated.rowCount} rfq_items, ${pricingItemsUpdated.rowCount} pricing_run_items)`);
  }

  // Delete duplicate materials
  const deleteResult = await db.query(`
    DELETE FROM materials
    WHERE id = ANY($1::uuid[])
    RETURNING id;
  `, [deleteIds]);

  console.log(`   ✓ Deleted ${deleteResult.rowCount} duplicate(s)`);

  return { updated: updatedCount, deleted: deleteResult.rowCount };
}

async function fixMaterialDuplicates() {
  const db = await connectMigrationDb();

  try {
    console.log('🔍 Finding duplicate materials...\n');

    const duplicates = await findDuplicates(db);
    
    // Handle both old format (array) and new format (object)
    let sameTenantDups = [];
    let crossTenantDups = [];
    let metaSteelTenantId = null;

    if (Array.isArray(duplicates)) {
      // Old format - all duplicates in one array
      sameTenantDups = duplicates;
    } else {
      // New format - separated by type
      sameTenantDups = duplicates.sameTenant || [];
      crossTenantDups = duplicates.crossTenant || [];
      metaSteelTenantId = duplicates.metaSteelTenantId;
    }
    
    const totalDups = sameTenantDups.length + crossTenantDups.length;
    if (totalDups === 0) {
      console.log('✅ No duplicates found!');
      return;
    }

    console.log(`Found ${totalDups} duplicate groups:`);
    console.log(`  - ${sameTenantDups.length} same-tenant duplicates`);
    console.log(`  - ${crossTenantDups.length} cross-tenant duplicates\n`);

    let totalKept = 0;
    let totalDeleted = 0;
    let totalUpdated = 0;

    await db.query('BEGIN');

    try {
      // Process same-tenant duplicates
      for (const dup of sameTenantDups) {
        const materialIds = dup.material_ids;
        const keepId = materialIds[0]; // Keep the oldest (first created)
        const deleteIds = materialIds.slice(1); // Delete the rest

        console.log(`\n📦 Material Code: ${dup.material_code}`);
        console.log(`   Tenant ID: ${dup.tenant_id || 'NULL (global)'}`);
        console.log(`   Total duplicates: ${dup.count}`);
        console.log(`   Keeping: ${keepId} (oldest)`);
        console.log(`   Deleting: ${deleteIds.join(', ')}`);

        // Update references
        const { updated, deleted } = await processDuplicates(db, keepId, deleteIds);
        totalUpdated += updated;
        totalDeleted += deleted;
        totalKept += 1;
      }

      // Process cross-tenant duplicates (MetaSteel materials)
      for (const dup of crossTenantDups) {
        const materialIds = dup.material_ids;
        const tenantIds = dup.tenant_ids;
        const keepId = materialIds[0]; // Keep the one in MetaSteel tenant (first in sorted order)
        const deleteIds = materialIds.slice(1); // Delete from other tenants

        console.log(`\n📦 Material Code: ${dup.material_code}`);
        console.log(`   Cross-tenant duplicate: ${dup.tenant_count} tenants`);
        console.log(`   Keeping: ${keepId} (in MetaSteel tenant: ${metaSteelTenantId})`);
        console.log(`   Deleting: ${deleteIds.join(', ')} (from other tenant(s))`);

        // Update references
        const { updated, deleted } = await processDuplicates(db, keepId, deleteIds);
        totalUpdated += updated;
        totalDeleted += deleted;
        totalKept += 1;
      }

      await db.query('COMMIT');

      console.log('\n' + '='.repeat(60));
      console.log('✅ Duplicate removal complete!');
      console.log(`   Kept: ${totalKept} materials`);
      console.log(`   Deleted: ${totalDeleted} duplicates`);
      console.log(`   Updated references: ${totalUpdated}`);
      console.log('='.repeat(60));

      // Show final count
      const finalCount = await db.query('SELECT COUNT(*) as count FROM materials');
      console.log(`\n📊 Total materials remaining: ${finalCount.rows[0].count}`);

    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    }

  } catch (error) {
    console.error('❌ Error fixing duplicates:', error);
    throw error;
  } finally {
    await db.end();
  }
}

// Run if called directly
if (require.main === module) {
  fixMaterialDuplicates()
    .then(() => {
      console.log('\n✅ Script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Script failed:', error);
      process.exit(1);
    });
}

module.exports = { fixMaterialDuplicates };

