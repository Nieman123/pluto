const test = require('node:test'), assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { harness } = require('./ticketing-harness.cjs');
const { hash } = require('../lib/ticketing/domain');
const verified = email => ({ uid: `verified_${hash(email).slice(0, 20)}`, email, email_verified: true });
async function offerToken(h, entryId) { return (await h.db.collection('ticketingEmailJobs').where('entryId', '==', entryId).get()).docs.find(d => d.data().type === 'waitlist-offer').data().token; }
async function runCampaignWorkers(h, eventId) {
  for (const doc of (await h.db.collection('ticketingCampaigns').where('eventId', '==', eventId).where('status', '==', 'pending').get()).docs) {
    while ((await doc.ref.get()).data().status === 'pending') await h.service.campaignPage(doc.id);
  }
}

async function emailRecoveryTest(run) {
  // Maintenance scans every queue. Earlier suites intentionally retain fake
  // payments whose provider instances cannot be shared between test processes.
  const { initializeApp, deleteApp } = require('firebase-admin/app');
  const { getFirestore } = require('firebase-admin/firestore');
  const projectId = `demo-email-${randomUUID()}`, app = initializeApp({ projectId }, projectId);
  const h = harness(getFirestore(app)), oldFetch = global.fetch, oldKey = process.env.RESEND_API_KEY;
  const refs = ['maintenance', 'latest', 'issuance-cursor'].map(id => h.db.collection('ticketingHealth').doc(id));
  const previous = await Promise.all(refs.map(ref => ref.get()));
  process.env.RESEND_API_KEY = 'fake-provider-key';
  try { await run(h); }
  finally {
    global.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = oldKey;
    for (const doc of (await h.db.collection('ticketingHealthAudit').where('uid', '==', h.staff).get()).docs) await doc.ref.delete();
    await h.cleanup();
    for (let i = 0; i < refs.length; i++) if (previous[i].exists) await refs[i].set(previous[i].data()); else await refs[i].delete();
    await deleteApp(app);
  }
}

test('maintenance recovers four existing reminder jobs with long IDs and never sends them twice', () => emailRecoveryTest(async h => {
  let sends = [];
  global.fetch = async (url, init) => { assert.equal(url, 'https://api.resend.com/emails'); sends.push(init); return { ok: true, json: async () => ({ id: randomUUID() }) }; };
  const eid = await h.event(d => { d.startAt = new Date(Date.now() + 23 * 3600000).toISOString(); d.admissionStartsAt = d.startAt; d.offers.forEach(o => { o.validFrom = d.startAt; }); });
  for (let i = 0; i < 4; i++) {
    const order = await h.service.checkout(h.request(eid, { email: `reminder-${i}-${h.prefix}@example.test` }), null);
    await h.pay(order.orderId); await h.service.emailJob(`receipt_${order.orderId}`);
  }
  sends = [];
  await h.service.communicationMaintenance();
  await runCampaignWorkers(h, eid);
  const jobs = (await h.db.collection('ticketingEmailJobs').where('eventId', '==', eid).where('type', '==', 'campaign').get()).docs;
  assert.equal(jobs.length, 4);
  for (const job of jobs) { assert.equal(job.id.length, 138); assert.equal(job.data().attempts, 0); }
  const summary = await h.service.maintenance();
  assert.equal(summary.errors, 0);
  // A concurrent payment check may temporarily defer delivery; it must never
  // cancel an otherwise valid recipient. Recover after that check finishes.
  for (const job of jobs) if ((await job.ref.get()).data().status === 'pending') await job.ref.update({ retryAt: 0 });
  await h.service.maintenance('emails');
  assert.equal(sends.length, 4);
  assert.deepEqual(sends.map(s => s.headers['Idempotency-Key']).sort(), jobs.map(j => `pluto-${j.id}`).sort());
  for (const job of jobs) assert.equal((await job.ref.get()).data().status, 'sent');
  const health = await h.service.health(h.staff, true);
  assert.equal(health.counts.pendingEmails, 0);
  assert.ok(!health.issues.some(i => i.kind === 'maintenance'));
  assert.ok(health.maintenance.completedAt >= health.maintenance.startedAt);
  await h.service.maintenance(); assert.equal(sends.length, 4, 'scheduled retries retain the existing sent jobs');
}));

