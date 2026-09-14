// Run explicitly with the isolated local Firebase emulators; never against production.
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { writeFileSync, mkdirSync } = require('node:fs');
const { join } = require('node:path');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');
const { getAuth } = require('firebase-admin/auth');
const express = require('express');
if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_STORAGE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST || process.env.GCLOUD_PROJECT !== 'demo-pluto-waiver') throw new Error('Isolated emulators required');
initializeApp({ projectId: 'demo-pluto-waiver' });
const { WaiverService } = require('../lib/waiver/service');
const { waiverRouter } = require('../lib/waiver/routes');
const doc = require('../lib/waiver/document');
const service = new WaiverService(), db = getFirestore();
const app = express(); app.use('/manafest-waiver', waiverRouter(() => ({}), service));
const valid = () => ({ receiptKey: randomBytes(32).toString('hex'), fullName: 'Integration Attendee', email: 'integration@example.com', phone: '555-010-2345', emergencyName: 'Integration Contact', emergencyRelationship: 'Friend', emergencyPhone: '555-010-9876', version: doc.version, documentHash: doc.documentHash, consentVersion: doc.consentVersion, acknowledgments: { adult: true, agreement: true, electronic: true }, signature: { type: 'typed', text: 'Integration Attendee' } });
(async () => {
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}/manafest-waiver/api/`;
  const post = (path, body, token, origin = 'http://127.0.0.1:4173') => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  try {
    assert.equal((await post('submit', valid(), null, 'https://attacker.example')).status, 403);
    assert.equal((await post('submit', { ...valid(), acknowledgments: {} })).status, 400);
    assert.equal((await post('submit', { ...valid(), version: 'outdated' })).status, 409);
    assert.equal((await post('submit', { ...valid(), fullName: 'x'.repeat(200000) })).status, 413);
    const input = valid();
    const simultaneous = await Promise.all([post('submit', input), post('submit', input)]);
    assert.deepEqual(simultaneous.map(r => r.status), [200, 200]);
    const [first, second] = await Promise.all(simultaneous.map(r => r.json()));
    assert.equal(first.confirmationId, second.confirmationId);
    const stored = (await db.collection('manafestWaivers').doc(doc.hash(input.receiptKey)).get()).data();
    assert.equal(stored.status, 'completed'); assert.equal(stored.waiverText, doc.waiverText); assert.equal(stored.sourcePdfHash, doc.sourcePdfHash);
    assert.equal(stored.signedAt.toDate().toISOString(), stored.signedAtUtc);
    assert.equal((await post('submit', { ...input, email: 'different@example.com' })).status, 409);
    const pdfResponse = await post('download', { receiptKey: input.receiptKey });
    assert.equal(pdfResponse.status, 200); assert.match(pdfResponse.headers.get('cache-control'), /private, no-store/);
    const pdf = Buffer.from(await pdfResponse.arrayBuffer()); assert.equal(doc.hash(pdf), stored.pdfHash);
    mkdirSync(join(__dirname, '../../tmp/pdfs'), { recursive: true });
    writeFileSync(join(__dirname, '../../tmp/pdfs/signed-test.pdf'), pdf);
    assert.equal((await post('download', { receiptKey: randomBytes(32).toString('hex') })).status, 404);
    assert.equal((await post('staff/search', { query: 'Integration' })).status, 401);
    assert.equal((await post('staff/download', { confirmationId: first.confirmationId })).status, 401);
    async function userToken(uid) {
      await getAuth().createUser({ uid });
      const customToken = await getAuth().createCustomToken(uid);
      const result = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: customToken, returnSecureToken: true }) });
      return (await result.json()).idToken;
    }
    const uid = `staff-${Date.now()}`, token = await userToken(uid);
    assert.equal((await post('staff/search', { query: 'Integration' }, token)).status, 403);
    await db.collection('adminUsers').doc(uid).set({ role: 'admin' });
    for (const query of ['integration attendee', 'integration@example.com', first.confirmationId]) {
      const result = await post('staff/search', { query }, token); assert.equal(result.status, 200); assert.ok((await result.json()).results.some(r => r.confirmationId === first.confirmationId));
    }
    assert.equal((await post('staff/download', { confirmationId: first.confirmationId }, token)).status, 200);
    await db.collection('adminUsers').doc(uid).delete();
    assert.equal((await post('staff/download', { confirmationId: first.confirmationId }, token)).status, 403);
    // Lose the final database commit after the PDF upload; no completion is returned.
    const retryInput = valid(), originalTransaction = db.runTransaction.bind(db); let transactionCount = 0;
    db.runTransaction = (...args) => { if (++transactionCount === 3) throw new Error('Injected final commit failure'); return originalTransaction(...args); };
    assert.equal((await post('submit', retryInput)).status, 503); db.runTransaction = originalTransaction;
    const pending = (await db.collection('manafestWaivers').doc(doc.hash(retryInput.receiptKey)).get()).data();
    assert.equal(pending.status, 'pending');
    assert.equal((await post('download', { receiptKey: retryInput.receiptKey })).status, 404);
    const liveVersion = doc.version, liveConsentVersion = doc.consentVersion;
    doc.version = 'future-waiver-version'; doc.consentVersion = 'future-consent-version';
    const retry = await post('submit', retryInput);
    doc.version = liveVersion; doc.consentVersion = liveConsentVersion;
    assert.equal(retry.status, 200); assert.equal((await retry.json()).confirmationId, pending.confirmationId);
    const recovered = (await db.collection('manafestWaivers').doc(doc.hash(retryInput.receiptKey)).get()).data();
    assert.equal(recovered.version, retryInput.version); assert.equal(recovered.consentVersion, retryInput.consentVersion);
    assert.equal(recovered.waiverText, pending.waiverText);
    // Force storage failure before saving, then verify retry succeeds without false confirmation.
    const originalBucket = service.bucket;
    service.bucket = { file: () => ({ save: async () => { throw new Error('Injected storage outage'); } }) };
    const failInput = valid(); assert.equal((await post('submit', failInput)).status, 503); service.bucket = originalBucket;
    assert.equal((await db.collection('manafestWaivers').doc(doc.hash(failInput.receiptKey)).get()).exists, false);
    assert.equal((await post('submit', failInput)).status, 200);
    const drawn = valid(); drawn.signature = { type: 'drawn', strokes: [[{x:.1,y:.2},{x:.2,y:.8},{x:.4,y:.2},{x:.6,y:.6},{x:.9,y:.3}]] };
    assert.equal((await post('submit', drawn)).status, 200);
    const rateIdentity = `integration-rate-${Date.now()}`;
    await service.rateLimit(rateIdentity, 'test', 1);
    await assert.rejects(service.rateLimit(rateIdentity, 'test', 1), err => err.status === 429);
    console.log('PASS: durable typed/drawn saves; concurrency; immutable payloads; download integrity; validation; private responses; staff authentication/authorization/revocation; failed storage and final commit; retry recovery; rate limits.');
  } finally { server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
