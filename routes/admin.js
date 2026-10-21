/**
 * routes/admin.js
 *
 * GET /api/admin/sessions  — all active sessions
 * GET /api/admin/revenue   — revenue summary
 * GET /api/admin/users     — registered users
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { query, pool } = require('../db');
const { authMiddleware, adminOnly, csrfProtection } = require('../middleware/auth');
const { activateSession } = require('../services/session');

const router = express.Router();
router.use(authMiddleware, adminOnly, csrfProtection);

async function audit(adminId, action, metadata = {}) {
  await query('INSERT INTO admin_audit_log (admin_id, action, metadata) VALUES ($1, $2, $3)', [adminId, action, metadata]);
}

function packageInput(body) {
  const name = String(body.name || '').trim();
  const description = String(body.description || '').trim();
  const currency = String(body.currency || 'USD').trim().toUpperCase();
  const price = Number(body.price);
  const duration = Number(body.duration_h);
  const mikrotikProfile = String(body.mikrotik_profile || '').trim();
  if (!name || name.length > 50 || !Number.isFinite(price) || price < 0 || price > 1000000 || !Number.isInteger(duration) || duration < 1 || duration > 87600 || !/^[A-Z]{3}$/.test(currency) || !mikrotikProfile) return null;
  return { name, description, currency, price: price.toFixed(2), duration, mikrotikProfile };
}

function validEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value); }
function validPhone(value) { return /^\d{7,20}$/.test(value); }
function isOriginalAdmin(req) { return req.user?.isOriginalAdmin === true || String(req.user?.email || '').toLowerCase() === 'astaricoyoga@gmail.com'; }

router.get('/overview', async (_req, res, next) => {
  try {
    const [users, plans, payments, sessions] = await Promise.all([
      query('SELECT COUNT(*)::int AS count FROM users WHERE role = $1', ['USER']),
      query('SELECT COUNT(*)::int AS count FROM plans'),
      query(`SELECT COALESCE(SUM(amount_usd), 0) AS revenue, COUNT(*)::int AS count
             FROM payments WHERE status = 'success' AND confirmed_at >= CURRENT_DATE`),
      query(`SELECT COUNT(*)::int AS count FROM sessions WHERE active = TRUE AND expires_at > NOW()`),
    ]);
    res.json({ customers: users.rows[0].count, plans: plans.rows[0].count, revenueUSD: Number(payments.rows[0].revenue).toFixed(2), transactions: payments.rows[0].count, activeSessions: sessions.rows[0].count });
  } catch (err) { next(err); }
});

router.get('/sessions', async (_req, res, next) => {
  try {
    const { rows } = await query(`
      SELECT s.id, s.mikrotik_user, s.ip_address, s.mac_address,
             s.started_at, s.expires_at,
             u.name AS user_name, u.phone,
             p.name AS plan_name
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      JOIN plans p ON p.id = s.plan_id
      WHERE s.active = TRUE AND s.expires_at > NOW()
      ORDER BY s.started_at DESC
    `);
    res.json({ count: rows.length, sessions: rows });
  } catch (err) { next(err); }
});

router.get('/revenue', async (req, res, next) => {
  try {
    const { period = 'today' } = req.query;

    const intervals = {
      today: "INTERVAL '1 day'",
      week: "INTERVAL '7 days'",
      month: "INTERVAL '30 days'",
      alltime: "INTERVAL '100 years'",
    };
    const interval = intervals[period] || intervals.today;

    const total = await query(`
      SELECT COALESCE(SUM(amount_usd), 0) AS total_usd, COUNT(*) AS transactions
      FROM payments
      WHERE status = 'success' AND confirmed_at > NOW() - ${interval}
    `);

    const byPlan = await query(`
      SELECT pl.name AS plan, COUNT(*) AS sales, SUM(pm.amount_usd) AS revenue
      FROM payments pm JOIN plans pl ON pl.id = pm.plan_id
      WHERE pm.status = 'success' AND pm.confirmed_at > NOW() - ${interval}
      GROUP BY pl.name ORDER BY revenue DESC
    `);

    const byProvider = await query(`
      SELECT provider, COUNT(*) AS transactions, SUM(amount_usd) AS revenue
      FROM payments
      WHERE status = 'success' AND confirmed_at > NOW() - ${interval}
      GROUP BY provider ORDER BY revenue DESC
    `);

    res.json({
      period,
      totalUSD: Number(total.rows[0].total_usd).toFixed(2),
      transactions: Number(total.rows[0].transactions),
      byPlan: byPlan.rows,
      byProvider: byProvider.rows,
    });
  } catch (err) { next(err); }
});

router.get('/users', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = 50;
    const offset = (page - 1) * limit;
    const search = String(req.query.search || '').trim();

    const { rows } = await query(`
      SELECT u.id, u.name, u.phone, u.email, u.created_at,
             COUNT(s.id) FILTER (WHERE s.active = TRUE) AS active_sessions,
             COUNT(p.id) FILTER (WHERE p.status = 'success') AS total_payments
      FROM users u
      LEFT JOIN sessions s ON s.user_id = u.id
      LEFT JOIN payments p ON p.user_id = u.id
      WHERE u.role = 'USER' AND ($3 = '' OR u.name ILIKE '%' || $3 || '%' OR u.phone ILIKE '%' || $3 || '%' OR COALESCE(u.email, '') ILIKE '%' || $3 || '%')
      GROUP BY u.id ORDER BY u.created_at DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset, search]);

    res.json({ page, users: rows });
  } catch (err) { next(err); }
});

router.get('/payments', async (req, res, next) => {
  try {
    const { rows } = await query(`
      SELECT p.id, p.amount_usd, p.provider, p.status, p.created_at, p.confirmed_at,
             p.phone, u.name AS user_name, u.email, pl.name AS plan_name
      FROM payments p LEFT JOIN users u ON u.id = p.user_id LEFT JOIN plans pl ON pl.id = p.plan_id
      ORDER BY p.created_at DESC LIMIT 100
    `);
    res.json({ payments: rows });
  } catch (err) { next(err); }
});

router.post('/payments/:id/retry-activation', async (req, res, next) => {
  try {
    const { rows } = await query(`SELECT * FROM payments WHERE id=$1 AND status='success' AND activation_status <> 'activated'`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Confirmed payment requiring activation was not found' });
    const payment = rows[0];
    const session = await activateSession({
      userId: payment.user_id,
      paymentId: payment.id,
      phone: payment.phone,
      plan: { id: payment.plan_id, duration_h: payment.duration_h_snapshot, mikrotik_profile: payment.mikrotik_profile_snapshot },
    });
    await query("UPDATE payments SET activation_status='activated', activation_error=NULL WHERE id=$1 AND status='success'", [payment.id]);
    await audit(req.user.userId, 'payment.activation_retried', { paymentId: payment.id });
    res.json({ activated: true, session });
  } catch (err) {
    await query("UPDATE payments SET activation_status='failed', activation_error=$1 WHERE id=$2 AND status='success'", ['Router activation failed; retry is required', req.params.id]).catch(() => {});
    next(err);
  }
});

router.get('/plans', async (_req, res, next) => {
  try {
    const { rows } = await query('SELECT id, name, description, price_usd, currency, duration_h, mikrotik_profile, active FROM plans ORDER BY duration_h');
    res.json({ plans: rows });
  } catch (err) { next(err); }
});

router.post('/plans', async (req, res, next) => {
  const input = packageInput(req.body);
  if (!input) return res.status(400).json({ error: 'Invalid package name, price, currency, duration, or router profile' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO plans (name, description, price_usd, currency, duration_h, mikrotik_profile, active)
       VALUES ($1,$2,$3,$4,$5,$6,TRUE)
       RETURNING id, name, description, price_usd, currency, duration_h, mikrotik_profile, active`,
      [input.name, input.description, input.price, input.currency, input.duration, input.mikrotikProfile]
    );
    await client.query('COMMIT');
    await audit(req.user.userId, 'package.created', { planId: rows[0].id });
    res.status(201).json({ plan: rows[0] });
  } catch (err) { await client.query('ROLLBACK'); next(err); } finally { client.release(); }
});

router.patch('/plans/:id', async (req, res, next) => {
  const input = packageInput(req.body);
  if (!input) return res.status(400).json({ error: 'Invalid package name, price, currency, duration, or router profile' });
  try {
    const { rows } = await query(
      `UPDATE plans SET name=$1, description=$2, price_usd=$3, currency=$4, duration_h=$5, mikrotik_profile=$6
       WHERE id=$7 RETURNING id, name, description, price_usd, currency, duration_h, mikrotik_profile, active`,
      [input.name, input.description, input.price, input.currency, input.duration, input.mikrotikProfile, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Package not found' });
    await audit(req.user.userId, 'package.updated', { planId: rows[0].id });
    res.json({ plan: rows[0] });
  } catch (err) { next(err); }
});

router.patch('/plans/:id/status', async (req, res, next) => {
  const active = req.body.active;
  if (typeof active !== 'boolean') return res.status(400).json({ error: 'active must be boolean' });
  try {
    const { rows } = await query('UPDATE plans SET active=$1 WHERE id=$2 RETURNING id, active', [active, req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Package not found' });
    await audit(req.user.userId, active ? 'package.activated' : 'package.deactivated', { planId: rows[0].id });
    res.json({ plan: rows[0] });
  } catch (err) { next(err); }
});

router.post('/customers', async (req, res, next) => {
  const name = String(req.body.name || '').trim();
  const phone = String(req.body.phone || '').replace(/\D/g, '');
  const email = String(req.body.email || '').trim().toLowerCase() || null;
  const password = String(req.body.password || '');
  if (!name || !validPhone(phone) || (email && !validEmail(email)) || password.length < 12) return res.status(400).json({ error: 'Valid name, phone, email, and password of at least 12 characters are required' });
  try {
    const existing = await query('SELECT id FROM users WHERE phone=$1 OR ($2::text IS NOT NULL AND LOWER(email)=LOWER($2))', [phone, email]);
    if (existing.rows.length) return res.status(409).json({ error: 'A customer with that phone or email already exists' });
    const passwordHash = await bcrypt.hash(password, 12);
    const { rows } = await query('INSERT INTO users (name, phone, email, password, role) VALUES ($1,$2,$3,$4,\'USER\') RETURNING id,name,phone,email,role,suspended,created_at', [name, phone, email, passwordHash]);
    await audit(req.user.userId, 'customer.created', { customerId: rows[0].id });
    res.status(201).json({ customer: rows[0] });
  } catch (err) { next(err); }
});

router.patch('/customers/:id', async (req, res, next) => {
  const name = String(req.body.name || '').trim();
  const phone = String(req.body.phone || '').replace(/\D/g, '');
  const email = String(req.body.email || '').trim().toLowerCase() || null;
  if (!name || !validPhone(phone) || (email && !validEmail(email))) return res.status(400).json({ error: 'Valid name, phone, and email are required' });
  try {
    const duplicate = await query('SELECT id FROM users WHERE (phone=$1 OR ($2::text IS NOT NULL AND LOWER(email)=LOWER($2))) AND id<>$3', [phone, email, req.params.id]);
    if (duplicate.rows.length) return res.status(409).json({ error: 'That phone or email is already in use' });
    const { rows } = await query('UPDATE users SET name=$1,phone=$2,email=$3 WHERE id=$4 AND role=\'USER\' RETURNING id,name,phone,email,role,suspended,created_at', [name, phone, email, req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Customer not found' });
    await audit(req.user.userId, 'customer.updated', { customerId: rows[0].id });
    res.json({ customer: rows[0] });
  } catch (err) { next(err); }
});

router.patch('/customers/:id/status', async (req, res, next) => {
  if (typeof req.body.suspended !== 'boolean') return res.status(400).json({ error: 'suspended must be boolean' });
  try {
    const { rows } = await query('UPDATE users SET suspended=$1 WHERE id=$2 AND role=\'USER\' RETURNING id,suspended', [req.body.suspended, req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Customer not found' });
    await audit(req.user.userId, req.body.suspended ? 'customer.suspended' : 'customer.reinstated', { customerId: rows[0].id });
    res.json({ customer: rows[0] });
  } catch (err) { next(err); }
});

router.post('/customers/:id/assignments', async (req, res, next) => {
  const planId = Number(req.body.planId);
  if (!Number.isInteger(planId) || planId < 1) return res.status(400).json({ error: 'A valid package ID is required' });
  try {
    const [customer, plan] = await Promise.all([query('SELECT id FROM users WHERE id=$1 AND role=\'USER\'', [req.params.id]), query('SELECT id FROM plans WHERE id=$1 AND active=TRUE', [planId])]);
    if (!customer.rows.length || !plan.rows.length) return res.status(404).json({ error: 'Customer or active package not found' });
    const { rows } = await query('INSERT INTO customer_package_assignments (user_id,plan_id,assigned_by) VALUES ($1,$2,$3) RETURNING id,user_id,plan_id,status,assigned_at', [req.params.id, planId, req.user.userId]);
    await audit(req.user.userId, 'customer.package_assigned', { customerId: req.params.id, planId });
    res.status(201).json({ assignment: rows[0], accessActivated: false, message: 'Assignment recorded; payment verification is still required.' });
  } catch (err) { next(err); }
});

router.get('/administrators', async (_req, res, next) => {
  try {
    const { rows } = await query(`SELECT id, name, email, phone, is_original_admin, created_at FROM users WHERE role = 'ADMIN' ORDER BY created_at`);
    res.json({ administrators: rows });
  } catch (err) { next(err); }
});

router.post('/administrators', async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const phone = String(req.body.phone || '').replace(/\D/g, '');
    const password = String(req.body.password || '');

    if (!name || !email || !phone || !password) {
      return res.status(400).json({ error: 'Name, email, phone, and password are required' });
    }
    if (!email.includes('@')) return res.status(400).json({ error: 'A valid email is required' });
    if (password.length < 12) return res.status(400).json({ error: 'Password must be at least 12 characters' });

    const existing = await query('SELECT id FROM users WHERE LOWER(email) = $1 OR phone = $2', [email, phone]);
    if (existing.rows.length) return res.status(409).json({ error: 'That email or phone is already in use' });

    const passwordHash = await bcrypt.hash(password, 12);
    const { rows } = await query(
      `INSERT INTO users (name, phone, email, password, role)
       VALUES ($1, $2, $3, $4, 'ADMIN')
       RETURNING id, name, phone, email, role, created_at`,
      [name, phone, email, passwordHash]
    );
    await audit(req.user.userId, 'admin.created', { adminId: rows[0].id, email });
    res.status(201).json({ administrator: rows[0] });
  } catch (err) {
    next(err);
  }
});

router.delete('/administrators/:id', async (req, res, next) => {
  if (!isOriginalAdmin(req)) return res.status(403).json({ error: 'Only the original administrator may remove an administrator' });
  const otp = String(req.body.otp || '');
  const configuredOtp = String(process.env.ADMIN_REMOVAL_OTP || '');
  if (!configuredOtp || !otp || Buffer.byteLength(otp) !== Buffer.byteLength(configuredOtp) || !crypto.timingSafeEqual(Buffer.from(otp), Buffer.from(configuredOtp))) return res.status(403).json({ error: 'Original administrator OTP approval is required' });
  if (String(req.user.userId) === String(req.params.id)) return res.status(400).json({ error: 'The original administrator cannot remove their own account' });
  try {
    const { rows } = await query('UPDATE users SET role=\'USER\', is_original_admin=FALSE WHERE id=$1 AND role=\'ADMIN\' AND is_original_admin=FALSE RETURNING id, email', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Administrator not found or protected' });
    await audit(req.user.userId, 'admin.removed', { adminId: rows[0].id });
    res.json({ removed: true });
  } catch (err) { next(err); }
});

router.get('/audit', async (_req, res, next) => {
  try {
    const { rows } = await query(`SELECT l.action, l.metadata, l.created_at, u.name AS admin_name
      FROM admin_audit_log l JOIN users u ON u.id = l.admin_id ORDER BY l.created_at DESC LIMIT 100`);
    res.json({ entries: rows });
  } catch (err) { next(err); }
});

router.post('/audit/login', async (req, res, next) => {
  try {
    await audit(req.user.userId, 'admin.dashboard.viewed');
    res.status(204).end();
  } catch (err) { next(err); }
});

module.exports = router;
