const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Timestamp } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const express = require('express');
const { harness } = require('./ticketing-harness.cjs');
const { Rewards } = require('../lib/rewards');
const { ticketingRouter } = require('../lib/ticketing/routes');

function setup() {
  const h = harness(), profiles = new Set(), qrs = new Set(), items = new Set(); let time = Date.now();
  const service = new Rewards(h.db, () => time), actor = { uid: `${h.prefix}_buyer`, email: `${h.prefix}@example.test`, name: 'Rewards Guest' };
  const profile = uid => { profiles.add(uid); return h.db.collection('userProfiles').doc(uid); };
  async function qr(overrides = {}) { const ref = h.db.collection('eventQrCodes').doc(randomUUID()); qrs.add(ref.id); await ref.set({ code: `TEST-${ref.id}`.toUpperCase(), eventName: 'Rewards Event', pointsAwarded: 100, isActive: true, totalClaims: 0, ...overrides }); return ref; }
  async function reward(overrides = {}) { const ref = h.db.collection('rewardItems').doc(randomUUID()); items.add(ref.id); await ref.set({ name: 'Shirt', pointsCost: 100, inventory: 1, isActive: true, ...overrides }); return ref; }
  async function claim(ref, attempt = h.newKey(), user = actor) { profile(user.uid); return service.claim({ code: (await ref.get()).data().code, attempt }, user); }
  async function cleanup() { for (const uid of profiles) await h.db.recursiveDelete(profile(uid)); for (const qr of qrs) await h.db.recursiveDelete(h.db.collection('eventQrCodes').doc(qr)); for (const item of items) await h.db.collection('rewardItems').doc(item).delete(); await h.cleanup(); }
  return { ...h, operations: h.service, service, actor, profile, qr, reward, claim, cleanup, advance: ms => time += ms, now: () => time };
}
const rejectsCode = (promise, code) => assert.rejects(promise, error => error.code === code);

