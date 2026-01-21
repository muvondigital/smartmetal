/**
 * Flange Materials Generator
 *
 * This script generates materials entries for every combination of:
 * - Flange dimensions (from flanges table)
 * - Flange grades (from flange_grades table)
 *
 * Each combination creates a unique material with:
 * - SKU based on flange SKU rules
 * - Proper links to flange_id and flange_grade_id
 * - Category = 'FLANGE'
 * - Type = 'FLANGE'
 *
 * Usage:
 *   cd backend
 *   node scripts/seedFlangeMaterialsFromCatalog.js
 */

require('dotenv').config();
const { connectDb } = require('../src/db/supabaseClient');

/**
 * Normalizes NPS (Nominal Pipe Size) for SKU
 * Converts decimal inches to underscore-separated format
 */
function normaliseNpsForSku(npsInch) {
  if (npsInch === null || npsInch === undefined) {
    return 'UNK';
  }
  const npsStr = String(npsInch).replace('.', '_');
  return `${npsStr}IN`;
}

/**
 * Normalizes rating class for SKU
 */
function normaliseRatingClass(ratingClass) {
  if (!ratingClass) return 'UNK';
  return String(ratingClass);
}

/**
 * Normalizes flange type for SKU
 */
function normaliseFlangeType(type) {
  if (!type) return 'UNK';
  const normalized = type.toUpperCase().trim();
  // Map common abbreviations
  const typeMap = {
    'WNRF': 'WN',
    'WNRTJ': 'WN',
    'SORF': 'SO',
    'SOFF': 'SO',
    'BLRF': 'BL',
    'BLRTJ': 'BL',
    'SWRF': 'SW',
    'THD': 'THD',
    'LJ': 'LJ',
    'ORIFICE': 'OR',
  };
  return typeMap[normalized] || normalized.substring(0, 4);
}

/**
 * Normalizes facing for SKU
 */
function normaliseFacing(facing) {
  if (!facing) return 'UNK';
  const normalized = facing.toUpperCase().trim();
  // Map common facings
  const facingMap = {
    'RF': 'RF',
    'RTJ': 'RTJ',
    'FF': 'FF',
    'T&G': 'TG',
    'M&F': 'MF',
  };
  return facingMap[normalized] || normalized.substring(0, 3);
}

/**
 * Normalizes material specification for SKU
 */
function normaliseSpecForSku(spec, grade) {
  if (!spec) return 'GEN';
  
  // Combine spec and grade, then normalize
  const combined = `${spec} ${grade || ''}`.trim();
  
  return combined
    .toUpperCase()
    .replace(/ASTM\s*/gi, '')
    .replace(/\s+/g, '')
    .replace(/GR\./gi, 'GR')
    .replace(/GR\s*/gi, 'GR')
    .replace(/-/g, '')
    .replace(/\./g, '')
    .substring(0, 10); // Limit length
}

/**
 * Builds a complete SKU for a flange material
 *
 * SKU Format: FLG-{NPS}-{CLASS}-{TYPE}-{FACING}-{GRADE}
 */
function buildFlangeMaterialSku(flange, grade) {
  const npsPart = normaliseNpsForSku(flange.nps_inch);
  const classPart = normaliseRatingClass(flange.rating_class);
  const typePart = normaliseFlangeType(flange.type);
  const facingPart = normaliseFacing(flange.facing);
  const gradePart = normaliseSpecForSku(grade.spec, grade.grade);

  return `FLG-${npsPart}-${classPart}-${typePart}-${facingPart}-${gradePart}`;
}

/**
 * Generates a human-readable description for the flange material
 */
function generateFlangeDescription(flange, grade) {
  const nps = flange.nps_inch || 'N/A';
  const rating = flange.rating_class || 'N/A';
  const type = flange.type || 'N/A';
  const facing = flange.facing || 'N/A';
  const spec = `${grade.spec} ${grade.grade}`;

  // Map type abbreviations to full names
  const typeNames = {
    'WN': 'Weld Neck',
    'SO': 'Slip-On',
    'BL': 'Blind',
    'SW': 'Socket Weld',
    'THD': 'Threaded',
    'LJ': 'Lap Joint',
    'ORIFICE': 'Orifice',
  };

  // Map facing abbreviations to full names
  const facingNames = {
    'RF': 'Raised Face',
    'RTJ': 'Ring Type Joint',
    'FF': 'Flat Face',
    'T&G': 'Tongue & Groove',
    'M&F': 'Male & Female',
  };

  const typeName = typeNames[type] || type;
  const facingName = facingNames[facing] || facing;

  return `${nps}" Class ${rating} ${typeName} ${facingName} Flange, ${spec}`;
}

/**
 * Generates a material_code in the format: FLANGE-{NPS_DISPLAY}-{CLASS}-{TYPE}-{FACING}-{GRADE}
 * This is the canonical identifier for flange materials
 */
function generateMaterialCode(flange, grade) {
  const npsDisplay = `${flange.nps_inch || 'UNK'}"`;
  const classPart = String(flange.rating_class || 'UNK');
  const typePart = normaliseFlangeType(flange.type);
  const facingPart = normaliseFacing(flange.facing);
  const gradePart = normaliseSpecForSku(grade.spec, grade.grade);

  return `FLANGE-${npsDisplay}-${classPart}-${typePart}-${facingPart}-${gradePart}`;
}

