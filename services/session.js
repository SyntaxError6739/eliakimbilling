const { v4: uuidv4 } = require('uuid');
const { query } = require('../db');
const mikrotik = require('./mikrotik');

async function activateSession({ userId, plan, paymentId, phone, macAddress }) {
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  const username = `sn_${phone.replace(/\D/g, '').slice(-9)}_${suffix}`;
  const password = uuidv4().slice(0, 12);
  const uptime = mikrotik.hoursToUptime(plan.duration_h);
  const expiresAt = new Date(Date.now() + plan.duration_h * 3600 * 1000);

  await mikrotik.createHotspotUser({
    username,
    password,
    profile: plan.mikrotik_profile,
    macAddress,
    limitUptime: uptime,
  });

  await query(
    `INSERT INTO sessions
       (id, user_id, payment_id, mac_address, mikrotik_user, plan_id, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [uuidv4(), userId, paymentId, macAddress || null, username, plan.id, expiresAt]
  );

  return { username, password, expiresAt };
}

async function deactivateSession(sessionId) {
  const { rows } = await query(
    'SELECT mikrotik_user FROM sessions WHERE id = $1 AND active = TRUE',
    [sessionId]
  );
  if (!rows.length) return;

  await mikrotik.removeHotspotUser(rows[0].mikrotik_user);

  await query(
    'UPDATE sessions SET active = FALSE WHERE id = $1',
    [sessionId]
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
      await query('UPDATE sessions SET active = FALSE WHERE id = $1', [s.id]);
      console.log(`[Session] Expired: ${s.mikrotik_user}`);
    } catch (err) {
      console.error(`[Session] Failed to expire ${s.mikrotik_user}:`, err.message);
    }
  }
}

module.exports = { activateSession, deactivateSession, expireOldSessions };
