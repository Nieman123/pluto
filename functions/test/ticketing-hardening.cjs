const test = require('node:test');
const assert = require('node:assert/strict');
const { hash } = require('../lib/ticketing/domain');
const { harness } = require('./ticketing-harness.cjs');

test('A8: overlapping refund workers keep terminal status and apply money/stock once', async () => {
  const h = harness();
  try {
    const eid = await h.event(), raw = h.request(eid, { items: [{ offerId: 'weekend', quantity: 2 }] }), result = await h.service.checkout(raw, null); await h.pay(result.orderId);
    const view = await h.service.view(result.orderId, raw.accessKey, null), ticket = view.tickets[0], attempt = h.newKey(), rid = hash(attempt);
    let firstStarted, secondStarted, firstFinished, calls = 0;
    const start = new Promise(r => firstStarted = r), both = new Promise(r => secondStarted = r), done = new Promise(r => firstFinished = r);
    h.hooks.refund = async () => { calls++; if (calls === 1) { firstStarted(); await both; } else { secondStarted(); await done; } };
    const a = h.service.refund(result.orderId, [ticket.id], attempt, h.staff).finally(() => firstFinished());
    await start; const b = h.service.processRefund(rid); await Promise.all([a, b]);
    const order = (await h.service.order(result.orderId).get()).data(), refund = (await h.db.collection('ticketingRefunds').doc(rid).get()).data();
    assert.equal(refund.status, 'succeeded'); assert.equal(order.refundedAmount, ticket.amount); assert.equal(h.refunds.size, 1);
    assert.equal((await h.service.event(eid).collection('pools').doc('friday').get()).data().sold, 1);
    assert.equal((await h.service.tickets().doc(ticket.id).get()).data().version, 2);
    await h.service.processRefund(rid); assert.equal((await h.service.order(result.orderId).get()).data().refundedAmount, ticket.amount);
  } finally { await h.cleanup(); }
});

test('A8: provider success followed by a lost response recovers without duplicate completion', async () => {
  const h = harness();
  try {
    const eid = await h.event(), raw = h.request(eid), result = await h.service.checkout(raw, null); await h.pay(result.orderId);
    const view = await h.service.view(result.orderId, raw.accessKey, null), attempt = h.newKey(), rid = hash(attempt);
    h.hooks.refund = async () => { throw new Error('Lost provider response'); };
    await assert.rejects(() => h.service.refund(result.orderId, [view.tickets[0].id], attempt, h.staff), /Lost provider/);
    assert.equal(h.refunds.size, 1); assert.equal((await h.service.order(result.orderId).get()).data().refundedAmount, 0);
    delete h.hooks.refund; await h.service.processRefund(rid); await h.service.processRefund(rid);
    assert.equal(h.refunds.size, 1); assert.equal((await h.service.order(result.orderId).get()).data().refundedAmount, view.total);
    assert.equal((await h.service.event(eid).collection('pools').doc('friday').get()).data().sold, 0);
  } finally { await h.cleanup(); }
});
