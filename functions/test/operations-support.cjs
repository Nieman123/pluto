const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { harness } = require('./ticketing-harness.cjs');
const { hash } = require('../lib/ticketing/domain');
const { recordDelivery } = require('../lib/ticketing/delivery');

test('manager contact corrections preserve ownership, transfers and finances; old links are replaced', async () => {
  const h = harness();
  try {
    const eid = await h.event(d => { d.startAt = d.admissionStartsAt = new Date(Date.now() + 3600000).toISOString(); d.offers.forEach(o => { o.validFrom = d.admissionStartsAt; }); }), raw = h.request(eid, { items: [{ offerId: 'weekend', quantity: 2 }] });
    const { orderId } = await h.service.checkout(raw, null); await h.pay(orderId);
    const original = await h.service.view(orderId, raw.accessKey, null), before = (await h.service.order(orderId).get()).data();
    await h.service.transfer(orderId, raw.accessKey, null, original.tickets[1].id, 'friend@example.test');
    const transfer = (await h.db.collection('ticketingEmailJobs').where('orderId', '==', orderId).get()).docs.find(d => d.data().type === 'transfer').data();
    await h.service.acceptTransfer(transfer.token, null);
    await h.service.recover(raw.email);
    const recovery = (await h.db.collection('ticketingEmailJobs').where('orderId', '==', orderId).get()).docs.find(d => d.data().type === 'recovery').data();
    await assert.rejects(() => h.service.correctOrder(orderId, { revision: 0, name: 'Fixed', email: 'fixed@example.test', note: 'Verified typo' }, 'not-manager'), /access/);
    await h.service.correctOrder(orderId, { revision: 0, name: 'Fixed Guest', email: 'fixed@example.test', note: 'Verified buyer identity' }, h.staff);
    await assert.rejects(() => h.service.view(orderId, raw.accessKey, null), /secure order link/);
    await assert.rejects(() => h.service.acceptRecovery(recovery.token), /replaced/);
    const after = (await h.service.order(orderId).get()).data();
    for (const key of ['ownerUid', 'total', 'units', 'consumption', 'paymentIntentId', 'refundedAmount']) assert.deepEqual(after[key], before[key]);
    assert.equal((await h.service.tickets().doc(original.tickets[0].id).get()).data().holderEmail, 'fixed@example.test');
    assert.equal((await h.service.scan(eid, original.tickets[0].qr, randomUUID(), h.staff)).result, 'invalid', 'a pass exposed to the old contact must no longer admit');
    assert.equal((await h.service.tickets().doc(original.tickets[1].id).get()).data().holderEmail, 'friend@example.test');
    await h.service.supportResend(orderId, { note: 'Send corrected receipt' }, h.staff);
    const job = (await h.db.collection('ticketingEmailJobs').where('orderId', '==', orderId).get()).docs.find(d => d.id.startsWith('support_')).data();
    const access = await h.service.acceptRecovery(job.token);
    assert.equal((await h.service.view(orderId, access.accessKey, null)).tickets.filter(t => t.qr).length, 1);
    assert.equal((await h.service.staffOrder(orderId, h.staff)).activity.filter(a => a.action === 'order-contact-corrected').length, 1);
    await assert.rejects(() => h.service.correctOrder(orderId, { revision: 0, name: 'Old edit', email: 'other@example.test', note: 'stale' }, h.staff), /changed/);
  } finally { await h.cleanup(); }
});

