const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { hash } = require('../lib/ticketing/domain');
const { readTicket } = require('../lib/ticketing/config');
const { harness } = require('./ticketing-harness.cjs');
const evidence = (manifest, ticketId, at = Date.now()) => ({ leaseToken: manifest.leaseToken, itemProof: manifest.tickets.find(t => t.id === ticketId).itemProof, deviceTime: at });

test('A5: offline ticket and guest admissions use bounded original time after windows close', async () => {
  const h = harness(), realNow = Date.now;
  try {
    const now = realNow(), eid = await h.event(d => { d.endAt = new Date(now + 600000).toISOString(); d.offers.forEach(o => { o.salesEnd = d.endAt; o.validUntil = d.endAt; }); });
    const raw = h.request(eid, { items: [{ offerId: 'weekend', quantity: 2 }] }), result = await h.service.checkout(raw, null); await h.pay(result.orderId);
    const tickets = (await h.service.view(result.orderId, raw.accessKey, null)).tickets;
    await h.service.addGuests(eid, ['Offline Guest'], '', h.newKey(), h.staff);
    const manifest = await h.service.manifest(eid, h.staff), guest = manifest.guests[0], recordedAt = realNow();
    const detail = evidence(manifest, tickets[0].id, recordedAt), guestDetail = { leaseToken: manifest.leaseToken, itemProof: guest.itemProof, guestVersion: guest.version, deviceTime: recordedAt };
    Date.now = () => now + 7 * 3600000;
    assert.equal((await h.service.scan(eid, tickets[1].qr, randomUUID(), h.staff)).result, 'outside-window');
    const sid = randomUUID(), scanned = await h.service.scan(eid, tickets[0].qr, sid, h.staff, true, detail);
    assert.equal(scanned.result, 'accepted'); assert.equal(scanned.at, recordedAt); assert.equal(scanned.syncedAt, Date.now());
    assert.equal((await h.service.scan(eid, tickets[0].qr, sid, h.staff, true, detail)).result, 'accepted');
    assert.equal((await h.service.arriveGuest(eid, guest.id, randomUUID(), h.staff, true, guestDetail)).result, 'accepted');
    assert.equal((await h.service.tickets().doc(tickets[0].id).get()).data().admission.at, recordedAt);
    assert.equal((await h.service.event(eid).collection('guests').doc(guest.id).get()).data().arrival.at, recordedAt);
  } finally { Date.now = realNow; await h.cleanup(); }
});

test('A5: proof and lease scope reject arbitrary backdating, future times, tampering and cross-scanner use', async () => {
  const h = harness();
  try {
    const eid = await h.event(), raw = h.request(eid), result = await h.service.checkout(raw, null); await h.pay(result.orderId);
    const ticket = (await h.service.view(result.orderId, raw.accessKey, null)).tickets[0], manifest = await h.service.manifest(eid, h.staff), detail = evidence(manifest, ticket.id);
    assert.throws(() => readTicket(detail.itemProof, h.signingKey), /Invalid ticket/, 'preparation proof cannot be used as an admission QR');
    await assert.rejects(() => h.service.scan(eid, ticket.qr, randomUUID(), h.staff, true, { ...detail, deviceTime: manifest.generatedAt - 1 }), /outside.*window/);
    await assert.rejects(() => h.service.scan(eid, ticket.qr, randomUUID(), h.staff, true, { ...detail, deviceTime: manifest.offlineUntil + 1 }), /outside.*window/);
    await assert.rejects(() => h.service.scan(eid, ticket.qr, randomUUID(), h.staff, true, { ...detail, itemProof: detail.itemProof + 'x' }), /Invalid offline/);
    const pin = await h.service.createScannerPin(eid, 'Different scanner', Date.now() + 86400000, h.staff), login = await h.service.scannerLogin(pin.pin, h.prefix);
    await assert.rejects(() => h.service.scan(eid, ticket.qr, randomUUID(), { scannerToken: login.token }, true, detail), /different scanner/);
    assert.equal((await h.service.scan(eid, ticket.qr, randomUUID(), h.staff, true)).result, 'offline-unverified');
    assert.equal((await h.service.tickets().doc(ticket.id).get()).data().admission, null);
  } finally { await h.cleanup(); }
});

