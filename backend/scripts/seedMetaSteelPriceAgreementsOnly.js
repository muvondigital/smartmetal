/**
 * Seed ONLY Price Agreements for MetaSteel
 * 
 * This script seeds price agreements without running the full demo data seed.
 * Use this if price agreements are missing but other data is fine.
 * 
 * Usage: node backend/scripts/seedMetaSteelPriceAgreementsOnly.js
 */

require('dotenv').config();
const { connectMigrationDb } = require('../src/db/supabaseClient');

async function seedPriceAgreementsOnly() {
  const db = await connectMigrationDb();
  
  try {
    console.log('🌱 Seeding MetaSteel Price Agreements Only...\n');
    
    // Get MetaSteel tenant
    const tenantResult = await db.query(
      `SELECT id, code, name FROM tenants WHERE UPPER(code) = 'METASTEEL' LIMIT 1`
    );
    
    if (tenantResult.rows.length === 0) {
      throw new Error('MetaSteel tenant not found');
    }
    
    const metaSteelTenant = tenantResult.rows[0];
    console.log(`✓ Found MetaSteel tenant: ${metaSteelTenant.code} (${metaSteelTenant.id})\n`);
    
    // Get clients
    const clientsResult = await db.query(
      `SELECT id, code, name FROM clients WHERE tenant_id = $1 AND code IN ('ALPHA-ENG', 'PIPEMART')`,
      [metaSteelTenant.id]
    );
    
    const clientMap = {};
    for (const client of clientsResult.rows) {
      clientMap[client.code] = client.id;
      console.log(`✓ Found client: ${client.code} (${client.id})`);
    }
    
    if (!clientMap['ALPHA-ENG']) {
      throw new Error('ALPHA-ENG client not found. Please run seedMetaSteelDemoData first to create clients.');
    }
    if (!clientMap['PIPEMART']) {
      throw new Error('PIPEMART client not found. Please run seedMetaSteelDemoData first to create clients.');
    }
    
    console.log('');
    
    // Upsert price agreements
    const today = new Date();
    const validFrom = new Date(today);
    validFrom.setDate(validFrom.getDate() - 7);
    const validUntil = new Date(today);
    validUntil.setDate(validUntil.getDate() + 90);
    
    // Agreement 1: Alpha Engineering
    const existing1 = await db.query(`
      SELECT id FROM price_agreements 
      WHERE tenant_id = $1 AND client_id = $2 AND category = $3
      LIMIT 1
    `, [metaSteelTenant.id, clientMap['ALPHA-ENG'], 'PIPE']);
    
    if (existing1.rows.length > 0) {
      console.log('  ⊙ Alpha Engineering agreement already exists (skipping)');
    } else {
      await db.query(`
        INSERT INTO price_agreements (
          tenant_id, client_id, material_id, category,
          base_price, currency, volume_tiers,
          valid_from, valid_until,
          payment_terms, delivery_terms, notes,
          created_by, status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      `, [
        metaSteelTenant.id,
        clientMap['ALPHA-ENG'],
        null,
        'PIPE',
        850.00,
        'USD',
        JSON.stringify([
          { min_qty: 0, max_qty: 100, price: 850.00 },
          { min_qty: 101, max_qty: 500, price: 820.00 },
          { min_qty: 501, max_qty: null, price: 800.00 }
        ]),
        validFrom.toISOString().split('T')[0],
        validUntil.toISOString().split('T')[0],
        'Net 30',
        'FOB Port',
        'Alpha Engineering A106 Pipe Volume Deal - Demo Agreement',
        'System',
        'active'
      ]);
      console.log('  ✓ Created Alpha Engineering - A106 Pipe Volume Deal');
    }
    
    // Agreement 2: PipeMart
    const existing2 = await db.query(`
      SELECT id FROM price_agreements 
      WHERE tenant_id = $1 AND client_id = $2 AND category = $3
      LIMIT 1
    `, [metaSteelTenant.id, clientMap['PIPEMART'], 'FITTING']);
    
    if (existing2.rows.length > 0) {
      console.log('  ⊙ PipeMart agreement already exists (skipping)');
    } else {
      await db.query(`
        INSERT INTO price_agreements (
          tenant_id, client_id, material_id, category,
          base_price, currency, volume_tiers,
          valid_from, valid_until,
          payment_terms, delivery_terms, notes,
          created_by, status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      `, [
        metaSteelTenant.id,
        clientMap['PIPEMART'],
        null,
        'FITTING',
        1200.00,
        'USD',
        JSON.stringify([
          { min_qty: 0, max_qty: null, price: 1200.00 }
        ]),
        validFrom.toISOString().split('T')[0],
        validUntil.toISOString().split('T')[0],
        'Net 45',
        'CIF Destination',
        'PipeMart Fittings Discount - Demo Agreement',
        'System',
        'active'
      ]);
      console.log('  ✓ Created PipeMart - Fittings Discount');
    }
    
    // Verify
    const verify = await db.query(
      `SELECT COUNT(*) as count FROM price_agreements WHERE tenant_id = $1`,
      [metaSteelTenant.id]
    );
    
    console.log(`\n✅ Price agreements seeded successfully!`);
    console.log(`   Total agreements for MetaSteel: ${verify.rows[0].count}\n`);
    
  } catch (error) {
    console.error('\n❌ Failed to seed price agreements:', error.message);
    console.error(error.stack);
    throw error;
  } finally {
    await db.end();
  }
}

if (require.main === module) {
  seedPriceAgreementsOnly()
    .then(() => {
      console.log('✅ Script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Script failed:', error);
      process.exit(1);
    });
}

module.exports = { seedPriceAgreementsOnly };

