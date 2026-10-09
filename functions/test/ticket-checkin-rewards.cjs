const test = require('node:test'), assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { harness } = require('./ticketing-harness.cjs');
const { Rewards } = require('../lib/rewards');
const { validateDraft } = require('../lib/ticketing/domain');
const { fixture } = require('./ticketing-fixture.cjs');

function setup() {
  const h = harness(), profiles = new Set(), qrIds = new Set();
  const actor = (suffix = 'buyer') => {
    const uid = `${h.prefix}_${suffix}`; profiles.add(uid);
    return { uid, email: `${uid}@example.test`, email_verified: true, name: suffix };
  };
  const profile = user => h.db.collection('userProfiles').doc(user.uid);
  async function purchase(eid, user, quantity = 1) {
    const raw = h.request(eid, { ...(user ? { email: user.email, name: user.name } : {}), items: [{ offerId: 'weekend', quantity }], checkInPoints: 999999 });
    const result = await h.service.checkout(raw, user); await h.pay(result.orderId);
    return { raw, ...result, tickets: (await h.service.view(result.orderId, raw.accessKey, user)).tickets };
  }
  const cleanup = async () => { for (const uid of profiles) await h.db.recursiveDelete(h.db.collection('userProfiles').doc(uid));
    for (const key of qrIds) await h.db.recursiveDelete(h.db.collection('eventQrCodes').doc(key)); await h.cleanup(); };
  return { ...h, actor, profile, purchase, cleanup, qrIds };
}

test('ticket settings default rewards off and reject negative, fractional and oversized awards', () => {
  const draft = fixture(true);
  assert.equal(validateDraft(draft).offers[0].checkInPoints, 0);
  for (const checkInPoints of [-1, 1.5, 1000001]) {
    assert.throws(() => validateDraft({ ...draft, offers: draft.offers.map(o => ({ ...o, checkInPoints })) }), /check-in Pluto Points/);
  }
});

test('different ticket types award configured points once, including concurrent scans and manual check-in', async () => {
  const h = setup();
  try {
    const user = h.actor(), eid = await h.event(d => { d.offers[0].checkInPoints = 75; d.offers[1].checkInPoints = 25; });
    await h.profile(user).set({ displayName: 'Keep me', pointsBalance: 10, lifetimePoints: 100, eventsAttended: 3 });
    const order = await h.purchase(eid, user, 2), ticket = order.tickets[0], scanId = randomUUID();
    const results = await Promise.all([h.service.scan(eid, ticket.qr, scanId, h.staff), h.service.scan(eid, ticket.qr, randomUUID(), h.staff)]);
    assert.deepEqual(results.map(r => r.result).sort(), ['accepted', 'duplicate']);
    await h.service.scan(eid, ticket.qr, scanId, h.staff);
    await h.service.checkInOrderTicket(order.orderId, order.tickets[1].id, randomUUID(), h.staff);
    const raw = h.request(eid, { email: user.email, items: [{ offerId: 'friday', quantity: 1 }] });
    const second = await h.service.checkout(raw, user); await h.pay(second.orderId);
    const friday = (await h.service.view(second.orderId, raw.accessKey, user)).tickets[0];
    await h.service.scan(eid, friday.qr, randomUUID(), h.staff);
    const p = (await h.profile(user).get()).data();
    assert.equal(p.pointsBalance, 185); assert.equal(p.lifetimePoints, 275); assert.equal(p.displayName, 'Keep me');
    assert.equal((await h.profile(user).collection('pointsTransactions').get()).size, 3);
  } finally { await h.cleanup(); }
});

test('settings changes apply to unscanned existing tickets; zero awards and invalid scans do not mint points', async () => {
  const h = setup();
  try {
    const user = h.actor(), eid = await h.event(), order = await h.purchase(eid, user, 2);
    assert.equal((await h.service.scan(eid, order.tickets[0].qr, randomUUID(), h.staff)).result, 'accepted');
    assert.equal((await h.profile(user).get()).exists, false);
    const event = await h.service.get(eid, h.staff); event.draft.offers[0].checkInPoints = 60;
    await h.service.save(eid, event.draft, event.revision, h.staff, true);
    assert.equal((await h.service.scan(eid, order.tickets[0].qr, randomUUID(), h.staff)).result, 'duplicate');
    await h.service.scan(eid, order.tickets[1].qr, randomUUID(), h.staff);
    assert.equal((await h.profile(user).get()).data().pointsBalance, 60);
    const blocked = await h.purchase(eid, user);
    await h.service.tickets().doc(blocked.tickets[0].id).update({ status: 'refunded' });
    assert.equal((await h.service.scan(eid, blocked.tickets[0].qr, randomUUID(), h.staff)).result, 'invalid');
    assert.equal((await h.profile(user).get()).data().pointsBalance, 60);
  } finally { await h.cleanup(); }
});