test('manual recovery of a long campaign ID preserves its payload and retry safety limits', () => emailRecoveryTest(async h => {
  const sends = [];
  global.fetch = async (url, init) => { assert.equal(url, 'https://api.resend.com/emails'); sends.push(init); return { ok: sends.length > 1, json: async () => ({ id: randomUUID() }) }; };
  const eid = await h.event(), raw = h.request(eid), order = await h.service.checkout(raw, null); await h.pay(order.orderId);
  const campaign = await h.service.announce(eid, { attempt: h.newKey(), title: 'Door update', body: 'Open My tickets for details.' }, h.staff);
  await h.service.campaignPage(campaign.campaignId);
  const job = (await h.db.collection('ticketingEmailJobs').where('campaignId', '==', campaign.campaignId).get()).docs[0];
  assert.equal(job.id.length, 138);
  await h.service.emailJob(job.id); assert.equal((await job.ref.get()).data().status, 'pending');
  await h.db.collection('ticketingCampaigns').doc(campaign.campaignId).update({ body: 'Changed after the uncertain first send.' });
  await assert.rejects(() => h.service.retryHealth({ kind: 'email', jobId: job.id }, 'non-admin'), /Administrator/);
  await h.service.retryHealth({ kind: 'email', jobId: job.id }, h.staff);
  assert.equal((await job.ref.get()).data().status, 'sent'); assert.equal(sends.length, 2);
  assert.equal(sends[0].body, sends[1].body);
  assert.equal(sends[0].headers['Idempotency-Key'], `pluto-${job.id}`);
  assert.equal(sends[0].headers['Idempotency-Key'], sends[1].headers['Idempotency-Key']);
  await h.service.emailJob(job.id); assert.equal(sends.length, 2);
  await job.ref.update({ status: 'pending', firstDeliveryAt: Date.now() - 24 * 3600000, leaseUntil: 0, retryAt: 0 });
  await assert.rejects(() => h.service.retryHealth({ kind: 'email', jobId: job.id }, h.staff), /Do not retry/);
  await h.service.emailJob(job.id); assert.equal((await job.ref.get()).data().status, 'review'); assert.equal(sends.length, 2);
}));

test('a malformed queued job is recorded without stopping maintenance or another email', () => emailRecoveryTest(async h => {
  const invalid = h.db.collection('ticketingEmailJobs').doc(`invalid.${h.prefix}`), sends = [];
  global.fetch = async (url, init) => { sends.push(init); return { ok: true, json: async () => ({ id: randomUUID() }) }; };
  try {
    await invalid.set({ status: 'pending', createdAt: Date.now(), attempts: 0 });
    const eid = await h.event(), order = await h.service.checkout(h.request(eid), null); await h.pay(order.orderId);
    const summary = await h.service.maintenance();
    assert.equal(summary.errors, 1); assert.equal(sends.length, 1);
    assert.match((await invalid.get()).data().lastWorkerError, /email job identifier/);
    assert.equal((await h.db.collection('ticketingEmailJobs').doc(`receipt_${order.orderId}`).get()).data().status, 'sent');
    assert.ok((await h.service.health(h.staff, true)).issues.some(i => i.id === 'maintenance-emails-errors'), 'the bad record remains visible as an operator alert');
  } finally { await invalid.delete(); }
}));

