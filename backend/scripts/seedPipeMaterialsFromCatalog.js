/**
 * Pipe Materials Generator
 *
 * This script generates materials entries for every combination of:
 * - Pipe dimensions (from pipes table)
 * - Pipe grades (from pipe_grades table)
 *
 * Each combination creates a unique material with:
 * - SKU based on pipeSku.ts rules
 * - Proper links to pipe_id and grade_id
 * - Category = 'PIPE'
 * - Type = 'PIPE'
 *
 * Usage:
 *   cd backend
 *   node scripts/seedPipeMaterialsFromCatalog.js
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
 * Normalizes schedule for SKU
 */
function normaliseSchedule(schedule) {
  if (!schedule) return 'NS';
  const normalized = schedule.toUpperCase().trim();
  const cleaned = normalized.replace(/^SCH\s*/i, '');
  return cleaned;
}

/**
 * Normalizes material specification for SKU
 */
function normaliseSpecForSku(spec) {
  if (!spec) return 'GEN';

  return spec
    .toUpperCase()
    .replace(/ASTM\s*/gi, '')
    .replace(/\s+/g, '')
    .replace(/GR\./gi, 'GR')
    .replace(/GR\s*/gi, 'GR')
    .replace(/-/g, '')
    .replace(/\./g, '');
}

/**
 * Normalizes manufacturing method for SKU
 */
function normaliseManufacturingMethod(method) {
  if (!method) return 'GEN';

  const normalized = method.toUpperCase().trim();

  if (normalized.includes('SEAMLESS') || normalized === 'SMLS') {
    return 'SMLS';
  }
  if (normalized === 'ERW' || normalized.includes('ELECTRIC RESISTANCE')) {
    return 'ERW';
  }
  if (normalized === 'SAW' || normalized.includes('SUBMERGED ARC')) {
    return 'SAW';
  }
  if (normalized === 'HFI' || normalized.includes('HIGH FREQUENCY')) {
    return 'HFI';
  }

  return normalized.length <= 4 ? normalized : 'GEN';
}

/**
 * Builds a complete SKU for a pipe material
 *
 * SKU Format: PIPE-{NPS}-{SCHEDULE}-{MFG_METHOD}-{MATERIAL_SPEC}
 */
function buildPipeMaterialSku(pipe, grade) {
  // Use outside_diameter_in if nps_inch is missing
  const effectiveNps = pipe.nps_inch || pipe.outside_diameter_in;

  const npsPart = normaliseNpsForSku(effectiveNps);
  const schedPart = normaliseSchedule(pipe.schedule);

  // Extract manufacturing method from grade's product_form or use default
  const mfgMethod = grade.product_form && grade.product_form.includes('Seamless')
    ? 'SMLS'
    : 'GEN';
  const mfgPart = normaliseManufacturingMethod(mfgMethod);

  // Use grade spec for material specification
  const specPart = normaliseSpecForSku(grade.spec + ' ' + grade.grade);

  return `PIPE-${npsPart}-${schedPart}-${mfgPart}-${specPart}`;
}

/**
 * Generates a human-readable description for the pipe material
 */
function generatePipeDescription(pipe, grade) {
  const nps = pipe.nps_inch || pipe.outside_diameter_in;
  const schedule = pipe.schedule || 'NS';
  const spec = `${grade.spec} ${grade.grade}`;

  const npsDisplay = pipe.nps_display || `${nps}"`;
  const weightInfo = pipe.weight_lb_per_ft ? `, ${pipe.weight_lb_per_ft} lb/ft` : '';

  return `${npsDisplay} Pipe, Sch ${schedule}, ${spec}${weightInfo}`;
}

/**
 * Generates a material_code in the format: PIPE-{NPS_DISPLAY}-{SCHEDULE}-{GRADE}
 * This is the canonical identifier for pipe materials
 */
function generateMaterialCode(pipe, grade) {
  // Use nps_display if available, otherwise use nps_inch or outside_diameter_in
  const npsDisplay = pipe.nps_display || pipe.nps_inch || pipe.outside_diameter_in || 'UNK';
  const schedule = pipe.schedule || 'NS';

  // Extract grade identifier (e.g., "A106 Gr B" -> "A106GRB")
  const gradeId = normaliseSpecForSku(grade.spec + ' ' + grade.grade);

  return `PIPE-${npsDisplay}-${schedule}-${gradeId}`;
}

