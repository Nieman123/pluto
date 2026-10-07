const test = require('node:test');
const assert = require('node:assert/strict');
const { generateKeyPairSync, randomBytes, sign } = require('node:crypto');
const { readFile } = require('node:fs/promises');
const { signTicket, readTicket, ticketingSecrets } = require('../lib/ticketing/config');
const { signOfflineItem, readOfflineItem } = require('../lib/ticketing/offline-proof');
const { keyPair, verificationKeys, validateKeyring, assertVerificationKeyAccepted } = require('../lib/ticketing/signing');
const { pinLookupHashes, validatePinKeys } = require('../lib/ticketing/pin-keys');
const makeKey = () => generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64');
const k1 = makeKey(), k2 = makeKey();
const ring = { version: 1, activeKeyId: 'k2', legacyKeyId: 'k1', keys: { k1: keyPair(k1).jwk, k2: keyPair(k2).jwk }, revokedKeyIds: [] };
const rotated = { privateKey: k2, keyring: ring };
const ticket = { id: 'stable-ticket', eventId: 'event', version: 4, validFrom: '2026-10-06T00:00:00Z', validUntil: '2026-10-07T00:00:00Z' };
const item = { ...ticket, kind: 'ticket', leaseHash: 'a'.repeat(64) };

test('rotation accepts original, transitional and refreshed QR credentials with identical ticket identity', () => {
  const original = signTicket(ticket, k1), transitional = signTicket(ticket, { privateKey: k1, keyring: { ...ring, activeKeyId: 'k1' } });
  const refreshed = signTicket(ticket, rotated);
  assert.match(original, /^PLUTO1\./); assert.match(refreshed, /^PLUTO2\./);
  for (const qr of [original, transitional, refreshed]) {
    const parsed = readTicket(qr, rotated);
    for (const field of ['id', 'eventId', 'version', 'validFrom', 'validUntil']) assert.equal(parsed[field], ticket[field]);
  }
  assert.equal(readTicket(refreshed, rotated).kid, 'k2');
  assert.throws(() => signTicket(ticket, { privateKey: k1, keyring: ring }), /does not match/);
});

test('emergency revocation rejects legacy and tagged old signatures while preserving newly signed credentials', () => {
  const revoked = { ...rotated, keyring: { ...ring, revokedKeyIds: ['k1'] } };
  const oldTagged = signTicket(ticket, { privateKey: k1, keyring: { ...ring, activeKeyId: 'k1' } });
  for (const qr of [signTicket(ticket, k1), oldTagged]) assert.throws(() => readTicket(qr, revoked), /Invalid ticket/);
  assert.throws(() => readTicket(signTicket(ticket, k1), revoked), error => error.status === 409 && error.code === 'ticket-key-unavailable');
  assert.equal(readTicket(signTicket(ticket, revoked), revoked).id, ticket.id);
  assert.equal(verificationKeys(revoked).legacyKeyId, null);
  assert.deepEqual(Object.keys(verificationKeys(revoked).verificationKeys), ['k2']);
  assert.throws(() => assertVerificationKeyAccepted(revoked, 'k1'), /revoked signing key/);
  assert.throws(() => assertVerificationKeyAccepted(revoked, null), /revoked signing key/);
});

test('signed key IDs and purpose prevent substitution, unknown keys, unsigned legacy downgrade and cross-purpose replay', () => {
  const qr = signTicket(ticket, rotated), [prefix, data, signature] = qr.split('.');
  const changed = Buffer.from(JSON.stringify({ ...ticket, kid: 'k1' })).toString('base64url');
  assert.throws(() => readTicket(`${prefix}.${changed}.${signature}`, rotated), /Invalid ticket/);
  for (const kid of ['unknown', '__proto__']) {
    const payload = Buffer.from(JSON.stringify({ ...ticket, kid })).toString('base64url');
    const signed = sign(null, Buffer.from(`PLUTO2.${payload}`), keyPair(k2).privateKey).toString('base64url');
    assert.throws(() => readTicket(`PLUTO2.${payload}.${signed}`, rotated), /Invalid ticket/);
  }
  assert.throws(() => readTicket(`PLUTO1.${data}.${signature}`, rotated), /Invalid ticket/);
  const proof = signOfflineItem(item, rotated);
  assert.throws(() => readTicket(proof, rotated), /Invalid ticket/);
  assert.throws(() => readOfflineItem(qr, rotated), /Invalid offline/);
  assert.throws(() => readOfflineItem(proof.replace('PLUTO-OFFLINE2', 'PLUTO2'), rotated), /Invalid offline/);
  assert.throws(() => readTicket(qr + '.', rotated), /Invalid ticket/);
  assert.throws(() => readTicket(signOfflineItem(item, k1).replace('PLUTO-OFFLINE1', 'PLUTO1'), rotated), /Invalid ticket/, 'legacy preparation payload cannot become a ticket by relabeling its prefix');
});

