/**
 * Verify tenants and users in database
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { connectDb } = require('../src/db/supabaseClient');

async function verifyTenantsAndUsers() {
  const db = await connectDb();
  
  try {
    console.log('🔍 Verifying tenants and users...\n');
    
    // 1. Verify tenants
    console.log('📋 Tenants:');
    const tenantsResult = await db.query(`
      SELECT id, code, name, is_active 
      FROM tenants 
      ORDER BY code;
    `);
    
    if (tenantsResult.rows.length === 0) {
      console.log('  ❌ No tenants found!');
    } else {
      tenantsResult.rows.forEach(tenant => {
        console.log(`  ✓ ${tenant.code} - ${tenant.name} (${tenant.is_active ? 'active' : 'inactive'})`);
      });
    }
    
    // 2. Verify NSC users
    console.log('\n👥 NSC Users:');
    const nscUsersResult = await db.query(`
      SELECT u.email, u.name, u.role, u.is_active, t.code as tenant_code
      FROM users u
      INNER JOIN tenants t ON u.tenant_id = t.id
      WHERE UPPER(t.code) = 'NSC'
      ORDER BY u.email;
    `);
    
    if (nscUsersResult.rows.length === 0) {
      console.log('  ❌ No NSC users found!');
    } else {
      nscUsersResult.rows.forEach(user => {
        console.log(`  ✓ ${user.email} (${user.role}) - ${user.is_active ? 'active' : 'inactive'}`);
      });
    }
    
    // 3. Verify MetaSteel users
    console.log('\n👥 MetaSteel Users:');
    const metaSteelUsersResult = await db.query(`
      SELECT u.email, u.name, u.role, u.is_active, t.code as tenant_code
      FROM users u
      INNER JOIN tenants t ON u.tenant_id = t.id
      WHERE UPPER(t.code) = 'METASTEEL'
      ORDER BY u.email;
    `);
    
    if (metaSteelUsersResult.rows.length === 0) {
      console.log('  ❌ No MetaSteel users found!');
    } else {
      metaSteelUsersResult.rows.forEach(user => {
        console.log(`  ✓ ${user.email} (${user.role}) - ${user.is_active ? 'active' : 'inactive'}`);
      });
    }
    
    // 4. Verify tenant settings
    console.log('\n⚙️  Tenant Settings:');
    const settingsResult = await db.query(`
      SELECT t.code, ts.key, 
             CASE WHEN ts.value::text = 'null' THEN 'null' ELSE 'configured' END as status
      FROM tenant_settings ts
      INNER JOIN tenants t ON ts.tenant_id = t.id
      ORDER BY t.code, ts.key;
    `);
    
    const settingsByTenant = {};
    settingsResult.rows.forEach(row => {
      if (!settingsByTenant[row.code]) {
        settingsByTenant[row.code] = [];
      }
      settingsByTenant[row.code].push(`${row.key}: ${row.status}`);
    });
    
    Object.entries(settingsByTenant).forEach(([code, settings]) => {
      console.log(`  ${code}:`);
      settings.forEach(setting => {
        console.log(`    ✓ ${setting}`);
      });
    });
    
    // 5. Summary
    console.log('\n📊 Summary:');
    console.log(`  • Tenants: ${tenantsResult.rows.length}`);
    console.log(`  • NSC users: ${nscUsersResult.rows.length}`);
    console.log(`  • MetaSteel users: ${metaSteelUsersResult.rows.length}`);
    console.log(`  • Tenant settings: ${settingsResult.rows.length} keys`);
    
    console.log('\n✅ Verification completed!');
    
  } catch (error) {
    console.error('❌ Verification failed:', error);
    throw error;
  } finally {
    await db.end();
  }
}

if (require.main === module) {
  verifyTenantsAndUsers()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Script failed:', error);
      process.exit(1);
    });
}

module.exports = { verifyTenantsAndUsers };

