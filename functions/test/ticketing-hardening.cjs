const test = require('node:test');
const assert = require('node:assert/strict');
const { hash } = require('../lib/ticketing/domain');
const { harness } = require('./ticketing-harness.cjs');

async function inbox(h, oid, type, objectId, extra = {}) {
  const ref = h.db.collection('ticketingWebhookInbox').doc(hash(`${h.prefix}_${objectId}`));
  await ref.set({ orderId: oid, type, objectId, livemode: false, status: 'pending', ...extra }); return ref;
}

test('A2: inactive provider taxes fail before reservation and the same attempt works after repair', async () => {
  const h = harness();
  try {
    const eid = await h.event(d => { d.tax = { mode: 'manual', confirmed: true, performanceLocationId: '' }; d.offers.forEach(o => o.stripeTaxRateIds = ['txr_test']); }), raw = h.request(eid);
    h.hooks.taxRate = () => ({ active: false, inclusive: true, livemode: false, percentage: 10 });
    await assert.rejects(() => h.service.checkout(raw, null), /active inclusive tax/);
    assert.equal((await h.service.order(hash(raw.accessKey)).get()).exists, false); assert.equal(h.sessions.size, 0);
    assert.equal((await h.service.event(eid).collection('pools').doc('friday').get()).data().held, 0);
    delete h.hooks.taxRate; const result = await h.service.checkout(raw, null); await h.pay(result.orderId);
    assert.equal((await h.service.order(result.orderId).get()).data().status, 'paid'); assert.equal(h.sessions.size, 1);
  } finally { await h.cleanup(); }
});

test('A2: a definite first-request permission rejection releases stock without a provider session', async () => {
  const h = harness();
  try {
    const eid = await h.event(), raw = h.request(eid);
    h.hooks.checkoutBefore = () => { throw Object.assign(new Error('Permission denied'), { type: 'StripePermissionError', statusCode: 403 }); };
    await assert.rejects(() => h.service.checkout(raw, null), /reservation was released/);
    const oid = hash(raw.accessKey), order = (await h.service.order(oid).get()).data();
    assert.equal(order.status, 'expired'); assert.equal(order.providerState, 'rejected'); assert.equal(h.sessions.size, 0);
    assert.equal((await h.service.event(eid).collection('pools').doc('friday').get()).data().held, 0);
    assert.equal((await h.service.cancel(oid, raw.accessKey, null)).status, 'expired');
    delete h.hooks.checkoutBefore; assert.equal((await h.service.checkout(h.request(eid), null)).status, 'open');
  } finally { await h.cleanup(); }
});

test('A2: uncertain creation keeps inventory and cancellation never sends another create request', async () => {
  const h = harness(); let calls = 0;
  try {
    const eid = await h.event(), raw = h.request(eid), oid = hash(raw.accessKey);
    h.hooks.checkoutBefore = () => { calls++; throw new Error('Provider outcome unknown'); };
    await assert.rejects(() => h.service.checkout(raw, null), /outcome unknown/);
    assert.equal((await h.service.order(oid).get()).data().providerState, 'uncertain');
    await assert.rejects(() => h.service.cancel(oid, raw.accessKey, null), /retained for staff review/); assert.equal(calls, 1);
    await h.service.order(oid).update({ createdAt: Date.now() - 5 * 60000 });
    await assert.rejects(async () => h.service.provision(oid, (await h.service.order(oid).get()).data()), /staff review/);
    await assert.rejects(() => h.service.resolveCheckout(oid, '', 'Verify ambiguous provider outcome', h.staff), /uncertain payment cannot be released/);
    assert.equal((await h.service.event(eid).collection('pools').doc('friday').get()).data().held, 1);
  } finally { await h.cleanup(); }
});

test('A2: staff safely resolve a lost create response using provider status and retain an audit trail', async () => {
  const h = harness();
  try {
    const eid = await h.event(), raw = h.request(eid), oid = hash(raw.accessKey);
    h.hooks.checkoutAfter = () => { throw new Error('Lost response'); }; await assert.rejects(() => h.service.checkout(raw, null), /Lost response/);
    assert.equal(h.sessions.size, 1); assert.equal((await h.service.order(oid).get()).data().sessionId, undefined);
    await assert.rejects(() => h.service.resolveCheckout(oid, '', 'Review', 'ordinary-user'), /permission|access|allowed/i);
    delete h.hooks.checkoutAfter; const result = await h.service.resolveCheckout(oid, '', 'Session exists but customer abandoned payment', h.staff);
    assert.equal(result.status, 'expired'); assert.equal(h.sessions.size, 1);
    assert.equal((await h.service.event(eid).collection('pools').doc('friday').get()).data().held, 0);
    const audit = await h.service.event(eid).collection('audit').where('action', '==', 'checkout-provider-resolved').get(); assert.equal(audit.size, 1);
    assert.equal(audit.docs[0].data().uid, h.staff);
  } finally { await h.cleanup(); }
});

