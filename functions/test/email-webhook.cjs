const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
// This test process owns a disposable signing secret; never load application keys.
process.env.TICKETING_RESEND_WEBHOOK_ENABLED = 'true';
process.env.RESEND_WEBHOOK_SECRET = `whsec_${randomBytes(32).toString('base64')}`;
const { Webhook } = require('svix');
const express = require('express');
const { harness } = require('./ticketing-harness.cjs');
const { ticketingRouter } = require('../lib/ticketing/routes');

test('Resend webhook verifies raw signatures, rejects tampering and expired signatures, and deduplicates delivery', async () => {
  const h = harness(), messageId = randomUUID(), jobId = `webhook_${randomUUID()}`;
  try {
    await h.db.collection('ticketingEmailJobs').doc(jobId).set({ providerMessageId: messageId, status: 'sent', deliveryStatus: 'sent' });
    for (const parsedByFirebase of [false, true]) {
      const app = express();
      if (parsedByFirebase) app.use(express.json({ verify: (req, _res, body) => { req.rawBody = body; } }));
      app.use(ticketingRouter(() => ({}), h.service));
      const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
      try {
        const endpoint = `http://127.0.0.1:${server.address().port}/tickets/email-webhook`, eid = randomUUID();
        const body = JSON.stringify({ type: 'email.delivered', created_at: new Date().toISOString(), data: { email_id: messageId } });
        const headers = (date = new Date()) => ({ 'Content-Type': 'application/json', 'svix-id': eid, 'svix-timestamp': String(Math.floor(date.getTime() / 1000)), 'svix-signature': new Webhook(process.env.RESEND_WEBHOOK_SECRET).sign(eid, date, body) });
        assert.equal((await fetch(endpoint, { method: 'POST', headers: headers(), body: body.replace('delivered', 'bounced') })).status, 400);
        assert.equal((await fetch(endpoint, { method: 'POST', headers: headers(new Date(Date.now() - 3600000)), body })).status, 400);
        for (let attempt = 0; attempt < 2; attempt++) assert.equal((await fetch(endpoint, { method: 'POST', headers: headers(), body })).status, 200);
      } finally { await new Promise(resolve => server.close(resolve)); }
    }
    assert.equal((await h.db.collection('ticketingEmailJobs').doc(jobId).get()).data().deliveryStatus, 'delivered');
    assert.equal((await h.db.collection('ticketingEmailDelivery').where('providerMessageId', '==', messageId).get()).size, 2);
  } finally {
    await h.db.collection('ticketingEmailJobs').doc(jobId).delete();
    for (const doc of (await h.db.collection('ticketingEmailDelivery').where('providerMessageId', '==', messageId).get()).docs) await doc.ref.delete();
    await h.cleanup();
  }
});
