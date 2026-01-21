/**
 * Comprehensive fix script for Agreement V2 tables
 * This script will:
 * 1. Check if tables exist
 * 2. Run migration 032 if needed
 * 3. Verify the fix
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { connectDb, query } = require('../src/db/supabaseClient');
const migration032 = require('../src/db/migrations/032_create_agreement_v2_tables');

async function fix() {
  console.log('\n' + '='.repeat(70));
  console.log('AGREEMENT V2 TABLES - FIX SCRIPT');
  console.log('='.repeat(70) + '\n');

  try {
    const db = await connectDb();
    console.log('✅ Connected to database\n');

    // Step 1: Check tables
    console.log('STEP 1: Checking if tables exist...\n');
    const tables = ['agreement_headers', 'agreement_conditions', 'agreement_scales'];
    const missing = [];

    for (const table of tables) {
      try {
        await query(`SELECT 1 FROM ${table} LIMIT 1`);
        const count = await query(`SELECT COUNT(*) as c FROM ${table}`);
        console.log(`  ✅ ${table} EXISTS (${count.rows[0].c} rows)`);
      } catch (err) {
        if (err.code === '42P01') {
          console.log(`  ❌ ${table} MISSING`);
          missing.push(table);
        } else {
          console.log(`  ⚠️  ${table} ERROR: ${err.message}`);
          missing.push(table);
        }
      }
    }

    console.log('');

    // Step 2: Run migration if needed
    if (missing.length > 0) {
      console.log(`STEP 2: ${missing.length} table(s) missing. Running migration 032...\n`);
      try {
        await migration032.up();
        console.log('  ✅ Migration 032 completed\n');

        // Step 3: Verify
        console.log('STEP 3: Verifying tables were created...\n');
        let allExist = true;
        for (const table of tables) {
          try {
            await query(`SELECT 1 FROM ${table} LIMIT 1`);
            console.log(`  ✅ ${table} NOW EXISTS`);
          } catch (err) {
            console.log(`  ❌ ${table} STILL MISSING`);
            allExist = false;
          }
        }

        if (allExist) {
          console.log('\n' + '='.repeat(70));
          console.log('✅ SUCCESS! All tables created successfully!');
          console.log('='.repeat(70));
          console.log('\nNEXT STEPS:');
          console.log('  1. Restart your backend server (if running)');
          console.log('  2. Try creating an agreement in the frontend');
          console.log('  3. The error should be resolved\n');
        } else {
          console.log('\n❌ Some tables are still missing. Check migration errors above.\n');
          process.exit(1);
        }
      } catch (err) {
        console.error('\n❌ Migration failed:');
        console.error('  Error:', err.message);
        console.error('  Code:', err.code);
        if (err.stack) {
          console.error('\nStack:', err.stack);
        }
        console.error('\nPlease fix the migration error and try again.\n');
        process.exit(1);
      }
    } else {
      console.log('✅ All tables exist! No migration needed.\n');
      console.log('If you still see errors:');
      console.log('  1. Restart your backend server');
      console.log('  2. Check that DATABASE_URL in .env is correct');
      console.log('  3. Verify backend is connecting to the same database\n');
    }

    process.exit(0);
  } catch (err) {
    console.error('\n❌ FATAL ERROR:');
    console.error('  ', err.message);
    if (err.stack) {
      console.error('\n', err.stack);
    }
    process.exit(1);
  }
}

fix();
