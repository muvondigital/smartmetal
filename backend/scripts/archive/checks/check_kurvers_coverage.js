/**
 * READ-ONLY script to check Kurvers coverage in database
 * This script only performs SELECT queries - no writes
 * 
 * Usage: node backend/scripts/check_kurvers_coverage.js
 */

require('dotenv').config();
const { connectDb } = require('../src/db/supabaseClient');

async function checkKurversCoverage() {
  const db = await connectDb();

  console.log('\n' + '='.repeat(70));
  console.log('KURVERS PIPING HANDBOOK - DATABASE COVERAGE AUDIT');
  console.log('='.repeat(70) + '\n');

  try {
    // 1. Check pipes table
    console.log('📊 PIPES TABLE:');
    console.log('-'.repeat(70));
    
    const pipesCount = await db.query('SELECT COUNT(*) as count FROM pipes');
    console.log(`Total pipes: ${pipesCount.rows[0].count}`);
    
    // Sample pipes
    const pipesSample = await db.query(`
      SELECT standard, material_spec, nps_inch, schedule, dn_mm, outside_diameter_mm
      FROM pipes
      ORDER BY standard, nps_inch, schedule
      LIMIT 10
    `);
    
    console.log('\nSample pipes (first 10):');
    pipesSample.rows.forEach(p => {
      console.log(`  ${p.standard} | ${p.material_spec || 'N/A'} | NPS ${p.nps_inch}" | SCH ${p.schedule} | DN ${p.dn_mm || 'N/A'}mm | OD ${p.outside_diameter_mm || 'N/A'}mm`);
    });
    
    // Standards breakdown
    const standardsBreakdown = await db.query(`
      SELECT standard, COUNT(*) as count
      FROM pipes
      GROUP BY standard
      ORDER BY count DESC
    `);
    
    console.log('\nStandards breakdown:');
    standardsBreakdown.rows.forEach(s => {
      console.log(`  ${s.standard}: ${s.count} pipes`);
    });

    // 2. Check materials table for pipes
    console.log('\n\n📦 MATERIALS TABLE (Pipes):');
    console.log('-'.repeat(70));
    
    const materialsPipeCount = await db.query(`
      SELECT COUNT(*) as count 
      FROM materials 
      WHERE category = 'pipe' OR category = 'PIPE'
    `);
    console.log(`Total pipe entries in materials: ${materialsPipeCount.rows[0].count}`);
    
    // Sample pipe materials
    const materialsSample = await db.query(`
      SELECT material_code, category, spec_standard, grade, size_description
      FROM materials
      WHERE category = 'pipe' OR category = 'PIPE'
      LIMIT 10
    `);
    
    console.log('\nSample pipe materials (first 10):');
    materialsSample.rows.forEach(m => {
      console.log(`  ${m.material_code} | ${m.spec_standard || 'N/A'} | ${m.grade || 'N/A'} | ${m.size_description || 'N/A'}`);
    });

    // 3. Check materials table for other categories
    console.log('\n\n📦 MATERIALS TABLE (Other Categories):');
    console.log('-'.repeat(70));
    
    const categoriesBreakdown = await db.query(`
      SELECT category, COUNT(*) as count
      FROM materials
      GROUP BY category
      ORDER BY count DESC
    `);
    
    console.log('Categories breakdown:');
    categoriesBreakdown.rows.forEach(c => {
      console.log(`  ${c.category}: ${c.count} entries`);
    });

    // 4. Check for fittings
    const fittingsCount = await db.query(`
      SELECT COUNT(*) as count 
      FROM materials 
      WHERE category = 'fitting' OR category = 'FITTING'
    `);
    console.log(`\nFittings in materials: ${fittingsCount.rows[0].count}`);

    // 5. Check for flanges
    const flangesCount = await db.query(`
      SELECT COUNT(*) as count 
      FROM materials 
      WHERE category = 'flange' OR category = 'FLANGE'
    `);
    console.log(`Flanges in materials: ${flangesCount.rows[0].count}`);

    // 6. Check for fasteners
    const fastenersCount = await db.query(`
      SELECT COUNT(*) as count 
      FROM materials 
      WHERE category = 'fastener' OR category = 'FASTENER'
    `);
    console.log(`Fasteners in materials: ${fastenersCount.rows[0].count}`);

    // 7. Check for any Kurvers references
    console.log('\n\n🔍 KURVERS REFERENCES:');
    console.log('-'.repeat(70));
    
    // Check pipes table for kurvers references (if field exists)
    try {
      const kurversPipes = await db.query(`
        SELECT COUNT(*) as count 
        FROM pipes 
        WHERE notes LIKE '%kurvers%' OR notes LIKE '%Kurvers%' OR notes LIKE '%KURVERS%'
      `);
      console.log(`Pipes with Kurvers in notes: ${kurversPipes.rows[0].count}`);
    } catch (e) {
      console.log('Note: Could not check for Kurvers references in pipes.notes');
    }

    // Check materials table for kurvers references
    try {
      const kurversMaterials = await db.query(`
        SELECT COUNT(*) as count 
        FROM materials 
        WHERE notes LIKE '%kurvers%' OR notes LIKE '%Kurvers%' OR notes LIKE '%KURVERS%'
           OR material_code LIKE '%kurvers%' OR material_code LIKE '%Kurvers%'
      `);
      console.log(`Materials with Kurvers references: ${kurversMaterials.rows[0].count}`);
    } catch (e) {
      console.log('Note: Could not check for Kurvers references in materials');
    }

    console.log('\n' + '='.repeat(70));
    console.log('AUDIT COMPLETE');
    console.log('='.repeat(70) + '\n');

  } catch (error) {
    console.error('\n❌ Error during audit:', error.message);
    throw error;
  } finally {
    await db.end();
  }
}

// Run if executed directly
if (require.main === module) {
  checkKurversCoverage()
    .then(() => {
      console.log('✓ Audit completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('✗ Audit failed:', error);
      process.exit(1);
    });
}

module.exports = { checkKurversCoverage };

