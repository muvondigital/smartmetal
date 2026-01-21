/**
 * Check Materials Count in Database
 */

require('dotenv').config();
const { connectDb } = require('../src/db/supabaseClient');

async function checkMaterials() {
  const db = await connectDb();
  
  try {
    // Get total count
    const countResult = await db.query('SELECT COUNT(*) AS count FROM materials');
    const totalCount = parseInt(countResult.rows[0]?.count || 0, 10);
    
    console.log('='.repeat(60));
    console.log('MATERIALS DATABASE CHECK');
    console.log('='.repeat(60));
    console.log('');
    console.log(`📊 Total Materials: ${totalCount}`);
    console.log('');
    
    if (totalCount === 0) {
      console.log('⚠️  No materials found in the database.');
      console.log('');
      process.exit(0);
    }
    
    // Get count by category
    const categoryResult = await db.query(`
      SELECT category, COUNT(*) AS count 
      FROM materials 
      GROUP BY category 
      ORDER BY category
    `);
    
    console.log('📋 BREAKDOWN BY CATEGORY:');
    console.log('-'.repeat(60));
    categoryResult.rows.forEach(row => {
      console.log(`  ${(row.category || 'NULL').padEnd(20)} → ${row.count} materials`);
    });
    console.log('');
    
    // Get sample materials
    const sampleResult = await db.query(`
      SELECT material_code, category, grade, spec_standard
      FROM materials
      ORDER BY created_at DESC
      LIMIT 10
    `);
    
    console.log('📋 SAMPLE MATERIALS (last 10):');
    console.log('-'.repeat(60));
    sampleResult.rows.forEach((row, idx) => {
      console.log(`${idx + 1}. ${row.material_code || 'N/A'}`);
      console.log(`   Category: ${row.category || 'N/A'}`);
      console.log(`   Grade: ${row.grade || 'N/A'}`);
      console.log(`   Standard: ${row.spec_standard || 'N/A'}`);
      console.log('');
    });
    
    console.log('='.repeat(60));
    console.log('✅ CHECK COMPLETE');
    console.log('='.repeat(60));
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

checkMaterials();