test('waitlist FIFO, duplicate workers, claim retries and shared checkout stock never oversell', async () => {
  const h = harness();
  try {
    const eid = await h.event(d => { d.waitlistEnabled = true; d.pools.filter(p => p.id !== 'vehicles').forEach(p => p.capacity = 1); });
    const initial = await h.service.checkout(h.request(eid), null); await h.pay(initial.orderId);
    const alice = h.request(eid, { offerId: 'weekend', email: 'alice@example.test' }), bob = h.request(eid, { offerId: 'weekend', email: 'bob@example.test' });
    const a = await h.service.joinWaitlist(alice, verified(alice.email)), b = await h.service.joinWaitlist(bob, verified(bob.email));
    const ticket = (await h.service.tickets().where('orderId', '==', initial.orderId).get()).docs[0];
    await h.service.refund(initial.orderId, [ticket.id], h.newKey(), h.staff);
    assert.equal(await h.service.offerWaitlist(b.entryId), false, 'later entries cannot jump the queue');
    assert.equal((await Promise.all([h.service.offerWaitlist(a.entryId), h.service.offerWaitlist(a.entryId)])).filter(Boolean).length, 1);
    assert.equal((await h.service.event(eid).collection('pools').doc('friday').get()).data().held, 1);
    await assert.rejects(() => h.service.checkout(h.request(eid, { email: 'public@example.test' }), null), /not enough/);
    const token = await offerToken(h, a.entryId), request = h.request(eid, { email: alice.email, waitlistToken: token });
    await assert.rejects(() => h.service.checkout({ ...request, email: 'wrong@example.test' }, null), /expired or changed/);
    const claimed = await h.service.checkout(request, null); await h.pay(claimed.orderId);
    assert.equal((await h.service.checkout(request, null)).orderId, claimed.orderId);
    await h.service.expireWaitlist(a.entryId);
    const inventory = (await h.service.event(eid).collection('pools').doc('friday').get()).data(); assert.deepEqual({ held: inventory.held, sold: inventory.sold }, { held: 0, sold: 1 });
  } finally { await h.cleanup(); }
});

test('approval RSVP waitlists require verified email and manager approval before issuing a pass', async () => {
  const h = harness();
  try {
    const eid = await h.event(d => { d.waitlistEnabled = true; d.registrationMode = 'rsvp-approval'; d.offers = [{ ...d.offers[0], unitAmount: 0, maxPerOrder: 1 }]; d.pools.filter(p => p.id !== 'vehicles').forEach(p => p.capacity = 1); });
    const old = h.request(eid), original = await h.service.rsvp(old, verified(old.email)); await h.service.reviewRsvp(eid, original.orderId, 'approve', 'Approved', h.staff);
    const raw = h.request(eid, { email: 'waitlist-rsvp@example.test', offerId: 'weekend' });
    await assert.rejects(() => h.service.joinWaitlist(raw, null), /Verify/);
    const proof = await h.service.requestRsvpVerification(raw, null, 'waitlist'), job = (await h.db.collection('ticketingEmailJobs').doc(`verify_${hash(proof.verificationToken)}`).get()).data();
    Object.assign(raw, proof, { verificationCode: job.code });
    const entry = await h.service.joinWaitlist(raw, null); assert.equal((await h.service.joinWaitlist(raw, null)).entryId, entry.entryId);
    await h.service.withdrawRsvp(eid, original.orderId, h.staff);
    assert.equal(await h.service.offerWaitlist(entry.entryId), false);
    await assert.rejects(() => h.service.approveWaitlist(eid, entry.entryId, 'stranger', 'Approve'), /access/);
    await h.service.approveWaitlist(eid, entry.entryId, h.staff, 'Approved named guest');
    const token = await offerToken(h, entry.entryId), claim = h.request(eid, { email: raw.email, waitlistToken: token });
    const rsvp = await h.service.rsvp(claim, null); assert.equal(rsvp.rsvpStatus, 'approved');
    assert.equal((await h.service.view(rsvp.orderId, claim.accessKey, null)).tickets.length, 1);
    assert.equal((await h.service.order(rsvp.orderId).get()).data().approvalRequired, true);
    assert.equal((await h.service.event(eid).collection('pools').doc('friday').get()).data().held, 0);
  } finally { await h.cleanup(); }
});

