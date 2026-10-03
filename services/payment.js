const axios = require('axios');
const crypto = require('crypto');

async function chargeEVC({ phone, amountUSD, reference, description }) {
  try {
    const res = await axios.post(
      `${process.env.EVC_API_URL}/payment/charge`,
      {
        merchantId: process.env.EVC_MERCHANT_ID,
        phone: phone.replace(/\D/g, ''),
        amount: amountUSD.toFixed(2),
        currency: 'USD',
        reference,
        description,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.EVC_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      }
    );

    const { data } = res;
    if (data.responseCode === '0' || data.status === 'success') {
      return { success: true, transactionId: data.transactionId, message: 'EVC charge initiated' };
    }
    return { success: false, transactionId: null, message: data.responseDesc || 'EVC charge failed' };
  } catch (err) {
    console.error('[EVC] Error:', err.message);
    return { success: false, transactionId: null, message: 'EVC service unavailable' };
  }
}

async function chargeZaad({ phone, amountUSD, reference, description }) {
  try {
    const res = await axios.post(
      `${process.env.ZAAD_API_URL}/pay`,
      {
        merchantId: process.env.ZAAD_MERCHANT_ID,
        msisdn: phone.replace(/\D/g, ''),
        amount: amountUSD.toFixed(2),
        invoiceNo: reference,
        description,
      },
      {
        headers: {
          apiKey: process.env.ZAAD_API_KEY,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      }
    );

    const { data } = res;
    if (data.status === 'SUCCESS' || data.code === 200) {
      return { success: true, transactionId: data.txnId, message: 'Zaad charge initiated' };
    }
    return { success: false, transactionId: null, message: data.message || 'Zaad charge failed' };
  } catch (err) {
    console.error('[Zaad] Error:', err.message);
    return { success: false, transactionId: null, message: 'Zaad service unavailable' };
  }
}

async function chargeSahal({ phone, amountUSD, reference, description }) {
  try {
    const res = await axios.post(
      `${process.env.SAHAL_API_URL}/transaction/push`,
      {
        merchant: process.env.SAHAL_MERCHANT_ID,
        phone: phone.replace(/\D/g, ''),
        amount: amountUSD.toFixed(2),
        ref: reference,
        narration: description,
      },
      {
        headers: {
          'x-api-key': process.env.SAHAL_API_KEY,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      }
    );

    const { data } = res;
    if (data.success || data.responseStatus === '00') {
      return { success: true, transactionId: data.transId, message: 'Sahal charge initiated' };
    }
    return { success: false, transactionId: null, message: data.responseMessage || 'Sahal charge failed' };
  } catch (err) {
    console.error('[Sahal] Error:', err.message);
    return { success: false, transactionId: null, message: 'Sahal service unavailable' };
  }
}

function verifyWebhookSignature(payload, signature) {
  const expected = crypto
    .createHmac('sha256', process.env.WEBHOOK_SECRET)
    .update(JSON.stringify(payload))
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(expected, 'hex'),
    Buffer.from(signature, 'hex')
  );
}

async function chargeProvider(provider, opts) {
  switch (provider) {
    case 'evc': return chargeEVC(opts);
    case 'zaad': return chargeZaad(opts);
    case 'sahal': return chargeSahal(opts);
    default: return { success: false, transactionId: null, message: 'Unknown provider' };
  }
}

module.exports = { chargeProvider, verifyWebhookSignature };
