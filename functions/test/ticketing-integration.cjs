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
  disputes: { list: async () => ({ data: [], has_more: false }) },
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
async function pay(result) { const order = (await service.order(result.orderId).get()).data(), session = sessions.get(order.sessionId); session.status = 'complete'; session.payment_status = 'paid'; session.payment_intent = { id: `pi_${result.orderId}`, latest_charge: { receipt_url: 'https://pay.stripe.com/test-receipt', balance_transaction: { id: `txn_${result.orderId}`, currency: 'usd', fee: 320 } } }; session.total_details = { amount_tax: 0 }; await service.verifySession(result.orderId); }
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
  const acceptedScan = await service.scan(active, ticket.qr, randomUUID(), staff);
  assert.equal(acceptedScan.result, 'accepted'); assert.equal(acceptedScan.holderName, 'Test buyer'); assert.equal(acceptedScan.name, 'Weekend');
  assert.equal((await service.scan(active, ticket.qr, randomUUID(), staff)).result, 'duplicate');
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
  const guestAttempt = newKey();
  const guestPoolBefore = (await service.event(pinEvent).collection('pools').doc('friday').get()).data();
  await service.addGuests(pinEvent, ['Alex Rivera', 'Sam Taylor', 'Offline Guest'], 'Artist list', guestAttempt, 'pin-event-manager');
  await service.addGuests(pinEvent, ['Alex Rivera', 'Sam Taylor', 'Offline Guest'], 'Artist list', guestAttempt, staff);
  await assert.rejects(() => service.addGuests(pinEvent, ['Different names'], '', guestAttempt, staff), /different names/);
  await assert.rejects(() => service.addGuests(pinEvent, ['Forged'], '', newKey(), scannerLogin.uid), /does not have access/);
  let guests = (await service.guestList(pinEvent, proof)).guests; assert.equal(guests.length, 3, 'bulk add retries cannot duplicate guests');
  assert.deepEqual((await service.event(pinEvent).collection('pools').doc('friday').get()).data(), guestPoolBefore, 'guest list leaves ticket stock intact');
  const guestManifest = await service.manifest(pinEvent, proof);
  assert.equal(guestManifest.guests.length, 3, 'offline manifest contains authorized guest list');
  await assert.rejects(() => service.guestList(eventId, proof), /assigned event/);
  const guest = guests[0]; await service.saveGuest(pinEvent, guest.id, 'Alex Updated', 'Door note', guest.version, staff);
  await assert.rejects(() => service.saveGuest(pinEvent, guest.id, 'Stale edit', '', guest.version, staff), /edited by someone else/);
  const guestScans = await Promise.all([service.arriveGuest(pinEvent, guest.id, randomUUID(), proof), service.arriveGuest(pinEvent, guest.id, randomUUID(), proof)]);
  assert.deepEqual(guestScans.map(s => s.result).sort(), ['accepted', 'duplicate'], 'two door devices cannot accept the same guest twice');
  const guestArrival = (await service.guestList(pinEvent, proof)).guests.find(g => g.id === guest.id); assert.ok(guestArrival.arrived);
  await service.saveGuest(pinEvent, guest.id, 'Alex Updated again', '', guestArrival.version, staff);
  assert.ok((await service.guestList(pinEvent, proof)).guests.find(g => g.id === guest.id).arrived, 'name edits retain arrival');
  const removedGuest = guests[1]; await service.saveGuest(pinEvent, removedGuest.id, '', '', removedGuest.version, staff, true);
  const removedAttempt = randomUUID(); assert.equal((await service.arriveGuest(pinEvent, removedGuest.id, removedAttempt, proof, true)).result, 'invalid');
  await service.reviewScan(pinEvent, removedAttempt, 'Guest removed from list after offline preparation.', proof);
  const offlineGuest = guests[2], guestScanId = randomUUID();
  const guestEvidence = { leaseToken: guestManifest.leaseToken, itemProof: guestManifest.guests.find(g => g.id === offlineGuest.id).itemProof, guestVersion: offlineGuest.version, deviceTime: Date.now() };
  assert.equal((await service.arriveGuest(pinEvent, offlineGuest.id, guestScanId, proof, true, guestEvidence)).result, 'accepted');
  assert.equal((await service.arriveGuest(pinEvent, offlineGuest.id, guestScanId, proof, true, guestEvidence)).result, 'accepted', 'replayed guest check-in is idempotent');
  await assert.rejects(() => service.arriveGuest(pinEvent, guest.id, guestScanId, proof), /attempt mismatch/);
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
  await assert.rejects(() => service.guestList(pinEvent, { scannerToken: secondLogin.token }), /revoked/);
  await assert.rejects(() => service.arriveGuest(pinEvent, guest.id, randomUUID(), { scannerToken: secondLogin.token }), /revoked/);
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
  const realNow = Date.now, throttleAt = realNow(); Date.now = () => throttleAt;
  try {
    await db.collection('ticketingRateLimits').doc(hash(`60000:${Math.floor(throttleAt / 60000)}:scanner-login-ip:${throttleIp}:0`)).set({ count: 40 });
    await assert.rejects(() => service.scannerLogin(scannerPin.pin, throttleIp), e => e.status === 429);
  } finally { Date.now = realNow; }
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
  await emailRef.set({ type: 'receipt', orderId: comp.orderId, to: (await service.order(comp.orderId).get()).data().email, status: 'pending', attempts: 0, createdAt: Date.now() });
  process.env.RESEND_API_KEY = 'resend-test-fixture';
  const originalFetch = global.fetch, deliveryBodies = []; let confirmDelivery = false;
  global.fetch = async (_url, options) => { deliveryBodies.push(options.body); const payload = JSON.parse(options.body); assert.equal(payload.attachments, undefined); assert.ok(!payload.text.includes('PLUTO1.')); assert.match(payload.html, /Open my tickets/); assert.ok(!payload.html.includes('PLUTO1.') && !payload.html.includes('Private secret venue')); assert.equal(options.headers['Idempotency-Key'], `pluto-${mailId}`); return { ok: confirmDelivery, json: async () => ({ id: 'email-test-retry' }) }; };
  await service.emailJob(mailId);
  const retry = (await emailRef.get()).data(); assert.equal(retry.status, 'pending'); assert.ok(retry.token);
  assert.ok(retry.emailPayload.html, 'rendered content is persisted before an uncertain provider result');
  const publicEventRef = db.collection('publishedEvents').doc(active), originalCity = (await publicEventRef.get()).data().city;
  await publicEventRef.update({ city: 'Changed after the first delivery attempt' });
  await service.acceptRecovery(retry.token); await emailRef.update({ retryAt: 0 }); confirmDelivery = true;
  try { await service.emailJob(mailId); } finally { global.fetch = originalFetch; await publicEventRef.update({ city: originalCity }); }
  assert.equal(deliveryBodies[0], deliveryBodies[1], 'email retries retain an identical idempotent payload');
  assert.equal((await emailRef.get()).data().status, 'sent');
  assert.equal((await emailRef.get()).data().emailPayload, null, 'delivered capability links are removed from the job snapshot');
  await assert.rejects(() => service.acceptRecovery(retry.token), /already used/, 'email retry cannot reactivate a consumed capability');
  const legacyId = `legacy_mail_${randomUUID()}`, legacyToken = newKey();
  await db.collection('ticketingEmailJobs').doc(legacyId).set({ type: 'receipt', orderId: comp.orderId, to: (await service.order(comp.orderId).get()).data().email, token: legacyToken, firstDeliveryAt: Date.now(), status: 'pending', attempts: 1, createdAt: Date.now() });
  global.fetch = async (_url, options) => { const payload = JSON.parse(options.body); assert.equal(payload.html, undefined, 'already attempted legacy deliveries preserve their previous text-only payload'); assert.match(payload.text, new RegExp(`#recovery=${legacyToken}`)); return { ok: true, json: async () => ({ id: 'email-test-legacy' }) }; };
  try { await service.emailJob(legacyId); } finally { global.fetch = originalFetch; }
  assert.equal((await db.collection('ticketingEmailJobs').doc(legacyId).get()).data().status, 'sent');
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
  for (const path of ['staff/events', 'staff/get', 'staff/orders', 'staff/all-orders', 'staff/order', 'staff/order/check-in', 'staff/scanner-pins', 'staff/scanner-pins/create', 'staff/roles', 'staff/cash', 'staff/refund', 'mine', 'staff/guestlist/add', 'staff/guestlist/save', 'staff/guestlist/remove']) {
    assert.equal((await post(path, { eventId: pinEvent, orderId: pinOrder.orderId, ticketId: revokedTicket.id, scanId: randomUUID(), guestId: guest.id, uid: 'pretend-staff', label: 'Unauthorized', roles: ['manager'] }, routeLogin.token)).status, 401, `scanner has no access to ${path}`);
  }
  assert.equal((await post('staff/manifest', { eventId: eventId }, routeLogin.token)).status, 403);
  assert.equal((await post('staff/manifest', { eventId: pinEvent }, routeLogin.token)).status, 200);
  assert.equal((await post('staff/guestlist', { eventId: pinEvent }, routeLogin.token)).status, 200);
  assert.equal((await post('staff/guestlist', { eventId }, routeLogin.token)).status, 403);
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
  await rsvpVipChecks();
  await service.pendingBatch('ticketingEmailJobs', ['pending'], 2);
  console.log('Ticketing integration checks passed: shared inventory/promotions, payments/refunds/transfers, recovery/claim, receipt-only PDF, event roles, account-free scanner PINs, scope/expiry/revocation, login throttle, concurrent duplicate admission, conflict review, API privilege isolation.');
}
async function rsvpVipChecks() {
  const { hash } = require('../lib/ticketing/domain');
  const mixed = mode => d => {
    d.registrationMode = mode; d.promos = [];
    const free = { ...d.offers[0], name: 'Free RSVP', unitAmount: 0, maxPerOrder: 1 };
    const vip = { ...free, id: 'vip', name: mode === 'rsvp' ? 'VIP admission' : 'VIP upgrade', unitAmount: 10000, kind: mode === 'rsvp' ? 'admission' : 'upgrade', pools: mode === 'rsvp' ? free.pools : { vip: 1 } };
    d.offers = [free, vip]; d.pools.push({ id: 'vip', name: 'VIP upgrades', capacity: 1 });
  };
  const freeRequest = (eventId, actor) => request(eventId, { email: actor.email, name: 'Approved RSVP Guest' });
  const vipRequest = (eventId, overrides = {}) => request(eventId, { items: [{ offerId: 'vip', quantity: 1 }], ...overrides });
  const open = await makeEvent(true, mixed('rsvp')), openVipRequest = vipRequest(open), openVip = await service.checkout(openVipRequest, buyer);
  await pay(openVip);
  const openView = await service.view(openVip.orderId, openVipRequest.accessKey, null);
  assert.equal(openView.tickets.length, 1); assert.equal(openView.tickets[0].name, 'VIP admission'); assert.ok(openView.tickets[0].qr);
  assert.equal((await service.scan(open, openView.tickets[0].qr, randomUUID(), staff)).result, 'accepted', 'open RSVP VIP includes entry without a separate RSVP');
  const freeOpen = await service.rsvp(freeRequest(open, buyer), buyer);
  assert.equal(freeOpen.rsvpStatus, 'approved');
  await assert.rejects(() => service.checkout(request(open), buyer), /RSVP form/);
  await assert.rejects(() => service.checkout(vipRequest(open, { items: [{ offerId: 'vip', quantity: 1 }, { offerId: 'weekend', quantity: 1 }] }), buyer), /one paid VIP/);

  const approval = await makeEvent(true, mixed('rsvp-approval')), registration = freeRequest(approval, buyer), pending = await service.rsvp(registration, buyer);
  await assert.rejects(() => service.rsvpUpgradeAccess({ eventId: approval, email: buyer.email }, buyer), /must be approved/);
  await assert.rejects(() => service.checkout(vipRequest(approval), buyer), /Verify your approved RSVP/);
  assert.equal((await service.event(approval).collection('pools').doc('vip').get()).data().held, 0);
  await service.reviewRsvp(approval, pending.orderId, 'approve', '', staff);
  const parent = await service.view(pending.orderId, registration.accessKey, null);
  assert.ok(parent.upgradeUrl); assert.equal(parent.tickets.length, 1);
  await assert.rejects(() => service.rsvpUpgradeAccess({ eventId: approval, email: buyer.email }, null), /Verify your RSVP email/);
  const verification = await service.requestRsvpVerification({ eventId: approval, email: buyer.email }, null, 'upgrade');
  const code = (await db.collection('ticketingEmailJobs').doc(`verify_${hash(verification.verificationToken)}`).get()).data().code;
  const proof = { eventId: approval, email: buyer.email, verificationToken: verification.verificationToken, verificationCode: code };
  const access = await service.rsvpUpgradeAccess(proof, null);
  await assert.rejects(() => service.rsvpUpgradeAccess(proof, null), /invalid or expired/);
  await assert.rejects(() => service.checkout(vipRequest(approval, { email: 'wrong@example.test', rsvpUpgradeToken: access.rsvpUpgradeToken }), null), /verification expired/);
  const purchase = vipRequest(approval, { name: 'Spoofed name', rsvpUpgradeToken: access.rsvpUpgradeToken }), vip = await service.checkout(purchase, buyer);
  await service.checkout(purchase, buyer);
  await assert.rejects(() => service.checkout(vipRequest(approval, { rsvpUpgradeToken: access.rsvpUpgradeToken }), buyer), /already used/);
  await assert.rejects(() => service.cancel(pending.orderId, registration.accessKey, null), /Close any VIP checkout/);
  assert.equal((await service.event(approval).collection('pools').doc('friday').get()).data().held, 0, 'VIP does not reserve another admission');
  assert.equal((await service.event(approval).collection('pools').doc('friday').get()).data().sold, 1);
  await pay(vip);
  let vipView = await service.view(vip.orderId, purchase.accessKey, null);
  assert.equal(vipView.name, 'Approved RSVP Guest'); assert.equal(vipView.rsvpOrderId, pending.orderId);
  assert.ok(vipView.tickets[0].qr); assert.equal(vipView.tickets[0].transferable, false);
  await assert.rejects(() => service.transfer(vip.orderId, purchase.accessKey, null, vipView.tickets[0].id, 'friend@example.test'), /cannot be transferred/);
  const vipQr = vipView.tickets[0].qr;
  await service.order(pending.orderId).update({ rsvpStatus: 'withdrawn' });
  assert.equal((await service.scan(approval, vipQr, randomUUID(), staff)).result, 'invalid', 'paid VIP cannot bypass an invalid parent RSVP');
  assert.equal((await service.view(vip.orderId, purchase.accessKey, null)).tickets[0].qr, null);
  assert.equal((await service.mine(buyer)).tickets.find(t => t.id === vipView.tickets[0].id).qr, null);
  assert.equal((await service.manifest(approval, staff)).tickets.find(t => t.id === vipView.tickets[0].id).status, 'invalid');
  await assert.rejects(() => service.walletTicket({ ticketId: vipView.tickets[0].id, accessKey: purchase.accessKey }, null), /not available/);
  assert.equal((await service.staffOrder(vip.orderId, staff)).tickets[0].canCheckIn, false);
  await service.order(pending.orderId).update({ rsvpStatus: 'approved' });
  await service.tickets().doc(parent.tickets[0].id).update({ version: 2 });
  assert.equal((await service.scan(approval, vipQr, randomUUID(), staff)).result, 'invalid', 'a reissued RSVP version does not revive old VIP access');
  await service.tickets().doc(parent.tickets[0].id).update({ version: 1 });
  assert.equal((await service.scan(approval, vipQr, randomUUID(), staff)).result, 'accepted');
  assert.equal((await service.attendance(approval, {}, staff)).counts.arrivals, 1, 'VIP also checks in its approved RSVP and counts one guest');
  assert.equal((await service.scan(approval, parent.tickets[0].qr, randomUUID(), staff)).result, 'duplicate');
  await service.refund(vip.orderId, [vipView.tickets[0].id], newKey(), staff);
  assert.equal((await service.event(approval).collection('pools').doc('vip').get()).data().sold, 1, 'used VIP capacity is not returned by a refund');
  assert.equal((await service.view(pending.orderId, registration.accessKey, null)).tickets[0].status, 'valid', 'VIP refund leaves the free RSVP intact');
  await assert.rejects(() => service.cancel(pending.orderId, registration.accessKey, null), /already arrived/);

  const refundEvent = await makeEvent(true, mixed('rsvp-approval')), refundRegistration = freeRequest(refundEvent, buyer), refundRsvp = await service.rsvp(refundRegistration, buyer);
  await service.reviewRsvp(refundEvent, refundRsvp.orderId, 'approve', '', staff);
  const refundAccess = await service.rsvpUpgradeAccess({ eventId: refundEvent, email: buyer.email }, buyer), refundRequest = vipRequest(refundEvent, { rsvpUpgradeToken: refundAccess.rsvpUpgradeToken });
  const refundVip = await service.checkout(refundRequest, buyer); await pay(refundVip);
  const refundView = await service.view(refundVip.orderId, refundRequest.accessKey, null);
  await service.refund(refundVip.orderId, [refundView.tickets[0].id], newKey(), staff);
  assert.equal((await service.event(refundEvent).collection('pools').doc('vip').get()).data().sold, 0, 'unused VIP capacity returns after refund');
  assert.equal((await service.view(refundRsvp.orderId, refundRegistration.accessKey, null)).tickets[0].status, 'valid');
  await service.cancel(refundRsvp.orderId, refundRegistration.accessKey, null);

  const promoEvent = await makeEvent(true, d => {
    mixed('rsvp-approval')(d);
    d.promos = [{ code: 'VIPCOMP', type: 'percent', value: 100, limit: 10, startsAt: d.offers[0].salesStart, endsAt: d.endAt, offerIds: ['vip'] }];
  });
  const promoRegistration = freeRequest(promoEvent, buyer), promoRsvp = await service.rsvp(promoRegistration, buyer);
  await service.reviewRsvp(promoEvent, promoRsvp.orderId, 'approve', '', staff);
  const promoAccess = await service.rsvpUpgradeAccess({ eventId: promoEvent, email: buyer.email }, buyer);
  const promoPurchase = vipRequest(promoEvent, { promoCode: 'VIPCOMP', rsvpUpgradeToken: promoAccess.rsvpUpgradeToken }), promoVip = await service.checkout(promoPurchase, buyer);
  assert.equal(promoVip.status, 'paid'); assert.equal(promoVip.total, 0);
  await assert.rejects(() => service.cancel(promoRsvp.orderId, promoRegistration.accessKey, null), /close your discounted VIP/);
  const promoView = await service.view(promoVip.orderId, promoPurchase.accessKey, null);
  const promoRefund = await service.refund(promoVip.orderId, [promoView.tickets[0].id], newKey(), staff);
  assert.equal(promoRefund.amount, 0);
  assert.equal((await service.event(promoEvent).collection('pools').doc('vip').get()).data().sold, 0);
  await service.cancel(promoRsvp.orderId, promoRegistration.accessKey, null);

  const expiryEvent = await makeEvent(true, mixed('rsvp-approval')), expiryRegistration = freeRequest(expiryEvent, buyer), expiryRsvp = await service.rsvp(expiryRegistration, buyer);
  await service.reviewRsvp(expiryEvent, expiryRsvp.orderId, 'approve', '', staff);
  const expired = await service.rsvpUpgradeAccess({ eventId: expiryEvent, email: buyer.email }, buyer);
  await db.collection('ticketingRsvpUpgradeAccess').doc(hash(expired.rsvpUpgradeToken)).update({ expiresAt: 0 });
  await assert.rejects(() => service.checkout(vipRequest(expiryEvent, { rsvpUpgradeToken: expired.rsvpUpgradeToken }), buyer), /verification expired/);
  const withdrawn = await service.rsvpUpgradeAccess({ eventId: expiryEvent, email: buyer.email }, buyer);
  await service.cancel(expiryRsvp.orderId, expiryRegistration.accessKey, null);
  await assert.rejects(() => service.checkout(vipRequest(expiryEvent, { rsvpUpgradeToken: withdrawn.rsvpUpgradeToken }), buyer), /approved RSVP is required/);
  assert.equal((await service.event(expiryEvent).collection('pools').doc('vip').get()).data().held, 0);

  const windowEvent = await makeEvent(true, d => {
    mixed('rsvp-approval')(d);
    d.offers[0].validFrom = new Date(Date.now() - 30 * 60000).toISOString();
    d.offers[0].validUntil = new Date(Date.now() + 86400000).toISOString();
  });
  const windowRegistration = freeRequest(windowEvent, buyer), windowRsvp = await service.rsvp(windowRegistration, buyer);
  await service.reviewRsvp(windowEvent, windowRsvp.orderId, 'approve', '', staff);
  const windowParent = await service.view(windowRsvp.orderId, windowRegistration.accessKey, null);
  const windowAccess = await service.rsvpUpgradeAccess({ eventId: windowEvent, email: buyer.email }, buyer);
  const windowPurchase = vipRequest(windowEvent, { rsvpUpgradeToken: windowAccess.rsvpUpgradeToken }), windowVip = await service.checkout(windowPurchase, buyer);
  const windowOrder = (await service.order(windowVip.orderId).get()).data();
  assert.equal(windowOrder.units[0].validFrom, windowParent.tickets[0].validFrom, 'VIP cannot admit before the parent RSVP window');
  assert.equal(windowOrder.units[0].validUntil, windowParent.tickets[0].validUntil, 'VIP cannot extend the parent RSVP window');
  // A parent revoked outside the normal withdrawal flow must never mint a VIP
  // QR when its delayed payment arrives. Keep the hold for operator review.
  await service.tickets().doc(windowParent.tickets[0].id).update({ status: 'void' });
  await pay(windowVip);
  const windowReview = await service.view(windowVip.orderId, windowPurchase.accessKey, null);
  assert.equal(windowReview.status, 'review'); assert.equal(windowReview.tickets.length, 0);
  assert.equal((await service.event(windowEvent).collection('pools').doc('vip').get()).data().held, 1);
  console.log('RSVP VIP checks passed: direct paid admission, free RSVP, email/approval gating, one-use verification, retries, distinct capacity, nontransferable upgrades, parent revocation/version gates, wallet/manifest/admin checks and independent VIP refunds.');
}
main().then(() => process.exit(0), error => { console.error(error); process.exit(1); });
