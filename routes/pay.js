/**
 * routes/pay.js
 *
 * POST /api/pay/:provider   — initiate a payment (evc | zaad | sahal)
 * POST /api/pay/webhook     — payment callback from provider
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { pool } = require('../db');
const { query } = require('../db');
const { chargeProvider, verifyWebhookSignature } = require('../services/payment');
const { activateSession } = require('../services/session');
const { authMiddleware, customerOnly } = require('../middleware/auth');

const router = express.Router();

// ── GET /api/pay/plans — list available plans ─────────────────────────────────
router.get('/plans', async (_req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM plans WHERE active = TRUE ORDER BY duration_h ASC');
    res.json(rows);
  } catch (err) { next(err); }
});

// ── POST /api/pay/:provider — initiate payment ────────────────────────────────
router.post('/:provider(evc|zaad|sahal)', authMiddleware, customerOnly, async (req, res, next) => {
  let client;
  try {
    const provider = String(req.params.provider || '').toLowerCase();
    const { planId, phone, macAddress } = req.body || {};
    const userId = req.user.userId;

    if (!['evc', 'zaad', 'sahal'].includes(provider))
      return res.status(400).json({ error: 'Provider aan la garanayn' });

    if (!Number.isInteger(Number(planId)) || !phone)
      return res.status(400).json({ error: 'planId iyo telefoon ayaa looga baahan yahay' });

    const normalizedPhone = String(phone).replace(/\D/g, '');
    if (!/^\d{7,20}$/.test(normalizedPhone)) return res.status(400).json({ error: 'Lambarka telefoonka waa khalad' });

    const planRes = await query('SELECT * FROM plans WHERE id = $1 AND active = TRUE', [Number(planId)]);
    if (!planRes.rows.length)
      return res.status(404).json({ error: 'Qorshahaasi lama helin' });

    const plan = planRes.rows[0];
    if (String(plan.currency || '').toUpperCase() !== 'USD') return res.status(400).json({ error: 'This payment provider currently supports USD packages only' });
    const reference = uuidv4();
    client = await pool.connect();
    await client.query('BEGIN');
    const payRes = await client.query(
      `INSERT INTO payments
      (id, user_id, plan_id, amount_usd, provider, phone, status, plan_name_snapshot,
       plan_description_snapshot, duration_h_snapshot, currency_snapshot, mikrotik_profile_snapshot)
       VALUES ($1,$2,$3,$4,$5,$6,'pending',$7,$8,$9,$10,$11) RETURNING id`,
      [reference, userId, plan.id, plan.price_usd, provider, normalizedPhone, plan.name,
        plan.description, plan.duration_h, plan.currency, plan.mikrotik_profile]
    );
    await client.query('COMMIT');
    client.release();
    client = null;
    const paymentId = payRes.rows[0].id;

    const result = await chargeProvider(provider, {
      phone: normalizedPhone,
      amountUSD: plan.price_usd,
      reference: paymentId,
      description: `SomaliNet ${plan.name} - ${plan.duration_h}h`,
    });

    if (result.status === 'failed') {
      await query("UPDATE payments SET status='failed' WHERE id=$1 AND status='pending'", [paymentId]);
      return res.status(502).json({ error: result.message });
    }

    await query('UPDATE payments SET provider_ref=$1, status=$2 WHERE id=$3 AND status=\'pending\'', [result.transactionId || null, result.status === 'unknown' ? 'unknown' : 'pending', paymentId]);

    res.status(result.status === 'unknown' ? 202 : 202).json({
      message: result.status === 'unknown' ? 'Payment status is unknown; no access was activated' : 'Codsiga lacagta waa la diray — sugnaanshaha awaiting',
      paymentId,
      reference: result.transactionId,
    });
  } catch (err) { if (client) { await client.query('ROLLBACK').catch(() => {}); client.release(); } next(err); }
});

// ── POST /api/pay/webhook — verified provider callback ───────────────────────
router.post('/webhook', async (req, res, next) => {
  let client;
  try {
    const provider = String(req.headers['x-payment-provider'] || '').toLowerCase();
    const signature = req.headers['x-webhook-signature'];
    if (!['evc', 'zaad', 'sahal'].includes(provider) || !signature || !verifyWebhookSignature(provider, req.rawBody, signature)) return res.status(401).json({ error: 'Webhook verification failed' });

    const body = req.body || {};
    const paymentId = String(body.reference || body.invoiceNo || body.ref || '');
    const txnId = String(body.transactionId || body.txnId || body.transId || '');
    const status = String(body.status || body.responseStatus || body.code || '').toLowerCase();
    const merchant = String(body.merchantId || body.merchant || body.merchant_id || '');
    const configuredMerchant = String(process.env[`${provider.toUpperCase()}_MERCHANT_ID`] || '');
    const amount = Number(body.amount);
    const currency = String(body.currency || '').toUpperCase();
    if (!paymentId || !txnId || !merchant || !configuredMerchant || merchant !== configuredMerchant || !Number.isFinite(amount) || !currency) return res.status(400).json({ error: 'Webhook payment fields are invalid' });

    client = await pool.connect();
    await client.query('BEGIN');
    const { rows } = await client.query('SELECT * FROM payments WHERE id=$1 FOR UPDATE', [paymentId]);
    if (!rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Payment lama helin' }); }
    const payment = rows[0];
    if (payment.provider !== provider || Number(payment.amount_usd) !== amount || String(payment.currency_snapshot).toUpperCase() !== currency) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Webhook does not match the payment record' }); }
    if (payment.status === 'success') { await client.query('ROLLBACK'); return res.json({ message: 'Already processed' }); }
    const existingTransaction = await client.query('SELECT id FROM payments WHERE provider=$1 AND provider_ref=$2 AND id<>$3', [provider, txnId, paymentId]);
    if (existingTransaction.rows.length) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Transaction has already been processed' }); }
    if (['failed', 'failure', 'cancelled', 'canceled', 'declined', 'rejected'].includes(status)) {
      await client.query("UPDATE payments SET status='failed' WHERE id=$1 AND status IN ('pending','unknown')", [paymentId]);
      await client.query('COMMIT');
      return res.json({ received: true, status: 'failed' });
    }
    if (!['success', 'completed', 'paid', '0', '00'].includes(status)) {
      await client.query("UPDATE payments SET status='unknown' WHERE id=$1 AND status='pending'", [paymentId]);
      await client.query('COMMIT');
      return res.status(202).json({ received: true, status: 'unknown' });
    }
    const updated = await client.query("UPDATE payments SET status='success', provider_ref=$1, confirmed_at=COALESCE(confirmed_at,NOW()), activation_status='pending', activation_error=NULL WHERE id=$2 AND status IN ('pending','unknown') RETURNING *", [txnId, paymentId]);
    await client.query('COMMIT');
    client.release();
    client = null;
    if (!updated.rows.length) return res.json({ message: 'Already processed' });

    const confirmed = updated.rows[0];
    const plan = { id: confirmed.plan_id, duration_h: confirmed.duration_h_snapshot, mikrotik_profile: confirmed.mikrotik_profile_snapshot };
    try {
      const session = await activateSession({ userId: confirmed.user_id, plan, paymentId: confirmed.id, phone: confirmed.phone });
      await query("UPDATE payments SET activation_status='activated', activation_error=NULL WHERE id=$1 AND status='success'", [paymentId]);
      return res.json({ received: true, status: 'success', session });
    } catch (activationError) {
      await query("UPDATE payments SET activation_status='failed', activation_error=$1 WHERE id=$2 AND status='success'", ['Router activation failed; retry is required', paymentId]);
      return res.status(202).json({ received: true, status: 'success', activationPending: true });
    }
  } catch (err) { if (client) { await client.query('ROLLBACK').catch(() => {}); client.release(); } next(err); }
});

module.exports = router;
