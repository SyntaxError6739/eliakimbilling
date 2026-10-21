/** Create or promote an administrator from environment variables. */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool } = require('./index');

async function createAdmin() {
  const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = String(process.env.ADMIN_PASSWORD || '');
  const name = String(process.env.ADMIN_NAME || 'Astarico Yoga').trim();
  const phone = String(process.env.ADMIN_PHONE || '').replace(/\D/g, '');

  if (!email || !password || !phone) throw new Error('ADMIN_EMAIL, ADMIN_PASSWORD, and ADMIN_PHONE are required');
  if (password.length < 12) throw new Error('ADMIN_PASSWORD must be at least 12 characters');

  const passwordHash = await bcrypt.hash(password, 12);
  await pool.query(
    `INSERT INTO users (name, phone, email, password, role, is_original_admin)
     VALUES ($1, $2, $3, $4, 'ADMIN', TRUE)
     ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, phone = EXCLUDED.phone,
       password = EXCLUDED.password, role = 'ADMIN', is_original_admin = TRUE`,
    [name, phone, email, passwordHash]
  );
  console.log(`Admin account ready: ${email}`);
}

createAdmin().catch((error) => {
  console.error('Admin creation failed:', error.message);
  process.exitCode = 1;
}).finally(() => pool.end());