const { test } = require('node:test');
const assert = require('node:assert/strict');
const { getAuth } = require('firebase-admin/auth');
const express = require('express');
const { harness } = require('./ticketing-harness.cjs');
const { AppReview, seedAppReview } = require('../lib/app-review');
const { Rewards } = require('../lib/rewards');
const { ticketingRouter } = require('../lib/ticketing/routes');
const { readTicket } = require('../lib/ticketing/config');

test('demo enrollment is idempotent; rewards and QR claims are isolated and retry-safe', async () => {
  const h = harness(), uid = `${h.prefix}_review`, email = `${uid}@example.test`, actor = { uid, email }, review = new AppReview(h.db);
  const liveProfile = h.db.collection('userProfiles').doc(uid);
  const liveReward = h.db.collection('rewardItems').doc(`${h.prefix}_live`);
  try {
    await liveProfile.set({ pointsBalance: 17, lifetimePoints: 17 });
    await liveReward.set({ name: 'Live reward', pointsCost: 1, isActive: true, inventory: 1 });
    await seedAppReview(h.db, uid, email);
    assert.equal(await review.enrolled(uid), true);
    const wallet = await review.handle('/mine', { uid: 'victim' }, actor);
    assert.equal(wallet.demo, true); assert.equal(wallet.tickets.length, 2);
    for (const t of wallet.tickets) {
      assert.ok(t.qr.startsWith('pluto-review:'));
      assert.throws(() => readTicket(t.qr, h.signingKey), e => e.status === 400 && e.message === 'Invalid ticket.');
      assert.equal(t.transferable, false);
    }
    await assert.rejects(review.handle('/order', { orderId: h.prefix }, actor), e => e.status === 404);
    const body = { rewardItemId: 'review-sticker', attempt: h.newKey() };
    const results = await Promise.all([review.handle('/rewards/redeem', body, actor), review.handle('/rewards/redeem', body, actor)]);
    assert.deepEqual(results[0], results[1]); assert.equal(results[0].newPointsBalance, 400);
    const profile = review.account(uid).collection('userProfiles').doc(uid);
    await seedAppReview(h.db, uid, email);
    assert.equal((await profile.get()).data().pointsBalance, 400, 'repeat enrollment preserves demo activity');
    await assert.rejects(seedAppReview(h.db, uid, 'other@example.test'));
    await assert.rejects(review.handle('/rewards/redeem', { rewardItemId: liveReward.id, attempt: h.newKey() }, actor), e => e.code === 'reward-missing');
    await assert.rejects(new Rewards(h.db).redeem(body, actor), e => e.code === 'reward-missing');
    const claim = { code: 'PLUTO-REVIEW', attempt: h.newKey() };
    assert.equal((await review.handle('/rewards/claim', claim, actor)).newPointsBalance, 500);
    assert.equal((await review.handle('/rewards/claim', claim, actor)).newPointsBalance, 500);
    await assert.rejects(review.handle('/rewards/claim', { ...claim, attempt: h.newKey() }, actor), e => e.code === 'already-claimed');
    assert.equal((await review.account(uid).collection('eventQrCodes').doc('review-hunt').collection('claims').get()).size, 0);
    assert.equal((await liveProfile.get()).data().pointsBalance, 17); assert.equal((await liveReward.get()).data().inventory, 1);
    await review.handle('/rewards/redeem', { ...body, attempt: h.newKey() }, actor);
    assert.equal((await review.handle('/review/refill', {}, actor)).newPointsBalance, 500);
    assert.equal((await review.handle('/review/refill', {}, actor)).newPointsBalance, 500);
    const before = (await profile.collection('pointsTransactions').get()).size;
    await review.account(uid).update({ enabled: false });
    await seedAppReview(h.db, uid, email); assert.equal((await review.account(uid).get()).data().enabled, false);
    await assert.rejects(review.handle('/mine', {}, actor), e => e.code === 'demo-disabled');
    await assert.rejects(new Rewards(h.db, Date.now, uid).redeem(body, actor), e => e.code === 'demo-disabled');
    assert.equal((await profile.collection('pointsTransactions').get()).size, before);
  } finally { await h.db.recursiveDelete(review.account(uid)); await liveProfile.delete(); await liveReward.delete(); await h.cleanup(); }
});

test('HTTP demo selection requires a verified, enrolled identity and intercepts all live operations', async () => {
  const h = harness(), review = new AppReview(h.db), auth = getAuth(), users = [], app = express();
  app.use(ticketingRouter(() => ({}), h.service));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, body = {}, token) => {
    const response = await fetch(`${base}/tickets/api${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
    return { status: response.status, data: await response.json() };
  };
  const signup = async () => {
    const user = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true }) }).then(r => r.json());
    assert.ok(user.idToken); users.push(user.localId); return user;
  };
  try {
    const demo = await signup(), member = await signup();
    await seedAppReview(h.db, demo.localId, `${demo.localId}@example.test`);
    assert.equal((await call('/mine')).status, 401);
    assert.equal((await call('/mine', {}, 'invalid-token')).status, 401);
    const normal = await call('/mine', { demo: true, uid: demo.localId }, member.idToken);
    assert.equal(normal.status, 200); assert.equal(normal.data.demo, undefined); assert.deepEqual(normal.data.tickets, []);
    const wallet = await call('/mine', {}, demo.idToken);
    assert.equal(wallet.status, 200); assert.equal(wallet.data.demo, true);
    const order = await call('/order', { orderId: wallet.data.orders[0].orderId }, demo.idToken);
    assert.equal(order.data.tickets.length, 1); assert.equal(order.data.demo, true);
    for (const path of ['/checkout', '/rsvp', '/transfer', '/resend', '/recover', '/staff/scan', '/staff/save', '/scanner/login', '/wallet/google']) {
      const result = await call(path, {}, demo.idToken);
      assert.equal(result.status, 403, path); assert.equal(result.data.code, 'demo-only');
    }
    assert.equal((await call('/account/navigation', {}, demo.idToken)).data.admin, false);
    const publicEvents = await fetch(`${base}/tickets/api/public/events`).then(r => r.json());
    assert.ok(publicEvents.events.every(e => e.demo !== true));
    const ownEvents = await fetch(`${base}/tickets/api/public/events`, { headers: { Authorization: `Bearer ${demo.idToken}` } }).then(r => r.json());
    assert.equal(ownEvents.events.length, 2); assert.ok(ownEvents.events.every(e => e.demo === true));
    assert.equal((await h.db.collection('ticketingOrders').where('ownerUid', '==', demo.localId).get()).size, 0);
    assert.equal((await h.db.collection('ticketingTickets').where('holderUid', '==', demo.localId).get()).size, 0);
    await review.account(demo.localId).update({ enabled: false });
    assert.equal((await call('/mine', {}, demo.idToken)).data.code, 'demo-disabled');
    assert.equal((await fetch(`${base}/tickets/api/public/events`, { headers: { Authorization: `Bearer ${demo.idToken}` } })).status, 403);
  } finally {
    await new Promise(resolve => server.close(resolve));
    for (const uid of users) { await h.db.recursiveDelete(review.account(uid)); await auth.deleteUser(uid); }
    await h.cleanup();
  }
});
