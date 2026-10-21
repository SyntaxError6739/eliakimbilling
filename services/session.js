const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const { query, pool } = require('../db');
const mikrotik = require('./mikrotik');

async function activateSession({ userId, plan, paymentId, phone, macAddress }) {
  const duration = Number(plan.duration_h);
  const profile = String(plan.mikrotik_profile || '').trim();
  if (!Number.isInteger(duration) || duration < 1 || duration > 87600 || !/^[A-Za-z0-9_-]{1,50}$/.test(profile)) throw new Error('Invalid package activation data');
  const client = await pool.connect();
  let credentials;
  try {
    await client.query('SELECT pg_advisory_lock(hashtext($1))', [paymentId]);
    const existing = await client.query('SELECT id, user_id, mikrotik_user, expires_at, active, activation_status FROM sessions WHERE payment_id = $1 FOR UPDATE', [paymentId]);
    if (existing.rows.length && existing.rows[0].active && existing.rows[0].activation_status === 'active') return existing.rows[0];

    const session = existing.rows[0];
    const suffix = crypto.randomBytes(4).toString('hex').toUpperCase();
    const username = session?.mikrotik_user || `sn_${phone.replace(/\D/g, '').slice(-9)}_${suffix}`;
    const password = crypto.randomBytes(18).toString('base64url');
    const expiresAt = new Date(Date.now() + duration * 3600 * 1000);
    const sessionId = session?.id || uuidv4();
    credentials = session ? null : { username, password, expiresAt };

    await client.query('BEGIN');
    if (!session) {
      await client.query(
        `INSERT INTO sessions
           (id, user_id, payment_id, mac_address, mikrotik_user, plan_id, expires_at, active, activation_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE, 'pending')`,
        [sessionId, userId, paymentId, macAddress || null, username, plan.id, expiresAt]
      );
    } else {
      await client.query("UPDATE sessions SET activation_status='pending', active=FALSE WHERE id=$1 AND payment_id=$2", [sessionId, paymentId]);
    }
    await client.query('COMMIT');

    const existingRouterUser = await mikrotik.findHotspotUser(username);
    if (!existingRouterUser) {
      await mikrotik.createHotspotUser({ username, password, profile, macAddress, limitUptime: mikrotik.hoursToUptime(duration) });
    }
    await client.query('BEGIN');
    await client.query("UPDATE sessions SET active=TRUE, activation_status='active', expires_at=$1 WHERE id=$2 AND payment_id=$3", [expiresAt, sessionId, paymentId]);
    await client.query('COMMIT');
    return credentials || { username, expiresAt };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    await client.query("UPDATE sessions SET active=FALSE, activation_status='failed' WHERE payment_id=$1", [paymentId]).catch(() => {});
    throw error;
  } finally {
    await client.query('SELECT pg_advisory_unlock(hashtext($1))', [paymentId]).catch(() => {});
    client.release();
  }
}

async function deactivateSession(sessionId, userId) {
  const { rows } = await query(
    'SELECT mikrotik_user FROM sessions WHERE id = $1 AND user_id = $2 AND active = TRUE',
    [sessionId, userId]
  );
  if (!rows.length) return;

  await mikrotik.removeHotspotUser(rows[0].mikrotik_user);

  await query(
    "UPDATE sessions SET active = FALSE, activation_status='expired' WHERE id = $1 AND user_id = $2",
    [sessionId, userId]
  );
}

async function expireOldSessions() {
  const { rows } = await query(
    `SELECT id, mikrotik_user FROM sessions
     WHERE active = TRUE AND expires_at < NOW()`
  );

  for (const s of rows) {
    try {
      await mikrotik.removeHotspotUser(s.mikrotik_user);
      await query("UPDATE sessions SET active = FALSE, activation_status='expired' WHERE id = $1", [s.id]);
      console.log(`[Session] Expired: ${s.mikrotik_user}`);
    } catch (err) {
      console.error(`[Session] Failed to expire ${s.mikrotik_user}:`, err.message);
    }
  }
}

module.exports = { activateSession, deactivateSession, expireOldSessions };