test('expired, withdrawn and edited offers release only their own reservation', async () => {
  const h = harness();
  try {
    const eid = await h.event(d => { d.waitlistEnabled = true; d.pools.filter(p => p.id !== 'vehicles').forEach(p => p.capacity = 1); });
    const order = await h.service.checkout(h.request(eid), null); await h.pay(order.orderId);
    const raw = h.request(eid, { offerId: 'weekend', email: 'expiry@example.test' }), entry = await h.service.joinWaitlist(raw, verified(raw.email));
    await h.service.refund(order.orderId, [(await h.service.tickets().where('orderId', '==', order.orderId).get()).docs[0].id], h.newKey(), h.staff); await h.service.offerWaitlist(entry.entryId);
    const token = await offerToken(h, entry.entryId); await h.db.collection('ticketingWaitlist').doc(entry.entryId).update({ offerExpiresAt: Date.now() - 1 });
    assert.equal((await h.service.waitlistView({ token })).canClaim, false);
    await assert.rejects(() => h.service.checkout(h.request(eid, { email: raw.email, waitlistToken: token }), null), /expired/);
    await Promise.all([h.service.expireWaitlist(entry.entryId), h.service.expireWaitlist(entry.entryId)]);
    assert.equal((await h.service.event(eid).collection('pools').doc('friday').get()).data().held, 0);
    // Rejoin at the end of the queue; a stale expiry worker cannot release the new offer.
    const resumed = { ...raw, accessKey: h.newKey() }; const pool = h.service.event(eid).collection('pools').doc('friday'); await pool.update({ held: 1 });
    await h.service.joinWaitlist(resumed, verified(raw.email)); await pool.update({ held: 0 }); await h.service.offerWaitlist(entry.entryId);
    await h.service.expireWaitlist(entry.entryId, false, 1); assert.equal((await pool.get()).data().held, 1);
    const e = await h.service.get(eid, h.staff); e.draft.offers[0].unitAmount += 100; await h.service.save(eid, e.draft, e.revision, h.staff); await h.service.publish(eid, 'publish', e.revision + 1, h.staff);
    const newest = (await h.db.collection('ticketingEmailJobs').where('entryId', '==', entry.entryId).get()).docs.find(d => d.id.endsWith('_2')).data();
    assert.equal(await h.service.engagementEmail(newest), null); await h.service.waitlistMaintenance(); assert.equal((await pool.get()).data().held, 0);
  } finally { await h.cleanup(); }
});

test('scheduled reminders and location notices deduplicate; cancellation reaches pending RSVPs without a QR', async () => {
  const h = harness();
  try {
    const eid = await h.event(d => { d.startAt = new Date(Date.now() + 23 * 3600000).toISOString(); d.admissionStartsAt = d.startAt; d.offers.forEach(o => { o.validFrom = d.startAt; }); d.venueRevealScheduled = true; d.venueRevealAt = new Date(Date.now() - 1000).toISOString(); });
    const raw = h.request(eid), order = await h.service.checkout(raw, null); await h.pay(order.orderId);
    await h.service.communicationMaintenance(); await h.service.communicationMaintenance();
    await runCampaignWorkers(h, eid);
    const notices = (await h.db.collection('ticketingCampaigns').where('eventId', '==', eid).get()).docs;
    assert.deepEqual(notices.map(n => n.data().kind).sort(), ['event-location', 'event-reminder']);
    for (const notice of notices) { const jobs = (await h.db.collection('ticketingEmailJobs').where('campaignId', '==', notice.id).get()).docs; assert.equal(jobs.length, 1); const payload = await h.service.engagementEmail(jobs[0].data()); assert.ok(payload); assert.ok(!payload.text.includes('123 Hidden Lane')); }
    const approval = await h.event(d => { d.registrationMode = 'rsvp-approval'; d.offers = [{ ...d.offers[0], unitAmount: 0, maxPerOrder: 1 }]; });
    const pending = h.request(approval), rsvp = await h.service.rsvp(pending, verified(pending.email));
    const sequence = (await h.db.collection('publishedEvents').doc(approval).get()).data().calendarSequence;
    await h.service.publish(approval, 'cancel', 1, h.staff);
    assert.ok((await h.db.collection('publishedEvents').doc(approval).get()).data().calendarSequence > sequence, 'calendar cancellation advances even without a new draft revision');
    const cancelled = (await h.db.collection('ticketingCampaigns').where('eventId', '==', approval).get()).docs[0];
    await h.service.campaignPage(cancelled.id); await h.service.campaignPage(cancelled.id);
    const jobs = (await h.db.collection('ticketingEmailJobs').where('campaignId', '==', cancelled.id).get()).docs;
    assert.equal(jobs.length, 1); assert.equal(jobs[0].data().pendingOrderId, rsvp.orderId); assert.match((await h.service.engagementEmail(jobs[0].data())).text, /cancelled/);
  } finally { await h.cleanup(); }
});

