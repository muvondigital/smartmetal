/**
 * Backup MetaSteel Data to JSON
 * 
 * Creates a complete backup of MetaSteel's data before any destructive operation.
 * Backup includes: RFQs, items, pricing runs, price agreements, clients, projects.
 * 
 * Usage: npm run backup:metasteel
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { connectMigrationDb } = require('../src/db/supabaseClient');

async function backupMetaSteelData() {
  const db = await connectMigrationDb();
  
  console.log('🔍 Looking up MetaSteel tenant...');
  const tenantResult = await db.query(
    `SELECT id, code, name FROM tenants WHERE UPPER(code) = 'METASTEEL' LIMIT 1`
  );
  
  if (tenantResult.rows.length === 0) {
    console.error('❌ MetaSteel tenant not found');
    process.exit(1);
  }
  
  const tenantId = tenantResult.rows[0].id;
  console.log(`✓ Found tenant: ${tenantResult.rows[0].code} (${tenantId})\n`);
  
  const backup = {
    timestamp: new Date().toISOString(),
    tenant: tenantResult.rows[0],
    data: {}
  };
  
  // Backup each table
  const tables = [
    { name: 'clients', query: 'SELECT * FROM clients WHERE tenant_id = $1' },
    { name: 'projects', query: 'SELECT * FROM projects WHERE tenant_id = $1' },
    { name: 'rfqs', query: 'SELECT * FROM rfqs WHERE tenant_id = $1' },
    { name: 'rfq_items', query: 'SELECT * FROM rfq_items WHERE tenant_id = $1' },
    { name: 'pricing_runs', query: 'SELECT * FROM pricing_runs WHERE tenant_id = $1' },
    { name: 'pricing_run_items', query: 'SELECT pri.* FROM pricing_run_items pri JOIN pricing_runs pr ON pri.pricing_run_id = pr.id WHERE pr.tenant_id = $1' },
    { name: 'price_agreements', query: 'SELECT * FROM price_agreements WHERE tenant_id = $1' },
  ];
  
  for (const table of tables) {
    try {
      const result = await db.query(table.query, [tenantId]);
      backup.data[table.name] = result.rows;
      console.log(`✓ Backed up ${table.name}: ${result.rows.length} rows`);
    } catch (error) {
      console.log(`⊙ Skipped ${table.name}: ${error.message}`);
      backup.data[table.name] = [];
    }
  }
  
  // Save to file
  const backupDir = path.join(__dirname, '../backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = path.join(backupDir, `metasteel-backup-${timestamp}.json`);
  
  fs.writeFileSync(filename, JSON.stringify(backup, null, 2));
  
  console.log(`\n✅ Backup saved to: ${filename}`);
  console.log('\n📊 Summary:');
  Object.entries(backup.data).forEach(([table, rows]) => {
    console.log(`  • ${table}: ${rows.length} rows`);
  });
  
  await db.end();
}

backupMetaSteelData().catch(err => {
  console.error('❌ Backup failed:', err);
  process.exit(1);
});