/**
 * Inserts or updates a flange material
 */
async function upsertFlangeMaterial(db, flange, grade) {
  const sku = buildFlangeMaterialSku(flange, grade);
  const materialCode = generateMaterialCode(flange, grade);
  const description = generateFlangeDescription(flange, grade);

  // Check if material exists by flange_id + flange_grade_id
  const existingResult = await db.query(
    `SELECT id FROM materials
     WHERE flange_id = $1 AND flange_grade_id = $2`,
    [flange.id, grade.id]
  );

  // Default base cost (will need to be updated with actual pricing)
  const baseCost = 100.0;

  if (existingResult.rows.length > 0) {
    // Update existing material
    const materialId = existingResult.rows[0].id;
    const result = await db.query(
      `UPDATE materials SET
        sku = $1,
        material_code = $2,
        category = $3,
        material_type = $4,
        spec_standard = $5,
        grade = $6,
        size_description = $7,
        origin_type = $8,
        base_cost = $9,
        notes = $10,
        sku_generated = true,
        updated_at = NOW()
      WHERE id = $11
      RETURNING *`,
      [
        sku,
        materialCode,
        'FLANGE',
        'FLANGE',
        grade.spec,
        grade.grade,
        description,
        'CATALOG',
        baseCost,
        `Generated from flange_id=${flange.id}, flange_grade_id=${grade.id}`,
        materialId,
      ]
    );
    return { material: result.rows[0], action: 'updated' };
  } else {
    // Insert new material
    const result = await db.query(
      `INSERT INTO materials (
        sku,
        material_code,
        category,
        material_type,
        spec_standard,
        grade,
        size_description,
        origin_type,
        base_cost,
        currency,
        notes,
        sku_generated,
        flange_id,
        flange_grade_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *`,
      [
        sku,
        materialCode,
        'FLANGE',
        'FLANGE',
        grade.spec,
        grade.grade,
        description,
        'CATALOG',
        baseCost,
        'USD',
        `Generated from flange_id=${flange.id}, flange_grade_id=${grade.id}`,
        true,
        flange.id,
        grade.id,
      ]
    );
    return { material: result.rows[0], action: 'inserted' };
  }
}

/**
 * Main seeding function
 */
async function seedFlangeMaterialsFromCatalog() {
  console.log('='.repeat(60));
  console.log('Flange Materials Generator');
  console.log('='.repeat(60));
  console.log('');

  let db;
  try {
    // Connect to database
    db = await connectDb();
    console.log('✓ Connected to database');

    // Fetch all flanges
    console.log('📄 Loading flanges from database...');
    const flangesResult = await db.query(
      `SELECT * FROM flanges WHERE is_active = true ORDER BY nps_inch, rating_class, type, facing`
    );
    const flanges = flangesResult.rows;
    console.log(`✓ Loaded ${flanges.length} active flanges`);

    // Fetch all grades
    console.log('📄 Loading flange grades from database...');
    const gradesResult = await db.query(
      `SELECT * FROM flange_grades ORDER BY spec, grade`
    );
    const grades = gradesResult.rows;
    console.log(`✓ Loaded ${grades.length} flange grades`);

    if (flanges.length === 0) {
      console.warn('⚠️  No flanges found in database. Please run seedFlangesFromDimensionsCsv.js first.');
      process.exit(1);
    }

    if (grades.length === 0) {
      console.warn('⚠️  No flange grades found in database. Please run seedFlangeGradesFromCsv.js first.');
      process.exit(1);
    }

    console.log('');
    console.log(`📊 Will generate materials for ${flanges.length} × ${grades.length} = ${flanges.length * grades.length} combinations`);
    console.log('');

    // Generate materials for each combination
    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;

    console.log('Processing flange materials...');
    for (let i = 0; i < flanges.length; i++) {
      const flange = flanges[i];

      for (let j = 0; j < grades.length; j++) {
        const grade = grades[j];

        try {
          const result = await upsertFlangeMaterial(db, flange, grade);

          if (result.action === 'inserted') {
            inserted++;
          } else {
            updated++;
          }

          if ((inserted + updated) % 100 === 0) {
            console.log(`  Processed ${inserted + updated} materials...`);
          }
        } catch (error) {
          errors++;
          if (errors <= 10) {
            console.warn(`⚠️  Failed to create material for flange ${flange.id} + grade ${grade.id}: ${error.message}`);
          }
        }
      }
    }

    console.log('');
    console.log('='.repeat(60));
    console.log('✅ Flange Materials Generation Completed');
    console.log('='.repeat(60));
    console.log(`Total combinations processed: ${flanges.length * grades.length}`);
    console.log(`Successfully inserted: ${inserted}`);
    console.log(`Successfully updated: ${updated}`);
    console.log(`Errors: ${errors}`);
    console.log('');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Seed script failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  seedFlangeMaterialsFromCatalog();
}

module.exports = {
  seedFlangeMaterialsFromCatalog,
  buildFlangeMaterialSku,
  generateFlangeDescription,
  upsertFlangeMaterial,
};

