/**
 * routes/voucher.js
 *
 * POST /api/voucher/redeem   — customer redeems a code
 * POST /api/voucher/generate — admin generates batch of vouchers
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const { query, pool } = require('../db');
const { activateSession } = require('../services/session');
const { authMiddleware, customerOnly, adminOnly } = require('../middleware/auth');

const router = express.Router();

router.post('/redeem', authMiddleware, customerOnly, async (req, res, next) => {
  let client;
  try {
    const { code, phone, macAddress } = req.body;
    const userId = req.user.userId;

    if (!code) return res.status(400).json({ error: 'Koodhka voucher ayaa looga baahan yahay' });

    client = await pool.connect();
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT v.*, p.id AS plan_id, p.duration_h, p.mikrotik_profile, p.name AS plan_name,
          p.description, p.currency, p.price_usd
       FROM vouchers v JOIN plans p ON p.id = v.plan_id
       WHERE v.code = $1 AND p.active = TRUE`,
      [code.toUpperCase()]
    );

    if (!rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Koodhkan lama helin' }); }

    const voucher = rows[0];
    if (voucher.redeemed) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Koodhkan horaa loo isticmaalay' }); }

    const redeemed = await client.query(
      'UPDATE vouchers SET redeemed=TRUE, redeemed_by=$1, redeemed_at=NOW() WHERE id=$2 AND redeemed=FALSE RETURNING id',
      [userId, voucher.id]
    );
    if (!redeemed.rows.length) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Koodhkan horaa loo isticmaalay' }); }

    const paymentId = uuidv4();
    await client.query(
      `INSERT INTO payments (id, user_id, plan_id, amount_usd, provider, phone, status, confirmed_at,
        plan_name_snapshot, plan_description_snapshot, duration_h_snapshot, mikrotik_profile_snapshot, currency_snapshot, activation_status)
       VALUES ($1,$2,$3,$4,'voucher',$5,'success',NOW(),$6,$7,$8,$9,$10,'pending')`,
      [paymentId, userId, voucher.plan_id, 0, phone || req.user.phone, voucher.plan_name,
        voucher.description, voucher.duration_h, voucher.mikrotik_profile, voucher.currency]
    );
    await client.query('COMMIT');
    client.release();
    client = null;

    const plan = {
      id: voucher.plan_id,
      duration_h: voucher.duration_h,
      mikrotik_profile: voucher.mikrotik_profile,
    };

    const session = await activateSession({
      userId,
      plan,
      paymentId,
      phone: phone || req.user.phone,
      macAddress,
    });

    res.json({
      message: `Voucher la isticmaalay — ${voucher.plan_name} waa firfircoon tahay`,
      session,
    });
  } catch (err) { if (client) { await client.query('ROLLBACK').catch(() => {}); client.release(); } next(err); }
});

router.post('/generate', authMiddleware, adminOnly, async (req, res, next) => {
  try {
    const { planId, count = 10 } = req.body;

    if (!Number.isInteger(Number(planId)) || Number(planId) < 1) return res.status(400).json({ error: 'planId ayaa looga baahan yahay' });
    if (!Number.isInteger(Number(count)) || Number(count) < 1 || Number(count) > 500) return res.status(400).json({ error: 'Count aan ka badnayn 500' });

    const codes = [];
    for (let i = 0; i < count; i++) {
      const code = generateCode();
      await query(
        'INSERT INTO vouchers (id, code, plan_id) VALUES ($1,$2,$3)',
        [uuidv4(), code, planId]
      );
      codes.push(code);
    }

    res.json({ message: `${count} voucher la sameeyey`, codes });
  } catch (err) { next(err); }
});

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(10);
  let code = '';
  for (let i = 0; i < 10; i++) {
    if (i === 5) code += '-';
    code += chars[bytes[i] % chars.length];
  }
  return code;
}

module.exports = router;
