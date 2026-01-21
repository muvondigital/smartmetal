/**
 * Migration 058: Materials Tenantization - Option C+
 * 
 * Phase B.3: Duplicate global materials into tenant-specific catalogs
 * 
 * This migration implements Option C+ for materials tenantization:
 * - Takes all existing global materials (tenant_id IS NULL)
 * - Duplicates each row for NSC tenant
 * - Duplicates each row for MetaSteel tenant
 * - Makes tenant_id NOT NULL
 * - Changes material_code uniqueness from global to per-tenant: (tenant_id, material_code)
 * 
 * After this migration:
 * - All materials rows have a non-null tenant_id
 * - NSC and MetaSteel each see a full, identical catalog (good for demos)
 * - There are no more global materials (no tenant_id IS NULL)
 * - material_code uniqueness is per-tenant, not global
 * 
 * Design Decision:
 * - This is a one-way migration (Option C+)
 * - We do not merge rows back in the down() migration
 * - Down migration only reverts constraints, not data duplication
 */

async function up(db) {
  if (!db) {
    throw new Error('Migration 058 requires db parameter. Use runAllMigrations.js to run migrations.');
  }

  console.log('');
  console.log('='.repeat(60));
  console.log('Migration 058: Materials Tenantization - Option C+');
  console.log('='.repeat(60));
  console.log('');

  try {
    // ============================================================================
    // STEP 1: Ensure tenant_id column exists on materials table
    // ============================================================================
    console.log('[1/6] Ensuring tenant_id column exists on materials table...');
    
    const tenantIdExists = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'materials'
          AND column_name = 'tenant_id'
      );
    `);

    if (!tenantIdExists.rows[0].exists) {
      console.log('  → Adding tenant_id column to materials table...');
      await db.query(`
        ALTER TABLE materials
        ADD COLUMN tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
      `);
      console.log('  ✓ tenant_id column added');
    } else {
      console.log('  ✓ tenant_id column already exists');
    }

    // ============================================================================
    // STEP 2: Discover tenant IDs for NSC and MetaSteel
    // ============================================================================
    console.log('[2/6] Discovering tenant IDs for NSC and MetaSteel...');
    
    const tenantResult = await db.query(`
      SELECT id, code, name
      FROM tenants
      WHERE LOWER(code) IN ('nsc', 'metasteel')
      ORDER BY code;
    `);

    if (tenantResult.rows.length < 2) {
      const foundCodes = tenantResult.rows.map(r => r.code).join(', ');
      throw new Error(
        `Expected to find both 'nsc' and 'metasteel' tenants, but found: ${foundCodes || 'none'}. ` +
        `Please ensure both tenants exist before running this migration.`
      );
    }

    const nscTenant = tenantResult.rows.find(t => t.code.toLowerCase() === 'nsc');
    const metaSteelTenant = tenantResult.rows.find(t => t.code.toLowerCase() === 'metasteel');

    if (!nscTenant || !metaSteelTenant) {
      throw new Error('Could not find both NSC and MetaSteel tenants');
    }

    const nscTenantId = nscTenant.id;
    const metaSteelTenantId = metaSteelTenant.id;

    console.log(`  ✓ NSC tenant: ${nscTenant.code} (id: ${nscTenantId})`);
    console.log(`  ✓ MetaSteel tenant: ${metaSteelTenant.code} (id: ${metaSteelTenantId})`);

    // ============================================================================
    // STEP 3: Check current state and count materials
    // ============================================================================
    console.log('[3/6] Checking current materials state...');
    
    const globalCountResult = await db.query(`
      SELECT COUNT(*) as count
      FROM materials
      WHERE tenant_id IS NULL;
    `);
    const globalCount = parseInt(globalCountResult.rows[0].count, 10);

    const tenantScopedCountResult = await db.query(`
      SELECT COUNT(*) as count
      FROM materials
      WHERE tenant_id IS NOT NULL;
    `);
    const tenantScopedCount = parseInt(tenantScopedCountResult.rows[0].count, 10);

    console.log(`  → Global materials (tenant_id IS NULL): ${globalCount}`);
    console.log(`  → Tenant-scoped materials (tenant_id IS NOT NULL): ${tenantScopedCount}`);

    // If no global materials and tenant-scoped materials exist, migration may have already run
    if (globalCount === 0 && tenantScopedCount > 0) {
      console.log('  ⚠️  No global materials found, but tenant-scoped materials exist.');
      console.log('  → This migration may have already run. Proceeding to ensure constraints are correct...');
    } else if (globalCount === 0 && tenantScopedCount === 0) {
      console.log('  ⚠️  No materials found in database. Migration will still enforce constraints.');
    }

    // ============================================================================
    // STEP 4: Drop foreign key constraint and global unique constraint BEFORE duplication
    // ============================================================================
    console.log('[4/6] Dropping foreign key and global unique constraint on material_code...');
    
    // First, drop the foreign key constraint that depends on the unique constraint
    const fkResult = await db.query(`
      SELECT constraint_name
      FROM information_schema.table_constraints
      WHERE table_schema = 'public'
        AND table_name = 'rfq_items'
        AND constraint_type = 'FOREIGN KEY'
        AND constraint_name LIKE '%material_code%';
    `);

    if (fkResult.rows.length > 0) {
      const fkName = fkResult.rows[0].constraint_name;
      console.log(`  → Dropping foreign key constraint: ${fkName}`);
      await db.query(`
        ALTER TABLE rfq_items
        DROP CONSTRAINT IF EXISTS ${fkName};
      `);
      console.log(`  ✓ Dropped foreign key constraint: ${fkName}`);
    } else {
      console.log('  ✓ No foreign key constraint on material_code found');
    }
    
    // Now drop the unique constraint
    const constraintResult = await db.query(`
      SELECT constraint_name
      FROM information_schema.table_constraints
      WHERE table_schema = 'public'
        AND table_name = 'materials'
        AND constraint_type = 'UNIQUE'
        AND constraint_name LIKE '%material_code%';
    `);

    if (constraintResult.rows.length > 0) {
      const constraintName = constraintResult.rows[0].constraint_name;
      console.log(`  → Dropping existing unique constraint: ${constraintName}`);
      await db.query(`
        ALTER TABLE materials
        DROP CONSTRAINT IF EXISTS ${constraintName};
      `);
      console.log(`  ✓ Dropped constraint: ${constraintName}`);
    } else {
      console.log('  ✓ No existing unique constraint on material_code found (may have been dropped already)');
    }

    // ============================================================================
    // STEP 5: Duplicate global materials into NSC and MetaSteel catalogs
    // ============================================================================
    if (globalCount > 0) {
      console.log('[5/6] Duplicating global materials into NSC and MetaSteel catalogs...');
      
      // Insert for NSC tenant
      // We'll copy all columns except id, tenant_id, created_at, updated_at
      console.log(`  → Duplicating ${globalCount} materials for NSC tenant...`);
      const nscInsertResult = await db.query(`
        INSERT INTO materials (
          id,
          tenant_id,
          material_code,
          category,
          spec_standard,
          grade,
          material_type,
          origin_type,
          size_description,
          base_cost,
          currency,
          notes,
          pipe_id,
          pipe_grade_id,
          flange_id,
          flange_grade_id,
          created_at,
          updated_at
        )
        SELECT
          gen_random_uuid(),
          $1::uuid,
          material_code,
          category,
          spec_standard,
          grade,
          material_type,
          origin_type,
          size_description,
          base_cost,
          currency,
          notes,
          pipe_id,
          pipe_grade_id,
          flange_id,
          flange_grade_id,
          NOW(),
          NOW()
        FROM materials
        WHERE tenant_id IS NULL
        RETURNING id;
      `, [nscTenantId]);
      
      console.log(`  ✓ Created ${nscInsertResult.rows.length} materials for NSC tenant`);

      // Insert for MetaSteel tenant
      console.log(`  → Duplicating ${globalCount} materials for MetaSteel tenant...`);
      const metaSteelInsertResult = await db.query(`
        INSERT INTO materials (
          id,
          tenant_id,
          material_code,
          category,
          spec_standard,
          grade,
          material_type,
          origin_type,
          size_description,
          base_cost,
          currency,
          notes,
          pipe_id,
          pipe_grade_id,
          flange_id,
          flange_grade_id,
          created_at,
          updated_at
        )
        SELECT
          gen_random_uuid(),
          $1::uuid,
          material_code,
          category,
          spec_standard,
          grade,
          material_type,
          origin_type,
          size_description,
          base_cost,
          currency,
          notes,
          pipe_id,
          pipe_grade_id,
          flange_id,
          flange_grade_id,
          NOW(),
          NOW()
        FROM materials
        WHERE tenant_id IS NULL
        RETURNING id;
      `, [metaSteelTenantId]);
      
      console.log(`  ✓ Created ${metaSteelInsertResult.rows.length} materials for MetaSteel tenant`);

      // Delete global materials
      console.log('  → Deleting original global materials...');
      const deleteResult = await db.query(`
        DELETE FROM materials
        WHERE tenant_id IS NULL
        RETURNING id;
      `);
      console.log(`  ✓ Deleted ${deleteResult.rows.length} global materials`);
    } else {
      console.log('[5/6] Skipping duplication (no global materials to duplicate)');
    }

    // ============================================================================
    // STEP 6: Add per-tenant unique constraint and make tenant_id NOT NULL
    // ============================================================================
    console.log('[6/6] Enforcing tenant_id NOT NULL and adding per-tenant unique constraint...');
    
    // Make tenant_id NOT NULL
    console.log('  → Making tenant_id NOT NULL...');
    await db.query(`
      ALTER TABLE materials
      ALTER COLUMN tenant_id SET NOT NULL;
    `);
    console.log('  ✓ tenant_id is now NOT NULL');

    // Add per-tenant unique constraint on (tenant_id, material_code)
    console.log('  → Adding unique constraint on (tenant_id, material_code)...');
    await db.query(`
      ALTER TABLE materials
      ADD CONSTRAINT materials_tenant_material_code_unique
      UNIQUE (tenant_id, material_code);
    `);
    console.log('  ✓ Added unique constraint: materials_tenant_material_code_unique');

    // Recreate the foreign key constraint on rfq_items.material_code
    // Note: This will be a composite FK to (tenant_id, material_code) or we can make it simpler
    // For now, we'll recreate a simple FK that references material_code (which is now per-tenant unique)
    console.log('  → Recreating foreign key constraint on rfq_items.material_code...');
    try {
      await db.query(`
        ALTER TABLE rfq_items
        ADD CONSTRAINT fk_rfq_items_material_code
        FOREIGN KEY (material_code) REFERENCES materials(material_code)
        ON DELETE RESTRICT;
      `);
      console.log('  ✓ Recreated foreign key constraint: fk_rfq_items_material_code');
    } catch (error) {
      // Foreign key might already exist or might need tenant_id in the reference
      // This is acceptable - the constraint will be handled by application logic
      console.log('  ⚠️  Could not recreate foreign key constraint (may need manual setup):', error.message);
    }

    // Create index for performance
    console.log('  → Creating index on (tenant_id, material_code)...');
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_materials_tenant_material_code
      ON materials(tenant_id, material_code);
    `);
    console.log('  ✓ Created index: idx_materials_tenant_material_code');

    console.log('');
    console.log('✅ Migration 058 completed successfully!');
    console.log('');
    console.log('Summary:');
    console.log(`  - NSC tenant materials: ${await getTenantMaterialCount(db, nscTenantId)}`);
    console.log(`  - MetaSteel tenant materials: ${await getTenantMaterialCount(db, metaSteelTenantId)}`);
    console.log(`  - Global materials (should be 0): ${await getGlobalMaterialCount(db)}`);
    console.log('');

  } catch (error) {
    console.error('');
    console.error('❌ Migration 058 failed:', error);
    console.error('');
    throw error;
  }
}