test('A5: lease expiry permits earlier recorded scans; expired sessions require reauthentication and revoked PINs stay denied', async () => {
  const h = harness(), realNow = Date.now;
  try {
    const now = realNow(), eid = await h.event(), raw = h.request(eid, { items: [{ offerId: 'weekend', quantity: 2 }] }), result = await h.service.checkout(raw, null); await h.pay(result.orderId);
    const tickets = (await h.service.view(result.orderId, raw.accessKey, null)).tickets;
    const pin = await h.service.createScannerPin(eid, 'Door', now + 2 * 86400000, h.staff), login = await h.service.scannerLogin(pin.pin, h.prefix), proof = { scannerToken: login.token }, manifest = await h.service.manifest(eid, proof);
    const details = tickets.map(t => evidence(manifest, t.id));
    await h.db.collection('ticketingScannerSessions').doc(hash(login.token)).update({ expiresAt: now - 1 });
    Date.now = () => now + 5 * 3600000;
    await assert.rejects(() => h.service.scan(eid, tickets[0].qr, randomUUID(), proof, true, details[0]), /expired/);
    const renewed = await h.service.scannerLogin(pin.pin, `${h.prefix}_renew`), renewedProof = { scannerToken: renewed.token };
    assert.equal((await h.service.scan(eid, tickets[0].qr, randomUUID(), renewedProof, true, details[0])).result, 'accepted');
    await h.service.revokeScannerPin(eid, pin.id, h.staff);
    await assert.rejects(() => h.service.scan(eid, tickets[1].qr, randomUUID(), renewedProof, true, details[1]), /revoked/);
    assert.equal((await h.service.tickets().doc(tickets[1].id).get()).data().admission, null);
  } finally { Date.now = realNow; await h.cleanup(); }
});

test('A5: manager review repairs late replay ledgers exactly once and requires manager privilege', async () => {
  const h = harness(), realNow = Date.now;
  try {
    const now = realNow(), eid = await h.event(), raw = h.request(eid), result = await h.service.checkout(raw, null); await h.pay(result.orderId);
    const ticket = (await h.service.view(result.orderId, raw.accessKey, null)).tickets[0], manifest = await h.service.manifest(eid, h.staff), detail = evidence(manifest, ticket.id), scanId = randomUUID();
    Date.now = () => now + 73 * 3600000;
    assert.equal((await h.service.scan(eid, ticket.qr, scanId, h.staff, true, detail)).result, 'offline-replay-expired');
    await assert.rejects(() => h.service.resolveOfflineScan(eid, scanId, 'confirm', 'Verified wristband', 'ordinary-user'), /access/);
    const resolved = await h.service.resolveOfflineScan(eid, scanId, 'confirm', 'Verified admission was recorded before close', h.staff); assert.equal(resolved.result, 'accepted');
    await h.service.resolveOfflineScan(eid, scanId, 'confirm', 'Retry', h.staff);
    const admission = (await h.service.tickets().doc(ticket.id).get()).data().admission;
    assert.equal(admission.at, detail.deviceTime); assert.equal(admission.resolvedBy, h.staff);
    assert.equal((await h.service.event(eid).collection('audit').where('action', '==', 'offline-admission-resolved').get()).size, 1);
  } finally { Date.now = realNow; await h.cleanup(); }
});

