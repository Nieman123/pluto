const test = require('node:test');
const assert = require('node:assert/strict');
const { generateKeyPairSync, randomBytes, randomUUID } = require('node:crypto');
const { harness } = require('./ticketing-harness.cjs');
const { keyPair } = require('../lib/ticketing/signing');
const { readTicket } = require('../lib/ticketing/config');
const { Operations } = require('../lib/ticketing/operations');

test('staged rotation keeps paid tickets, legacy PINs, existing sessions and offline replay intact', async () => {
  const h = harness();
  try {
    const eid = await h.event(), raw = h.request(eid, { items: [{ offerId: 'weekend', quantity: 3 }] });
    const result = await h.service.checkout(raw, null); await h.pay(result.orderId);
    const oldTickets = (await h.service.view(result.orderId, raw.accessKey, null)).tickets;
    const oldPin = await h.service.createScannerPin(eid, 'Old door PIN', Date.now() + 86400000, h.staff);
    const oldLogin = await h.service.scannerLogin(oldPin.pin, h.prefix);
    const proof = { scannerToken: oldLogin.token }, oldManifest = await h.service.manifest(eid, proof);
    const k2 = generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64');
    const ring = { version: 1, activeKeyId: 'k2', legacyKeyId: 'k1', keys: { k1: keyPair(h.signingKey).jwk, k2: keyPair(k2).jwk }, revokedKeyIds: [] };
    const pins = { version: 1, activeKeyId: 'pin1', keys: { pin1: randomBytes(32).toString('base64') }, legacySigningKey: h.signingKey };
    const rotated = new Operations(h.db, { stripe: h.fake, signingKey: { privateKey: k2, keyring: ring }, scannerPinKeys: pins });
    const current = (await rotated.view(result.orderId, raw.accessKey, null)).tickets;
    assert.deepEqual(current.map(t => [t.id, readTicket(t.qr, { privateKey: k2, keyring: ring }).version, t.admission]), oldTickets.map(t => [t.id, readTicket(t.qr, h.signingKey).version, t.admission]));
    assert.ok(current.every(t => t.qr.startsWith('PLUTO2.')));
    assert.equal((await rotated.scannerSession(oldLogin.token)).eventId, eid);
    assert.equal((await rotated.scannerLogin(oldPin.pin, `${h.prefix}_rotate`)).eventId, eid);
    // Successful legacy login has created the independent lookup; remove the migration secret.
    delete pins.legacySigningKey;
    assert.equal((await rotated.scannerLogin(oldPin.pin, `${h.prefix}_retire`)).eventId, eid);
    const freshPin = await rotated.createScannerPin(eid, 'New door PIN', Date.now() + 86400000, h.staff);
    assert.equal((await rotated.scannerLogin(freshPin.pin, `${h.prefix}_new`)).eventId, eid);
    const oldItem = oldManifest.tickets.find(t => t.id === oldTickets[0].id);
    const detail = { leaseToken: oldManifest.leaseToken, itemProof: oldItem.itemProof, deviceTime: Date.now() };
    assert.equal((await rotated.scan(eid, oldTickets[0].qr, randomUUID(), proof, true, detail)).result, 'accepted');
    assert.equal((await rotated.scan(eid, current[0].qr, randomUUID(), proof)).result, 'duplicate');
    const newManifest = await rotated.manifest(eid, proof);
    assert.deepEqual(Object.keys(newManifest.verificationKeys), ['k1', 'k2']);
    assert.equal(newManifest.verificationKey, undefined);
    assert.equal((await rotated.scan(eid, current[1].qr, randomUUID(), proof)).result, 'accepted');
    // A refund remains authoritative for both generations of QR.
    await rotated.refund(result.orderId, [current[2].id], h.newKey(), h.staff);
    for (const qr of [oldTickets[2].qr, current[2].qr]) assert.equal((await rotated.scan(eid, qr, randomUUID(), proof)).result, 'invalid');
    assert.equal((await rotated.order(result.orderId).get()).data().status, 'paid');
  } finally { await h.cleanup(); }
});

