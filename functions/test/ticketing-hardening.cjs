const test = require('node:test');
const assert = require('node:assert/strict');
const { hash } = require('../lib/ticketing/domain');
const { harness } = require('./ticketing-harness.cjs');
const express = require('express');
const { ticketingRouter } = require('../lib/ticketing/routes');
const { configureTrustedProxy } = require('../lib/ticketing/client-identity');
const { FieldValue } = require('firebase-admin/firestore');

async function inbox(h, oid, type, objectId, extra = {}) {
  const ref = h.db.collection('ticketingWebhookInbox').doc(hash(`${h.prefix}_${objectId}`));
  await ref.set({ orderId: oid, type, objectId, livemode: false, status: 'pending', ...extra }); return ref;
}

test('Checkout branding is server-controlled and survives an uncertain creation retry without changing the Stripe request', async () => {
  const h = harness();
  try {
    const eid = await h.event(), raw = h.request(eid, { branding_settings: { button_color: '#ffffff', display_name: 'Untrusted name' } }), requests = [];
    h.hooks.checkoutBefore = p => requests.push(JSON.parse(JSON.stringify(p)));
    h.hooks.checkoutAfter = () => { if (requests.length === 1) throw new Error('Lost response'); };
    await assert.rejects(() => h.service.checkout(raw, null), /Lost response/);
    const ref = h.service.order(hash(raw.accessKey)), snapshot = (await ref.get()).data().checkoutBranding;
    assert.deepEqual(snapshot, { background_color: '#211a2b', button_color: '#c4a2ff', font_family: 'montserrat', border_style: 'rounded', display_name: 'Pluto Events' });
    // Public event edits must not alter an already submitted payment attempt.
    await h.service.event(eid).update({ 'liveDraft.theme.accent': '#ffae45', 'liveDraft.theme.font': 'SourceCodePro' });
    const result = await h.service.checkout(raw, null);
    assert.equal(result.status, 'open'); assert.equal(h.sessions.size, 1);
    assert.deepEqual(requests[0], requests[1], 'Stripe idempotency retry uses identical parameters');
    assert.deepEqual(requests[1].branding_settings, snapshot);
    assert.equal((await h.service.event(eid).collection('pools').doc('friday').get()).data().held, 1);
    await h.pay(result.orderId); assert.equal((await h.service.view(result.orderId, raw.accessKey, null)).tickets.length, 1);
  } finally { await h.cleanup(); }
});

test('a legacy uncertain checkout retry omits new branding to preserve the original Stripe idempotency request', async () => {
  const h = harness();
  try {
    const eid = await h.event(), raw = h.request(eid), requests = [], ref = h.service.order(hash(raw.accessKey));
    h.hooks.checkoutBefore = async p => {
      if (!requests.length) {
        // Simulate an attempt submitted by the release before branding existed.
        await ref.update({ checkoutBranding: FieldValue.delete() }); delete p.branding_settings;
      }
      requests.push(JSON.parse(JSON.stringify(p)));
    };
    h.hooks.checkoutAfter = () => { if (requests.length === 1) throw new Error('Lost legacy response'); };
    await assert.rejects(() => h.service.checkout(raw, null), /Lost legacy response/);
    const result = await h.service.checkout(raw, null);
    assert.equal(result.status, 'open'); assert.equal(h.sessions.size, 1);
    assert.deepEqual(requests[0], requests[1]); assert.ok(!('branding_settings' in requests[1]));
    assert.equal((await ref.get()).data().checkoutBranding, undefined);
  } finally { await h.cleanup(); }
});

