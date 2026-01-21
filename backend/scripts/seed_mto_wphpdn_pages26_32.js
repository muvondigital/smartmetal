/**
 * Seed WHP-DHN MTO Materials (Pages 26-32)
 * 
 * Normalizes and seeds materials from WHP-DHN MTO into SmartMetal catalog.
 * 
 * Material Families:
 * - Rolled Sections (W-beams): W36x194, W33x152, W24x104, etc.
 * - Rolled Tubular: 2338×40, 2134×60, 1828.8×44.5, etc.
 * - Seamless Pipe: 406.4×25.4, 273.1×15.9, 219.1×12.7, etc.
 * - Plates: PL6, PL8, PL10, PL12, PL15, PL16, PL20, PL25, PL30, PL32, PL35, PL38, PL40, PL45, PL50, PL60
 * - Reducers/Cones: 1828.8→1371.6×38, 1016→1320.8×30, etc.
 * 
 * Usage:
 *   cd backend
 *   node scripts/seed_mto_wphpdn_pages26_32.js [tenant_code]
 * 
 * If tenant_code is not provided, will prompt or use default tenant.
 * 
 * ============================================================================
 * SUMMARY
 * ============================================================================
 * 
 * Tables Touched:
 *   - materials (INSERT/UPDATE only, no DELETE)
 * 
 * Idempotency:
 *   - Script is safe to run multiple times
 *   - Uses ON CONFLICT (tenant_id, material_code) DO UPDATE for upsert behavior
 *   - If material exists: UPDATE with new values (except id, created_at)
 *   - If material doesn't exist: INSERT new row
 *   - No duplicates are created due to (tenant_id, material_code) unique constraint
 * 
 * Collision Handling:
 *   - Material codes are generated deterministically from normalized attributes
 *   - Same input always produces same material_code
 *   - If collision occurs (same tenant_id + material_code):
 *     * Existing material is updated with latest normalized data
 *     * No error is thrown
 *     * Updated count is incremented
 *   - Database unique constraint on (tenant_id, material_code) prevents duplicates
 * 
 * Transaction Safety:
 *   - Each material is upserted individually (not in a single transaction)
 *   - If one material fails, others continue processing
 *   - Errors are logged but don't stop the entire seeding process
 * 
 * ============================================================================
 */

require('dotenv').config();
const path = require('path');
const { connectMigrationDb } = require('../src/db/supabaseClient');
const { normalizeMtoItem } = require('../src/services/mtoNormalizer');

/**
 * WHP-DHN MTO Material Data (Pages 26-32)
 * 
 * Source: WHP-DHN MTO document (pages 26-32)
 * Note: Source PDF is not available - these are authoritative inputs
 * for catalog normalization and SKU generation.
 */
