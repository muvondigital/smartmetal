/**
 * Flange Catalogue Verification Utility
 *
 * This script verifies the flange catalogue data by:
 * - Counting flanges, flange_grades, and flange materials
 * - Showing sample records with SKUs
 * - Checking data integrity and relationships
 *
 * Usage:
 *   cd backend
 *   node scripts/verifyFlangeCatalog.js
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
async function verifyFlangeCatalog() {
  console.log('='.repeat(70));
  console.log('FLANGE CATALOGUE VERIFICATION REPORT');
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

    // Count flanges
    const totalFlanges = await countRecords(db, 'flanges');
    const activeFlanges = await countRecords(db, 'flanges', 'is_active = true');
    console.log(`  Flanges (total):           ${totalFlanges}`);
    console.log(`  Flanges (active):          ${activeFlanges}`);

    // Count flange_grades
    const totalGrades = await countRecords(db, 'flange_grades');
    console.log(`  Flange Grades:             ${totalGrades}`);

    // Count materials
    const totalMaterials = await countRecords(db, 'materials');
    const flangeMaterials = await countRecords(db, 'materials', "category = 'FLANGE'");
    const flangeMaterialsWithLinks = await countRecords(
      db,
      'materials',
      "category = 'FLANGE' AND flange_id IS NOT NULL AND flange_grade_id IS NOT NULL"
    );
    console.log(`  Materials (total):         ${totalMaterials}`);
    console.log(`  Materials (FLANGE):         ${flangeMaterials}`);
    console.log(`  Materials (with links):    ${flangeMaterialsWithLinks}`);

    console.log('');
    console.log(`  Expected flange materials: ${activeFlanges} × ${totalGrades} = ${activeFlanges * totalGrades}`);
    console.log(`  Actual flange materials:   ${flangeMaterialsWithLinks}`);

    if (flangeMaterialsWithLinks === activeFlanges * totalGrades) {
      console.log('  ✅ Material count matches expected (100% coverage)');
    } else if (flangeMaterialsWithLinks > 0) {
      const coverage = ((flangeMaterialsWithLinks / (activeFlanges * totalGrades)) * 100).toFixed(1);
      console.log(`  ⚠️  Material coverage: ${coverage}%`);
    } else {
      console.log('  ❌ No flange materials found');
    }

    console.log('');

    // ============================================================================
    // PART 2: SAMPLE FLANGES
    // ============================================================================
    console.log('2. SAMPLE FLANGES');
    console.log('-'.repeat(70));

    const sampleFlanges = await getSampleRecords(
      db,
      `SELECT
        id,
        standard,
        nps_inch,
        rating_class,
        type,
        facing,
        od_inch,
        thickness_inch,
        bolt_circle_inch,
        number_of_bolts,
        bolt_size_inch,
        is_active
      FROM flanges
      WHERE is_active = true
      ORDER BY nps_inch, rating_class, type, facing`,
      5
    );

    if (sampleFlanges.length === 0) {
      console.log('  ⚠️  No flanges found');
    } else {
      sampleFlanges.forEach((flange, idx) => {
        console.log(`  [${idx + 1}] ${flange.standard}`);
        console.log(`      NPS: ${flange.nps_inch || 'N/A'}", Class: ${flange.rating_class}, Type: ${flange.type}, Facing: ${flange.facing}`);
        console.log(`      OD: ${flange.od_inch || 'N/A'}", Thickness: ${flange.thickness_inch || 'N/A'}"`);
        console.log(`      BC: ${flange.bolt_circle_inch || 'N/A'}", Bolts: ${flange.number_of_bolts || 'N/A'} × ${flange.bolt_size_inch || 'N/A'}"`);
        console.log('');
      });
    }

    // ============================================================================
    // PART 3: SAMPLE FLANGE GRADES
    // ============================================================================
    console.log('3. SAMPLE FLANGE GRADES');
    console.log('-'.repeat(70));

    const sampleGrades = await getSampleRecords(
      db,
      `SELECT
        id,
        spec,
        grade,
        material_family,
        min_yield_mpa,
        min_tensile_mpa,
        temp_service
      FROM flange_grades
      ORDER BY spec, grade`,
      5
    );

    if (sampleGrades.length === 0) {
      console.log('  ⚠️  No flange grades found');
    } else {
      sampleGrades.forEach((grade, idx) => {
        console.log(`  [${idx + 1}] ${grade.spec} ${grade.grade}`);
        console.log(`      Family: ${grade.material_family || 'N/A'}, Service: ${grade.temp_service || 'N/A'}`);
        console.log(`      Yield: ${grade.min_yield_mpa || 'N/A'} MPa, Tensile: ${grade.min_tensile_mpa || 'N/A'} MPa`);
        console.log('');
      });
    }

    // ============================================================================
    // PART 4: SAMPLE FLANGE MATERIALS WITH SKUs
    // ============================================================================
    console.log('4. SAMPLE FLANGE MATERIALS (with SKUs)');
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
        f.nps_inch,
        f.rating_class,
        f.type,
        f.facing,
        fg.spec as grade_spec,
        fg.grade as grade_name
      FROM materials m
      LEFT JOIN flanges f ON m.flange_id = f.id
      LEFT JOIN flange_grades fg ON m.flange_grade_id = fg.id
      WHERE m.category = 'FLANGE'
        AND m.flange_id IS NOT NULL
        AND m.flange_grade_id IS NOT NULL
      ORDER BY f.nps_inch, f.rating_class, f.type`,
      10
    );

    if (sampleMaterials.length === 0) {
      console.log('  ⚠️  No flange materials found');
    } else {
      sampleMaterials.forEach((mat, idx) => {
        console.log(`  [${idx + 1}] SKU: ${mat.sku}`);
        console.log(`      Material Code: ${mat.material_code}`);
        console.log(`      Description: ${mat.size_description}`);
        console.log(`      Flange: NPS ${mat.nps_inch || 'N/A'}", Class ${mat.rating_class}, ${mat.type} ${mat.facing}`);
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

    // Check for flanges without required dimensions
    const flangesWithoutOd = await countRecords(db, 'flanges', 'od_inch IS NULL');
    console.log(`  Flanges without OD:                    ${flangesWithoutOd}`);
    if (flangesWithoutOd > 0) {
      console.log('    ⚠️  Some flanges are missing outside diameter');
    }

    const flangesWithoutRating = await countRecords(db, 'flanges', 'rating_class IS NULL');
    console.log(`  Flanges without rating class:          ${flangesWithoutRating}`);
    if (flangesWithoutRating > 0) {
      console.log('    ⚠️  Some flanges are missing rating class');
    }

    const flangesWithoutType = await countRecords(db, 'flanges', 'type IS NULL');
    console.log(`  Flanges without type:                  ${flangesWithoutType}`);
    if (flangesWithoutType > 0) {
      console.log('    ⚠️  Some flanges are missing type');
    }

    // Check for materials without SKU
    const materialsWithoutSku = await countRecords(db, 'materials', "category = 'FLANGE' AND sku IS NULL");
    console.log(`  Flange materials without SKU:          ${materialsWithoutSku}`);
    if (materialsWithoutSku > 0) {
      console.log('    ⚠️  Some flange materials are missing SKUs');
    }

    // Check for duplicate SKUs (flange materials only)
    const duplicateSkusResult = await db.query(`
      SELECT sku, COUNT(*) as count
      FROM materials
      WHERE sku IS NOT NULL AND category = 'FLANGE'
      GROUP BY sku
      HAVING COUNT(*) > 1
    `);
    const duplicateSkus = duplicateSkusResult.rows.length;
    console.log(`  Flange materials with duplicate SKUs:  ${duplicateSkus}`);
    if (duplicateSkus > 0) {
      console.log('    ⚠️  Some SKUs are duplicated');
      duplicateSkusResult.rows.slice(0, 5).forEach(row => {
        console.log(`      - ${row.sku} (${row.count} times)`);
      });
    }

    // Check for duplicate material_codes (flange materials only)
    const duplicateMaterialCodesResult = await db.query(`
      SELECT material_code, COUNT(*) as count
      FROM materials
      WHERE material_code IS NOT NULL AND category = 'FLANGE'
      GROUP BY material_code
      HAVING COUNT(*) > 1
    `);
    const duplicateMaterialCodes = duplicateMaterialCodesResult.rows.length;
    console.log(`  Flange materials with duplicate codes: ${duplicateMaterialCodes}`);
    if (duplicateMaterialCodes > 0) {
      console.log('    ⚠️  Some material codes are duplicated');
      duplicateMaterialCodesResult.rows.slice(0, 5).forEach(row => {
        console.log(`      - ${row.material_code} (${row.count} times)`);
      });
    }

    // Check for orphaned materials (flange materials without flange links)
    const orphanedMaterials = await countRecords(
      db,
      'materials',
      "category = 'FLANGE' AND (flange_id IS NULL OR flange_grade_id IS NULL)"
    );
    console.log(`  Orphaned flange materials:             ${orphanedMaterials}`);
    if (orphanedMaterials > 0) {
      console.log('    ⚠️  Some flange materials lack proper links');
    }

    console.log('');

    // ============================================================================
    // PART 6: SUMMARY
    // ============================================================================
    console.log('6. SUMMARY');
    console.log('-'.repeat(70));

    const allChecksPass =
      totalFlanges > 0 &&
      totalGrades > 0 &&
      flangeMaterialsWithLinks > 0 &&
      flangesWithoutOd === 0 &&
      flangesWithoutRating === 0 &&
      flangesWithoutType === 0 &&
      materialsWithoutSku === 0 &&
      duplicateSkus === 0 &&
      duplicateMaterialCodes === 0 &&
      orphanedMaterials === 0;

    if (allChecksPass) {
      console.log('  ✅ All integrity checks passed!');
      console.log('  ✅ Flange catalogue is ready for use');
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
  verifyFlangeCatalog();
}

module.exports = {
  verifyFlangeCatalog,
};

