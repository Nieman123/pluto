const test = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./ticketing-harness.cjs');

test('wallet batches shared event reads and reuses owned order snapshots', async () => {
  const h = harness();
  const original = h.db.getAll;
  try {
    const eid = await h.event(), actor = { uid: `${h.prefix}_buyer`, email: `${h.prefix}@example.test`, email_verified: true };
    const raw = h.request(eid, { items: [{ offerId: 'weekend', quantity: 5 }] });
    const checkout = await h.service.checkout(raw, actor); await h.pay(checkout.orderId);
    const lookups = [];
    h.db.getAll = function(...refs) { lookups.push(refs.map(ref => ref.path)); return original.apply(this, refs); };
    const result = await h.service.mine(actor);
    assert.equal(result.tickets.length, 5);
    assert.ok(result.tickets.every(t => t.eventId === eid && t.qr));
    assert.deepEqual(lookups, [[h.service.event(eid).path]], 'one event lookup, no duplicate order reads');
    assert.equal(result.orders[0].eventId, eid);
  } finally { h.db.getAll = original; await h.cleanup(); }
});

test('native wallet claims only matching unowned purchases and never reclaims a transfer', async () => {
  const h = harness();
  try {
    const eid = await h.event(d => { d.startAt = d.admissionStartsAt = new Date(Date.now() + 86400000).toISOString(); d.offers.forEach(o => o.validFrom = d.startAt); });
    const actor = { uid: `${h.prefix}_buyer`, email: `${h.prefix}@example.test`, email_verified: true };
    const raw = h.request(eid), checkout = await h.service.checkout(raw, null); await h.pay(checkout.orderId);
    let wallet = await h.service.mine(actor, true);
    assert.equal(wallet.orders.length, 1); assert.equal(wallet.tickets.length, 1);
    await h.service.transfer(checkout.orderId, raw.accessKey, actor, wallet.tickets[0].id, 'holder@example.test');
    const token = (await h.db.collection('ticketingEmailJobs').where('orderId', '==', checkout.orderId).get()).docs.map(d => d.data()).find(d => d.type === 'transfer').token;
    const holder = { uid: `${h.prefix}_holder`, email: 'holder@example.test', email_verified: true };
    await h.service.acceptTransfer(token, holder);
    wallet = await h.service.mine(actor, true);
    assert.equal(wallet.tickets.length, 0);
    assert.equal((await h.service.mine(holder)).tickets.length, 1);
  } finally { await h.cleanup(); }
});

test('saved checkout status is authorized by its original secret and reports completed/expired states', async () => {
  const h = harness();
  try {
    const eid = await h.event(), raw = h.request(eid), checkout = await h.service.checkout(raw, null);
    assert.equal((await h.service.checkoutAttempt(raw.accessKey)).status, 'open');
    await h.pay(checkout.orderId);
    const paid = await h.service.checkoutAttempt(raw.accessKey);
    assert.equal(paid.status, 'paid'); assert.equal(paid.orderId, checkout.orderId); assert.equal(paid.eventId, eid);
    assert.deepEqual(await h.service.checkoutAttempt(h.newKey()), { exists: false });
    const abandoned = h.request(eid), pending = await h.service.checkout(abandoned, null);
    await h.service.cancel(pending.orderId, abandoned.accessKey, null);
    assert.equal((await h.service.checkoutAttempt(abandoned.accessKey)).status, 'expired');
  } finally { await h.cleanup(); }
});
