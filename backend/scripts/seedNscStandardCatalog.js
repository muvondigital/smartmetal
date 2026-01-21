/**
 * Seed NSC Standard Catalog
 * 
 * Seeds NSC's standard material catalog based on their product offerings.
 * Includes common industrial materials that NSC typically stocks.
 * 
 * Product Categories:
 * 1. Pipes (Seamless/Welded) - Common NPS sizes, schedules, materials
 * 2. Plates - Standard thicknesses, common materials
 * 3. Fittings - Common types (Elbows, Tees, Reducers, Caps)
 * 4. Flanges - Common types (WN, SO, BL), ratings (150, 300, 600)
 * 5. Structural - Common beams (W-beams, H-beams)
 * 6. Fasteners - Common bolts/nuts (ASTM specs)
 * 
 * Usage:
 *   cd backend
 *   node scripts/seedNscStandardCatalog.js [tenant_code]
 * 
 * Defaults to 'nsc' tenant if not specified.
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
 * 
 * Collision Handling:
 *   - Material codes are generated deterministically
 *   - Database unique constraint on (tenant_id, material_code) prevents duplicates
 */

require('dotenv').config();
const { connectMigrationDb } = require('../src/db/supabaseClient');

/**
 * Generate material code following SmartMetal conventions
 * Pattern: M-{MATERIAL}-{CATEGORY}-{SIZE}-{VARIANT}-{STANDARD}
 */
function generateMaterialCode(category, sizeComponent, variantComponent, standardComponent, materialType = 'CS') {
  const materialTypeCode = materialType === 'CS' ? 'CS' : materialType === 'SS' ? 'SS' : 'CS';
  const categoryCode = category.toUpperCase().replace(/_/g, '-');
  
  let code = `M-${materialTypeCode}-${categoryCode}-${sizeComponent}`;
  if (variantComponent) {
    code += `-${variantComponent}`;
  }
  if (standardComponent) {
    code += `-${standardComponent}`;
  }
  return code;
}

/**
 * NSC Standard Catalog Materials
 * Based on NSC's product offerings from their website
 */
const nscStandardMaterials = [];

// ============================================================================
// 1. PIPES - Common NPS sizes, schedules, materials
// ============================================================================
const commonNpsSizes = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4, 6, 8, 10, 12, 14, 16, 18, 20, 24];
const commonSchedules = ['SCH40', 'SCH80', 'SCH160'];
const pipeMaterials = [
  { spec: 'ASTM A106', grade: 'GR.B', materialType: 'CS', desc: 'Carbon Steel' },
  { spec: 'API 5L', grade: 'GR.B', materialType: 'CS', desc: 'Carbon Steel' },
  { spec: 'ASTM A312', grade: 'TP304', materialType: 'SS', desc: 'Stainless Steel 304' },
  { spec: 'ASTM A312', grade: 'TP316', materialType: 'SS', desc: 'Stainless Steel 316' },
];

for (const nps of commonNpsSizes) {
  for (const schedule of commonSchedules) {
    for (const mat of pipeMaterials) {
      const sizeComponent = `${nps.toString().replace('.', '_')}-${schedule}`;
      const standardComponent = mat.spec.replace(/\s+/g, '').replace(/ASTM|API/gi, '').replace(/GR\./gi, 'GR');
      const materialCode = generateMaterialCode('PIPE', sizeComponent, 'SEAM', standardComponent, mat.materialType);
      
      nscStandardMaterials.push({
        material_code: materialCode,
        category: 'PIPE',
        spec_standard: mat.spec,
        grade: mat.grade,
        material_type: mat.desc,
        origin_type: mat.materialType === 'SS' ? 'NON_CHINA' : 'BOTH',
        size_description: `${nps}" ${schedule}`,
        base_cost: 0,
        currency: 'USD',
        notes: JSON.stringify({
          nps_inch: nps,
          schedule: schedule,
          manufacturing_method: 'SEAMLESS',
          description: `${nps}" ${schedule} ${mat.desc} ${mat.spec} ${mat.grade}`,
        }, null, 2),
      });
    }
  }
}

