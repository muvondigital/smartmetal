/**
 * Comprehensive diagnostic script for Agreement V2 tables
 * Checks tables, dependencies, and can run migration 032 if needed
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { connectDb } = require('../src/db/supabaseClient');
const migration032 = require('../src/db/migrations/032_create_agreement_v2_tables');

async function diagnose() {
  console.log('='.repeat(60));
  console.log('AGREEMENT V2 DIAGNOSTIC TOOL');
  console.log('='.repeat(60));
  console.log('');

  const db = await connectDb();
  console.log('✅ Connected to database');
  console.log('');

  // Check tables
  console.log('1. Checking Agreement V2 tables...');
  const tables = ['agreement_headers', 'agreement_conditions', 'agreement_scales'];
  const missingTables = [];
  
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
      console.log(`   ✅ ${tableName} EXISTS`);
    } else {
      console.log(`   ❌ ${tableName} MISSING`);
      missingTables.push(tableName);
    }
  }
  
  console.log('');
  
  // Check dependencies
  console.log('2. Checking dependencies...');
  const dependencies = [
    { name: 'tenants', required: true },
    { name: 'clients', required: false },
    { name: 'materials', required: false },
    { name: 'users', required: false },
  ];
  
  const missingDeps = [];
  for (const dep of dependencies) {
    const result = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = $1
      );
    `, [dep.name]);
    
    const exists = result.rows[0].exists;
    if (exists) {
      console.log(`   ✅ ${dep.name} EXISTS`);
    } else {
      const status = dep.required ? '❌ REQUIRED' : '⚠️  OPTIONAL';
      console.log(`   ${status} ${dep.name} MISSING`);
      if (dep.required) {
        missingDeps.push(dep.name);
      }
    }
  }
  
  console.log('');
  console.log('='.repeat(60));
  
  // Diagnosis
  if (missingTables.length === 0) {
    console.log('✅ ALL TABLES EXIST - Agreement V2 should work!');
    console.log('');
    console.log('If you still see errors:');
    console.log('  1. Restart your backend server');
    console.log('  2. Check backend logs for detailed error messages');
    console.log('  3. Verify DATABASE_URL in .env matches the migrated database');
  } else {
    console.log('❌ MISSING TABLES DETECTED');
    console.log('');
    console.log(`Missing: ${missingTables.join(', ')}`);
    console.log('');
    
    if (missingDeps.length > 0) {
      console.log('❌ REQUIRED DEPENDENCIES MISSING:');
      console.log(`   ${missingDeps.join(', ')}`);
      console.log('');
      console.log('SOLUTION: Run all migrations first:');
      console.log('  cd backend && npm run migrate');
    } else {
      console.log('✅ All dependencies exist');
      console.log('');
      console.log('SOLUTION: Run migration 032 to create missing tables');
      console.log('');
      console.log('Attempting to run migration 032 now...');
      console.log('');
      
      try {
        await migration032.up();
        console.log('');
        console.log('✅ Migration 032 completed successfully!');
        console.log('');
        console.log('NEXT STEPS:');
        console.log('  1. Restart your backend server');
        console.log('  2. Try creating an agreement again');
      } catch (error) {
        console.error('');
        console.error('❌ Migration 032 failed:');
        console.error('   Error:', error.message);
        console.error('');
        console.error('Please check the error above and fix any issues.');
        console.error('Common issues:');
        console.error('  - Missing dependencies (run earlier migrations)');
        console.error('  - Database connection issues');
        console.error('  - Permission issues');
      }
    }
  }
  
  console.log('');
  console.log('='.repeat(60));
  
  process.exit(0);
}

diagnose().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
