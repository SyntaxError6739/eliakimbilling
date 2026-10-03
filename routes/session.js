/**
 * routes/session.js
 *
 * GET /api/session/status
 * POST /api/session/logout
 */

const express = require('express');
const { query } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { deactivateSession } = require('../services/session');

const router = express.Router();

router.get('/status', authMiddleware, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT s.id, s.mikrotik_user, s.ip_address, s.mac_address, s.started_at, s.expires_at,
              s.active, p.name AS plan_name, p.duration_h
       FROM sessions s
       JOIN plans p ON p.id = s.plan_id
       WHERE s.user_id = $1 AND s.active = TRUE
       ORDER BY s.started_at DESC
       LIMIT 1`,
      [req.user.userId]
    );

    if (!rows.length) {
      return res.json({ active: false, session: null });
    }

    const session = rows[0];
    res.json({ active: true, session });
  } catch (err) { next(err); }
});

router.post('/logout', authMiddleware, async (req, res, next) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) return res.status(400).json({ error: 'sessionId ayaa looga baahan yahay' });

    await deactivateSession(sessionId);
    res.json({ message: 'Session waa la xidhay' });
  } catch (err) { next(err); }
});

module.exports = router;
