const { Pool } = require('pg');
require('dotenv').config();

(async () => {
  const pool = new Pool({ connectionString: process.env.MIGRATION_DATABASE_URL });
  const client = await pool.connect();

  const tenantResult = await client.query("SELECT id FROM tenants WHERE code='nsc'");
  const tenantId = tenantResult.rows[0].id;

  console.log('📋 NSC DATA COMPLETENESS CHECK');
  console.log('=' .repeat(60));

  // 2. MATERIALS CATALOG
  console.log('\n2️⃣  MATERIALS CATALOG:');
  const materials = await client.query(
    'SELECT category, COUNT(*) as count FROM materials WHERE tenant_id=$1 GROUP BY category ORDER BY count DESC',
    [tenantId]
  );
  console.log(`   Total: ${materials.rows.reduce((sum, r) => sum + parseInt(r.count), 0)} materials`);
  materials.rows.forEach(m => {
    console.log(`   - ${m.category}: ${m.count}`);
  });
  const matStatus = materials.rows.length > 0 ? '✅' : '❌';
  console.log(`   Status: ${matStatus} ${materials.rows.length > 0 ? 'COMPLETE' : 'MISSING'}`);

  // 3. CLIENTS
  console.log('\n3️⃣  CLIENTS:');
  const clients = await client.query(
    'SELECT name, code, country FROM clients WHERE tenant_id=$1',
    [tenantId]
  );
  console.log(`   Total: ${clients.rows.length} clients`);
  clients.rows.forEach(c => {
    console.log(`   - ${c.name} (${c.code || 'no code'}) - ${c.country}`);
  });
  const clientStatus = clients.rows.length > 0 ? '✅' : '❌';
  console.log(`   Status: ${clientStatus} ${clients.rows.length > 0 ? 'COMPLETE' : 'MISSING'}`);

  // 4. PRICING RULES
  console.log('\n4️⃣  PRICING RULES:');
  try {
    const rules = await client.query(
      `SELECT category, origin_type, markup_pct, logistics_pct, risk_pct
       FROM client_pricing_rules
       WHERE tenant_id=$1 AND client_id IS NULL
       ORDER BY category, origin_type`,
      [tenantId]
    );
    console.log(`   Total: ${rules.rows.length} tenant-level rules`);
    rules.rows.forEach(r => {
      console.log(`   - ${r.category}/${r.origin_type}: markup ${(r.markup_pct*100).toFixed(0)}%, logistics ${(r.logistics_pct*100).toFixed(0)}%, risk ${(r.risk_pct*100).toFixed(0)}%`);
    });
    const ruleStatus = rules.rows.length > 0 ? '✅' : '❌';
    console.log(`   Status: ${ruleStatus} ${rules.rows.length > 0 ? 'COMPLETE' : 'MISSING'}`);
  } catch (err) {
    console.log(`   Status: ❌ ERROR - ${err.message}`);
  }

  // 5. LOGISTICS CONFIGURATION
  console.log('\n5️⃣  LOGISTICS CONFIGURATION:');
  const logisticsSettings = await client.query(
    `SELECT value FROM tenant_settings WHERE tenant_id=$1 AND key='logistics_config'`,
    [tenantId]
  );
  if (logisticsSettings.rows.length > 0) {
    const config = logisticsSettings.rows[0].value;
    console.log(`   ✓ Freight rates: ${config.freight_rates ? Object.keys(config.freight_rates).length + ' countries' : 'NOT SET'}`);
    console.log(`   ✓ Insurance rates: ${config.insurance_rates ? 'SET' : 'NOT SET'}`);
    console.log(`   ✓ Handling charges: ${config.handling_charges ? Object.keys(config.handling_charges).length + ' categories' : 'NOT SET'}`);
    console.log(`   ✓ Port charges: ${config.port_charges ? Object.keys(config.port_charges).length + ' countries' : 'NOT SET'}`);
    console.log(`   Status: ✅ COMPLETE`);
  } else {
    console.log(`   Status: ❌ MISSING`);
  }

  // 6. TAX & DUTY DATA
  console.log('\n6️⃣  TAX & DUTY DATA:');

  // 6a. HS Codes
  const hsCodes = await client.query('SELECT COUNT(*) FROM regulatory_hs_codes');
  console.log(`   HS Codes: ${hsCodes.rows[0].count} codes`);

  // 6b. Material-to-HS Mappings
  const mappings = await client.query('SELECT COUNT(*) FROM regulatory_material_mapping');
  console.log(`   Material Mappings: ${mappings.rows[0].count} mappings`);

  // 6c. Tax Rules
  const taxRules = await client.query("SELECT COUNT(*) FROM tax_rules");
  console.log(`   Tax Rules: ${taxRules.rows[0].count} rules`);

  const taxStatus = (parseInt(hsCodes.rows[0].count) > 0 && parseInt(mappings.rows[0].count) > 0 && parseInt(taxRules.rows[0].count) > 0) ? '✅' : '❌';
  console.log(`   Status: ${taxStatus} ${taxStatus === '✅' ? 'COMPLETE' : 'INCOMPLETE'}`);

  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY:');
  console.log('  2. Materials: ' + matStatus);
  console.log('  3. Clients: ' + clientStatus);
  console.log('  4. Pricing Rules: Check output above');
  console.log('  5. Logistics: Check output above');
  console.log('  6. Tax & Duty: ' + taxStatus);
  console.log('=' .repeat(60));

  client.release();
  await pool.end();
})();