for (const mutation of ['refund', 'transfer', 'cancel']) test(`A5: ${mutation} invalidates stale offline credentials and manager resolution cannot restore them`, async () => {
  const h = harness(), realNow = Date.now;
  try {
    const now = realNow(), eid = await h.event(d => { if (mutation === 'transfer') { d.startAt = d.admissionStartsAt = new Date(now + 1800000).toISOString(); d.offers.forEach(o => o.validFrom = d.startAt); } });
    const raw = h.request(eid), result = await h.service.checkout(raw, null); await h.pay(result.orderId);
    const ticket = (await h.service.view(result.orderId, raw.accessKey, null)).tickets[0], manifest = await h.service.manifest(eid, h.staff);
    const detail = evidence(manifest, ticket.id, mutation === 'transfer' ? now + 1860000 : realNow());
    if (mutation === 'refund') await h.service.refund(result.orderId, [ticket.id], h.newKey(), h.staff);
    else if (mutation === 'cancel') await h.service.publish(eid, 'cancel', 1, h.staff);
    else {
      await h.service.transfer(result.orderId, raw.accessKey, null, ticket.id, 'recipient@example.test');
      const job = (await h.db.collection('ticketingEmailJobs').where('orderId', '==', result.orderId).get()).docs.find(d => d.data().type === 'transfer').data();
      await h.service.acceptTransfer(job.token, null); Date.now = () => now + 1900000;
    }
    const scanId = randomUUID(); assert.equal((await h.service.scan(eid, ticket.qr, scanId, h.staff, true, detail)).result, 'invalid');
    await assert.rejects(() => h.service.resolveOfflineScan(eid, scanId, 'confirm', 'Review stale credential', h.staff), /cannot authorize|cannot be safely/);
    assert.equal((await h.service.tickets().doc(ticket.id).get()).data().admission, null);
    await h.service.resolveOfflineScan(eid, scanId, 'reject', 'Original credential was invalidated', h.staff);
  } finally { Date.now = realNow; await h.cleanup(); }
});

test('A5: a manager can import a revoked scanner queue for explicit ticket and guest ledger resolution', async () => {
  const h = harness();
  try {
    const eid = await h.event(), raw = h.request(eid), result = await h.service.checkout(raw, null); await h.pay(result.orderId);
    await h.service.addGuests(eid, ['Review Guest'], '', h.newKey(), h.staff);
    const ticket = (await h.service.view(result.orderId, raw.accessKey, null)).tickets[0], pin = await h.service.createScannerPin(eid, 'Review Door', Date.now() + 86400000, h.staff), login = await h.service.scannerLogin(pin.pin, h.prefix), proof = { scannerToken: login.token };
    const manifest = await h.service.manifest(eid, proof), guest = manifest.guests[0];
    const ticketItem = { eventId: eid, scanId: randomUUID(), qr: ticket.qr, ...evidence(manifest, ticket.id) };
    const guestItem = { eventId: eid, scanId: randomUUID(), kind: 'guest', guestId: guest.id, guestVersion: guest.version, leaseToken: manifest.leaseToken, itemProof: guest.itemProof, deviceTime: Date.now() };
    await h.service.revokeScannerPin(eid, pin.id, h.staff);
    for (const item of [ticketItem, guestItem]) {
      await assert.rejects(() => h.service.submitOfflineReview(eid, item, login.uid), /access/);
      const imported = await h.service.submitOfflineReview(eid, item, h.staff); assert.equal(imported.result, 'offline-manager-review'); assert.equal(imported.uid, login.uid);
      await Promise.all([h.service.resolveOfflineScan(eid, item.scanId, 'confirm', 'Verified original door record', h.staff), h.service.resolveOfflineScan(eid, item.scanId, 'confirm', 'Concurrent retry', h.staff)]);
    }
    assert.equal((await h.service.tickets().doc(ticket.id).get()).data().admission.uid, login.uid);
    assert.equal((await h.service.event(eid).collection('guests').doc(guest.id).get()).data().arrival.uid, login.uid);
    assert.equal((await h.service.event(eid).collection('audit').where('action', '==', 'offline-admission-resolved').get()).size, 2);
  } finally { await h.cleanup(); }
});
