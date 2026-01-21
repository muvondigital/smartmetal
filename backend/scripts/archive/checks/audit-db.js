/**
 * Database Audit Script
 * 
 * This script runs audit queries to understand the database state:
 * - Count of materials, pipes, and other tables
 * - Distinct categories in materials
 * - Sample data structure
 * 
 * Run with: node backend/scripts/audit-db.js
 */

const { connectDb } = require('../src/db/supabaseClient');

async function auditDatabase() {
  const db = await connectDb();

  try {
    console.log('=== Database Audit ===\n');

    // 1. Count materials
    const materialsCount = await db.query('SELECT COUNT(*) as count FROM materials');
    console.log(`Materials: ${materialsCount.rows[0].count}`);

    // 2. Count pipes
    const pipesCount = await db.query('SELECT COUNT(*) as count FROM pipes');
    console.log(`Pipes: ${pipesCount.rows[0].count}`);

    // 3. Distinct categories in materials
    const categories = await db.query('SELECT DISTINCT category FROM materials ORDER BY category');
    console.log(`\nMaterial Categories (${categories.rows.length}):`);
    categories.rows.forEach(row => {
      console.log(`  - ${row.category || '(null)'}`);
    });

    // 4. Count by category
    const categoryCounts = await db.query(`
      SELECT category, COUNT(*) as count 
      FROM materials 
      GROUP BY category 
      ORDER BY count DESC
    `);
    console.log(`\nMaterials by Category:`);
    categoryCounts.rows.forEach(row => {
      console.log(`  ${row.category || '(null)'}: ${row.count}`);
    });

    // 5. Check if flanges table exists
    try {
      const flangesCount = await db.query('SELECT COUNT(*) as count FROM flanges');
      console.log(`\nFlanges: ${flangesCount.rows[0].count}`);
    } catch (e) {
      console.log(`\nFlanges table: Does not exist`);
    }

    // 6. Sample pipe data structure
    const samplePipes = await db.query(`
      SELECT nps_inch, schedule, standard, is_preferred 
      FROM pipes 
      LIMIT 5
    `);
    console.log(`\nSample Pipes (first 5):`);
    samplePipes.rows.forEach((row, i) => {
      console.log(`  ${i + 1}. NPS: ${row.nps_inch}", Schedule: ${row.schedule || '(null)'}, Standard: ${row.standard || '(null)'}, Preferred: ${row.is_preferred}`);
    });

    // 7. Sample materials with pipe category
    const samplePipeMaterials = await db.query(`
      SELECT id, material_code, category, spec_standard, grade, size_description, notes
      FROM materials 
      WHERE category = 'PIPE' OR category = 'pipe'
      LIMIT 5
    `);
    console.log(`\nSample Pipe Materials (first 5):`);
    samplePipeMaterials.rows.forEach((row, i) => {
      console.log(`  ${i + 1}. Code: ${row.material_code}, Standard: ${row.spec_standard || '(null)'}, Grade: ${row.grade || '(null)'}, Size: ${row.size_description || '(null)'}`);
    });

    // 8. Check for materials linked to pipes (via material_id or similar)
    const hasMaterialId = await db.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'pipes' AND column_name LIKE '%material%'
    `);
    console.log(`\nPipes table columns with 'material': ${hasMaterialId.rows.map(r => r.column_name).join(', ') || '(none)'}`);

    console.log('\n=== Audit Complete ===');
  } catch (error) {
    console.error('Error during audit:', error);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  auditDatabase()
    .then(() => {
      console.log('\nAudit completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Audit failed:', error);
      process.exit(1);
    });
}

module.exports = { auditDatabase };