for (const type of ['refund.created', 'charge.refunded']) test(`A1: ${type} before PaymentIntent linkage reconciles a metadata-free Dashboard refund`, async () => {
  const h = harness();
  try {
    const eid = await h.event(), raw = h.request(eid), result = await h.service.checkout(raw, null);
    const session = await h.paidSession(result.orderId), intent = session.payment_intent, charge = intent.latest_charge;
    const rid = `re_${h.prefix}`; h.refunds.set(rid, { id: rid, payment_intent: intent.id, charge: charge.id, metadata: {}, amount: session.amount_total, currency: 'usd', status: 'succeeded' });
    charge.refunded = true; charge.amount_refunded = session.amount_total;
    assert.equal((await h.service.order(result.orderId).get()).data().paymentIntentId, undefined);
    const ref = await inbox(h, result.orderId, type, type === 'refund.created' ? rid : charge.id, { orderId: '', paymentIntentId: intent.id });
    await h.service.processWebhook(ref.id); await h.service.verifySession(result.orderId);
    const order = (await h.service.order(result.orderId).get()).data(), tickets = (await h.service.tickets().where('orderId', '==', result.orderId).get()).docs;
    assert.equal((await ref.get()).data().status, 'done'); assert.equal(order.refundedAmount, order.total); assert.equal(tickets.length, 1); assert.equal(tickets[0].data().status, 'refunded');
    assert.equal((await h.service.view(result.orderId, raw.accessKey, null)).tickets[0].qr, null);
    const qr = h.service.credential(tickets[0].data(), tickets[0].id); assert.equal((await h.service.scan(eid, qr, h.prefix, h.staff)).result, 'invalid');
  } finally { await h.cleanup(); const docs = await h.db.collection('ticketingWebhookInbox').where('objectId', '==', type === 'refund.created' ? `re_${h.prefix}` : [...h.charges.keys()][0]).get(); for (const doc of docs.docs) await doc.ref.delete(); }
});

test('A1: early disputes hold admission and a won dispute is reconciled without reissuing tickets', async () => {
  const h = harness();
  try {
    const eid = await h.event(), raw = h.request(eid), result = await h.service.checkout(raw, null), session = await h.paidSession(result.orderId), intent = session.payment_intent;
    const dispute = { id: `du_${h.prefix}`, payment_intent: intent.id, charge: intent.latest_charge.id, status: 'needs_response', metadata: {} }; h.disputes.set(dispute.id, dispute);
    const ref = await inbox(h, result.orderId, 'charge.dispute.created', dispute.id); await h.service.processWebhook(ref.id);
    let view = await h.service.view(result.orderId, raw.accessKey, null); assert.equal(view.financialBlocked, true); assert.equal(view.tickets[0].qr, null);
    const t = (await h.service.tickets().doc(view.tickets[0].id).get()).data(), qr = h.service.credential(t, view.tickets[0].id);
    assert.equal((await h.service.scan(eid, qr, h.prefix, h.staff)).result, 'invalid');
    assert.equal((await h.service.manifest(eid, h.staff)).tickets[0].status, 'invalid');
    dispute.status = 'won'; await h.service.verifySession(result.orderId); view = await h.service.view(result.orderId, raw.accessKey, null);
    assert.equal(view.financialBlocked, false); assert.ok(view.tickets[0].qr); assert.equal((await h.service.tickets().doc(view.tickets[0].id).get()).data().version, 1);
    assert.equal((await h.service.event(eid).collection('pools').doc('friday').get()).data().sold, 1);
  } finally { await h.cleanup(); }
});

test('A1: relevant unresolved ownership stays pending; unrelated provider events are explicitly ignored', async () => {
  const h = harness(), missing = `pi_${h.prefix}_missing`, unrelated = `pi_${h.prefix}_unrelated`, refs = [];
  try {
    h.intents.set(missing, { id: missing, metadata: { pluto_order_id: hash(h.newKey()) }, amount: 100, currency: 'usd', livemode: false });
    let ref = await inbox(h, '', 'payment_intent.succeeded', missing); refs.push(ref); await assert.rejects(() => h.service.processWebhook(ref.id), /no order yet/); assert.equal((await ref.get()).data().status, 'pending');
    h.intents.set(unrelated, { id: unrelated, metadata: {}, amount: 100, currency: 'usd', livemode: false });
    ref = await inbox(h, '', 'payment_intent.succeeded', unrelated); refs.push(ref); await h.service.processWebhook(ref.id); assert.equal((await ref.get()).data().status, 'ignored');
    const eid = await h.event(), raw = h.request(eid), result = await h.service.checkout(raw, null), session = await h.paidSession(result.orderId);
    await h.service.order(result.orderId).update({ sessionId: null });
    ref = await inbox(h, result.orderId, 'payment_intent.succeeded', session.payment_intent.id); refs.push(ref);
    await assert.rejects(() => h.service.processWebhook(ref.id), /linkage/); assert.equal((await ref.get()).data().status, 'pending');
    await h.service.order(result.orderId).update({ sessionId: session.id }); await h.service.processWebhook(ref.id); assert.equal((await ref.get()).data().status, 'done');
  } finally { await h.cleanup(); for (const ref of refs) await ref.delete(); }
});