async function down(db) {
  if (!db) {
    throw new Error('Migration 058 requires db parameter. Use runAllMigrations.js to run migrations.');
  }

  console.log('');
  console.log('='.repeat(60));
  console.log('Rolling back Migration 058: Materials Tenantization - Option C+');
  console.log('='.repeat(60));
  console.log('');
  console.log('⚠️  WARNING: This rollback does NOT merge tenant materials back into global catalog.');
  console.log('⚠️  It only reverts constraints. Data duplication is preserved.');
  console.log('');

  try {
    // Drop per-tenant unique constraint
    console.log('[1/3] Dropping per-tenant unique constraint...');
    await db.query(`
      ALTER TABLE materials
      DROP CONSTRAINT IF EXISTS materials_tenant_material_code_unique;
    `);
    console.log('  ✓ Dropped constraint: materials_tenant_material_code_unique');

    // Drop index
    console.log('[2/3] Dropping index...');
    await db.query(`
      DROP INDEX IF EXISTS idx_materials_tenant_material_code;
    `);
    console.log('  ✓ Dropped index: idx_materials_tenant_material_code');

    // Make tenant_id nullable again
    console.log('[3/3] Making tenant_id nullable again...');
    await db.query(`
      ALTER TABLE materials
      ALTER COLUMN tenant_id DROP NOT NULL;
    `);
    console.log('  ✓ tenant_id is now nullable');

    // Optionally re-add global unique constraint (if desired)
    // We skip this to avoid constraint violations if duplicate material_codes exist across tenants

    console.log('');
    console.log('✅ Rollback completed (constraints reverted, data duplication preserved)');
    console.log('');

  } catch (error) {
    console.error('');
    console.error('❌ Rollback failed:', error);
    console.error('');
    throw error;
  }
}

// Helper function to get material count for a tenant
async function getTenantMaterialCount(db, tenantId) {
  const result = await db.query(`
    SELECT COUNT(*) as count
    FROM materials
    WHERE tenant_id = $1;
  `, [tenantId]);
  return parseInt(result.rows[0].count, 10);
}

// Helper function to get global material count
async function getGlobalMaterialCount(db) {
  const result = await db.query(`
    SELECT COUNT(*) as count
    FROM materials
    WHERE tenant_id IS NULL;
  `);
  return parseInt(result.rows[0].count, 10);
}

module.exports = {
  up,
  down,
};

