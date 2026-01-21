const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.MIGRATION_DATABASE_URL
});

async function checkUsers() {
  try {
    console.log('='.repeat(60));
    console.log('CHECKING ALL USERS AND THEIR CREDENTIALS');
    console.log('='.repeat(60));
    console.log('');

    // Get all users with their tenant info
    const result = await pool.query(`
      SELECT
        u.id,
        u.email,
        u.name,
        u.role,
        u.is_active,
        u.password_hash,
        t.name as tenant_name,
        t.code as tenant_code,
        t.id as tenant_id
      FROM users u
      LEFT JOIN tenants t ON u.tenant_id = t.id
      ORDER BY t.name, u.role
    `);

    console.log(`Found ${result.rows.length} total users\n`);

    // Group by tenant
    const byTenant = {};
    result.rows.forEach(user => {
      const tenant = user.tenant_name || 'No Tenant';
      if (!byTenant[tenant]) byTenant[tenant] = [];
      byTenant[tenant].push(user);
    });

    // Display by tenant
    for (const [tenant, users] of Object.entries(byTenant)) {
      console.log('─'.repeat(60));
      console.log(`TENANT: ${tenant}`);
      console.log('─'.repeat(60));

      users.forEach(user => {
        console.log(`\nEmail: ${user.email}`);
        console.log(`  Name: ${user.name}`);
        console.log(`  Role: ${user.role}`);
        console.log(`  Active: ${user.is_active ? '✅' : '❌'}`);
        console.log(`  Password Set: ${user.password_hash ? '✅ YES' : '❌ NO'}`);
        console.log(`  Tenant ID: ${user.tenant_id}`);
        console.log(`  Tenant Code: ${user.tenant_code || 'N/A'}`);
      });
      console.log('');
    }

    console.log('='.repeat(60));
    console.log('CHECKING APPROVAL PERMISSIONS');
    console.log('='.repeat(60));
    console.log('');

    // Check who has approval permissions
    const approvers = result.rows.filter(u =>
      u.role === 'admin' ||
      u.role === 'manager' ||
      u.role === 'approver'
    );

    console.log('Users with approval permissions (admin/manager/approver roles):');
    console.log('');
    approvers.forEach(user => {
      console.log(`✓ ${user.email} (${user.role}) - ${user.tenant_name}`);
    });

    console.log('');
    console.log('='.repeat(60));
    console.log('DEFAULT PASSWORD INFORMATION');
    console.log('='.repeat(60));
    console.log('');
    console.log('The default password for seeded users is typically: password123');
    console.log('');

    await pool.end();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkUsers();
