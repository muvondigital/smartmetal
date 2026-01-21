/**
 * Verification script to check if Agreement V2 tables exist
 * Run: node scripts/verifyAgreementV2Tables.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { connectDb } = require('../src/db/supabaseClient');

async function verifyTables() {
  console.log('='.repeat(60));
  console.log('VERIFYING AGREEMENT V2 TABLES');
  console.log('='.repeat(60));
  console.log('');

  try {
    const db = await connectDb();
    console.log('✅ Connected to database');
    console.log('');

    // Check for required tables
    const tables = ['agreement_headers', 'agreement_conditions', 'agreement_scales'];
    
    for (const tableName of tables) {
      const result = await db.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = $1
        );
      `, [tableName]);
      
      const exists = result.rows[0].exists;
      
      if (exists) {
        console.log(`✅ Table "${tableName}" EXISTS`);
        
        // Get row count
        const countResult = await db.query(`SELECT COUNT(*) as count FROM ${tableName}`);
        console.log(`   Rows: ${countResult.rows[0].count}`);
      } else {
        console.log(`❌ Table "${tableName}" DOES NOT EXIST`);
      }
    }
    
    console.log('');
    console.log('='.repeat(60));
    
    // Check for required dependencies
    console.log('Checking dependencies...');
    const dependencies = ['tenants', 'clients', 'materials', 'users'];
    
    for (const depName of dependencies) {
      const result = await db.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = $1
        );
      `, [depName]);
      
      const exists = result.rows[0].exists;
      console.log(`${exists ? '✅' : '❌'} Dependency "${depName}": ${exists ? 'EXISTS' : 'MISSING'}`);
    }
    
    console.log('');
    console.log('='.repeat(60));
    console.log('VERIFICATION COMPLETE');
    console.log('='.repeat(60));
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

verifyTables();