test('free walk-up attendance is PIN-scoped and audited; exits and re-entry cannot invent arrivals', async () => {
  const h = harness();
  try {
    const eid = await h.event(d => { d.registrationMode = 'free'; d.venueVisibility = 'public'; d.offers.forEach(o => { o.active = false; }); });
    const pin = await h.service.createScannerPin(eid, 'Front door', Date.now() + 3600000, h.staff), session = await h.service.scannerLogin(pin.pin, '127.0.0.1'), proof = { scannerToken: session.token };
    const raw = { kind: 'walkup', action: 'arrive', quantity: 5, version: 0, attempt: h.newKey() };
    await Promise.all([h.service.doorMovement(eid, raw, proof), h.service.doorMovement(eid, raw, proof)]);
    await h.service.doorMovement(eid, { ...raw, action: 'exit', quantity: 2, version: 1, attempt: h.newKey() }, proof);
    await assert.rejects(() => h.service.doorMovement(eid, { ...raw, action: 'reenter', quantity: 3, version: 2, attempt: h.newKey() }, proof), /exceed/);
    await h.service.doorMovement(eid, { ...raw, action: 'reenter', quantity: 1, version: 2, attempt: h.newKey() }, proof);
    const attendance = await h.service.attendance(eid, {}, proof); assert.equal(attendance.counts.arrivals, 5); assert.equal(attendance.counts.inside, 4);
    const another = await h.event(); await assert.rejects(() => h.service.attendance(another, {}, proof), /event|access/);
    await h.service.revokeScannerPin(eid, pin.id, h.staff); await assert.rejects(() => h.service.attendance(eid, {}, proof), /revoked|access|expired/);
  } finally { await h.cleanup(); }
});