test('A3: 75 purchasers on one network remain independent while contact/client abuse is limited', async t => {
  // Keep this fixed-window abuse scenario in one bucket even when its HTTP
  // requests and cleanup span a wall-clock hour boundary on a CI runner.
  const now = Date.now(); t.mock.method(Date, 'now', () => now);
  const h = harness(), app = express(); configureTrustedProxy(app, 'loopback'); app.use(ticketingRouter(() => ({}), h.service));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  try {
    const eid = await h.event(d => d.pools.forEach(p => p.capacity = 200)), network = `198.51.100.${1 + Math.floor(Math.random() * 250)}`;
    const endpoint = `http://127.0.0.1:${server.address().port}/tickets/api/`;
    const post = (path, body, client) => fetch(endpoint + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://127.0.0.1:4173', 'X-Forwarded-For': `203.0.113.66,${network}`, 'X-Pluto-Client': client }, body: JSON.stringify(body) });
    for (let start = 0; start < 75; start += 5) {
      const results = await Promise.all(Array.from({ length: 5 }, (_, index) => post('checkout', h.request(eid, { email: `${h.prefix}-${start + index}@example.test` }), h.newKey())));
      for (const response of results) assert.equal(response.status, 200, await response.text());
    }
    assert.equal(h.sessions.size, 75); assert.equal((await h.service.event(eid).collection('pools').doc('friday').get()).data().held, 75);
    const client = h.newKey(), attempt = h.request(eid, { email: `${h.prefix}-repeat@example.test` });
    for (let i = 0; i < 20; i++) assert.equal((await post('checkout', attempt, client)).status, 200);
    assert.equal((await post('checkout', attempt, h.newKey())).status, 429, 'rotating a device ID cannot bypass the contact limit');
    let rejected = false;
    for (let i = 0; i < 31; i++) { const response = await post('checkout', h.request(eid, { email: `${h.prefix}-device-${i}@example.test` }), client); if (response.status === 429) { rejected = true; break; } }
    assert.equal(rejected, true, 'one client cannot bypass its limit by changing email');
    const rsvpEvent = await h.event(d => { d.registrationMode = 'rsvp'; d.offers = [{ ...d.offers[0], unitAmount: 0, maxPerOrder: 1 }]; d.pools.forEach(p => p.capacity = 100); });
    for (let start = 0; start < 45; start += 5) {
      const results = await Promise.all(Array.from({ length: 5 }, async (_, index) => {
        const raw = h.request(rsvpEvent, { email: `${h.prefix}-rsvp-${start + index}@example.test` }), client = h.newKey();
        const verifying = await post('rsvp/verification', raw, client); assert.equal(verifying.status, 200);
        const proof = await verifying.json(), job = (await h.db.collection('ticketingEmailJobs').doc(`verify_${hash(proof.verificationToken)}`).get()).data();
        return post('rsvp', { ...raw, ...proof, verificationCode: job.code }, client);
      }));
      for (const response of results) assert.equal(response.status, 200, await response.text());
    }
    for (let i = 0; i < 15; i++) assert.equal((await post('recover', { email: `${h.prefix}-recover-${i}@example.test` }, h.newKey())).status, 200);
    const counter = (await h.db.collection('ticketingRateLimits').doc(hash(`${3600000}:${Math.floor(Date.now() / 3600000)}:checkout-client:${eid}:client:${hash(client)}:0`)).get()).data();
    assert.ok(counter.expiresAt.toMillis() > Date.now(), 'TTL uses a Firestore Timestamp');
  } finally { await new Promise(resolve => server.close(resolve)); await h.cleanup(); }
});

test('hourly rate limits reset at the boundary while each bucket retains its Timestamp TTL', async t => {
  const h = harness(), windowMs = 3600000, bucket = Math.floor(Date.now() / windowMs);
  let now = (bucket + 1) * windowMs - 1;
  t.mock.method(Date, 'now', () => now);
  const identity = h.newKey(), lane = `boundary:${h.prefix}`;
  const counter = hour => h.db.collection('ticketingRateLimits').doc(hash(`${windowMs}:${hour}:${lane}:${identity}:0`));
  try {
    await h.service.rateLimit(identity, lane, 1);
    await assert.rejects(() => h.service.rateLimit(identity, lane, 1), error => error.status === 429);
    now++;
    await h.service.rateLimit(identity, lane, 1);
    await assert.rejects(() => h.service.rateLimit(identity, lane, 1), error => error.status === 429);
    for (const hour of [bucket, bucket + 1]) {
      const value = (await counter(hour).get()).data();
      assert.equal(value.count, 1);
      assert.equal(value.expiresAt.toMillis(), (hour + 2) * windowMs);
      assert.ok(value.expiresAt.toMillis() > now);
    }
  } finally { await Promise.all([counter(bucket).delete(), counter(bucket + 1).delete()]); await h.cleanup(); }
});

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
  const { initializeApp, deleteApp } = require('firebase-admin/app');
  const projectId = `demo-paid-${require('node:crypto').randomUUID()}`, app = initializeApp({ projectId }, projectId);
  const h = harness(require('firebase-admin/firestore').getFirestore(app));
  try {
    const eid = await h.event(), raw = h.request(eid, { items: [{ offerId: 'weekend', quantity: 2 }] }), result = await h.service.checkout(raw, null); await h.pay(result.orderId, null);
    let order = (await h.service.order(result.orderId).get()).data(); assert.equal(order.stripeFee, null); assert.equal(order.stripeFeeStatus, 'pending');
    const charge = h.charges.get(`ch_${result.orderId}`); charge.balance_transaction = { id: `txn_${h.prefix}`, fee: 660, currency: 'usd', net: order.total - 660 };
    const rid = `re_${h.prefix}`, first = (await h.service.view(result.orderId, raw.accessKey, null)).tickets[0];
    h.refunds.set(rid, { id: rid, payment_intent: order.paymentIntentId, charge: charge.id, metadata: {}, amount: first.amount, status: 'succeeded', currency: 'usd' });
    assert.equal((await h.service.maintenance('payments')).errors, 0);
    order = (await h.service.order(result.orderId).get()).data();
    assert.equal(order.stripeFee, 660); assert.equal(order.stripeFeeStatus, 'confirmed'); assert.equal(order.externalRefundAmount, first.amount); assert.equal(order.financialBlocked, true);
    assert.ok((await h.service.view(result.orderId, raw.accessKey, null)).tickets.every(t => !t.qr));
    await h.service.mapExternalRefund(result.orderId, [first.id], h.staff); order = (await h.service.order(result.orderId).get()).data();
    assert.equal(order.financialBlocked, false); assert.equal(order.refundedAmount, first.amount); assert.equal(order.externalRefundAmount, 0);
    assert.equal((await h.service.tickets().where('orderId', '==', result.orderId).get()).size, 2); assert.equal((await h.service.event(eid).collection('pools').doc('friday').get()).data().sold, 1);
    charge.balance_transaction = null; await h.service.verifySession(result.orderId); assert.equal((await h.service.order(result.orderId).get()).data().stripeFee, 660, 'an unexpanded response cannot erase a confirmed fee');
  } finally { await h.cleanup(); await deleteApp(app); }
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
