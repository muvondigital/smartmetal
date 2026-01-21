/**
 * Add NSC Admin User
 *
 * Creates an admin user for NSC tenant with full approval permissions.
 *
 * Usage: node scripts/addNscAdmin.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { Pool } = require('pg');
const { hashPassword } = require('../src/services/authService');

const DEFAULT_PASSWORD = 'Password123!';

async function addNscAdmin() {
  const db = new Pool({
    connectionString: process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL
  });

  console.log('🔧 Adding NSC admin user...\n');

  try {
    // Get NSC tenant
    const tenantResult = await db.query(`
      SELECT id, code, name FROM tenants WHERE code = 'nsc' LIMIT 1;
    `);

    if (tenantResult.rows.length === 0) {
      throw new Error('NSC tenant not found. Please run seedTenantsAndUsers.js first.');
    }

    const nscTenant = tenantResult.rows[0];
    console.log(`✓ Found NSC tenant: ${nscTenant.code} (${nscTenant.id})\n`);

    // Create admin user
    const adminEmail = 'admin@nscsinergi.com.my';
    const passwordHash = await hashPassword(DEFAULT_PASSWORD);

    const result = await db.query(`
      INSERT INTO users (tenant_id, email, name, role, password_hash, is_active)
      VALUES ($1, $2, $3, $4, $5, true)
      ON CONFLICT (tenant_id, email) DO UPDATE
      SET name = EXCLUDED.name,
          role = EXCLUDED.role,
          password_hash = EXCLUDED.password_hash,
          is_active = true,
          updated_at = NOW()
      RETURNING id, email, name, role;
    `, [nscTenant.id, adminEmail, 'NSC Admin', 'admin', passwordHash]);

    const admin = result.rows[0];

    console.log('✅ NSC admin user created/updated:');
    console.log(`   Email: ${admin.email}`);
    console.log(`   Name: ${admin.name}`);
    console.log(`   Role: ${admin.role}`);
    console.log(`   Password: ${DEFAULT_PASSWORD}`);
    console.log('\n⚠️  IMPORTANT: Change password in production!\n');

  } catch (error) {
    console.error('\n❌ Failed to add NSC admin:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await db.end();
  }
}

if (require.main === module) {
  addNscAdmin()
    .then(() => {
      console.log('✅ Script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Script failed:', error);
      process.exit(1);
    });
}

module.exports = { addNscAdmin };
