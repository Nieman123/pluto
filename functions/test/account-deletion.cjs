const { test } = require('node:test');
const assert = require('node:assert/strict');
const { getAuth } = require('firebase-admin/auth');
const { harness } = require('./ticketing-harness.cjs');
const { AccountDeletion, requireDeletionConfirmation } = require('../lib/account-deletion');
const express = require('express');
const { ticketingRouter } = require('../lib/ticketing/routes');

test('deletion requires explicit confirmation and recent authentication', () => {
  const now = Date.now(), key = 'a'.repeat(64), actor = { uid: 'owner', auth_time: Math.floor(now / 1000) };
  assert.equal(requireDeletionConfirmation(actor, { confirmation: 'DELETE', receipt: key }, now), key);
  assert.throws(() => requireDeletionConfirmation(actor, { receipt: key }, now), e => e.code === 'deletion-confirmation-required');
  assert.throws(() => requireDeletionConfirmation({ ...actor, auth_time: actor.auth_time - 301 }, { confirmation: 'DELETE', receipt: key }, now), e => e.code === 'recent-login-required');
  assert.throws(() => requireDeletionConfirmation({ ...actor, auth_time: NaN }, { confirmation: 'DELETE', receipt: key }, now));
});

test('durable deletion resumes across pages, removes personal data, preserves money and other ticket holders', async () => {
  const h = harness(), auth = getAuth(), uid = `${h.prefix}_delete`, victim = `${h.prefix}_other`, email = `${uid}@example.test`;
  const service = new AccountDeletion(h.db, auth), receipt = h.newKey(), prefix = `${h.prefix}_deletion`, roots = [];
  const root = (collection, id = prefix) => { const ref = h.db.collection(collection).doc(id); roots.push(ref); return ref; };
  const job = h.db.collection('accountDeletionRequests').doc(uid);
  try {
    await auth.createUser({ uid, email, password: 'Emulator-only-Deletion-2026!', emailVerified: true });
    await root('userProfiles', uid).set({ displayName: 'Delete me', bio: 'Private', profileImageDataUrl: 'image', pointsBalance: 42 });
    await h.db.collection('userProfiles').doc(uid).collection('pointsTransactions').doc('earned').set({ pointsDelta: 42 });
    await root('userProfiles', victim).set({ displayName: 'Keep me' });
    await root('adminUsers', uid).set({ role: 'admin' });
    await root('appReviewAccounts', uid).set({ enabled: true, email });
    await h.db.collection('appReviewAccounts').doc(uid).collection('rewardItems').doc('sample').set({ name: 'Demo reward' });
    const event = h.db.collection('ticketingEvents').doc(await h.event());
    const order = root('ticketingOrders');
    await order.set({ eventId: event.id, units: [], currency: 'usd', method: 'stripe', ownerUid: uid, email, name: 'Payer', status: 'paid', total: 10000, refundedAmount: 500, stripeFee: 300, paymentIntentId: 'pi_preserve', accessHash: 'old', accessRevision: 2 });
    const unpaid = root('ticketingOrders', `${prefix}_unpaid`);
    await unpaid.set({ eventId: event.id, units: [], currency: 'usd', method: 'stripe', ownerUid: uid, email, name: 'Unpaid', status: 'expired', total: 10000 });
    const batch = h.db.batch();
    for (let i = 0; i < 104; i++) {
      const ticket = root('ticketingTickets', `${prefix}_${String(i).padStart(3, '0')}`);
      batch.set(ticket, { ownerUid: uid, orderId: order.id, holderEmail: email, holderName: 'Private name', status: 'valid', version: 1 });
      if (i === 0) batch.set(ticket.collection('rewards').doc('check-in'), { creditedUid: uid, points: 42 });
    }
    const transferred = root('ticketingTickets', `${prefix}_transferred`);
    batch.set(transferred, { ownerUid: victim, orderId: order.id, holderEmail: 'other@example.test', holderName: 'Other holder', status: 'valid' });
    const staff = root('ticketingStaff'); batch.set(staff, { uid, roles: ['admission'] });
    const qr = root('eventQrCodes'); batch.set(qr, { totalClaims: 2 });
    batch.set(qr.collection('claims').doc(uid), { uid, claimedByEmail: email });
    batch.set(qr.collection('claims').doc(victim), { uid: victim });
    const emailJob = root('ticketingEmailJobs'); batch.set(emailJob, { orderId: order.id, to: email, status: 'pending', token: 'private', emailPayload: { html: 'private' } });
    await batch.commit();
    const pool = event.collection('pools').doc('admission'); await pool.set({ capacity: 100, held: 2, sold: 8 });
    const waitlist = root('ticketingWaitlist'); await waitlist.set({ ownerUid: uid, email, eventId: event.id, status: 'offered', consumption: { admission: 2 } });
    const raw = { confirmation: 'DELETE', receipt, uid: victim, email: 'victim@example.test' };
    const actor = { uid, auth_time: Math.floor(Date.now() / 1000), firebase: { sign_in_provider: 'password' } };
    await service.request(actor, raw); await service.request(actor, raw);
    assert.equal((await service.status({ receipt })).status, 'pending');
    await assert.rejects(service.status({ receipt: h.newKey() }), e => e.status === 404);
    await service.process(uid, 2);
    assert.equal((await auth.getUser(uid)).disabled, true);
    assert.equal((await h.db.collection('userProfiles').doc(uid).get()).exists, false);
    assert.equal((await job.get()).data().status, 'pending');
    await service.process(uid);
    assert.equal((await service.status({ receipt })).status, 'completed');
    await service.process(uid); // retry after completion is harmless
    await assert.rejects(auth.getUser(uid), e => e.code === 'auth/user-not-found');
    assert.equal((await h.db.collection('userProfiles').doc(victim).get()).data().displayName, 'Keep me');
    assert.equal((await h.db.collection('appReviewAccounts').doc(uid).collection('rewardItems').get()).size, 0);
    assert.equal((await qr.collection('claims').doc(uid).get()).exists, false);
    assert.equal((await qr.get()).data().totalClaims, 2);
    assert.equal((await qr.collection('claims').doc(victim).get()).exists, true);
    const paid = (await order.get()).data();
    assert.equal(paid.total, 10000); assert.equal(paid.refundedAmount, 500); assert.equal(paid.stripeFee, 300); assert.equal(paid.paymentIntentId, 'pi_preserve');
    assert.equal(paid.accessRevision, 3); assert.equal(paid.name, 'Payer'); assert.equal(paid.email, email);
    assert.equal((await unpaid.get()).data().email, '');
    const tickets = await h.db.collection('ticketingTickets').where('orderId', '==', order.id).get();
    assert.equal(tickets.size, 105);
    assert.equal(tickets.docs.filter(t => t.data().holderEmail === '' && t.data().status === 'valid').length, 104);
    assert.equal((await transferred.get()).data().holderName, 'Other holder');
    assert.equal((await pool.get()).data().held, 0); assert.equal((await pool.get()).data().sold, 8);
    assert.equal((await waitlist.get()).exists, false);
    assert.equal((await emailJob.get()).data().emailPayload, null); assert.equal((await emailJob.get()).data().to, '');
    assert.equal((await job.get()).data().email, undefined); assert.equal((await job.get()).data().uid, undefined);
    assert.equal((await staff.get()).exists, false);
  } finally {
    await auth.deleteUser(uid).catch(() => {});
    await job.delete(); for (const ref of roots) await h.db.recursiveDelete(ref);
    await h.cleanup();
  }
});

