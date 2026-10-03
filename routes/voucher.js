/**
 * routes/voucher.js
 *
 * POST /api/voucher/redeem   — customer redeems a code
 * POST /api/voucher/generate — admin generates batch of vouchers
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../db');
const { activateSession } = require('../services/session');
const { authMiddleware, adminOnly } = require('../middleware/auth');

const router = express.Router();

router.post('/redeem', authMiddleware, async (req, res, next) => {
  try {
    const { code, phone, macAddress } = req.body;
    const userId = req.user.userId;

    if (!code) return res.status(400).json({ error: 'Koodhka voucher ayaa looga baahan yahay' });

    const { rows } = await query(
      `SELECT v.*, p.id AS plan_id, p.duration_h, p.mikrotik_profile, p.name AS plan_name
       FROM vouchers v JOIN plans p ON p.id = v.plan_id
       WHERE v.code = $1`,
      [code.toUpperCase()]
    );

    if (!rows.length) return res.status(404).json({ error: 'Koodhkan lama helin' });

    const voucher = rows[0];
    if (voucher.redeemed) return res.status(409).json({ error: 'Koodhkan horaa loo isticmaalay' });

    await query(
      'UPDATE vouchers SET redeemed=TRUE, redeemed_by=$1, redeemed_at=NOW() WHERE id=$2',
      [userId, voucher.id]
    );

    const paymentId = uuidv4();
    await query(
      `INSERT INTO payments (id, user_id, plan_id, amount_usd, provider, phone, status, confirmed_at)
       VALUES ($1,$2,$3,$4,'voucher',$5,'success',NOW())`,
      [paymentId, userId, voucher.plan_id, 0, phone || req.user.phone]
    );

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
  } catch (err) { next(err); }
});

router.post('/generate', authMiddleware, adminOnly, async (req, res, next) => {
  try {
    const { planId, count = 10 } = req.body;

    if (!planId) return res.status(400).json({ error: 'planId ayaa looga baahan yahay' });
    if (count > 500) return res.status(400).json({ error: 'Count aan ka badnayn 500' });

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
  let code = '';
  for (let i = 0; i < 10; i++) {
    if (i === 5) code += '-';
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

module.exports = router;