// ============================================================================
// 2. PLATES - Standard thicknesses, common materials
// ============================================================================
const plateThicknesses = [6, 8, 10, 12, 15, 16, 20, 25, 30, 32, 40, 50, 60, 80, 100];
const plateMaterials = [
  { spec: 'ASTM A36', grade: 'A36', materialType: 'CS', desc: 'Carbon Steel' },
  { spec: 'ASTM A516', grade: 'GR.70', materialType: 'CS', desc: 'Carbon Steel' },
  { spec: 'ASTM A240', grade: '304', materialType: 'SS', desc: 'Stainless Steel 304' },
  { spec: 'ASTM A240', grade: '316', materialType: 'SS', desc: 'Stainless Steel 316' },
];

for (const thickness of plateThicknesses) {
  for (const mat of plateMaterials) {
    const sizeComponent = `T${thickness}`;
    const standardComponent = mat.spec.replace(/\s+/g, '').replace(/ASTM/gi, '').replace(/GR\./gi, 'GR');
    const materialCode = generateMaterialCode('PLATE', sizeComponent, 'PLAT', standardComponent, mat.materialType);
    
    nscStandardMaterials.push({
      material_code: materialCode,
      category: 'PLATE',
      spec_standard: mat.spec,
      grade: mat.grade,
      material_type: mat.desc,
      origin_type: mat.materialType === 'SS' ? 'NON_CHINA' : 'BOTH',
      size_description: `PL${thickness} (2.4×6.0m)`,
      base_cost: 0,
      currency: 'USD',
      notes: JSON.stringify({
        thickness_mm: thickness,
        plate_size_m: '2.4×6.0',
        description: `Plate ${thickness}mm ${mat.desc} ${mat.spec} ${mat.grade}`,
      }, null, 2),
    });
  }
}

// ============================================================================
// 3. FITTINGS - Common types, sizes, schedules
// ============================================================================
const fittingTypes = [
  { type: 'ELBOW90', desc: '90° Elbow LR', category: 'FITTING' },
  { type: 'ELBOW45', desc: '45° Elbow LR', category: 'FITTING' },
  { type: 'TEE', desc: 'Equal Tee', category: 'FITTING' },
  { type: 'REDUCER', desc: 'Concentric Reducer', category: 'FITTING' },
  { type: 'CAP', desc: 'Cap', category: 'FITTING' },
];
const fittingNpsSizes = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4, 6, 8, 10, 12];
const fittingSchedules = ['SCH40', 'SCH80'];
const fittingMaterials = [
  { spec: 'ANSI B16.9', grade: 'WPB', materialType: 'CS', desc: 'Carbon Steel' },
  { spec: 'ANSI B16.9', grade: '304', materialType: 'SS', desc: 'Stainless Steel 304' },
  { spec: 'ANSI B16.9', grade: '316', materialType: 'SS', desc: 'Stainless Steel 316' },
];

for (const fitting of fittingTypes) {
  for (const nps of fittingNpsSizes) {
    for (const schedule of fittingSchedules) {
      for (const mat of fittingMaterials) {
        const sizeComponent = `${nps.toString().replace('.', '_')}-${schedule}`;
        const standardComponent = mat.spec.replace(/\s+/g, '').replace(/ANSI/gi, '');
        const materialCode = generateMaterialCode(fitting.category, sizeComponent, fitting.type, standardComponent, mat.materialType);
        
        nscStandardMaterials.push({
          material_code: materialCode,
          category: 'FITTING',
          spec_standard: mat.spec,
          grade: mat.grade,
          material_type: mat.desc,
          origin_type: mat.materialType === 'SS' ? 'NON_CHINA' : 'BOTH',
          size_description: `${nps}" ${schedule} ${fitting.desc}`,
          base_cost: 0,
          currency: 'USD',
          notes: JSON.stringify({
            fitting_type: fitting.type,
            nps_inch: nps,
            schedule: schedule,
            description: `${nps}" ${schedule} ${fitting.desc} ${mat.desc} ${mat.spec} ${mat.grade}`,
          }, null, 2),
        });
      }
    }
  }
}

// ============================================================================
// 4. FLANGES - Common types, sizes, ratings
// ============================================================================
const flangeTypes = [
  { type: 'WN', desc: 'Weld Neck', category: 'FLANGE' },
  { type: 'SO', desc: 'Slip-On', category: 'FLANGE' },
  { type: 'BL', desc: 'Blind', category: 'FLANGE' },
];
const flangeNpsSizes = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4, 6, 8, 10, 12, 14, 16, 18, 20, 24];
const flangeRatings = ['150', '300', '600'];
const flangeMaterials = [
  { spec: 'ASME B16.5', grade: 'A105', materialType: 'CS', desc: 'Carbon Steel' },
  { spec: 'ASME B16.5', grade: '304', materialType: 'SS', desc: 'Stainless Steel 304' },
  { spec: 'ASME B16.5', grade: '316', materialType: 'SS', desc: 'Stainless Steel 316' },
];