test('guest-earned rewards are credited once on verified account claim, preserving the earned amount', async () => {
  const h = setup();
  try {
    const eid = await h.event(d => { d.offers[0].checkInPoints = 90; }), order = await h.purchase(eid, null);
    const user = { ...h.actor(), email: order.raw.email };
    await h.service.scan(eid, order.tickets[0].qr, randomUUID(), h.staff);
    const grant = h.service.tickets().doc(order.tickets[0].id).collection('rewards').doc('check-in');
    assert.equal((await grant.get()).data().status, 'pending-account');
    const event = await h.service.get(eid, h.staff); event.draft.offers[0].checkInPoints = 900;
    await h.service.save(eid, event.draft, event.revision, h.staff, true);
    await assert.rejects(() => h.service.claim({ ...user, email_verified: false }), /Verify/);
    await Promise.all([h.service.claim(user), h.service.claim(user)]);
    assert.equal((await h.profile(user).get()).data().pointsBalance, 90);
    assert.equal((await grant.get()).data().creditedUid, user.uid);
    assert.equal((await h.profile(user).collection('pointsTransactions').get()).size, 1);
  } finally { await h.cleanup(); }
});

test('PIN scans credit the current transferred holder, never the original purchaser', async () => {
  const h = setup(), originalNow = Date.now;
  try {
    const now = Date.now(), buyer = h.actor(), recipient = h.actor('recipient');
    const eid = await h.event(d => { d.offers[0].checkInPoints = 50; d.startAt = d.admissionStartsAt = new Date(now + 1800000).toISOString(); d.offers.forEach(o => o.validFrom = d.startAt); });
    const order = await h.purchase(eid, buyer), ticket = order.tickets[0];
    await h.service.transfer(order.orderId, order.raw.accessKey, buyer, ticket.id, recipient.email);
    const job = (await h.db.collection('ticketingEmailJobs').where('orderId', '==', order.orderId).get()).docs.find(d => d.data().type === 'transfer').data();
    const held = await h.service.acceptTransfer(job.token, recipient);
    Date.now = () => now + 1860000;
    const pin = await h.service.createScannerPin(eid, 'Door', now + 86400000, h.staff), login = await h.service.scannerLogin(pin.pin, h.prefix);
    await h.service.scan(eid, held.qr, randomUUID(), { scannerToken: login.token });
    assert.equal((await h.profile(recipient).get()).data().pointsBalance, 50);
    assert.equal((await h.profile(buyer).get()).exists, false);
  } finally { Date.now = originalNow; await h.cleanup(); }
});

test('verified offline admission and manager confirmation each award only once', async () => {
  const h = setup(), originalNow = Date.now;
  try {
    const user = h.actor(), eid = await h.event(d => { d.offers[0].checkInPoints = 40; }), order = await h.purchase(eid, user, 2);
    const manifest = await h.service.manifest(eid, h.staff);
    const details = ticket => ({ leaseToken: manifest.leaseToken, itemProof: manifest.tickets.find(t => t.id === ticket.id).itemProof, deviceTime: originalNow() });
    await h.service.scan(eid, order.tickets[0].qr, randomUUID(), h.staff, true, details(order.tickets[0]));
    const evidence = details(order.tickets[1]), scanId = randomUUID(); Date.now = () => originalNow() + 73 * 3600000;
    assert.equal((await h.service.scan(eid, order.tickets[1].qr, scanId, h.staff, true, evidence)).result, 'offline-replay-expired');
    assert.equal((await h.profile(user).get()).data().pointsBalance, 40);
    await h.service.resolveOfflineScan(eid, scanId, 'confirm', 'Door record verified', h.staff);
    await h.service.resolveOfflineScan(eid, scanId, 'confirm', 'Retry', h.staff);
    assert.equal((await h.profile(user).get()).data().pointsBalance, 80);
  } finally { Date.now = originalNow; await h.cleanup(); }
});

