const test = require('node:test');
const assert = require('node:assert/strict');
const { generateKeyPairSync, verify, createHash } = require('node:crypto');
const { mkdtempSync, writeFileSync, readFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { spawnSync } = require('node:child_process');
const { DigitalWallet } = require('../lib/ticketing/digital-wallet');
const { signTicket } = require('../lib/ticketing/config');
const pair = generateKeyPairSync('ed25519'), encoded = pair.privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64');
const ticket = { id: 'ticket_123', version: 2, orderId: 'order_123', eventId: 'event_123', eventTitle: 'A Night in Orbit', eventSlug: 'orbit', name: 'Weekend pass', holderName: 'Test Guest',
  validFrom: new Date(Date.now() + 86400000).toISOString(), validUntil: new Date(Date.now() + 172800000).toISOString(), startAt: new Date(Date.now() + 86400000).toISOString(), endAt: new Date(Date.now() + 172800000).toISOString(),
  timezone: 'America/New_York', venueName: 'Private venue', address: 'Private address', city: 'Asheville', region: 'NC', publicVenue: false };
ticket.qr = signTicket({ id: ticket.id, eventId: ticket.eventId, version: 2, validFrom: ticket.validFrom, validUntil: ticket.validUntil }, encoded);
function unzipStored(zip) {
  const files = {}; let offset = 0;
  while (zip.readUInt32LE(offset) === 0x04034b50) {
    assert.equal(zip.readUInt16LE(offset + 8), 0);
    const size = zip.readUInt32LE(offset + 18), nameSize = zip.readUInt16LE(offset + 26), extra = zip.readUInt16LE(offset + 28), start = offset + 30 + nameSize + extra;
    files[zip.subarray(offset + 30, offset + 30 + nameSize).toString()] = zip.subarray(start, start + size); offset = start + size;
  }
  return files;
}
function openssl(dir, args, success = true) {
  const binary = process.platform === 'win32' ? 'C:/Program Files/Git/usr/bin/openssl.exe' : 'openssl';
  const result = spawnSync(binary, args, { cwd: dir, encoding: 'utf8' });
  if (success) assert.equal(result.status, 0, result.stderr || String(result.error));
  return result;
}
test('Apple pass manifest and detached CMS verify independently; tampering fails', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pluto-wallet-'));
  try {
    openssl(dir, ['req', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'wwdr.key', '-out', 'wwdr.csr', '-subj', '/CN=Wallet test CA']);
    writeFileSync(join(dir, 'ca.ext'), 'basicConstraints=critical,CA:TRUE\nkeyUsage=critical,keyCertSign,cRLSign\nsubjectKeyIdentifier=hash\n');
    openssl(dir, ['x509', '-req', '-in', 'wwdr.csr', '-signkey', 'wwdr.key', '-out', 'wwdr.pem', '-days', '2', '-extfile', 'ca.ext']);
    openssl(dir, ['req', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'signer.key', '-out', 'signer.csr', '-subj', '/CN=Wallet test/OU=TESTTEAM01/UID=pass.events.pluto.test']);
    writeFileSync(join(dir, 'leaf.ext'), 'basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\nsubjectKeyIdentifier=hash\nauthorityKeyIdentifier=keyid,issuer\n');
    openssl(dir, ['x509', '-req', '-in', 'signer.csr', '-CA', 'wwdr.pem', '-CAkey', 'wwdr.key', '-CAcreateserial', '-out', 'signer.pem', '-days', '2', '-extfile', 'leaf.ext']);
    const apple = { passTypeIdentifier: 'pass.events.pluto.test', teamIdentifier: 'TESTTEAM01', signerCert: readFileSync(join(dir, 'signer.pem'), 'utf8'), signerKey: readFileSync(join(dir, 'signer.key'), 'utf8'), wwdr: readFileSync(join(dir, 'wwdr.pem'), 'utf8') };
    const wallet = new DigitalWallet({ apple });
    assert.equal(wallet.options().apple, true);
    const files = unzipStored(await wallet.apple(ticket)), manifest = JSON.parse(files['manifest.json']);
    for (const [name, hash] of Object.entries(manifest)) assert.equal(createHash('sha1').update(files[name]).digest('hex'), hash);
    const pass = JSON.parse(files['pass.json']); assert.equal(pass.barcodes[0].message, ticket.qr); assert.equal(pass.sharingProhibited, true); assert.equal(pass.serialNumber, 'ticket_123_v2');
    assert.ok(files['icon@3x.png']); assert.ok(files['logo@2x.png']);
    writeFileSync(join(dir, 'manifest.json'), files['manifest.json']); writeFileSync(join(dir, 'signature'), files.signature);
    const args = ['cms', '-verify', '-binary', '-inform', 'DER', '-in', 'signature', '-content', 'manifest.json', '-CAfile', 'wwdr.pem', '-purpose', 'any', '-out', 'verified.json'];
    openssl(dir, args); assert.deepEqual(readFileSync(join(dir, 'verified.json')), files['manifest.json']);
    writeFileSync(join(dir, 'manifest.json'), Buffer.concat([files['manifest.json'], Buffer.from('tamper')])); assert.notEqual(openssl(dir, args, false).status, 0);
    assert.equal(new DigitalWallet({ apple: { ...apple, teamIdentifier: 'OTHERTEAM1' } }).options().apple, false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('Google persists scoped pass objects and signs a compact save JWT', async () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const google = { issuerId: '123456', clientEmail: 'wallet@pluto-test.iam.gserviceaccount.com', privateKey: privateKey.export({ format: 'pem', type: 'pkcs8' }).toString() }, calls = [];
  const fake = async (url, options) => {
    calls.push({ url, ...options });
    if (url.endsWith('/token')) return new Response(JSON.stringify({ access_token: 'test-access', expires_in: 3600 }));
    if (options.method === 'GET') return new Response('', { status: 404 });
    return new Response('{}');
  };
  const url = await new DigitalWallet({ google }, fake).google(ticket), token = url.split('/').at(-1), [header, payload, signature] = token.split('.');
  assert.equal(verify('RSA-SHA256', Buffer.from(`${header}.${payload}`), publicKey, Buffer.from(signature, 'base64url')), true);
  const data = JSON.parse(Buffer.from(payload, 'base64url')); assert.deepEqual(data.payload.eventTicketObjects, [{ id: '123456.pluto_ticket_123_v2' }]); assert.ok(token.length < 1800);
  const oauth = new URLSearchParams(calls[0].body).get('assertion').split('.'); assert.equal(verify('RSA-SHA256', Buffer.from(`${oauth[0]}.${oauth[1]}`), publicKey, Buffer.from(oauth[2], 'base64url')), true);
  const eventClass = JSON.parse(calls.find(c => c.url.endsWith('/eventTicketClass') && c.method === 'POST').body);
  assert.equal(eventClass.multipleDevicesAndHoldersAllowedStatus, 'ONE_USER_ALL_DEVICES'); assert.ok(!JSON.stringify(eventClass).includes('Private'));
  const object = JSON.parse(calls.find(c => c.url.endsWith('/eventTicketObject') && c.method === 'POST').body); assert.equal(object.barcode.value, ticket.qr); assert.equal(object.passConstraints.screenshotEligibility, 'INELIGIBLE');
  assert.ok(!url.includes(ticket.qr));
});
test('missing configuration and Google provider failures are isolated from ticket access', async () => {
  assert.deepEqual(new DigitalWallet({}).options(), { apple: false, google: false });
  await assert.rejects(new DigitalWallet({}).apple(ticket), e => e.status === 503 && e.code === 'wallet-unavailable');
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const google = { issuerId: '123', clientEmail: 'wallet@test.iam.gserviceaccount.com', privateKey: privateKey.export({ format: 'pem', type: 'pkcs8' }).toString() };
  await assert.rejects(new DigitalWallet({ google }, async () => { throw new Error('Sensitive provider error'); }).google(ticket), e => e.status === 503 && !e.message.includes('Sensitive'));
});