test('A6: concurrent same-attempt awards and lost-response retries update balances, attendance and logs once', async () => {
  const h = setup();
  try {
    const qr = await h.qr(), key = h.newKey();
    const responses = await Promise.all([h.claim(qr, key), h.claim(qr, key)]); assert.deepEqual(responses[0], responses[1]);
    await h.claim(qr, key);
    const p = (await h.profile(h.actor.uid).get()).data();
    assert.equal(p.pointsBalance, 100); assert.equal(p.lifetimePoints, 100); assert.equal(p.eventsAttended, 1);
    assert.equal((await qr.get()).data().totalClaims, 1); assert.equal((await h.profile(h.actor.uid).collection('pointsTransactions').get()).size, 1);
    await rejectsCode(h.claim(qr), 'already-claimed');
    const other = await h.qr(); await rejectsCode(h.claim(other, key), 'attempt-conflict');
    await qr.update({ isActive: false }); assert.deepEqual(await h.claim(qr, key), responses[0], 'a recorded success remains retrievable');
  } finally { await h.cleanup(); }
});
test('A6: simultaneous QR claims enforce server cooldown and UTC daily limits', async () => {
  const h = setup();
  try {
    const qrs = await Promise.all(Array.from({ length: 11 }, () => h.qr()));
    const results = await Promise.allSettled([h.claim(qrs[0]), h.claim(qrs[1])]); assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal(results.find(r => r.status === 'rejected').reason.code, 'claim-cooldown');
    const winner = results[0].status === 'fulfilled' ? 0 : 1, remaining = qrs.filter((_, i) => i !== winner);
    for (let i = 0; i < 9; i++) { h.advance(30001); await h.claim(remaining[i]); }
    h.advance(30001); await rejectsCode(h.claim(remaining[9]), 'daily-claim-limit');
    h.advance(86400000); await h.claim(remaining[9]);
    assert.equal((await h.profile(h.actor.uid).get()).data().eventsAttended, 11);
  } finally { await h.cleanup(); }
});
test('A6: expired, inactive, ambiguous, unopened and full QR configurations cannot award points', async () => {
  const h = setup();
  try {
    for (const [config, expected] of [[{ isActive: false }, 'qr-inactive'], [{ expiresAt: Timestamp.fromMillis(h.now()) }, 'qr-expired'], [{ startsAt: Timestamp.fromMillis(h.now() + 10000) }, 'qr-not-open'], [{ maxClaims: 0 }, 'qr-full'], [{ pointsAwarded: 0 }, 'invalid-points'], [{ pointsAwarded: -1 }, 'invalid-rewards-state']]) await rejectsCode(h.claim(await h.qr(config)), expected);
    const first = await h.qr(); await h.qr({ code: (await first.get()).data().code }); await rejectsCode(h.claim(first), 'qr-ambiguous');
    assert.equal((await h.profile(h.actor.uid).get()).exists, false);
  } finally { await h.cleanup(); }
});
test('A6: competing attendees cannot exceed a final event claim or reward inventory', async () => {
  const h = setup();
  try {
    const other = { ...h.actor, uid: `${h.prefix}_other` }, qr = await h.qr({ maxClaims: 1 });
    const claims = await Promise.allSettled([h.claim(qr), h.claim(qr, h.newKey(), other)]); assert.equal(claims.filter(r => r.status === 'fulfilled').length, 1); assert.equal((await qr.get()).data().totalClaims, 1);
    await h.profile(h.actor.uid).set({ pointsBalance: 100 }); await h.profile(other.uid).set({ pointsBalance: 100 });
    const item = await h.reward(), results = await Promise.allSettled([h.service.redeem({ rewardItemId: item.id, attempt: h.newKey() }, h.actor), h.service.redeem({ rewardItemId: item.id, attempt: h.newKey() }, other)]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1); assert.equal(results.find(r => r.status === 'rejected').reason.code, 'out-of-stock');
    assert.equal((await item.get()).data().inventory, 0);
    assert.equal((await h.profile(h.actor.uid).get()).data().pointsBalance + (await h.profile(other.uid).get()).data().pointsBalance, 100);
  } finally { await h.cleanup(); }
});
test('A6: redemption retries are idempotent and distinct competing requests cannot overdraw', async () => {
  const h = setup();
  try {
    await h.profile(h.actor.uid).set({ pointsBalance: 100, lifetimePoints: 500, eventsAttended: 2 });
    const item = await h.reward({ inventory: 3 }), key = h.newKey(), body = { rewardItemId: item.id, attempt: key, pointsCost: 1, pointsBalance: 999999 };
    const results = await Promise.all([h.service.redeem(body, h.actor), h.service.redeem(body, h.actor)]); assert.deepEqual(results[0], results[1]); assert.equal(results[0].pointsCost, 100);
    assert.deepEqual(await h.service.redeem(body, h.actor), results[0]);
    let p = (await h.profile(h.actor.uid).get()).data(); assert.equal(p.pointsBalance, 0); assert.equal(p.lifetimePoints, 500); assert.equal(p.eventsAttended, 2); assert.equal((await item.get()).data().inventory, 2);
    assert.equal((await h.profile(h.actor.uid).collection('redemptionRequests').get()).size, 1);
    const other = await h.reward(); await rejectsCode(h.service.redeem({ ...body, rewardItemId: other.id }, h.actor), 'attempt-conflict');
    await h.profile(h.actor.uid).update({ pointsBalance: 100 });
    const competing = await Promise.allSettled([h.service.redeem({ ...body, attempt: h.newKey() }, h.actor), h.service.redeem({ ...body, attempt: h.newKey() }, h.actor)]);
    assert.equal(competing.filter(r => r.status === 'fulfilled').length, 1); assert.equal(competing.find(r => r.status === 'rejected').reason.code, 'insufficient-points');
    p = (await h.profile(h.actor.uid).get()).data(); assert.equal(p.pointsBalance, 0);
  } finally { await h.cleanup(); }
});
test('A6: forged identity and malformed balances cannot debit or award points', async () => {
  const h = setup();
  try {
    const item = await h.reward(), qr = await h.qr(); await h.profile(h.actor.uid).set({ pointsBalance: '100' });
    await rejectsCode(h.service.redeem({ rewardItemId: item.id, attempt: h.newKey(), uid: 'victim' }, h.actor), 'account-mismatch');
    await rejectsCode(h.service.redeem({ rewardItemId: item.id, attempt: h.newKey() }, h.actor), 'invalid-rewards-state');
    await rejectsCode(h.claim(qr), 'invalid-rewards-state');
    assert.equal((await item.get()).data().inventory, 1); assert.equal((await qr.get()).data().totalClaims, 0);
  } finally { await h.cleanup(); }
});
test('A6: HTTP rewards require verified Firebase identity; anonymous and scanner proofs have no rewards authority', async () => {
  const h = setup(), app = express(); app.use(ticketingRouter(() => ({}), h.operations));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); let uid;
  const call = async (path, body, headers = {}) => { const response = await fetch(`http://127.0.0.1:${server.address().port}/tickets/api/rewards/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) }); return { status: response.status, body: await response.json() }; };
  try {
    const qr = await h.qr(), item = await h.reward(), body = { code: (await qr.get()).data().code, attempt: h.newKey(), pointsAwarded: 1000000, deviceTime: 0 };
    assert.equal((await call('claim', body)).status, 401); assert.equal((await call('claim', body, { 'X-Pluto-Scanner': h.newKey() })).status, 401);
    assert.equal((await call('claim', body, { Authorization: 'Bearer invalid' })).status, 401);
    const signed = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true }) }).then(r => r.json());
    assert.ok(signed.idToken); uid = signed.localId; h.profile(uid);
    const headers = { Authorization: `Bearer ${signed.idToken}` };
    assert.equal((await call('claim', { ...body, uid: h.actor.uid }, headers)).status, 403);
    const claimed = await call('claim', body, headers); assert.equal(claimed.status, 200); assert.equal(claimed.body.pointsAwarded, 100);
    const redeemed = await call('redeem', { rewardItemId: item.id, attempt: h.newKey(), pointsCost: 1 }, headers); assert.equal(redeemed.status, 200); assert.equal(redeemed.body.pointsCost, 100);
    assert.equal((await h.profile(uid).get()).data().pointsBalance, 0); assert.equal((await h.profile(h.actor.uid).get()).exists, false);
  } finally { await new Promise(resolve => server.close(resolve)); if (uid) await getAuth().deleteUser(uid); await h.cleanup(); }
});