test('offline proofs survive planned overlap and fail after revocation', () => {
  const old = signOfflineItem(item, k1), current = signOfflineItem(item, rotated);
  assert.equal(readOfflineItem(old, rotated).leaseHash, item.leaseHash);
  assert.equal(readOfflineItem(current, rotated).kid, 'k2');
  assert.throws(() => readOfflineItem(old, { ...rotated, keyring: { ...ring, revokedKeyIds: ['k1'] } }), /Invalid offline/);
  assert.throws(() => readOfflineItem(old, { ...rotated, keyring: { ...ring, revokedKeyIds: ['k1'] } }), error => error.status === 409 && error.code === 'offline-key-unavailable');
});

test('keyring configuration fails closed for private material, wrong algorithm, revoked active signer and missing IDs', () => {
  for (const change of [
    { keys: { ...ring.keys, k1: { ...ring.keys.k1, d: 'private' } } },
    { keys: { ...ring.keys, k1: { kty: 'RSA' } } },
    { revokedKeyIds: ['k2'] }, { revokedKeyIds: ['unknown'] }, { activeKeyId: 'unknown' }, { legacyKeyId: 'unknown' },
    { keys: { ...ring.keys, alias: ring.keys.k1 } },
  ]) assert.throws(() => validateKeyring({ ...ring, ...change }), /not configured/);
  assert.throws(() => readTicket(signTicket(ticket, k1), { ...rotated, keyring: { ...ring, legacyKeyId: null } }), /Invalid ticket/);
  if (process.env.TICKETING_KEY_ROTATION_ENABLED !== 'true') assert.equal(ticketingSecrets.length, 4, 'compatibility deploy needs no new secrets');
});

test('independent PIN lookups are stable across ticket rotation and preserve legacy lookup during migration', () => {
  const config = { version: 1, activeKeyId: 'pin1', keys: { pin1: randomBytes(32).toString('base64') }, legacySigningKey: k1 };
  const before = pinLookupHashes('12345678', config, k1), after = pinLookupHashes('12345678', config, rotated);
  assert.deepEqual(after, before);
  assert.equal(after[1], pinLookupHashes('12345678', undefined, k1)[0]);
  assert.notEqual(after[0], after[1]);
  assert.throws(() => pinLookupHashes('12345678', undefined, rotated), /Independent scanner PIN keys/);
  assert.throws(() => validatePinKeys({ ...config, keys: { pin1: 'weak' } }), /not configured/);
  assert.deepEqual(pinLookupHashes('12345678', { ...config, legacySigningKey: undefined }, rotated), [before[0]]);
});

test('browser offline verifier accepts overlap, survives public-only key distribution and rejects revoked keys', async () => {
  const source = await readFile(require('node:path').resolve(__dirname, '../../site/src/ticketing/verification.js'), 'utf8');
  const browser = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  const oldManifest = await browser.importVerificationKeys(verificationKeys(k1));
  const preparedBeforeActivation = await browser.importVerificationKeys(verificationKeys({ privateKey: k1, keyring: { ...ring, activeKeyId: 'k1' } }));
  const refreshed = signTicket(ticket, rotated);
  assert.equal((await browser.verifyTicketQr(signTicket(ticket, k1), oldManifest)).id, ticket.id);
  await assert.rejects(() => browser.verifyTicketQr(refreshed, oldManifest), /Reconnect/);
  assert.equal((await browser.verifyTicketQr(refreshed, preparedBeforeActivation)).id, ticket.id);
  assert.equal((await browser.verifyTicketQr(signTicket(ticket, k1), preparedBeforeActivation)).id, ticket.id);
  const revokedManifest = await browser.importVerificationKeys(verificationKeys({ ...rotated, keyring: { ...ring, revokedKeyIds: ['k1'] } }));
  await assert.rejects(() => browser.verifyTicketQr(signTicket(ticket, k1), revokedManifest), /Reconnect/);
  assert.equal((await browser.verifyTicketQr(refreshed, revokedManifest)).id, ticket.id);
  await assert.rejects(() => browser.verifyTicketQr(refreshed.replace('PLUTO2', 'PLUTO1'), preparedBeforeActivation), /Invalid ticket/);
});
