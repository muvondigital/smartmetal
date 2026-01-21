/**
 * Verify Supplier Performance Tables
 * 
 * Quick script to verify that migration 067 created the supplier performance tables
 */

const { connectDb } = require('../src/db/supabaseClient');

async function verifyTables() {
  const db = await connectDb();
  
  try {
    console.log('Verifying supplier performance tables...\n');
    
    // Check if tables exist
    const tables = await db.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('suppliers', 'supplier_performance')
      ORDER BY table_name;
    `);
    
    console.log('Tables found:');
    if (tables.rows.length === 0) {
      console.log('  ❌ No supplier tables found');
    } else {
      tables.rows.forEach(row => {
        console.log(`  ✅ ${row.table_name}`);
      });
    }
    
    // Check suppliers table structure
    if (tables.rows.some(r => r.table_name === 'suppliers')) {
      const suppliersColumns = await db.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'suppliers'
        ORDER BY ordinal_position;
      `);
      
      console.log('\nSuppliers table columns:');
      suppliersColumns.rows.forEach(col => {
        console.log(`  - ${col.column_name} (${col.data_type}, ${col.is_nullable === 'NO' ? 'NOT NULL' : 'nullable'})`);
      });
    }
    
    // Check supplier_performance table structure
    if (tables.rows.some(r => r.table_name === 'supplier_performance')) {
      const perfColumns = await db.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'supplier_performance'
        ORDER BY ordinal_position;
      `);
      
      console.log('\nSupplier_performance table columns:');
      perfColumns.rows.forEach(col => {
        console.log(`  - ${col.column_name} (${col.data_type}, ${col.is_nullable === 'NO' ? 'NOT NULL' : 'nullable'})`);
      });
    }
    
    // Check indexes
    if (tables.rows.some(r => r.table_name === 'suppliers')) {
      const indexes = await db.query(`
        SELECT indexname
        FROM pg_indexes
        WHERE tablename = 'suppliers'
        ORDER BY indexname;
      `);
      
      console.log('\nSuppliers table indexes:');
      indexes.rows.forEach(idx => {
        console.log(`  ✅ ${idx.indexname}`);
      });
    }
    
    if (tables.rows.some(r => r.table_name === 'supplier_performance')) {
      const perfIndexes = await db.query(`
        SELECT indexname
        FROM pg_indexes
        WHERE tablename = 'supplier_performance'
        ORDER BY indexname;
      `);
      
      console.log('\nSupplier_performance table indexes:');
      perfIndexes.rows.forEach(idx => {
        console.log(`  ✅ ${idx.indexname}`);
      });
    }
    
    console.log('\n✅ Verification complete!');
    
  } catch (error) {
    console.error('❌ Verification failed:', error.message);
    throw error;
  } finally {
    await db.end();
  }
}

if (require.main === module) {
  verifyTables().catch(console.error);
}

module.exports = { verifyTables };