test('announcements deduplicate current holders, recheck membership, hide locations and supersede stale schedules', async () => {
  const h = harness();
  try {
    const eid = await h.event(d => { d.admissionStartsAt = new Date(Date.now() + 86400000).toISOString(); d.startAt = d.admissionStartsAt; d.offers.forEach(o => { o.validFrom = d.startAt; }); }), request = h.request(eid, { items: [{ offerId: 'weekend', quantity: 2 }] }), order = await h.service.checkout(request, null); await h.pay(order.orderId);
    const tickets = (await h.service.view(order.orderId, request.accessKey, null)).tickets;
    await h.service.transfer(order.orderId, request.accessKey, null, tickets[1].id, 'friend@example.test');
    const invitation = (await h.db.collection('ticketingEmailJobs').where('orderId', '==', order.orderId).get()).docs.find(d => d.data().type === 'transfer').data(); await h.service.acceptTransfer(invitation.token, null);
    const raw = { attempt: h.newKey(), title: 'See you soon', body: 'Sound starts at 9. Open Pluto for details.' };
    await assert.rejects(() => h.service.announce(eid, { ...raw, body: 'Meet at 123 Hidden Lane' }, h.staff), /private venue/);
    const c = await h.service.announce(eid, raw, h.staff); assert.equal((await h.service.announce(eid, raw, h.staff)).campaignId, c.campaignId);
    await Promise.all([h.service.campaignPage(c.campaignId), h.service.campaignPage(c.campaignId)]);
    const jobs = (await h.db.collection('ticketingEmailJobs').where('campaignId', '==', c.campaignId).get()).docs;
    assert.deepEqual(jobs.map(d => d.data().to).sort(), [request.email, 'friend@example.test'].sort());
    const payload = await h.service.engagementEmail(jobs[0].data()); assert.ok(payload); assert.ok(!payload.html.includes('123 Hidden Lane')); assert.ok(!payload.text.includes('qr-fixture')); assert.match(payload.text, /Add to Calendar/);
    const event = await h.service.get(eid, h.staff); event.draft.startAt = new Date(Date.now() + 86400000).toISOString(); await h.service.save(eid, event.draft, 1, h.staff); await h.service.publish(eid, 'publish', 2, h.staff);
    assert.equal(await h.service.engagementEmail(jobs[0].data()), null, 'old payloads cannot be sent after a schedule change');
    assert.ok((await h.db.collection('ticketingCampaigns').where('eventId', '==', eid).get()).docs.some(d => d.data().kind === 'event-rescheduled'));
  } finally { await h.cleanup(); }
});

test('door attendance combines arrivals, supports audited retries and rejects re-entry of revoked passes', async () => {
  const h = harness();
  try {
    const eid = await h.event(), raw = h.request(eid), order = await h.service.checkout(raw, null); await h.pay(order.orderId);
    const ticket = (await h.service.view(order.orderId, raw.accessKey, null)).tickets[0]; await h.service.scan(eid, ticket.qr, randomUUID(), h.staff);
    await h.service.addGuests(eid, ['Door Guest'], '', h.newKey(), h.staff);
    const guest = (await h.service.event(eid).collection('guests').get()).docs[0]; await h.service.arriveGuest(eid, guest.id, randomUUID(), h.staff);
    let data = await h.service.attendance(eid, {}, h.staff); assert.equal(data.counts.arrivals, 2); assert.equal(data.counts.inside, 2);
    const exit = { kind: 'ticket', id: ticket.id, action: 'exit', version: 0, attempt: h.newKey() };
    await Promise.all([h.service.doorMovement(eid, exit, h.staff), h.service.doorMovement(eid, exit, h.staff)]);
    data = await h.service.attendance(eid, {}, h.staff); assert.equal(data.counts.inside, 1);
    await h.service.doorMovement(eid, { ...exit, action: 'reenter', version: 1, attempt: h.newKey() }, h.staff);
    assert.equal((await h.service.attendance(eid, {}, h.staff)).counts.inside, 2);
    await h.service.doorMovement(eid, { ...exit, version: 2, attempt: h.newKey() }, h.staff); await h.service.tickets().doc(ticket.id).update({ status: 'revoked' });
    await assert.rejects(() => h.service.doorMovement(eid, { ...exit, action: 'reenter', version: 3, attempt: h.newKey() }, h.staff), /cannot re-enter/);
    await h.service.saveGuest(eid, guest.id, '', '', 1, h.staff, true);
    assert.equal((await h.service.attendance(eid, {}, h.staff)).rows.find(r => r.id === guest.id).valid, false, 'removed guests already inside remain available for an exit');
    await h.service.doorMovement(eid, { kind: 'guest', id: guest.id, action: 'exit', version: 0, attempt: h.newKey() }, h.staff);
    assert.equal((await h.service.attendance(eid, {}, h.staff)).counts.inside, 0);
    await assert.rejects(() => h.service.doorMovement(eid, { kind: 'guest', id: guest.id, action: 'reenter', version: 1, attempt: h.newKey() }, h.staff), /cannot re-enter/);
    await assert.rejects(() => h.service.attendance(eid, {}, 'stranger'), /access/);
  } finally { await h.cleanup(); }
});
