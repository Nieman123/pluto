const test = require('node:test'), assert = require('node:assert/strict');
const { harness } = require('./ticketing-harness.cjs');
const { checkoutFollowupDelay } = require('../lib/ticketing/checkout-followup');
const { hash } = require('../lib/ticketing/domain');
const jobId = (eid, email) => `expired_${hash(JSON.stringify([eid, email]))}`;

async function expired(h, eid, overrides = {}) {
  const raw = h.request(eid, overrides), { orderId } = await h.service.checkout(raw, null);
  const order = (await h.service.order(orderId).get()).data();
  await h.fake.checkout.sessions.expire(order.sessionId); await h.service.verifySession(orderId);
  await h.service.order(orderId).update({ expiredAt: Date.now() - checkoutFollowupDelay - 1000 });
  return { raw, orderId, ref: h.db.collection('ticketingEmailJobs').doc(jobId(eid, raw.email)) };
}

test('expired checkout releases inventory, retains history and queues one branded reminder with stable provider retries', async () => {
  const h = harness(), oldFetch = global.fetch; process.env.RESEND_API_KEY = 'fake-provider-key';
  try {
    const eid = await h.event(), e = await expired(h, eid);
    const usage = (await h.service.event(eid).collection('pools').doc('friday').get()).data(); assert.equal(usage.held, 0); assert.equal(usage.sold, 0);
    assert.equal((await h.service.staffOrders(eid, h.staff)).orders[0].status, 'expired');
    assert.equal((await h.service.allOrders({ eventId: eid, status: 'expired' }, h.staff)).orders.length, 1);
    await Promise.all([h.service.checkoutFollowupMaintenance(), h.service.checkoutFollowupMaintenance()]);
    assert.equal((await e.ref.get()).data().type, 'checkout-expired');
    assert.equal((await h.db.collection('ticketingEmailJobs').where('eventId', '==', eid).get()).size, 1);
    const sends = []; global.fetch = async (url, init) => { assert.equal(url, 'https://api.resend.com/emails'); sends.push(init); return { ok: sends.length > 1, json: async () => ({ id: 'expired-message-test' }) }; };
    await h.service.emailJob(e.ref.id);
    assert.equal((await e.ref.get()).data().status, 'pending');
    const event = (await h.service.event(eid).get()).data(); await h.service.event(eid).update({ 'liveDraft.title': 'Edited after first attempt' });
    await e.ref.update({ retryAt: 0 }); await h.service.emailJob(e.ref.id);
    assert.equal((await e.ref.get()).data().status, 'sent'); assert.equal(sends.length, 2);
    assert.equal(sends[0].headers['Idempotency-Key'], sends[1].headers['Idempotency-Key']); assert.equal(sends[0].body, sends[1].body);
    const payload = JSON.parse(sends[0].body);
    assert.match(payload.html, /CHECKOUT EXPIRED/); assert.match(payload.text, /tickets are no longer held/);
    assert.ok(payload.html.includes(`/events/${event.liveDraft.slug}`));
    for (const value of ['#recovery=', 'PLUTO1.', 'client_secret', '$100.00', 'ORDER CONFIRMED']) assert.ok(!sends[0].body.includes(value));
    assert.equal((await h.service.tickets().where('eventId', '==', eid).get()).size, 0);
    assert.equal((await h.db.collection('ticketingRecovery').where('orderId', '==', e.orderId).get()).size, 0);
    await expired(h, eid); await h.service.checkoutFollowupMaintenance();
    await h.service.emailJob(e.ref.id); assert.equal(sends.length, 2, 'another expired attempt does not send another reminder');
  } finally { global.fetch = oldFetch; await h.cleanup(); }
});