const whpDhnMtoItems = [
  // ============================================================================
  // A) Rolled Sections (W-beams)
  // ============================================================================
  { type: 'W_BEAM', designation: 'W36x194', spec_standard: 'ASTM A992', grade: 'GR50', material_type: 'CS', origin_type: 'NON_CHINA' },
  { type: 'W_BEAM', designation: 'W33x152', spec_standard: 'ASTM A992', grade: 'GR50', material_type: 'CS', origin_type: 'NON_CHINA' },
  { type: 'W_BEAM', designation: 'W24x104', spec_standard: 'ASTM A992', grade: 'GR50', material_type: 'CS', origin_type: 'NON_CHINA' },
  { type: 'W_BEAM', designation: 'W18x60', spec_standard: 'ASTM A992', grade: 'GR50', material_type: 'CS', origin_type: 'NON_CHINA' },
  { type: 'W_BEAM', designation: 'W12x40', spec_standard: 'ASTM A992', grade: 'GR50', material_type: 'CS', origin_type: 'NON_CHINA' },
  { type: 'W_BEAM', designation: 'W14x38', spec_standard: 'ASTM A992', grade: 'GR50', material_type: 'CS', origin_type: 'NON_CHINA' },
  { type: 'W_BEAM', designation: 'W10x22', spec_standard: 'ASTM A992', grade: 'GR50', material_type: 'CS', origin_type: 'NON_CHINA' },
  { type: 'W_BEAM', designation: 'W8x18', spec_standard: 'ASTM A992', grade: 'GR50', material_type: 'CS', origin_type: 'NON_CHINA' },
  
  // ============================================================================
  // B) Rolled Tubular
  // ============================================================================
  { type: 'ROLLED_TUBULAR', dimensions: '2338×40', spec_standard: 'ASTM A106', grade: 'GR.B', material_type: 'CS', origin_type: 'NON_CHINA' },
  { type: 'ROLLED_TUBULAR', dimensions: '2338×30', spec_standard: 'ASTM A106', grade: 'GR.B', material_type: 'CS', origin_type: 'NON_CHINA' },
  { type: 'ROLLED_TUBULAR', dimensions: '2134×60', spec_standard: 'ASTM A106', grade: 'GR.B', material_type: 'CS', origin_type: 'NON_CHINA' },
  { type: 'ROLLED_TUBULAR', dimensions: '2134×40', spec_standard: 'ASTM A106', grade: 'GR.B', material_type: 'CS', origin_type: 'NON_CHINA' },
  { type: 'ROLLED_TUBULAR', dimensions: '1828.8×44.5', spec_standard: 'ASTM A106', grade: 'GR.B', material_type: 'CS', origin_type: 'NON_CHINA' },
  { type: 'ROLLED_TUBULAR', dimensions: '1371.6×60', spec_standard: 'ASTM A106', grade: 'GR.B', material_type: 'CS', origin_type: 'NON_CHINA' },
  { type: 'ROLLED_TUBULAR', dimensions: '1219.2×25.4', spec_standard: 'ASTM A106', grade: 'GR.B', material_type: 'CS', origin_type: 'NON_CHINA' },
  { type: 'ROLLED_TUBULAR', dimensions: '1016×25.4', spec_standard: 'ASTM A106', grade: 'GR.B', material_type: 'CS', origin_type: 'NON_CHINA' },
  { type: 'ROLLED_TUBULAR', dimensions: '965.2×15.9', spec_standard: 'ASTM A106', grade: 'GR.B', material_type: 'CS', origin_type: 'NON_CHINA' },
  { type: 'ROLLED_TUBULAR', dimensions: '609.6×12.7', spec_standard: 'ASTM A106', grade: 'GR.B', material_type: 'CS', origin_type: 'NON_CHINA' },
  
  // ============================================================================
  // C) Seamless Tubular / PIPE
  // ============================================================================
  { type: 'SEAMLESS_PIPE', dimensions: '406.4×25.4', spec_standard: 'ASTM A106', grade: 'GR.B', material_type: 'CS', origin_type: 'NON_CHINA' },
  { type: 'SEAMLESS_PIPE', dimensions: '406.4×19.05', spec_standard: 'ASTM A106', grade: 'GR.B', material_type: 'CS', origin_type: 'NON_CHINA' },
  { type: 'SEAMLESS_PIPE', dimensions: '406.4×12.7', spec_standard: 'ASTM A106', grade: 'GR.B', material_type: 'CS', origin_type: 'NON_CHINA' },
  { type: 'SEAMLESS_PIPE', dimensions: '273.1×15.9', spec_standard: 'ASTM A106', grade: 'GR.B', material_type: 'CS', origin_type: 'NON_CHINA' },
  { type: 'SEAMLESS_PIPE', dimensions: '219.1×12.7', spec_standard: 'ASTM A106', grade: 'GR.B', material_type: 'CS', origin_type: 'NON_CHINA' },
  { type: 'SEAMLESS_PIPE', dimensions: '168.3×7.1', spec_standard: 'ASTM A106', grade: 'GR.B', material_type: 'CS', origin_type: 'NON_CHINA' },
  
  // ============================================================================
  // D) Plates
  // ============================================================================
  { type: 'PLATE', designation: 'PL6', plate_size_m: '2.4×6.0', spec_standard: 'ASTM A36', grade: null, material_type: 'CS', origin_type: 'NON_CHINA' },
  { type: 'PLATE', designation: 'PL8', plate_size_m: '2.4×6.0', spec_standard: 'ASTM A36', grade: null, material_type: 'CS', origin_type: 'NON_CHINA' },
  { type: 'PLATE', designation: 'PL10', plate_size_m: '2.4×6.0', spec_standard: 'ASTM A36', grade: null, material_type: 'CS', origin_type: 'NON_CHINA' },
  { type: 'PLATE', designation: 'PL12', plate_size_m: '2.4×6.0', spec_standard: 'ASTM A36', grade: null, material_type: 'CS', origin_type: 'NON_CHINA' },
  { type: 'PLATE', designation: 'PL15', plate_size_m: '2.4×6.0', spec_standard: 'ASTM A36', grade: null, material_type: 'CS', origin_type: 'NON_CHINA' },
  { type: 'PLATE', designation: 'PL16', plate_size_m: '2.4×6.0', spec_standard: 'ASTM A36', grade: null, material_type: 'CS', origin_type: 'NON_CHINA' },
  { type: 'PLATE', designation: 'PL20', plate_size_m: '2.4×6.0', spec_standard: 'ASTM A36', grade: null, material_type: 'CS', origin_type: 'NON_CHINA' },
  { type: 'PLATE', designation: 'PL25', plate_size_m: '2.4×6.0', spec_standard: 'ASTM A36', grade: null, material_type: 'CS', origin_type: 'NON_CHINA' },
  { type: 'PLATE', designation: 'PL30', plate_size_m: '2.4×6.0', spec_standard: 'ASTM A36', grade: null, material_type: 'CS', origin_type: 'NON_CHINA' },
  { type: 'PLATE', designation: 'PL32', plate_size_m: '2.4×6.0', spec_standard: 'ASTM A36', grade: null, material_type: 'CS', origin_type: 'NON_CHINA' },
  { type: 'PLATE', designation: 'PL35', plate_size_m: '2.4×6.0', spec_standard: 'ASTM A36', grade: null, material_type: 'CS', origin_type: 'NON_CHINA' },
  { type: 'PLATE', designation: 'PL38', plate_size_m: '2.4×6.0', spec_standard: 'ASTM A36', grade: null, material_type: 'CS', origin_type: 'NON_CHINA' },
  { type: 'PLATE', designation: 'PL40', plate_size_m: '2.4×6.0', spec_standard: 'ASTM A36', grade: null, material_type: 'CS', origin_type: 'NON_CHINA' },
  { type: 'PLATE', designation: 'PL45', plate_size_m: '2.4×6.0', spec_standard: 'ASTM A36', grade: null, material_type: 'CS', origin_type: 'NON_CHINA' },
  { type: 'PLATE', designation: 'PL50', plate_size_m: '2.4×6.0', spec_standard: 'ASTM A36', grade: null, material_type: 'CS', origin_type: 'NON_CHINA' },
  { type: 'PLATE', designation: 'PL60', plate_size_m: '2.4×6.0', spec_standard: 'ASTM A36', grade: null, material_type: 'CS', origin_type: 'NON_CHINA' },
  
  // ============================================================================
  // E) Reducers / Cones
  // ============================================================================
  { type: 'REDUCER', dimensions: '1828.8→1371.6×38', spec_standard: 'ASTM A36', grade: null, material_type: 'CS', origin_type: 'NON_CHINA' },
  { type: 'REDUCER', dimensions: '1016→1320.8×30', spec_standard: 'ASTM A36', grade: null, material_type: 'CS', origin_type: 'NON_CHINA' },
  { type: 'REDUCER', dimensions: '1219.2→1828×38', spec_standard: 'ASTM A36', grade: null, material_type: 'CS', origin_type: 'NON_CHINA' },
];