for (const flange of flangeTypes) {
  for (const nps of flangeNpsSizes) {
    for (const rating of flangeRatings) {
      for (const mat of flangeMaterials) {
        const sizeComponent = `${nps.toString().replace('.', '_')}-${rating}`;
        const standardComponent = mat.spec.replace(/\s+/g, '').replace(/ASME/gi, '');
        const materialCode = generateMaterialCode(flange.category, sizeComponent, flange.type, standardComponent, mat.materialType);
        
        nscStandardMaterials.push({
          material_code: materialCode,
          category: 'FLANGE',
          spec_standard: mat.spec,
          grade: mat.grade,
          material_type: mat.desc,
          origin_type: mat.materialType === 'SS' ? 'NON_CHINA' : 'BOTH',
          size_description: `${nps}" ${rating}# ${flange.desc}`,
          base_cost: 0,
          currency: 'USD',
          notes: JSON.stringify({
            flange_type: flange.type,
            nps_inch: nps,
            rating: rating,
            facing: 'RF',
            description: `${nps}" ${rating}# ${flange.desc} ${mat.desc} ${mat.spec} ${mat.grade}`,
          }, null, 2),
        });
      }
    }
  }
}

// ============================================================================
// 5. STRUCTURAL - Common W-beams and H-beams
// ============================================================================
const structuralBeams = [
  { designation: 'W8x18', spec: 'ASTM A992', grade: 'GR50', materialType: 'CS' },
  { designation: 'W10x22', spec: 'ASTM A992', grade: 'GR50', materialType: 'CS' },
  { designation: 'W12x40', spec: 'ASTM A992', grade: 'GR50', materialType: 'CS' },
  { designation: 'W14x38', spec: 'ASTM A992', grade: 'GR50', materialType: 'CS' },
  { designation: 'W18x60', spec: 'ASTM A992', grade: 'GR50', materialType: 'CS' },
  { designation: 'W24x104', spec: 'ASTM A992', grade: 'GR50', materialType: 'CS' },
  { designation: 'W33x152', spec: 'ASTM A992', grade: 'GR50', materialType: 'CS' },
  { designation: 'W36x194', spec: 'ASTM A992', grade: 'GR50', materialType: 'CS' },
];

for (const beam of structuralBeams) {
  const sizeComponent = beam.designation.replace(/[×xX]/g, 'X');
  const standardComponent = beam.spec.replace(/\s+/g, '').replace(/ASTM/gi, '').replace(/GR\./gi, 'GR');
  const materialCode = generateMaterialCode('STRUCTURAL-BEAM', sizeComponent, 'BEAM', standardComponent, beam.materialType);
  
  nscStandardMaterials.push({
    material_code: materialCode,
    category: 'STRUCTURAL_BEAM',
    spec_standard: beam.spec,
    grade: beam.grade,
    material_type: 'Carbon Steel',
    origin_type: 'NON_CHINA',
    size_description: beam.designation,
    base_cost: 0,
    currency: 'USD',
    notes: JSON.stringify({
      designation: beam.designation,
      description: `W-Beam ${beam.designation} ${beam.spec} ${beam.grade}`,
    }, null, 2),
  });
}

// ============================================================================
// 6. FASTENERS - Common bolts/nuts
// ============================================================================
const fastenerTypes = [
  { type: 'BOLT', desc: 'Hex Head Bolt', category: 'FASTENER' },
  { type: 'NUT', desc: 'Hex Nut', category: 'FASTENER' },
];
const fastenerSizes = ['M12', 'M16', 'M20', 'M24', 'M30', '1/2"', '5/8"', '3/4"', '1"', '1-1/4"'];
const fastenerMaterials = [
  { spec: 'ASTM A193', grade: 'B7', materialType: 'CS', desc: 'Low Alloy Steel' },
  { spec: 'ASTM A320', grade: 'L7', materialType: 'CS', desc: 'Low Temperature Steel' },
  { spec: 'ASTM A193', grade: 'B8', materialType: 'SS', desc: 'Stainless Steel 304' },
  { spec: 'ASTM A193', grade: 'B8M', materialType: 'SS', desc: 'Stainless Steel 316' },
];