test('scavenger-hunt QR claims remain independent of automatic ticket rewards', async () => {
  const h = setup();
  try {
    const user = h.actor(), eid = await h.event(d => { d.offers[0].checkInPoints = 100; }), order = await h.purchase(eid, user);
    await h.service.scan(eid, order.tickets[0].qr, randomUUID(), h.staff);
    const qr = h.db.collection('eventQrCodes').doc(randomUUID()); h.qrIds.add(qr.id);
    await qr.set({ code: `HUNT-${qr.id}`.toUpperCase(), eventName: 'Hidden treasure', pointsAwarded: 35, isActive: true, totalClaims: 0 });
    const rewards = new Rewards(h.db), request = { code: `HUNT-${qr.id}`, attempt: h.newKey() };
    await rewards.claim(request, user); await rewards.claim(request, user);
    assert.equal((await h.profile(user).get()).data().pointsBalance, 135);
    assert.equal((await h.profile(user).collection('pointsTransactions').get()).size, 2);
  } finally { await h.cleanup(); }
});

test('approved RSVP and paid VIP upgrades reward each implicitly admitted ticket once', async () => {
  const h = setup();
  try {
    const user = h.actor(), eid = await h.event(d => {
      d.registrationMode = 'rsvp-approval';
      d.offers = [{ ...d.offers[0], id: 'rsvp', unitAmount: 0, maxPerOrder: 1, pools: { friday: 1 }, checkInPoints: 20 },
        { ...d.offers[1], id: 'vip', kind: 'upgrade', maxPerOrder: 1, pools: { saturday: 1 }, checkInPoints: 30 }];
    });
    const raw = h.request(eid, { email: user.email, items: [{ offerId: 'rsvp', quantity: 1 }] });
    const pending = await h.service.rsvp(raw, user);
    assert.equal((await h.service.view(pending.orderId, raw.accessKey, user)).tickets.length, 0);
    assert.equal((await h.profile(user).get()).exists, false);
    await h.service.reviewRsvp(eid, pending.orderId, 'approve', '', h.staff);
    const rsvpTicket = (await h.service.view(pending.orderId, raw.accessKey, user)).tickets[0];
    const access = await h.service.rsvpUpgradeAccess({ eventId: eid, email: user.email }, user);
    const vipRaw = h.request(eid, { email: user.email, items: [{ offerId: 'vip', quantity: 1 }], rsvpUpgradeToken: access.rsvpUpgradeToken });
    const vip = await h.service.checkout(vipRaw, user); await h.pay(vip.orderId);
    const vipTicket = (await h.service.view(vip.orderId, vipRaw.accessKey, user)).tickets[0];
    assert.equal((await h.service.scan(eid, vipTicket.qr, randomUUID(), h.staff)).pointsAwarded, 50);
    assert.equal((await h.service.scan(eid, rsvpTicket.qr, randomUUID(), h.staff)).result, 'duplicate');
    assert.equal((await h.profile(user).get()).data().pointsBalance, 50);
    assert.equal((await h.profile(user).collection('pointsTransactions').get()).size, 2);
  } finally { await h.cleanup(); }
});

test('a transferred guest can claim earned points later using their holder link', async () => {
  const h = setup(), originalNow = Date.now;
  try {
    const now = Date.now(), buyer = h.actor(), recipient = h.actor('recipient');
    const eid = await h.event(d => { d.offers[0].checkInPoints = 45; d.startAt = d.admissionStartsAt = new Date(now + 1800000).toISOString(); d.offers.forEach(o => o.validFrom = d.startAt); });
    const order = await h.purchase(eid, buyer);
    await h.service.transfer(order.orderId, order.raw.accessKey, buyer, order.tickets[0].id, recipient.email);
    const job = (await h.db.collection('ticketingEmailJobs').where('orderId', '==', order.orderId).get()).docs.find(d => d.data().type === 'transfer').data();
    const held = await h.service.acceptTransfer(job.token, null); Date.now = () => now + 1860000;
    await h.service.scan(eid, held.qr, randomUUID(), h.staff);
    assert.equal((await h.profile(recipient).get()).exists, false);
    await h.service.holder(job.token, { ...recipient, email_verified: false });
    assert.equal((await h.profile(recipient).get()).exists, false);
    await Promise.all([h.service.holder(job.token, recipient), h.service.holder(job.token, recipient)]);
    assert.equal((await h.profile(recipient).get()).data().pointsBalance, 45);
    assert.equal((await h.profile(buyer).get()).exists, false);
  } finally { Date.now = originalNow; await h.cleanup(); }
});