/**
 * Main seeding function
 */
async function seedWphpDhnMto(tenantCode = null) {
  const db = await connectMigrationDb();
  
  try {
    console.log('='.repeat(60));
    console.log('WHP-DHN MTO Materials Seeder (Pages 26-32)');
    console.log('='.repeat(60));
    console.log('');
    
    // ============================================================================
    // STEP 1: Resolve tenant
    // ============================================================================
    let tenantId;
    if (tenantCode) {
      const tenantResult = await db.query(
        'SELECT id, code, name FROM tenants WHERE LOWER(code) = LOWER($1)',
        [tenantCode]
      );
      if (tenantResult.rows.length === 0) {
        throw new Error(`Tenant not found: ${tenantCode}`);
      }
      tenantId = tenantResult.rows[0].id;
      console.log(`✓ Using tenant: ${tenantResult.rows[0].code} (${tenantResult.rows[0].name})`);
    } else {
      // Get first active tenant as default
      const tenantResult = await db.query(
        'SELECT id, code, name FROM tenants WHERE status = $1 ORDER BY code LIMIT 1',
        ['ACTIVE']
      );
      if (tenantResult.rows.length === 0) {
        throw new Error('No active tenants found. Please create a tenant first.');
      }
      tenantId = tenantResult.rows[0].id;
      console.log(`✓ Using default tenant: ${tenantResult.rows[0].code} (${tenantResult.rows[0].name})`);
    }
    console.log('');
    
    // ============================================================================
    // STEP 2: Check if materials table has tenant_id column
    // ============================================================================
    const tenantIdCheck = await db.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'materials' AND column_name = 'tenant_id';
    `);
    const hasTenantId = tenantIdCheck.rows.length > 0;
    
    if (!hasTenantId) {
      throw new Error('Materials table does not have tenant_id column. Please run migration 058 first.');
    }
    
    // ============================================================================
    // STEP 3: Normalize and seed materials
    // ============================================================================
    console.log(`Normalizing ${whpDhnMtoItems.length} MTO items...`);
    console.log('');
    
    const normalizedMaterials = [];
    const errors = [];
    
    for (const mtoItem of whpDhnMtoItems) {
      try {
        const normalized = normalizeMtoItem(mtoItem);
        normalizedMaterials.push(normalized);
      } catch (error) {
        errors.push({ item: mtoItem, error: error.message });
        console.error(`  ✗ Error normalizing ${JSON.stringify(mtoItem)}: ${error.message}`);
      }
    }
    
    if (errors.length > 0) {
      console.log(`⚠️  ${errors.length} items failed normalization (see errors above)`);
      console.log('');
    }
    
    console.log(`✓ Normalized ${normalizedMaterials.length} materials`);
    console.log('');
    
    // ============================================================================
    // STEP 4: Upsert materials into database
    // ============================================================================
    console.log('Upserting materials into catalog...');
    console.log('');
    
    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    const materialCodes = [];
    
    for (const material of normalizedMaterials) {
      try {
        // Check if material exists to determine if this is insert or update
        const existingCheck = await db.query(
          `SELECT id FROM materials WHERE tenant_id = $1 AND material_code = $2`,
          [tenantId, material.material_code]
        );
        const isUpdate = existingCheck.rows.length > 0;
        
        // Upsert material using ON CONFLICT DO UPDATE
        const result = await db.query(
          `INSERT INTO materials (
            tenant_id, material_code, category, spec_standard, grade, material_type,
            origin_type, size_description, base_cost, currency, notes
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          ON CONFLICT (tenant_id, material_code) DO UPDATE
          SET category = EXCLUDED.category,
              spec_standard = EXCLUDED.spec_standard,
              grade = EXCLUDED.grade,
              material_type = EXCLUDED.material_type,
              origin_type = EXCLUDED.origin_type,
              size_description = EXCLUDED.size_description,
              base_cost = EXCLUDED.base_cost,
              currency = EXCLUDED.currency,
              notes = EXCLUDED.notes,
              updated_at = NOW()
          RETURNING id, material_code`,
          [
            tenantId,
            material.material_code,
            material.category,
            material.spec_standard,
            material.grade,
            material.material_type,
            material.origin_type,
            material.size_description,
            material.base_cost,
            material.currency,
            material.notes,
          ]
        );
        
        if (result.rows.length > 0) {
          if (isUpdate) {
            updatedCount++;
            console.log(`  ↻ Updated: ${material.material_code} (${material._description})`);
          } else {
            createdCount++;
            console.log(`  ✓ Created: ${material.material_code} (${material._description})`);
          }
          materialCodes.push(material.material_code);
        } else {
          skippedCount++;
        }
      } catch (error) {
        console.error(`  ✗ Error upserting ${material.material_code}: ${error.message}`);
        errors.push({ material_code: material.material_code, error: error.message });
      }
    }
    
    // ============================================================================
    // STEP 5: Summary
    // ============================================================================
    console.log('');
    console.log('='.repeat(60));
    console.log('Seeding Summary');
    console.log('='.repeat(60));
    console.log(`  Total MTO items: ${whpDhnMtoItems.length}`);
    console.log(`  Normalized: ${normalizedMaterials.length}`);
    console.log(`  Created: ${createdCount}`);
    console.log(`  Updated: ${updatedCount}`);
    console.log(`  Skipped: ${skippedCount}`);
    console.log(`  Errors: ${errors.length}`);
    console.log('');
    
    if (materialCodes.length > 0) {
      console.log('Material codes generated:');
      materialCodes.slice(0, 10).forEach(code => console.log(`  - ${code}`));
      if (materialCodes.length > 10) {
        console.log(`  ... and ${materialCodes.length - 10} more`);
      }
    }
    console.log('');
    
    console.log('✓ WHP-DHN MTO materials seeded successfully');
    console.log('');
    console.log('Note: base_cost is set to 0. Update with actual pricing data as needed.');
    console.log('');
    
  } catch (error) {
    console.error('Error seeding WHP-DHN MTO materials:', error);
    throw error;
  } finally {
    await db.end();
  }
}

// Run if called directly
if (require.main === module) {
  const tenantCode = process.argv[2] || null;
  seedWphpDhnMto(tenantCode)
    .then(() => {
      console.log('Done.');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = {
  seedWphpDhnMto,
  whpDhnMtoItems,
};
