/**
 * routes/admin.js
 *
 * GET /api/admin/sessions  — all active sessions
 * GET /api/admin/revenue   — revenue summary
 * GET /api/admin/users     — registered users
 */

const express = require('express');
const { query } = require('../db');
const { authMiddleware, adminOnly } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware, adminOnly);

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

    const { rows } = await query(`
      SELECT u.id, u.name, u.phone, u.email, u.created_at,
             COUNT(s.id) FILTER (WHERE s.active = TRUE) AS active_sessions,
             COUNT(p.id) FILTER (WHERE p.status = 'success') AS total_payments
      FROM users u
      LEFT JOIN sessions s ON s.user_id = u.id
      LEFT JOIN payments p ON p.user_id = u.id
      GROUP BY u.id ORDER BY u.created_at DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);

    res.json({ page, users: rows });
  } catch (err) { next(err); }
});

module.exports = router;
