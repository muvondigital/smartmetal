/**
 * Reset User Password Script
 * Usage: node scripts/resetUserPassword.js <email> <new_password>
 */

require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcrypt');

const pool = new Pool({
  connectionString: process.env.MIGRATION_DATABASE_URL
});

async function resetPassword(email, newPassword) {
  try {
    // Hash the new password
    const passwordHash = await bcrypt.hash(newPassword, 10);

    // Update the user's password
    const result = await pool.query(`
      UPDATE users
      SET password_hash = $1, updated_at = NOW()
      WHERE email = $2
      RETURNING id, email, name, role
    `, [passwordHash, email]);

    if (result.rows.length === 0) {
      console.log(`❌ User not found: ${email}`);
      process.exit(1);
    }

    const user = result.rows[0];
    console.log('✅ Password reset successful!');
    console.log('');
    console.log('User:', user.name);
    console.log('Email:', user.email);
    console.log('Role:', user.role);
    console.log('New Password:', newPassword);
    console.log('');

    await pool.end();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// Get command line arguments
const email = process.argv[2];
const newPassword = process.argv[3];

if (!email || !newPassword) {
  console.log('Usage: node scripts/resetUserPassword.js <email> <new_password>');
  console.log('');
  console.log('Examples:');
  console.log('  node scripts/resetUserPassword.js Sales07@nscsinergi.com.my password123');
  console.log('  node scripts/resetUserPassword.js admin@metasteel.com newpass');
  process.exit(1);
}

resetPassword(email, newPassword);