test('HTTP deletion targets the authenticated user and allows only receipt-based status after disable', async () => {
  const h = harness(), app = express(), auth = getAuth(); app.use(ticketingRouter(() => ({}), h.service));
  const server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`, receipt = h.newKey(); let uid;
  const call = async (path, body, token) => {
    const res = await fetch(`${base}/tickets/api/account/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  };
  try {
    const signup = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `${h.prefix}@example.test`, password: 'Emulator-only-2026!', returnSecureToken: true }) }).then(r => r.json());
    uid = signup.localId; assert.ok(uid);
    const body = { confirmation: 'DELETE', receipt, uid: 'victim' };
    assert.equal((await call('delete', body)).status, 401);
    assert.equal((await call('delete', body, 'invalid')).status, 401);
    assert.equal((await call('delete', body, signup.idToken)).status, 200);
    assert.equal((await call('deletion-status', { receipt })).body.status, 'pending');
    assert.equal((await call('navigation', {}, signup.idToken)).status, 401);
    await new AccountDeletion(h.db).process(uid);
    assert.equal((await call('deletion-status', { receipt }, 'invalid-stale-token')).body.status, 'completed');
  } finally {
    if (uid) { await auth.deleteUser(uid).catch(() => {}); await h.db.collection('accountDeletionRequests').doc(uid).delete(); }
    server.closeAllConnections(); await new Promise(r => server.close(r)); await h.cleanup();
  }
});

test('a failed final Auth deletion stays pending and maintenance resumes it', async () => {
  const h = harness(), auth = getAuth(), uid = `${h.prefix}_retry`, key = h.newKey(); let failOnce = true;
  const job = h.db.collection('accountDeletionRequests').doc(uid);
  const retryAuth = {
    getUser: value => auth.getUser(value), updateUser: (...args) => auth.updateUser(...args), revokeRefreshTokens: value => auth.revokeRefreshTokens(value),
    deleteUser: value => { if (failOnce) { failOnce = false; throw new Error('Simulated temporary Auth failure'); } return auth.deleteUser(value); },
  };
  const deletion = new AccountDeletion(h.db, retryAuth);
  try {
    await auth.createUser({ uid });
    await deletion.request({ uid, auth_time: Math.floor(Date.now() / 1000) }, { confirmation: 'DELETE', receipt: key });
    await assert.rejects(deletion.process(uid), /temporary Auth failure/);
    assert.equal((await deletion.status({ receipt: key })).status, 'pending');
    assert.equal((await job.get()).data().phase, 11);
    assert.equal((await auth.getUser(uid)).disabled, true);
    await deletion.recover();
    assert.equal((await deletion.status({ receipt: key })).status, 'completed');
  } finally { await auth.deleteUser(uid).catch(() => {}); await job.delete(); await h.cleanup(); }
});

test('Apple-linked deletion refuses another provider or missing revocation', async () => {
  const h = harness(), uid = `${h.prefix}_apple`, deletion = new AccountDeletion(h.db, {
    getUser: async () => ({ uid, providerData: [{ providerId: 'apple.com' }], emailVerified: false }),
  });
  const raw = { confirmation: 'DELETE', receipt: h.newKey() }, actor = { uid, auth_time: Math.floor(Date.now() / 1000), firebase: { sign_in_provider: 'password' } };
  try {
    await assert.rejects(deletion.request(actor, raw), e => e.code === 'apple-revocation-required');
    await assert.rejects(deletion.request({ ...actor, firebase: { sign_in_provider: 'apple.com' } }, raw), e => e.code === 'apple-revocation-required');
    assert.equal((await h.db.collection('accountDeletionRequests').doc(uid).get()).exists, false);
  } finally { await h.cleanup(); }
});