test('emergency revocation blocks old credentials, offline proofs and previously verified manager conflicts', async () => {
  const h = harness(), realNow = Date.now;
  try {
    const eid = await h.event(), raw = h.request(eid), result = await h.service.checkout(raw, null); await h.pay(result.orderId);
    await h.service.addGuests(eid, ['Rotation guest'], '', h.newKey(), h.staff);
    const ticket = (await h.service.view(result.orderId, raw.accessKey, null)).tickets[0], manifest = await h.service.manifest(eid, h.staff);
    const detail = { leaseToken: manifest.leaseToken, itemProof: manifest.tickets.find(t => t.id === ticket.id).itemProof, deviceTime: realNow() }, scanId = randomUUID();
    Date.now = () => realNow() + 73 * 3600000;
    assert.equal((await h.service.scan(eid, ticket.qr, scanId, h.staff, true, detail)).result, 'offline-replay-expired');
    const guest = manifest.guests[0], guestScanId = randomUUID();
    assert.equal((await h.service.arriveGuest(eid, guest.id, guestScanId, h.staff, true, { leaseToken: manifest.leaseToken, itemProof: guest.itemProof, guestVersion: guest.version, deviceTime: detail.deviceTime })).result, 'offline-replay-expired');
    Date.now = realNow;
    const k2 = generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64');
    const signingKey = { privateKey: k2, keyring: { version: 1, activeKeyId: 'k2', legacyKeyId: 'k1', keys: { k1: keyPair(h.signingKey).jwk, k2: keyPair(k2).jwk }, revokedKeyIds: ['k1'] } };
    const rotated = new Operations(h.db, { stripe: h.fake, signingKey });
    const refreshed = (await rotated.view(result.orderId, raw.accessKey, null)).tickets[0];
    await assert.rejects(() => rotated.scan(eid, ticket.qr, randomUUID(), h.staff), /Invalid ticket/);
    await assert.rejects(() => rotated.scan(eid, refreshed.qr, randomUUID(), h.staff, true, detail), /Invalid offline/);
    await assert.rejects(() => rotated.resolveOfflineScan(eid, scanId, 'confirm', 'Compromised preparation', h.staff), /revoked signing key/);
    await assert.rejects(() => rotated.resolveOfflineScan(eid, guestScanId, 'confirm', 'Compromised guest preparation', h.staff), /revoked signing key/);
    assert.equal((await rotated.tickets().doc(ticket.id).get()).data().admission, null);
    assert.equal((await rotated.scan(eid, refreshed.qr, randomUUID(), h.staff)).result, 'accepted');
  } finally { Date.now = realNow; await h.cleanup(); }
});

test('a transferred ticket refreshes under the active key while both prior QR generations remain invalid', async () => {
  const h = harness(), realNow = Date.now;
  try {
    const now = realNow(), eid = await h.event(d => { d.startAt = d.admissionStartsAt = new Date(now + 1800000).toISOString(); d.offers.forEach(o => o.validFrom = d.startAt); });
    const raw = h.request(eid), result = await h.service.checkout(raw, null); await h.pay(result.orderId);
    const original = (await h.service.view(result.orderId, raw.accessKey, null)).tickets[0];
    const k2 = generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64');
    const signingKey = { privateKey: k2, keyring: { version: 1, activeKeyId: 'k2', legacyKeyId: 'k1', keys: { k1: keyPair(h.signingKey).jwk, k2: keyPair(k2).jwk }, revokedKeyIds: [] } };
    const rotated = new Operations(h.db, { stripe: h.fake, signingKey });
    const refreshed = (await rotated.view(result.orderId, raw.accessKey, null)).tickets[0];
    await rotated.transfer(result.orderId, raw.accessKey, null, original.id, 'recipient@example.test');
    const job = (await h.db.collection('ticketingEmailJobs').where('orderId', '==', result.orderId).get()).docs.find(d => d.data().type === 'transfer').data();
    const recipient = await rotated.acceptTransfer(job.token, null);
    assert.equal(recipient.id, original.id); assert.equal(recipient.version, readTicket(original.qr, h.signingKey).version + 1); assert.match(recipient.qr, /^PLUTO2\./);
    Date.now = () => now + 1860000;
    for (const qr of [original.qr, refreshed.qr]) assert.equal((await rotated.scan(eid, qr, randomUUID(), h.staff)).result, 'invalid');
    assert.equal((await rotated.scan(eid, recipient.qr, randomUUID(), h.staff)).result, 'accepted');
  } finally { Date.now = realNow; await h.cleanup(); }
});
