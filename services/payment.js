const axios = require('axios');

async function chargeEVC({ phone, amountUSD, reference, description }) {
  try {
    const res = await axios.post(
      `${process.env.EVC_API_URL}/payment/charge`,
      {
        merchantId: process.env.EVC_MERCHANT_ID,
        phone: phone.replace(/\D/g, ''),
        amount: Number(amountUSD).toFixed(2),
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
      return { status: 'pending', success: true, transactionId: data.transactionId || null, message: 'EVC charge initiated' };
    }
    return { status: 'failed', success: false, transactionId: data.transactionId || null, message: data.responseDesc || 'EVC charge failed' };
  } catch (err) {
    console.error('[EVC] service request failed');
    return { status: 'unknown', success: false, transactionId: null, message: 'EVC service unavailable' };
  }
}

async function chargeZaad({ phone, amountUSD, reference, description }) {
  try {
    const res = await axios.post(
      `${process.env.ZAAD_API_URL}/pay`,
      {
        merchantId: process.env.ZAAD_MERCHANT_ID,
        msisdn: phone.replace(/\D/g, ''),
        amount: Number(amountUSD).toFixed(2),
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
      return { status: 'pending', success: true, transactionId: data.txnId || null, message: 'Zaad charge initiated' };
    }
    return { status: 'failed', success: false, transactionId: data.txnId || null, message: data.message || 'Zaad charge failed' };
  } catch (err) {
    console.error('[Zaad] service request failed');
    return { status: 'unknown', success: false, transactionId: null, message: 'Zaad service unavailable' };
  }
}

async function chargeSahal({ phone, amountUSD, reference, description }) {
  try {
    const res = await axios.post(
      `${process.env.SAHAL_API_URL}/transaction/push`,
      {
        merchant: process.env.SAHAL_MERCHANT_ID,
        phone: phone.replace(/\D/g, ''),
        amount: Number(amountUSD).toFixed(2),
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
      return { status: 'pending', success: true, transactionId: data.transId || null, message: 'Sahal charge initiated' };
    }
    return { status: 'failed', success: false, transactionId: data.transId || null, message: data.responseMessage || 'Sahal charge failed' };
  } catch (err) {
    console.error('[Sahal] service request failed');
    return { status: 'unknown', success: false, transactionId: null, message: 'Sahal service unavailable' };
  }
}

function verifyWebhookSignature(provider, rawBody, signature) {
  // EVC, Zaad, and Sahal have different undocumented callback contracts here.
  // Reject every callback until an official provider-specific adapter exists.
  return false;
}

async function chargeProvider(provider, opts) {
  switch (provider) {
    case 'evc': return chargeEVC(opts);
    case 'zaad': return chargeZaad(opts);
    case 'sahal': return chargeSahal(opts);
    default: return { status: 'failed', success: false, transactionId: null, message: 'Unknown provider' };
  }
}

module.exports = { chargeProvider, verifyWebhookSignature };
