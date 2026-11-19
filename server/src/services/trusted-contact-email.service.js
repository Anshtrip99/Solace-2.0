const crypto = require('crypto');
const TrustedContactNotification = require('../models/TrustedContactNotification');

const hashKey = value => crypto.createHash('sha256').update(value).digest('hex');
const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));

const sendTrustedContactEmail = async ({ userId, chatId, recipientEmail, userName, riskLevel }) => {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.TRUSTED_CONTACT_FROM_EMAIL;
  if (!apiKey || !from) return { status: 'not_configured' };

  const normalizedEmail = String(recipientEmail || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) return { status: 'invalid_email' };

  const dedupeKey = hashKey(`${userId}:${chatId || 'unthreaded'}:${normalizedEmail}`);
  const identity = { userId, chatId: chatId || null, recipientEmail: normalizedEmail, riskLevel, dedupeKey };
  let alert;
  try {
    alert = await TrustedContactNotification.findOneAndUpdate(
      { dedupeKey, $or: [{ status: 'failed' }, { status: 'sending', updatedAt: { $lt: new Date(Date.now() - 10 * 60 * 1000) } }] },
      { $set: { status: 'sending', failureCode: '', providerMessageId: '' }, $setOnInsert: identity },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    );
  } catch (error) {
    if (error.code !== 11000) {
      console.error('Could not claim trusted-contact email notification');
      return { status: 'failed' };
    }
    alert = await TrustedContactNotification.findOne({ dedupeKey });
    if (alert?.status === 'sent') return { status: 'already_sent' };
    if (alert?.status === 'sending') return { status: 'pending' };
    return { status: 'failed' };
  }

  const safeName = String(userName || 'Someone who trusts you').trim().slice(0, 80);
  const safeRisk = riskLevel === 'crisis' ? 'crisis-level' : 'high-level';
  const occurredAt = new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });
  const text = [
    `Hello,`,
    '',
    `${safeName} listed you as a trusted contact and chose to have Solace email you if a serious safety concern is detected. Solace detected a ${safeRisk} concern at ${occurredAt} IST.`,
    '',
    'Please check in with them directly if you can. Their message and private conversation have not been included in this email.',
    '',
    'This automated email is not monitored. If you believe someone is in immediate danger, contact local emergency services.',
    '',
    '— Solace Support'
  ].join('\n');
  const html = `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#202124;max-width:600px;margin:auto"><h2 style="color:#6b8f71">A trusted person may need your support</h2><p>${escapeHtml(safeName)} listed you as a trusted contact and chose to have Solace email you if a serious safety concern is detected.</p><p>Solace detected a <strong>${safeRisk}</strong> concern at ${escapeHtml(occurredAt)} IST.</p><p>Please check in with them directly if you can. Their message and private conversation have not been included in this email.</p><p style="color:#5f6368;font-size:13px">This automated email is not monitored. If you believe someone is in immediate danger, contact local emergency services.</p><p>— Solace Support</p></div>`;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': dedupeKey,
      },
      body: JSON.stringify({ from, to: [normalizedEmail], subject: 'A trusted person may need your support', text, html }),
      signal: AbortSignal.timeout(10000),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      await TrustedContactNotification.findByIdAndUpdate(alert._id, { status: 'failed', failureCode: `provider_${response.status}` });
      console.error(`Trusted-contact email provider returned HTTP ${response.status}`);
      return { status: 'failed' };
    }
    await TrustedContactNotification.findByIdAndUpdate(alert._id, { status: 'sent', providerMessageId: result.id || '', sentAt: new Date(), failureCode: '' });
    return { status: 'sent' };
  } catch (error) {
    await TrustedContactNotification.findByIdAndUpdate(alert._id, { status: 'failed', failureCode: error.name === 'TimeoutError' ? 'provider_timeout' : 'provider_unavailable' });
    console.error('Trusted-contact email could not be delivered by the configured provider');
    return { status: 'failed' };
  }
};

module.exports = { sendTrustedContactEmail };