for (const fastener of fastenerTypes) {
  for (const size of fastenerSizes) {
    for (const mat of fastenerMaterials) {
      const sizeComponent = size.replace(/[\/\s"]/g, '_').replace(/-/g, '_');
      const standardComponent = mat.spec.replace(/\s+/g, '').replace(/ASTM/gi, '');
      const materialCode = generateMaterialCode(fastener.category, sizeComponent, fastener.type, standardComponent, mat.materialType);
      
      nscStandardMaterials.push({
        material_code: materialCode,
        category: 'FASTENER',
        spec_standard: mat.spec,
        grade: mat.grade,
        material_type: mat.desc,
        origin_type: mat.materialType === 'SS' ? 'NON_CHINA' : 'BOTH',
        size_description: `${size} ${fastener.desc}`,
        base_cost: 0,
        currency: 'USD',
        notes: JSON.stringify({
          fastener_type: fastener.type,
          size: size,
          description: `${size} ${fastener.desc} ${mat.desc} ${mat.spec} ${mat.grade}`,
        }, null, 2),
      });
    }
  }
}

/**
 * Main seeding function
 */
async function seedNscStandardCatalog(tenantCode = 'nsc') {
  const db = await connectMigrationDb();
  
  try {
    console.log('='.repeat(60));
    console.log('NSC Standard Catalog Seeding');
    console.log('='.repeat(60));
    console.log('');
    
    // Find tenant
    console.log('[1/4] Finding tenant...');
    const tenantResult = await db.query(
      'SELECT id, code, name FROM tenants WHERE LOWER(code) = $1',
      [tenantCode.toLowerCase()]
    );
    
    if (tenantResult.rows.length === 0) {
      throw new Error(`Tenant '${tenantCode}' not found`);
    }
    
    const tenant = tenantResult.rows[0];
    console.log(`✓ Found tenant: ${tenant.code} (${tenant.name})`);
    console.log(`  ID: ${tenant.id}`);
    console.log('');
    
    // Count materials
    console.log('[2/4] Preparing materials...');
    console.log(`✓ Generated ${nscStandardMaterials.length} standard materials`);
    console.log('');
    
    // Upsert materials
    console.log('[3/4] Upserting materials into catalog...');
    console.log('');
    
    let createdCount = 0;
    let updatedCount = 0;
    let errorCount = 0;
    
    for (const material of nscStandardMaterials) {
      try {
        // Check if exists
        const existingCheck = await db.query(
          'SELECT id FROM materials WHERE tenant_id = $1 AND material_code = $2',
          [tenant.id, material.material_code]
        );
        const isUpdate = existingCheck.rows.length > 0;
        
        // Upsert
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
            tenant.id,
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
          } else {
            createdCount++;
            if (createdCount <= 20 || createdCount % 100 === 0) {
              console.log(`  ✓ ${isUpdate ? 'Updated' : 'Created'}: ${material.material_code}`);
            }
          }
        }
      } catch (error) {
        errorCount++;
        console.error(`  ✗ Error: ${material.material_code} - ${error.message}`);
      }
    }
    
    // Summary
    console.log('');
    console.log('='.repeat(60));
    console.log('Seeding Summary');
    console.log('='.repeat(60));
    console.log(`  Total materials: ${nscStandardMaterials.length}`);
    console.log(`  Created: ${createdCount}`);
    console.log(`  Updated: ${updatedCount}`);
    console.log(`  Errors: ${errorCount}`);
    console.log('');
    
    // Category breakdown
    const categoryCounts = {};
    nscStandardMaterials.forEach(m => {
      categoryCounts[m.category] = (categoryCounts[m.category] || 0) + 1;
    });
    console.log('Category breakdown:');
    Object.entries(categoryCounts).forEach(([cat, count]) => {
      console.log(`  ${cat}: ${count}`);
    });
    console.log('');
    
    console.log('✓ NSC standard catalog seeded successfully');
    console.log('');
    console.log('Note: base_cost is set to 0. Update with actual pricing data as needed.');
    console.log('');
    
  } catch (error) {
    console.error('Error seeding NSC standard catalog:', error);
    throw error;
  } finally {
    await db.end();
  }
}

// Run if called directly
if (require.main === module) {
  const tenantCode = process.argv[2] || 'nsc';
  seedNscStandardCatalog(tenantCode)
    .then(() => {
      console.log('Done.');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = { seedNscStandardCatalog };
