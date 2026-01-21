/**
 * Check Database Connection
 * 
 * Shows which database SmartMetal is currently connected to
 * (without exposing sensitive credentials)
 */

require('dotenv').config();
const { connectDb } = require('../src/db/supabaseClient');

async function checkConnection() {
  console.log('='.repeat(70));
  console.log('DATABASE CONNECTION INFO');
  console.log('='.repeat(70));
  console.log('');

  try {
    // Check which env var is being used
    const dbUrl = process.env.DATABASE_URL || 
                  process.env.PG_CONNECTION_STRING || 
                  process.env.SUPABASE_DB_URL;
    
    if (!dbUrl) {
      console.log('❌ No database connection string found!');
      console.log('   Set one of: DATABASE_URL, PG_CONNECTION_STRING, or SUPABASE_DB_URL');
      process.exit(1);
    }

    // Parse connection string (mask password)
    const url = new URL(dbUrl);
    const source = process.env.DATABASE_URL ? 'DATABASE_URL' :
                   process.env.PG_CONNECTION_STRING ? 'PG_CONNECTION_STRING' :
                   'SUPABASE_DB_URL';

    console.log('📋 Connection Source:', source);
    console.log('🔌 Database Type: PostgreSQL');
    console.log('🌐 Host:', url.hostname);
    console.log('🔌 Port:', url.port || '5432 (default)');
    console.log('📁 Database:', url.pathname.replace('/', '') || 'default');
    console.log('👤 User:', url.username || 'not specified');
    console.log('🔐 Password:', url.password ? '***' : 'not set');
    console.log('');

    // Test connection and get database info
    console.log('🔍 Testing connection...');
    const db = await connectDb();
    
    // Get database name and version
    const dbInfo = await db.query(`
      SELECT 
        current_database() as database_name,
        version() as postgres_version,
        current_user as current_user,
        inet_server_addr() as server_address,
        inet_server_port() as server_port
    `);
    
    const info = dbInfo.rows[0];
    console.log('');
    console.log('✅ Connected successfully!');
    console.log('');
    console.log('📊 Database Information:');
    console.log('-'.repeat(70));
    console.log(`   Database Name: ${info.database_name}`);
    console.log(`   PostgreSQL Version: ${info.postgres_version.split(',')[0]}`);
    console.log(`   Current User: ${info.current_user}`);
    if (info.server_address) {
      console.log(`   Server Address: ${info.server_address}:${info.server_port || 'N/A'}`);
    }
    console.log('');

    // Check if it's Supabase
    const isSupabase = dbUrl.includes('supabase') || dbUrl.includes('supabase.co');
    if (isSupabase) {
      console.log('☁️  Database Provider: Supabase (Cloud PostgreSQL)');
    } else {
      console.log('💻 Database Provider: Self-hosted PostgreSQL');
    }
    console.log('');

    // Check table count
    const tableCount = await db.query(`
      SELECT COUNT(*) as count 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    console.log(`📋 Total Tables: ${tableCount.rows[0].count}`);
    console.log('');

    // Check hs_codes table specifically
    const hsCodesCheck = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'hs_codes'
      ) as exists
    `);
    
    if (hsCodesCheck.rows[0].exists) {
      const hsCount = await db.query('SELECT COUNT(*) as count FROM hs_codes');
      console.log(`📦 hs_codes table: EXISTS (${hsCount.rows[0].count} records)`);
    } else {
      console.log('📦 hs_codes table: DOES NOT EXIST');
    }
    console.log('');

    console.log('='.repeat(70));
    console.log('✅ Connection check complete');
    console.log('='.repeat(70));

  } catch (error) {
    console.error('❌ Connection failed:', error.message);
    console.error('');
    console.error('Troubleshooting:');
    console.error('  1. Check your .env file has DATABASE_URL, PG_CONNECTION_STRING, or SUPABASE_DB_URL');
    console.error('  2. Verify the database server is running');
    console.error('  3. Check network connectivity');
    console.error('  4. Verify credentials are correct');
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

checkConnection().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
