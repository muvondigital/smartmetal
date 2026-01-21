/**
 * Reset All Users to Simple Password
 * Resets all user passwords to "password123" for easier local testing
 */

require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcrypt');

const pool = new Pool({
  connectionString: process.env.MIGRATION_DATABASE_URL
});

async function resetAllPasswords() {
  try {
    const newPassword = 'password123';
    const passwordHash = await bcrypt.hash(newPassword, 10);

    console.log('🔐 Resetting all user passwords to: password123');
    console.log('');

    // Get all users
    const users = await pool.query('SELECT id, email, name, role FROM users');

    console.log(`Found ${users.rows.length} users\n`);

    // Update all passwords
    for (const user of users.rows) {
      await pool.query(`
        UPDATE users
        SET password_hash = $1, updated_at = NOW()
        WHERE id = $2
      `, [passwordHash, user.id]);

      console.log(`✅ ${user.email} (${user.role}) - password reset`);
    }

    console.log('');
    console.log('✅ All user passwords have been reset to: password123');

    await pool.end();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

resetAllPasswords();
