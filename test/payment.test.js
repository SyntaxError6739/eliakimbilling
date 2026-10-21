const test = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const { chargeProvider, verifyWebhookSignature } = require('../services/payment');

test('webhook signatures fail closed when provider mode is disabled', () => {
  const previousMode = process.env.EVC_WEBHOOK_MODE;
  const previousSecret = process.env.EVC_WEBHOOK_SECRET;
  delete process.env.EVC_WEBHOOK_MODE;
  process.env.EVC_WEBHOOK_SECRET = 'test-secret';
  assert.equal(verifyWebhookSignature('evc', Buffer.from('{"ok":true}'), '00'.repeat(32)), false);
  if (previousMode === undefined) delete process.env.EVC_WEBHOOK_MODE;
  else process.env.EVC_WEBHOOK_MODE = previousMode;
  if (previousSecret === undefined) delete process.env.EVC_WEBHOOK_SECRET;
  else process.env.EVC_WEBHOOK_SECRET = previousSecret;
});

test('webhook verifier rejects malformed and unconfigured provider signatures', () => {
  const raw = Buffer.from('{"amount":"1.00"}');
  assert.equal(verifyWebhookSignature('evc', raw, 'not-a-signature'), false);
  assert.equal(verifyWebhookSignature('zaad', raw, '00'.repeat(32)), false);
  assert.equal(verifyWebhookSignature('sahal', raw, 'sha256=00'.repeat(32)), false);
});

test('accepted provider requests remain pending, while timeouts are unknown', async () => {
  const originalPost = axios.post;
  try {
    axios.post = async () => ({ data: { responseCode: '0', transactionId: 'tx-1' } });
    const pending = await chargeProvider('evc', { phone: '700000000', amountUSD: '1.00', reference: 'ref-1', description: 'test' });
    assert.equal(pending.status, 'pending');
    assert.equal(pending.success, true);
    assert.equal(pending.transactionId, 'tx-1');

    axios.post = async () => { throw new Error('timeout'); };
    const unknown = await chargeProvider('evc', { phone: '700000000', amountUSD: '1.00', reference: 'ref-2', description: 'test' });
    assert.equal(unknown.status, 'unknown');
    assert.equal(unknown.success, false);
  } finally {
    axios.post = originalPost;
  }
});
