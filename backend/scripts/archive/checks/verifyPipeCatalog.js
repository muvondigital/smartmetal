/**
 * Pipe Catalogue Verification Utility
 *
 * This script verifies the pipe catalogue data by:
 * - Counting pipes, pipe_grades, and pipe materials
 * - Showing sample records with SKUs
 * - Checking data integrity and relationships
 *
 * Usage:
 *   cd backend
 *   node scripts/verifyPipeCatalog.js
 */

require('dotenv').config();
const { connectDb } = require('../src/db/supabaseClient');

/**
 * Counts records in a table
 */
async function countRecords(db, tableName, whereClause = '') {
  const query = `SELECT COUNT(*) as count FROM ${tableName}${whereClause ? ' WHERE ' + whereClause : ''}`;
  const result = await db.query(query);
  return parseInt(result.rows[0].count, 10);
}

/**
 * Gets sample records from a table
 */
async function getSampleRecords(db, query, limit = 5) {
  const result = await db.query(query + ` LIMIT ${limit}`);
  return result.rows;
}

/**
 * Main verification function
 */
async function verifyPipeCatalog() {
  console.log('='.repeat(70));
  console.log('PIPE CATALOGUE VERIFICATION REPORT');
  console.log('='.repeat(70));
  console.log('');

  let db;
  try {
    // Connect to database
    db = await connectDb();
    console.log('✓ Connected to database');
    console.log('');

    // ============================================================================
    // PART 1: COUNT STATISTICS
    // ============================================================================
    console.log('1. RECORD COUNTS');
    console.log('-'.repeat(70));

    // Count pipes
    const totalPipes = await countRecords(db, 'pipes');
    const activePipes = await countRecords(db, 'pipes', 'is_active = true');
    console.log(`  Pipes (total):           ${totalPipes}`);
    console.log(`  Pipes (active):          ${activePipes}`);

    // Count pipe_grades
    const totalGrades = await countRecords(db, 'pipe_grades');
    console.log(`  Pipe Grades:             ${totalGrades}`);

    // Count materials
    const totalMaterials = await countRecords(db, 'materials');
    const pipeMaterials = await countRecords(db, 'materials', "category = 'PIPE'");
    const pipeMaterialsWithLinks = await countRecords(
      db,
      'materials',
      "category = 'PIPE' AND pipe_id IS NOT NULL AND pipe_grade_id IS NOT NULL"
    );
    console.log(`  Materials (total):       ${totalMaterials}`);
    console.log(`  Materials (PIPE):        ${pipeMaterials}`);
    console.log(`  Materials (with links):  ${pipeMaterialsWithLinks}`);

    console.log('');
    console.log(`  Expected pipe materials: ${activePipes} × ${totalGrades} = ${activePipes * totalGrades}`);
    console.log(`  Actual pipe materials:   ${pipeMaterialsWithLinks}`);

    if (pipeMaterialsWithLinks === activePipes * totalGrades) {
      console.log('  ✅ Material count matches expected (100% coverage)');
    } else if (pipeMaterialsWithLinks > 0) {
      const coverage = ((pipeMaterialsWithLinks / (activePipes * totalGrades)) * 100).toFixed(1);
      console.log(`  ⚠️  Material coverage: ${coverage}%`);
    } else {
      console.log('  ❌ No pipe materials found');
    }

    console.log('');

    // ============================================================================
    // PART 2: SAMPLE PIPES
    // ============================================================================
    console.log('2. SAMPLE PIPES');
    console.log('-'.repeat(70));

    const samplePipes = await getSampleRecords(
      db,
      `SELECT
        id,
        standard,
        nps_inch,
        outside_diameter_in,
        schedule,
        wall_thickness_in,
        weight_lb_per_ft,
        pipe_category,
        pressure_series,
        is_active
      FROM pipes
      WHERE is_active = true
      ORDER BY outside_diameter_in, schedule`,
      5
    );

    if (samplePipes.length === 0) {
      console.log('  ⚠️  No pipes found');
    } else {
      samplePipes.forEach((pipe, idx) => {
        console.log(`  [${idx + 1}] ${pipe.standard}`);
        console.log(`      NPS: ${pipe.nps_inch || 'N/A'}", OD: ${pipe.outside_diameter_in}", Sch: ${pipe.schedule}`);
        console.log(`      Wall: ${pipe.wall_thickness_in}", Weight: ${pipe.weight_lb_per_ft || 'N/A'} lb/ft`);
        console.log(`      Category: ${pipe.pipe_category || 'N/A'}, Series: ${pipe.pressure_series || 'N/A'}`);
        console.log('');
      });
    }

    // ============================================================================
    // PART 3: SAMPLE PIPE GRADES
    // ============================================================================
    console.log('3. SAMPLE PIPE GRADES');
    console.log('-'.repeat(70));

    const sampleGrades = await getSampleRecords(
      db,
      `SELECT
        id,
        spec,
        grade,
        material_family,
        min_yield_psi,
        min_tensile_psi,
        product_form
      FROM pipe_grades
      ORDER BY spec, grade`,
      5
    );

    if (sampleGrades.length === 0) {
      console.log('  ⚠️  No pipe grades found');
    } else {
      sampleGrades.forEach((grade, idx) => {
        console.log(`  [${idx + 1}] ${grade.spec} ${grade.grade}`);
        console.log(`      Family: ${grade.material_family || 'N/A'}, Form: ${grade.product_form || 'N/A'}`);
        console.log(`      Yield: ${grade.min_yield_psi || 'N/A'} psi, Tensile: ${grade.min_tensile_psi || 'N/A'} psi`);
        console.log('');
      });
    }

    // ============================================================================
    // PART 4: SAMPLE PIPE MATERIALS WITH SKUs
    // ============================================================================
    console.log('4. SAMPLE PIPE MATERIALS (with SKUs)');
    console.log('-'.repeat(70));

    const sampleMaterials = await getSampleRecords(
      db,
      `SELECT
        m.id,
        m.sku,
        m.material_code,
        m.size_description,
        m.spec_standard,
        m.grade,
        m.base_cost,
        p.nps_inch,
        p.outside_diameter_in,
        p.schedule,
        pg.spec as grade_spec,
        pg.grade as grade_name
      FROM materials m
      LEFT JOIN pipes p ON m.pipe_id = p.id
      LEFT JOIN pipe_grades pg ON m.pipe_grade_id = pg.id
      WHERE m.category = 'PIPE'
        AND m.pipe_id IS NOT NULL
        AND m.pipe_grade_id IS NOT NULL
      ORDER BY p.outside_diameter_in, p.schedule, pg.spec`,
      10
    );

    if (sampleMaterials.length === 0) {
      console.log('  ⚠️  No pipe materials found');
    } else {
      sampleMaterials.forEach((mat, idx) => {
        console.log(`  [${idx + 1}] SKU: ${mat.sku}`);
        console.log(`      Material Code: ${mat.material_code}`);
        console.log(`      Description: ${mat.size_description}`);
        console.log(`      Pipe: NPS ${mat.nps_inch || mat.outside_diameter_in}", Sch ${mat.schedule}`);
        console.log(`      Grade: ${mat.grade_spec} ${mat.grade_name}`);
        console.log(`      Base Cost: $${mat.base_cost}`);
        console.log('');
      });
    }

    // ============================================================================
    // PART 5: DATA INTEGRITY CHECKS
    // ============================================================================
    console.log('5. DATA INTEGRITY CHECKS');
    console.log('-'.repeat(70));

    // Check for pipes without required dimensions
    const pipesWithoutOd = await countRecords(db, 'pipes', 'outside_diameter_in IS NULL');
    console.log(`  Pipes without OD:                    ${pipesWithoutOd}`);
    if (pipesWithoutOd > 0) {
      console.log('    ⚠️  Some pipes are missing outside diameter');
    }

    const pipesWithoutSchedule = await countRecords(db, 'pipes', 'schedule IS NULL');
    console.log(`  Pipes without schedule:              ${pipesWithoutSchedule}`);
    if (pipesWithoutSchedule > 0) {
      console.log('    ⚠️  Some pipes are missing schedule');
    }

    const pipesWithoutWall = await countRecords(db, 'pipes', 'wall_thickness_in IS NULL');
    console.log(`  Pipes without wall thickness:        ${pipesWithoutWall}`);
    if (pipesWithoutWall > 0) {
      console.log('    ⚠️  Some pipes are missing wall thickness');
    }

    // Check for materials without SKU
    const materialsWithoutSku = await countRecords(db, 'materials', 'sku IS NULL');
    console.log(`  Materials without SKU:               ${materialsWithoutSku}`);
    if (materialsWithoutSku > 0) {
      console.log('    ⚠️  Some materials are missing SKUs');
    }

    // Check for duplicate SKUs
    const duplicateSkusResult = await db.query(`
      SELECT sku, COUNT(*) as count
      FROM materials
      WHERE sku IS NOT NULL
      GROUP BY sku
      HAVING COUNT(*) > 1
    `);
    const duplicateSkus = duplicateSkusResult.rows.length;
    console.log(`  Materials with duplicate SKUs:       ${duplicateSkus}`);
    if (duplicateSkus > 0) {
      console.log('    ⚠️  Some SKUs are duplicated');
      duplicateSkusResult.rows.slice(0, 5).forEach(row => {
        console.log(`      - ${row.sku} (${row.count} times)`);
      });
    }

    // Check for orphaned materials (pipe materials without pipe links)
    const orphanedMaterials = await countRecords(
      db,
      'materials',
      "category = 'PIPE' AND (pipe_id IS NULL OR pipe_grade_id IS NULL)"
    );
    console.log(`  Orphaned pipe materials:             ${orphanedMaterials}`);
    if (orphanedMaterials > 0) {
      console.log('    ⚠️  Some pipe materials lack proper links');
    }

    console.log('');

    // ============================================================================
    // PART 6: SUMMARY
    // ============================================================================
    console.log('6. SUMMARY');
    console.log('-'.repeat(70));

    const allChecksPass =
      totalPipes > 0 &&
      totalGrades > 0 &&
      pipeMaterialsWithLinks > 0 &&
      pipesWithoutOd === 0 &&
      pipesWithoutSchedule === 0 &&
      pipesWithoutWall === 0 &&
      materialsWithoutSku === 0 &&
      duplicateSkus === 0 &&
      orphanedMaterials === 0;

    if (allChecksPass) {
      console.log('  ✅ All integrity checks passed!');
      console.log('  ✅ Pipe catalogue is ready for use');
    } else {
      console.log('  ⚠️  Some integrity issues found (see above)');
      console.log('  ℹ️  You may need to re-run seeding scripts or fix data');
    }

    console.log('');
    console.log('='.repeat(70));
    console.log('VERIFICATION COMPLETE');
    console.log('='.repeat(70));
    console.log('');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Verification failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  verifyPipeCatalog();
}

module.exports = {
  verifyPipeCatalog,
};