test('A1/A7: paid-order reconciliation catches missing webhooks and late provider fees without duplicate issuance', async () => {
  const h = harness();
  try {
    const eid = await h.event(), raw = h.request(eid, { items: [{ offerId: 'weekend', quantity: 2 }] }), result = await h.service.checkout(raw, null); await h.pay(result.orderId, null);
    let order = (await h.service.order(result.orderId).get()).data(); assert.equal(order.stripeFee, null); assert.equal(order.stripeFeeStatus, 'pending');
    const charge = h.charges.get(`ch_${result.orderId}`); charge.balance_transaction = { id: `txn_${h.prefix}`, fee: 660, currency: 'usd', net: order.total - 660 };
    const rid = `re_${h.prefix}`, first = (await h.service.view(result.orderId, raw.accessKey, null)).tickets[0];
    h.refunds.set(rid, { id: rid, payment_intent: order.paymentIntentId, charge: charge.id, metadata: {}, amount: first.amount, status: 'succeeded', currency: 'usd' });
    const batches = [];
    h.service.pendingBatch = async (collection, statuses) => {
      batches.push(`${collection}:${statuses.join(',')}`);
      return { docs: collection === 'ticketingOrders' && statuses.includes('paid') ? [await h.service.order(result.orderId).get()] : [] };
    };
    assert.equal((await h.service.maintenance()).errors, 0); assert.ok(batches.includes('ticketingOrders:paid'));
    order = (await h.service.order(result.orderId).get()).data();
    assert.equal(order.stripeFee, 660); assert.equal(order.stripeFeeStatus, 'confirmed'); assert.equal(order.externalRefundAmount, first.amount); assert.equal(order.financialBlocked, true);
    assert.ok((await h.service.view(result.orderId, raw.accessKey, null)).tickets.every(t => !t.qr));
    await h.service.mapExternalRefund(result.orderId, [first.id], h.staff); order = (await h.service.order(result.orderId).get()).data();
    assert.equal(order.financialBlocked, false); assert.equal(order.refundedAmount, first.amount); assert.equal(order.externalRefundAmount, 0);
    assert.equal((await h.service.tickets().where('orderId', '==', result.orderId).get()).size, 2); assert.equal((await h.service.event(eid).collection('pools').doc('friday').get()).data().sold, 1);
    charge.balance_transaction = null; await h.service.verifySession(result.orderId); assert.equal((await h.service.order(result.orderId).get()).data().stripeFee, 660, 'an unexpanded response cannot erase a confirmed fee');
  } finally { await h.cleanup(); }
});

test('A1: an older verifier cannot clear the financial hold owned by a newer webhook', async () => {
  const h = harness(); let releaseOld, releaseNew;
  try {
    const eid = await h.event(), raw = h.request(eid), result = await h.service.checkout(raw, null); await h.pay(result.orderId);
    let oldStarted, newStarted, listCalls = 0, disputeCalls = 0;
    const oldReady = new Promise(r => oldStarted = r), newReady = new Promise(r => newStarted = r);
    const oldGate = new Promise(r => releaseOld = r), newGate = new Promise(r => releaseNew = r);
    const originalLines = h.fake.checkout.sessions.listLineItems, originalDisputes = h.fake.disputes.list;
    h.fake.checkout.sessions.listLineItems = async sid => { listCalls++; if (listCalls === 2) { newStarted(); await newGate; } return originalLines(sid); };
    h.fake.disputes.list = async params => { disputeCalls++; const value = await originalDisputes(params); if (disputeCalls === 1) { oldStarted(); await oldGate; } return value; };
    const old = h.service.verifySession(result.orderId); await oldReady;
    const intent = h.intents.get(`pi_${result.orderId}`), charge = intent.latest_charge, rid = `re_${h.prefix}`;
    h.refunds.set(rid, { id: rid, payment_intent: intent.id, charge: charge.id, metadata: {}, amount: charge.amount, currency: 'usd', status: 'succeeded' });
    const ref = await inbox(h, result.orderId, 'refund.created', rid), newer = h.service.processWebhook(ref.id); await newReady;
    releaseOld(); await old; assert.equal((await h.service.order(result.orderId).get()).data().financialBlocked, true);
    releaseNew(); await newer; assert.equal((await h.service.order(result.orderId).get()).data().refundedAmount, charge.amount);
  } finally { releaseOld?.(); releaseNew?.(); await h.cleanup(); }
});

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
