const assert = require('node:assert/strict');
const { generateKeyPairSync, randomBytes, randomUUID } = require('node:crypto');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
if (!process.env.FIRESTORE_EMULATOR_HOST?.startsWith('127.0.0.1:') || !process.env.GCLOUD_PROJECT?.startsWith('demo-')) throw new Error('Demo Firebase emulators required; never run against production.');
initializeApp({ projectId: process.env.GCLOUD_PROJECT });
const { Operations } = require('../lib/ticketing/operations');
const { fixture } = require('./ticketing-fixture.cjs');
const { PDFDocument, PDFName } = require('pdf-lib');
const { orderPdf } = require('../lib/ticketing/pdf');
const sessions = new Map(), idempotency = new Map(), refunds = new Map();
const fake = {
  checkout: { sessions: {
    create: async (params, opts) => {
      if (idempotency.has(opts.idempotencyKey)) return sessions.get(idempotency.get(opts.idempotencyKey));
      assert.equal(params.ui_mode, 'embedded_page'); assert.equal(params.mode, 'payment'); assert.equal(params.payment_method_types, undefined);
      assert.ok(!params.invoice_creation); assert.match(params.return_url, /\/app\/tickets/);
      const session = { id: `cs_test_${randomUUID()}`, client_secret: 'fake-client-secret', metadata: params.metadata, client_reference_id: params.client_reference_id, currency: 'usd', amount_total: params.line_items.reduce((n, l) => n + l.price_data.unit_amount, 0), livemode: false, status: 'open', payment_status: 'unpaid', expires_at: params.expires_at,
        line_items: params.line_items.map((l, i) => ({ id: `li_${i}`, metadata: l.metadata, quantity: l.quantity, amount_total: l.price_data.unit_amount, amount_tax: 0, currency: 'usd' })) };
      sessions.set(session.id, session); idempotency.set(opts.idempotencyKey, session.id); return session;
    },
    retrieve: async key => { assert.ok(sessions.has(key)); return sessions.get(key); },
    listLineItems: async key => ({ data: sessions.get(key).line_items, has_more: false }),
    list: () => ({ autoPagingEach: async callback => { for (const session of sessions.values()) if (await callback(session) === false) break; } }),
    expire: async key => { const s = sessions.get(key); if (s.payment_status !== 'paid') s.status = 'expired'; return s; },
  } },
  refunds: {
    create: async (params, opts) => { if (idempotency.has(opts.idempotencyKey)) return refunds.get(idempotency.get(opts.idempotencyKey)); const r = { id: `re_${randomUUID()}`, ...params, status: 'succeeded' }; refunds.set(r.id, r); idempotency.set(opts.idempotencyKey, r.id); return r; },
    retrieve: async key => refunds.get(key), list: async params => ({ data: [...refunds.values()].filter(r => r.payment_intent === params.payment_intent) }),
  },
  taxRates: { retrieve: async () => ({ active: true, inclusive: true, livemode: false, percentage: 10 }) },
  products: { retrieve: async key => ({ id: key, active: true, livemode: false, tax_code: 'txcd_test', tax_details: { performance_location: 'taxloc_test' } }) },
  tax: {
    settings: { retrieve: async () => ({ status: 'active' }) }, registrations: { list: async () => ({ data: [{}] }) },
    calculations: { create: async params => ({ id: 'taxcalc_test', line_items: { has_more: false, data: params.line_items.map((l, i) => ({ ...l, amount_tax: i === 0 ? 909 : 48 })) } }) },
    transactions: {
      createFromCalculation: async () => ({ id: 'tax_test', livemode: false, currency: 'usd', line_items: { has_more: false, data: [{ id: 'taxli_0', reference: '0', amount: 10000, amount_tax: 909 }, { id: 'taxli_1', reference: '1', amount: 1000, amount_tax: 48 }] } }),
      createReversal: async params => { assert.equal(params.line_items.length, 1); assert.equal(params.line_items[0].original_line_item, 'taxli_1'); assert.equal(params.line_items[0].amount, -1000); assert.equal(params.line_items[0].amount_tax, -48); return { id: 'tax_reverse_test', livemode: false, currency: 'usd' }; },
    },
  },
};
const db = getFirestore(), key = generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64'), service = new Operations(db, { stripe: fake, signingKey: key });
const staff = 'ticketing-test-admin';
const newKey = () => randomBytes(32).toString('hex');
const buyer = { uid: 'ticketing-test-buyer', email: `buyer-${randomUUID()}@example.test`, email_verified: true };
const request = (eventId, overrides = {}) => ({ eventId, accessKey: newKey(), items: [{ offerId: 'weekend', quantity: 1 }], email: buyer.email, name: 'Test buyer', promoCode: '', ...overrides });
async function makeEvent(active = false, modify = () => {}) { const eventId = randomUUID(), draft = fixture(active); draft.slug += `-${eventId}`; modify(draft); await service.save(eventId, draft, 0, staff); await service.publish(eventId, 'publish', 1, staff); return eventId; }
async function pay(result) { const order = (await service.order(result.orderId).get()).data(), session = sessions.get(order.sessionId); session.status = 'complete'; session.payment_status = 'paid'; session.payment_intent = { id: `pi_${result.orderId}`, latest_charge: { receipt_url: 'https://pay.stripe.com/test-receipt', balance_transaction: { fee: 320 } } }; session.total_details = { amount_tax: 0 }; await service.verifySession(result.orderId); }
async function main() {
  await db.collection('adminUsers').doc(staff).set({ role: 'admin' });
  const eventId = await makeEvent(false, d => { d.pools[0].capacity = 2; d.pools[1].capacity = 2; });
  const attempts = Array.from({ length: 5 }, () => request(eventId));
  const results = await Promise.allSettled(attempts.map(r => service.checkout(r, buyer)));
  const winners = results.flatMap((r, i) => r.status === 'fulfilled' ? [{ request: attempts[i], result: r.value }] : []);
  assert.equal(winners.length, 2, 'shared pools cannot oversell under concurrent checkout');
  const pool = (await service.event(eventId).collection('pools').doc('friday').get()).data(); assert.equal(pool.held, 2); assert.equal(pool.sold, 0);
  const first = winners[0]; await service.checkout(first.request, buyer); assert.equal(sessions.size, 2, 'request retry creates no second Session');
  await pay(first.result); await pay(first.result); let view = await service.view(first.result.orderId, first.request.accessKey, null);
  assert.equal(view.tickets.length, 1, 'fulfillment is idempotent'); assert.equal(view.venue.address, '123 Hidden Lane');
  await assert.rejects(() => service.view(first.result.orderId, newKey(), null), /secure order link/);
  await assert.rejects(() => service.checkout({ ...first.request, name: 'Changed' }, buyer), /different details/);
  await service.cancel(winners[1].result.orderId, winners[1].request.accessKey, null);
  assert.equal((await service.event(eventId).collection('pools').doc('friday').get()).data().held, 0);
  const qr = view.tickets[0].qr; await service.transfer(first.result.orderId, first.request.accessKey, null, view.tickets[0].id, 'recipient@example.test');
  const transfer = (await db.collection('ticketingEmailJobs').where('type', '==', 'transfer').get()).docs.find(d => d.data().orderId === first.result.orderId).data();
  const holder = await service.acceptTransfer(transfer.token, { uid: 'recipient', email: 'recipient@example.test', email_verified: true });
  assert.notEqual(holder.qr, qr); view = await service.view(first.result.orderId, first.request.accessKey, null); assert.equal(view.tickets[0].qr, null, 'payer loses transferred admission credential'); assert.equal(view.venue, null);
  await assert.rejects(() => service.acceptTransfer(transfer.token, null), /already accepted/);
  const refundAttempt = newKey(); await service.refund(first.result.orderId, [view.tickets[0].id], refundAttempt, staff); await service.refund(first.result.orderId, [view.tickets[0].id], refundAttempt, staff);
  assert.equal((await service.event(eventId).collection('pools').doc('friday').get()).data().sold, 0, 'unused refunded stock reopens'); assert.equal(refunds.size, 1);
  await assert.rejects(() => service.holder(transfer.token, null), /no longer valid/);
  const promoEvent = await makeEvent(false, d => { d.promos[0].limit = 1; });
  const promoAttempts = await Promise.allSettled([service.checkout(request(promoEvent, { promoCode: 'SAVE' }), buyer), service.checkout(request(promoEvent, { promoCode: 'SAVE' }), buyer)]);
  assert.equal(promoAttempts.filter(r => r.status === 'fulfilled').length, 1, 'promo cap includes concurrent reservations');
  const active = await makeEvent(true); const activeRequest = request(active); const activeOrder = await service.checkout(activeRequest, buyer); await pay(activeOrder);
  const activeView = await service.view(activeOrder.orderId, activeRequest.accessKey, null), ticket = activeView.tickets[0];
  assert.equal((await service.scan(active, ticket.qr, randomUUID(), staff)).result, 'accepted'); assert.equal((await service.scan(active, ticket.qr, randomUUID(), staff)).result, 'duplicate');
  await service.refund(activeOrder.orderId, [ticket.id], newKey(), staff); assert.equal((await service.event(active).collection('pools').doc('friday').get()).data().sold, 1, 'admitted capacity is not reissued');
  const poorCash = request(active, { cashReceived: 0 }); await assert.rejects(() => service.checkout(poorCash, null, 'cash', staff), /Cash received/); assert.ok(!(await service.order(require('../lib/ticketing/domain').hash(poorCash.accessKey)).get()).exists);
  const comp = await service.checkout(request(active, { reason: 'Artist guest list' }), null, 'comp', staff); assert.equal(comp.total, 0); assert.equal(comp.status, 'paid');
  assert.equal((await service.checkoutAttempt(poorCash.accessKey)).exists, false, 'a rejected cart can be safely edited');
  assert.equal((await service.checkoutAttempt(activeRequest.accessKey)).exists, true, 'an existing reservation remains recoverable');
  const recovery = await service.recover(buyer.email); assert.match(recovery.message, /If we found/);
  const recoveryJob = (await db.collection('ticketingEmailJobs').where('type', '==', 'recovery').get()).docs.find(d => d.data().to === buyer.email).data(); const recovered = await service.acceptRecovery(recoveryJob.token); await service.view(recovered.orderId, recovered.accessKey, null);
  await assert.rejects(() => service.acceptRecovery(recoveryJob.token), /already used/);
  await assert.rejects(() => service.claim({ ...buyer, email_verified: false }), /Verify your account/);
  const receiptPdf = await PDFDocument.load(await orderPdf(await service.view(activeOrder.orderId, activeRequest.accessKey, null))); assert.equal(receiptPdf.getPageCount(), 1);
  assert.equal(receiptPdf.context.enumerateIndirectObjects().filter(([, value]) => value?.get?.(PDFName.of('Subtype'))?.toString() === '/Image').length, 0, 'receipt PDF contains no admission QR image');
  const event = await service.get(eventId, staff); await service.save(eventId, { ...event.draft, title: 'Changed draft' }, event.revision, staff);
  assert.equal((await db.collection('publishedEvents').doc(eventId).get()).data().title, 'Pluto Test Festival', 'draft changes do not alter published content');
  await assert.rejects(() => service.save(eventId, event.draft, event.revision, staff), /Another editor/);
  await assert.rejects(() => service.staffOrders(eventId, 'unauthorized'), /does not have access/);
  await service.setStaff(eventId, 'scanner-only', ['admission'], staff); await service.manifest(eventId, 'scanner-only'); await assert.rejects(() => service.staffOrders(eventId, 'scanner-only'), /does not have access/);
  const pinEvent = await makeEvent(true);
  await assert.rejects(() => service.createScannerPin(pinEvent, 'Unauthorized', undefined, 'scanner-only'), /does not have access/);
  await service.setStaff(pinEvent, 'pin-event-manager', ['manager'], staff);
  const scannerPin = await service.createScannerPin(pinEvent, 'Alex · Main door', undefined, 'pin-event-manager');
  assert.match(scannerPin.pin, /^\d{8}$/);
  const pins = await service.scannerPins(pinEvent, staff);
  assert.equal(pins.pins[0].label, 'Alex · Main door'); assert.equal(pins.pins[0].pin, undefined);
  assert.ok(!JSON.stringify((await db.collection('ticketingScannerPins').doc(scannerPin.id).get()).data()).includes(scannerPin.pin), 'PIN is never stored as plaintext');
  const scannerLogin = await service.scannerLogin(`${scannerPin.pin.slice(0, 4)} ${scannerPin.pin.slice(4)}`, `pin-test-${randomUUID()}`);
  const proof = { scannerToken: scannerLogin.token };
  assert.equal((await service.scannerSession(scannerLogin.token)).eventId, pinEvent);
  await assert.rejects(() => service.manifest(eventId, proof), /assigned event/);
  await assert.rejects(() => service.staffOrders(pinEvent, scannerLogin.uid), /does not have access/);
  const manifest = await service.manifest(pinEvent, proof);
  assert.equal(manifest.staffUid, scannerLogin.uid); assert.ok(manifest.offlineUntil <= Date.now() + 4 * 3600000);
  const pinOrder = await service.checkout(request(pinEvent, { reason: 'PIN scanner acceptance', items: [{ offerId: 'weekend', quantity: 3 }] }), null, 'comp', staff);
  const pinView = await service.view(pinOrder.orderId, undefined, { uid: '' }), [pinTicket, revokedTicket, expiredTicket] = pinView.tickets;
  const pinScanId = randomUUID();
  const concurrentScans = await Promise.all([service.scan(pinEvent, pinTicket.qr, pinScanId, proof), service.scan(pinEvent, pinTicket.qr, randomUUID(), proof)]);
  assert.deepEqual(concurrentScans.map(s => s.result).sort(), ['accepted', 'duplicate']);
  assert.equal((await service.scan(pinEvent, pinTicket.qr, pinScanId, proof)).scannerLabel, 'Alex · Main door');
  const duplicateId = randomUUID(); await service.scan(pinEvent, pinTicket.qr, duplicateId, proof, true);
  await service.reviewScan(pinEvent, duplicateId, 'Wristband already issued', proof);
  assert.equal((await service.event(pinEvent).collection('scans').doc(duplicateId).get()).data().reviewedBy, scannerLogin.uid);
  await service.scannerLogout(scannerLogin.token); await assert.rejects(() => service.manifest(pinEvent, proof), /expired/);
  const secondLogin = await service.scannerLogin(scannerPin.pin, `pin-test-${randomUUID()}`);
  assert.equal(secondLogin.uid, scannerLogin.uid, 'same PIN can resume its queued scans after session sign-out');
  await assert.rejects(() => service.revokeScannerPin(eventId, scannerPin.id, staff), /not found/);
  await service.revokeScannerPin(pinEvent, scannerPin.id, 'pin-event-manager');
  await assert.rejects(() => service.scan(pinEvent, revokedTicket.qr, randomUUID(), { scannerToken: secondLogin.token }), /revoked/);
  assert.equal((await service.tickets().doc(revokedTicket.id).get()).data().admission, null);
  await assert.rejects(() => service.scannerLogin(scannerPin.pin, `pin-test-${randomUUID()}`), /invalid, expired or revoked/);
  const expiringPin = await service.createScannerPin(pinEvent, 'Short shift', Date.now() + 60000, staff);
  const expiringLogin = await service.scannerLogin(expiringPin.pin, `pin-test-${randomUUID()}`);
  const { hash } = require('../lib/ticketing/domain');
  await db.collection('ticketingScannerSessions').doc(hash(expiringLogin.token)).update({ expiresAt: Date.now() - 1 });
  await assert.rejects(() => service.scan(pinEvent, expiredTicket.qr, randomUUID(), { scannerToken: expiringLogin.token }), /expired/);
  await db.collection('ticketingScannerPins').doc(expiringPin.id).update({ expiresAt: Date.now() - 1 });
  await assert.rejects(() => service.scannerLogin(expiringPin.pin, `pin-test-${randomUUID()}`), /invalid, expired or revoked/);
  await assert.rejects(() => service.createScannerPin(pinEvent, 'Too long', Date.now() + 10 * 86400000, staff), /future expiry/);
  const throttleIp = `pin-throttle-${randomUUID()}`;
  await db.collection('ticketingRateLimits').doc(hash(`${Math.floor(Date.now() / 3600000)}:scanner-login-ip:${throttleIp}`)).set({ count: 40 });
  await assert.rejects(() => service.scannerLogin(scannerPin.pin, throttleIp), e => e.status === 429);
  const recoverRequest = request(await makeEvent()), recoverOrder = await service.checkout(recoverRequest, buyer);
  const recoverRef = service.order(recoverOrder.orderId), recoverSnapshot = (await recoverRef.get()).data();
  await recoverRef.update({ status: 'provisioning', sessionId: null, createdAt: Date.now() - 6 * 60000 });
  await service.provision(recoverOrder.orderId, (await recoverRef.get()).data());
  assert.equal((await recoverRef.get()).data().sessionId, recoverSnapshot.sessionId, 'late provisioning recovers the same Stripe Session');
  const longAttempt = request(await makeEvent()), longOrder = await service.checkout(longAttempt, buyer);
  const longRef = service.order(longOrder.orderId); await longRef.update({ status: 'provisioning', sessionId: null, createdAt: Date.now() - 24 * 3600000 });
  await assert.rejects(async () => service.provision(longOrder.orderId, (await longRef.get()).data()), /staff review/);
  assert.equal((await longRef.get()).data().status, 'provisioning', 'uncertain outcome retains capacity');
  const taxEvent = await makeEvent(false, d => { d.tax = { mode: 'manual', confirmed: true, performanceLocationId: '' }; d.offers.forEach(o => { o.stripeTaxRateIds = ['txr_test']; }); });
  const cashTax = await service.checkout(request(taxEvent, { cashReceived: 10000 }), null, 'cash', staff);
  const cashView = await service.view(cashTax.orderId, undefined, { uid: '' });
  assert.equal(cashView.taxAmount, 909, 'inclusive cash tax is allocated to ticket units');
  const automaticEvent = await makeEvent(false, d => { d.tax = { mode: 'automatic', confirmed: true, performanceLocationId: 'taxloc_test' }; d.offers.forEach(o => { o.stripeProductId = `prod_${o.id}`; o.taxCode = 'txcd_test'; }); });
  const automaticRequest = request(automaticEvent, { items: [{ offerId: 'weekend', quantity: 1 }, { offerId: 'vehicle', quantity: 1 }], cashReceived: 11000, taxState: 'NC', taxPostalCode: '28801', taxCity: 'Asheville', taxLine1: '1 Test Street' });
  const automatic = await service.checkout(automaticRequest, null, 'cash', staff), automaticView = await service.view(automatic.orderId, automaticRequest.accessKey, null);
  assert.equal(automaticView.taxAmount, 957);
  await service.refund(automatic.orderId, [automaticView.tickets.find(t => t.name === 'Vehicle').id], newKey(), staff);
  assert.equal((await service.order(automatic.orderId).get()).data().refundedTaxAmount, 48, 'cash refund reverses the selected tax line only');
  const externalEvent = await makeEvent(), externalRequest = request(externalEvent, { items: [{ offerId: 'weekend', quantity: 2 }] });
  const externalOrder = await service.checkout(externalRequest, buyer); await pay(externalOrder);
  const externalView = await service.view(externalOrder.orderId, externalRequest.accessKey, null), externalPi = (await service.order(externalOrder.orderId).get()).data().paymentIntentId;
  const dashboardRefundId = `re_dashboard_${randomUUID()}`;
  refunds.set(dashboardRefundId, { id: dashboardRefundId, payment_intent: externalPi, amount: 10000, status: 'succeeded', metadata: {} });
  await service.reconcileRefunds(externalOrder.orderId);
  assert.equal((await service.order(externalOrder.orderId).get()).data().externalRefundAmount, 10000);
  await assert.rejects(() => service.refund(externalOrder.orderId, [externalView.tickets[0].id], newKey(), staff), /Map the existing/);
  await service.mapExternalRefund(externalOrder.orderId, [externalView.tickets[0].id], staff); await service.reconcileRefunds(externalOrder.orderId);
  assert.equal((await service.order(externalOrder.orderId).get()).data().refundedAmount, 10000, 'external mapping is counted once');
  assert.equal((await service.tickets().doc(externalView.tickets[0].id).get()).data().status, 'refunded');
  assert.equal((await service.tickets().doc(externalView.tickets[1].id).get()).data().status, 'valid');
  const changed = await service.get(eventId, staff); await service.save(eventId, { ...changed.draft, title: 'Unpublished secret content', slug: `${changed.draft.slug}-draft` }, changed.revision, staff);
  await service.publish(eventId, 'archive', changed.revision + 1, staff);
  assert.equal((await db.collection('publishedEvents').doc(eventId).get()).data().title, 'Pluto Test Festival', 'archival never releases unpublished content');
  const mailId = `mail_test_${randomUUID()}`, emailRef = db.collection('ticketingEmailJobs').doc(mailId);
  await emailRef.set({ type: 'receipt', orderId: comp.orderId, to: 'delivered@resend.dev', status: 'pending', attempts: 0, createdAt: Date.now() });
  process.env.RESEND_API_KEY = 'resend-test-fixture';
  const originalFetch = global.fetch, deliveryBodies = []; let confirmDelivery = false;
  global.fetch = async (_url, options) => { deliveryBodies.push(options.body); const payload = JSON.parse(options.body); assert.equal(payload.attachments, undefined); assert.ok(!payload.text.includes('PLUTO1.')); return { ok: confirmDelivery }; };
  await service.emailJob(mailId);
  const retry = (await emailRef.get()).data(); assert.equal(retry.status, 'pending'); assert.ok(retry.token);
  await service.acceptRecovery(retry.token); await emailRef.update({ retryAt: 0 }); confirmDelivery = true;
  await service.emailJob(mailId); global.fetch = originalFetch;
  assert.equal(deliveryBodies[0], deliveryBodies[1], 'email retries retain an identical idempotent payload');
  assert.equal((await emailRef.get()).data().status, 'sent');
  await assert.rejects(() => service.acceptRecovery(retry.token), /already used/, 'email retry cannot reactivate a consumed capability');
  const Stripe = require('stripe'), express = require('express'), sdk = new Stripe('sk_test_fixture', { apiVersion: '2026-09-30.endive' });
  fake.webhooks = sdk.webhooks; process.env.STRIPE_WEBHOOK_SECRET = 'whsec_ticketing_fixture';
  const { ticketingRouter } = require('../lib/ticketing/routes'), app = express();
  // Firebase provides parsed JSON plus original bytes. Exercise that exact combination.
  app.use(express.json({ verify: (req, _res, buffer) => { req.rawBody = buffer; } })); app.use(ticketingRouter(() => ({}), service));
  const server = await new Promise(resolve => { const handle = app.listen(0, '127.0.0.1', () => resolve(handle)); });
  const endpoint = `http://127.0.0.1:${server.address().port}`;
  const routePin = await service.createScannerPin(pinEvent, 'API gate', undefined, staff);
  const post = (path, body = {}, token = '') => fetch(`${endpoint}/tickets/api/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Pluto-Scanner': token } : {}) }, body: JSON.stringify(body) });
  const loginResponse = await post('scanner/login', { pin: routePin.pin }); assert.equal(loginResponse.status, 200);
  const routeLogin = await loginResponse.json();
  for (const path of ['staff/events', 'staff/get', 'staff/orders', 'staff/scanner-pins', 'staff/scanner-pins/create', 'staff/roles', 'staff/cash', 'staff/refund', 'mine']) {
    assert.equal((await post(path, { eventId: pinEvent, orderId: pinOrder.orderId, uid: 'pretend-staff', label: 'Unauthorized', roles: ['manager'] }, routeLogin.token)).status, 401, `scanner has no access to ${path}`);
  }
  assert.equal((await post('staff/manifest', { eventId: eventId }, routeLogin.token)).status, 403);
  assert.equal((await post('staff/manifest', { eventId: pinEvent }, routeLogin.token)).status, 200);
  assert.equal((await (await post('staff/scan', { eventId: pinEvent, qr: revokedTicket.qr, scanId: randomUUID() }, routeLogin.token)).json()).result, 'accepted');
  await service.revokeScannerPin(pinEvent, routePin.id, staff);
  assert.equal((await post('staff/manifest', { eventId: pinEvent }, routeLogin.token)).status, 403);
  const eventKey = `evt_${randomUUID()}`, webhook = { id: eventKey, object: 'event', type: 'checkout.session.expired', livemode: false, data: { object: { id: recoverSnapshot.sessionId, metadata: { pluto_order_id: recoverOrder.orderId } } } };
  const payload = JSON.stringify(webhook), signature = sdk.webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET });
  assert.equal((await fetch(`${endpoint}/tickets/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Stripe-Signature': 'invalid' }, body: payload })).status, 400);
  for (let i = 0; i < 2; i++) assert.equal((await fetch(`${endpoint}/tickets/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Stripe-Signature': signature }, body: payload })).status, 200);
  const inboxId = `test_${eventKey}`; assert.ok((await db.collection('ticketingWebhookInbox').doc(inboxId).get()).exists);
  await pay(recoverOrder); await service.processWebhook(inboxId); await service.processWebhook(inboxId);
  assert.equal((await recoverRef.get()).data().status, 'paid', 'stale expiry event cannot release a paid order');
  assert.equal((await db.collection('ticketingWebhookInbox').doc(inboxId).get()).data().status, 'done');
  await new Promise(resolve => server.close(resolve));
  await service.pendingBatch('ticketingEmailJobs', ['pending'], 2);
  console.log('Ticketing integration checks passed: shared inventory/promotions, payments/refunds/transfers, recovery/claim, receipt-only PDF, event roles, account-free scanner PINs, scope/expiry/revocation, login throttle, concurrent duplicate admission, conflict review, API privilege isolation.');
}
main().then(() => process.exit(0), error => { console.error(error); process.exit(1); });