test('no reminder is queued before its delay or for an obsolete attempt', async () => {
  const h = harness();
  try {
    const eid = await h.event(), e = await expired(h, eid);
    await h.service.order(e.orderId).update({ expiredAt: Date.now() });
    await h.service.checkoutFollowupMaintenance(); assert.equal((await e.ref.get()).exists, false);
    await h.service.order(e.orderId).update({ expiredAt: Date.now() - checkoutFollowupDelay - 1000 });
    const newer = await h.service.checkout(h.request(eid), null);
    await h.service.checkoutFollowupMaintenance(); assert.equal((await e.ref.get()).exists, false, 'newer open checkout suppresses old expiry');
    await h.pay(newer.orderId); await h.service.checkoutFollowupMaintenance(); assert.equal((await e.ref.get()).exists, false, 'completed purchase suppresses expiry');
  } finally { await h.cleanup(); }
});

test('delivery rechecks purchases, current checkouts, late payments and event availability', async t => {
  for (const scenario of ['paid', 'new-checkout', 'late-payment', 'cancelled', 'sold-out', 'recipient-corrected']) await t.test(scenario, async () => {
    const h = harness(), oldFetch = global.fetch; process.env.RESEND_API_KEY = 'fake-provider-key';
    try {
      const eid = await h.event(), e = await expired(h, eid); await h.service.checkoutFollowupMaintenance(); assert.equal((await e.ref.get()).data().status, 'pending');
      if (scenario === 'paid' || scenario === 'new-checkout') { const next = await h.service.checkout(h.request(eid), null); if (scenario === 'paid') await h.pay(next.orderId); }
      if (scenario === 'late-payment') await h.paidSession(e.orderId);
      if (scenario === 'cancelled') await h.service.event(eid).update({ status: 'cancelled' });
      if (scenario === 'sold-out') for (const doc of (await h.service.event(eid).collection('pools').get()).docs) await doc.ref.update({ sold: 50, held: 0 });
      if (scenario === 'recipient-corrected') await h.service.order(e.orderId).update({ email: 'corrected@example.test' });
      let sends = 0; global.fetch = async () => { sends++; throw new Error('Unexpected email delivery'); };
      await h.service.emailJob(e.ref.id); assert.equal(sends, 0); assert.equal((await e.ref.get()).data().status, 'cancelled');
      if (scenario === 'late-payment') { const order = (await h.service.order(e.orderId).get()).data(); assert.ok(order.paymentIntentId); assert.match(order.reviewReason, /Payment received after stock was released/); }
    } finally { global.fetch = oldFetch; await h.cleanup(); }
  });
});

test('an approved free RSVP permits a VIP follow-up, but withdrawing its parent cancels the email', async () => {
  const h = harness(), oldFetch = global.fetch;
  try {
    const eid = await h.event(d => { d.registrationMode = 'rsvp-approval'; d.promos = [];
      const free = { ...d.offers[0], unitAmount: 0, maxPerOrder: 1 }; d.offers = [free, { ...free, id: 'vip', name: 'VIP upgrade', kind: 'upgrade', unitAmount: 10000, pools: { vip: 1 } }]; d.pools.push({ id: 'vip', name: 'VIP upgrades', capacity: 2 }); });
    const raw = h.request(eid), actor = { uid: `verified_${h.prefix}`, email: raw.email, email_verified: true };
    const rsvp = await h.service.rsvp(raw, actor); await h.service.reviewRsvp(eid, rsvp.orderId, 'approve', '', h.staff);
    const proof = await h.service.rsvpUpgradeAccess({ eventId: eid, email: raw.email }, actor);
    const e = await expired(h, eid, { items: [{ offerId: 'vip', quantity: 1 }], rsvpUpgradeToken: proof.rsvpUpgradeToken });
    await h.service.checkoutFollowupMaintenance(); assert.equal((await e.ref.get()).data().status, 'pending');
    await h.service.withdrawRsvp(eid, rsvp.orderId, h.staff);
    global.fetch = async () => { throw new Error('A revoked RSVP must not receive a VIP reminder'); };
    await h.service.emailJob(e.ref.id); assert.equal((await e.ref.get()).data().status, 'cancelled');
  } finally { global.fetch = oldFetch; await h.cleanup(); }
});