test('RSVP email proof is single-use, limited, and reopen needs new approval and QR version', async () => {
  const h = harness();
  try {
    const eid = await h.event(d => { d.registrationMode = 'rsvp-approval'; d.offers = [{ ...d.offers[0], unitAmount: 0, maxPerOrder: 1 }]; });
    const raw = h.request(eid);
    await assert.rejects(() => h.service.rsvp(raw, null), /Verify/);
    const verification = await h.service.requestRsvpVerification(raw, null);
    const code = (await h.db.collection('ticketingEmailJobs').doc(`verify_${hash(verification.verificationToken)}`).get()).data().code;
    await assert.rejects(() => h.service.rsvp({ ...raw, ...verification, verificationCode: code === '000000' ? '111111' : '000000' }, null), /invalid/);
    assert.equal((await h.db.collection('ticketingRsvpVerification').doc(hash(verification.verificationToken)).get()).data().attempts, 1);
    const proof = { ...raw, ...verification, verificationCode: code }, result = await h.service.rsvp(proof, null);
    assert.equal(result.rsvpStatus, 'pending'); assert.equal((await h.service.view(result.orderId, raw.accessKey, null)).tickets.length, 0);
    await assert.rejects(() => h.service.rsvp({ ...proof, accessKey: h.newKey() }, null), /invalid/);
    await h.service.reviewRsvp(eid, result.orderId, 'approve', '', h.staff);
    const first = (await h.service.view(result.orderId, raw.accessKey, null)).tickets[0];
    await h.service.withdrawRsvp(eid, result.orderId, h.staff);
    await h.service.reopenRsvp(eid, result.orderId, { revision: 0, note: 'Guest can attend again' }, h.staff);
    assert.equal((await h.service.view(result.orderId, raw.accessKey, null)).tickets[0].qr, null);
    await h.service.reviewRsvp(eid, result.orderId, 'approve', '', h.staff);
    const next = (await h.service.view(result.orderId, raw.accessKey, null)).tickets[0];
    assert.notEqual(next.qr, first.qr);
    assert.equal((await h.service.scan(eid, first.qr, randomUUID(), h.staff)).result, 'invalid');
    assert.equal((await h.service.scan(eid, next.qr, randomUUID(), h.staff)).result, 'accepted');
    const sold = (await h.service.event(eid).collection('pools').doc('friday').get()).data().sold; assert.equal(sold, 1);
  } finally { await h.cleanup(); }
});

test('delivery events survive webhook/send races and health exposes bounded, permission-checked alerts', async () => {
  const h = harness(), messageId = randomUUID();
  try {
    const eid = await h.event(), raw = h.request(eid), result = await h.service.checkout(raw, null); await h.pay(result.orderId);
    const jobId = `receipt_${result.orderId}`, job = h.db.collection('ticketingEmailJobs').doc(jobId);
    await recordDelivery(h.db, `${messageId}-bounce`, { type: 'email.bounced', created_at: new Date().toISOString(), data: { email_id: messageId } });
    const oldFetch = global.fetch; process.env.RESEND_API_KEY = 'fake-provider-key';
    global.fetch = async () => ({ ok: true, json: async () => ({ id: messageId }) });
    try { await h.service.emailJob(jobId); } finally { global.fetch = oldFetch; }
    assert.equal((await job.get()).data().deliveryStatus, 'bounced');
    await recordDelivery(h.db, `${messageId}-delivered`, { type: 'email.delivered', created_at: new Date().toISOString(), data: { email_id: messageId } });
    assert.equal((await job.get()).data().deliveryStatus, 'bounced');
    await h.service.tickets().doc((await h.service.view(result.orderId, raw.accessKey, null)).tickets[0].id).delete();
    await assert.rejects(() => h.service.health('non-admin', true), /Administrator/);
    const health = await h.service.health(h.staff, true);
    assert.ok(health.issues.some(i => i.kind === 'email-review' && i.jobId === jobId));
    assert.ok(health.issues.some(i => i.kind === 'issuance' && i.orderId === result.orderId));
    assert.ok(health.issues.some(i => i.kind === 'maintenance'));
    await assert.rejects(() => h.service.retryHealth({ kind: 'email', jobId }, h.staff), /Do not retry/);
    assert.ok(!JSON.stringify(health).includes(raw.email));
    await h.db.collection('ticketingHealth').doc('maintenance').set({ completedAt: Date.now(), summary: { errors: 2 } });
    assert.ok((await h.service.health(h.staff, true)).issues.some(i => i.id === 'maintenance-errors'), 'a recent heartbeat must not hide failed operations');
  } finally {
    await h.db.collection('ticketingHealth').doc('maintenance').delete();
    for (const doc of (await h.db.collection('ticketingEmailDelivery').where('providerMessageId', '==', messageId).get()).docs) await doc.ref.delete();
    await h.cleanup();
  }
});
