/**
 * routes/pay.js
 *
 * POST /api/pay/:provider   — initiate a payment (evc | zaad | sahal)
 * POST /api/pay/webhook     — payment callback from provider
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../db');
const { chargeProvider, verifyWebhookSignature } = require('../services/payment');
const { activateSession } = require('../services/session');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// ── GET /api/pay/plans — list available plans ─────────────────────────────────
router.get('/plans', async (_req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM plans ORDER BY duration_h ASC');
    res.json(rows);
  } catch (err) { next(err); }
});

// ── POST /api/pay/:provider — initiate payment ────────────────────────────────
router.post('/:provider', authMiddleware, async (req, res, next) => {
  try {
    const { provider } = req.params;
    const { planId, phone, macAddress } = req.body;
    const userId = req.user.userId;

    if (!['evc', 'zaad', 'sahal'].includes(provider))
      return res.status(400).json({ error: 'Provider aan la garanayn' });

    if (!planId || !phone)
      return res.status(400).json({ error: 'planId iyo telefoon ayaa looga baahan yahay' });

    const planRes = await query('SELECT * FROM plans WHERE id = $1', [planId]);
    if (!planRes.rows.length)
      return res.status(404).json({ error: 'Qorshahaasi lama helin' });

    const plan = planRes.rows[0];
    const reference = uuidv4();

    const payRes = await query(
      `INSERT INTO payments (id, user_id, plan_id, amount_usd, provider, phone, status)
       VALUES ($1,$2,$3,$4,$5,$6,'pending') RETURNING id`,
      [reference, userId, plan.id, plan.price_usd, provider, phone]
    );
    const paymentId = payRes.rows[0].id;

    const result = await chargeProvider(provider, {
      phone,
      amountUSD: plan.price_usd,
      reference: paymentId,
      description: `SomaliNet ${plan.name} - ${plan.duration_h}h`,
    });

    if (!result.success) {
      await query("UPDATE payments SET status='failed' WHERE id=$1", [paymentId]);
      return res.status(502).json({ error: result.message });
    }

    await query(
      'UPDATE payments SET provider_ref=$1 WHERE id=$2',
      [result.transactionId, paymentId]
    );

    if (result.confirmed) {
      const session = await activateSession({ userId, plan, paymentId, phone, macAddress });
      await query("UPDATE payments SET status='success', confirmed_at=NOW() WHERE id=$1", [paymentId]);
      return res.json({
        message: 'Lacagta la qaatay — xididdaadu waa firfircoon tahay',
        session,
        paymentId,
      });
    }

    res.json({
      message: 'Codsiga lacagta waa la diray — sugnaanshaha awaiting',
      paymentId,
      reference: result.transactionId,
    });
  } catch (err) { next(err); }
});

router.post('/webhook', async (req, res, next) => {
  try {
    const sig = req.headers['x-webhook-signature'];
    if (sig && !verifyWebhookSignature(req.body, sig)) {
      return res.status(401).json({ error: 'Saxiixka webhook waa khalad' });
    }

    const body = req.body;
    const paymentId = body.reference || body.invoiceNo || body.ref;
    const status = body.status || body.responseStatus || body.code;
    const txnId = body.transactionId || body.txnId || body.transId;

    if (!paymentId) return res.status(400).json({ error: 'reference maa jiro' });

    const { rows } = await query(
      `SELECT p.*, pl.duration_h, pl.mikrotik_profile, pl.name AS plan_name,
              pl.id AS plan_id
       FROM payments p JOIN plans pl ON pl.id = p.plan_id
       WHERE p.id = $1`,
      [paymentId]
    );

    if (!rows.length) return res.status(404).json({ error: 'Payment lama helin' });
    const payment = rows[0];

    if (payment.status === 'success') {
      return res.json({ message: 'Already processed' });
    }

    const isSuccess = ['success', 'SUCCESS', '0', '00', 200].includes(status);

    if (isSuccess) {
      if (txnId) {
        await query('UPDATE payments SET provider_ref=$1 WHERE id=$2', [txnId, paymentId]);
      }
      await query("UPDATE payments SET status='success', confirmed_at=NOW() WHERE id=$1", [paymentId]);

      const plan = {
        id: payment.plan_id,
        duration_h: payment.duration_h,
        mikrotik_profile: payment.mikrotik_profile,
      };

      await activateSession({
        userId: payment.user_id,
        plan,
        paymentId: payment.id,
        phone: payment.phone,
      });

      console.log(`[Webhook] Session activated for payment ${paymentId}`);
    } else {
      await query("UPDATE payments SET status='failed' WHERE id=$1", [paymentId]);
      console.log(`[Webhook] Payment failed: ${paymentId}`);
    }

    res.json({ received: true });
  } catch (err) { next(err); }
});

module.exports = router;