/**
 * Checks if a material with the given SKU already exists
 */
async function materialExistsBySku(db, sku) {
  const result = await db.query(
    `SELECT id FROM materials WHERE sku = $1`,
    [sku]
  );
  return result.rows.length > 0;
}

/**
 * Checks if a material with the given pipe_id and grade_id exists
 */
async function materialExistsByPipeAndGrade(db, pipeId, gradeId) {
  const result = await db.query(
    `SELECT id FROM materials
     WHERE pipe_id = $1 AND pipe_grade_id = $2`,
    [pipeId, gradeId]
  );
  return result.rows.length > 0;
}

/**
 * Inserts or updates a pipe material
 */
async function upsertPipeMaterial(db, pipe, grade) {
  const sku = buildPipeMaterialSku(pipe, grade);
  const materialCode = generateMaterialCode(pipe, grade);
  const description = generatePipeDescription(pipe, grade);

  // Check if material exists by pipe_id + grade_id
  const existingResult = await db.query(
    `SELECT id FROM materials
     WHERE pipe_id = $1 AND pipe_grade_id = $2`,
    [pipe.id, grade.id]
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
        'PIPE',
        'PIPE',
        grade.spec,
        grade.grade,
        description,
        'CATALOG',
        baseCost,
        `Generated from pipe_id=${pipe.id}, grade_id=${grade.id}`,
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
        pipe_id,
        pipe_grade_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *`,
      [
        sku,
        materialCode,
        'PIPE',
        'PIPE',
        grade.spec,
        grade.grade,
        description,
        'CATALOG',
        baseCost,
        'USD',
        `Generated from pipe_id=${pipe.id}, grade_id=${grade.id}`,
        true,
        pipe.id,
        grade.id,
      ]
    );
    return { material: result.rows[0], action: 'inserted' };
  }
}

/**
 * Main seeding function
 */
async function seedPipeMaterialsFromCatalog() {
  console.log('='.repeat(60));
  console.log('Pipe Materials Generator');
  console.log('='.repeat(60));
  console.log('');

  let db;
  try {
    // Connect to database
    db = await connectDb();
    console.log(' Connected to database');

    // Fetch all pipes
    console.log('=� Loading pipes from database...');
    const pipesResult = await db.query(
      `SELECT * FROM pipes WHERE is_active = true ORDER BY outside_diameter_in, schedule`
    );
    const pipes = pipesResult.rows;
    console.log(` Loaded ${pipes.length} active pipes`);

    // Fetch all grades
    console.log('=� Loading pipe grades from database...');
    const gradesResult = await db.query(
      `SELECT * FROM pipe_grades ORDER BY spec, grade`
    );
    const grades = gradesResult.rows;
    console.log(` Loaded ${grades.length} pipe grades`);

    if (pipes.length === 0) {
      console.warn('�  No pipes found in database. Please run seedPipesFromDimensionsCsv.js first.');
      process.exit(1);
    }

    if (grades.length === 0) {
      console.warn('�  No pipe grades found in database. Please run seedPipeGradesFromCsv.js first.');
      process.exit(1);
    }

    console.log('');
    console.log(`=� Will generate materials for ${pipes.length} � ${grades.length} = ${pipes.length * grades.length} combinations`);
    console.log('');

    // Generate materials for each combination
    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;

    console.log('Processing pipe materials...');
    for (let i = 0; i < pipes.length; i++) {
      const pipe = pipes[i];

      for (let j = 0; j < grades.length; j++) {
        const grade = grades[j];

        try {
          const result = await upsertPipeMaterial(db, pipe, grade);

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
            console.warn(`�  Failed to create material for pipe ${pipe.id} + grade ${grade.id}: ${error.message}`);
          }
        }
      }
    }

    console.log('');
    console.log('='.repeat(60));
    console.log(' Pipe Materials Generation Completed');
    console.log('='.repeat(60));
    console.log(`Total combinations processed: ${pipes.length * grades.length}`);
    console.log(`Successfully inserted: ${inserted}`);
    console.log(`Successfully updated: ${updated}`);
    console.log(`Errors: ${errors}`);
    console.log('');

    process.exit(0);
  } catch (error) {
    console.error('\nL Seed script failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  seedPipeMaterialsFromCatalog();
}

module.exports = {
  seedPipeMaterialsFromCatalog,
  buildPipeMaterialSku,
  generatePipeDescription,
  upsertPipeMaterial,
};
