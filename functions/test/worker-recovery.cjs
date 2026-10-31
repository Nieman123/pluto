const test = require('node:test'), assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { harness } = require('./ticketing-harness.cjs');
const { campaignNeedsWork } = require('../lib/ticketing/campaign-policy');
const { WorkBudget, processBatch } = require('../lib/ticketing/worker-batch');
const { refreshHealthSnapshot } = require('../lib/ticketing/health');

async function isolated(run) {
  const projectId = `demo-recovery-${randomUUID()}`, app = initializeApp({ projectId }, projectId), h = harness(getFirestore(app));
  const oldFetch = global.fetch, oldKey = process.env.RESEND_API_KEY;
  process.env.RESEND_API_KEY = 'fake-provider-key';
  global.fetch = async () => { throw new Error('Unexpected provider request'); };
  try { await run(h); }
  finally {
    global.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = oldKey;
    for (const collection of await h.db.listCollections()) await h.db.recursiveDelete(collection);
    await deleteApp(app);
  }
}

test('empty recovery does not create cursor writes and successful lanes leave the broad audit to its schedule', () => isolated(async h => {
  await processBatch(h.db, 'emptyQueue', ['pending'], 10, async () => assert.fail('empty'));
  assert.equal((await h.db.collection('ticketingWorkerCursors').get()).size, 0);
  await h.service.maintenance('emails');
  assert.equal((await h.db.collection('ticketingHealth').doc('latest').get()).exists, false);
  const first = await refreshHealthSnapshot(h.db);
  assert.equal((await refreshHealthSnapshot(h.db)).checkedAt, first.checkedAt);
  const lease = h.db.collection('ticketingHealth').doc('audit-lease');
  await lease.set({leaseId:'other-auditor',leaseUntil:Date.now()+60000});
  assert.equal((await refreshHealthSnapshot(h.db,true)).refreshInProgress, true);
  assert.equal((await lease.get()).data().leaseId,'other-auditor');
}));

test('manual requests retry busy lanes and completion deliveries are idempotent', () => isolated(async h => {
  await h.service.requestMaintenance();
  const request=(await h.db.collection('ticketingRecoveryRequests').where('lane','==','payments').get()).docs[0];
  let attempts=0;
  h.service.maintenance=async () => (++attempts===1 ? {busy:1,errors:0} : {errors:0});
  await assert.rejects(()=>h.service.processRecoveryRequest(request.id), /retry/);
  assert.equal((await request.ref.get()).data().status,'pending');
  await h.service.processRecoveryRequest(request.id);
  await h.service.processRecoveryRequest(request.id);
  assert.equal(attempts,2); assert.equal((await request.ref.get()).data().status,'done');
  assert.ok((await request.ref.get()).data().deleteAfter.toMillis()>Date.now());
}));

test('due reconciliation skips settled history, migrates legacy orders once and recovers missed webhooks', () => isolated(async h => {
  const eid=await h.event(), checkout=await h.service.checkout(h.request(eid),null); await h.pay(checkout.orderId);
  const ref=h.service.order(checkout.orderId), {FieldValue}=require('firebase-admin/firestore');
  await ref.update({nextFinancialCheckAt:FieldValue.delete()});
  await h.service.seedFinancialSchedule();
  assert.ok((await ref.get()).data().nextFinancialCheckAt<=Date.now());
  assert.equal((await h.service.reconcileDueOrders()).processed,1);
  assert.equal((await h.service.reconcileDueOrders()).processed,0);
  const state=h.db.collection('ticketingWorkerCursors').doc('financial-schedule-v1'), prior=(await state.get()).updateTime;
  await h.service.seedFinancialSchedule(); assert.ok(prior.isEqual((await state.get()).updateTime));
  // A payment finished by a draining old revision must also be picked up.
  await h.db.collection('ticketingOrders').doc('legacy-late').set({status:'paid',method:'stripe',total:100});
  await state.update({verifyAfter:Date.now()-1}); await h.service.seedFinancialSchedule();
  assert.ok((await h.db.collection('ticketingOrders').doc('legacy-late').get()).data().nextFinancialCheckAt<=Date.now());
  assert.equal((await state.get()).data().done,true);
  await h.db.collection('ticketingOrders').doc('legacy-late').delete();
  const order=(await ref.get()).data();
  h.refunds.set('missed-dashboard-refund',{id:'missed-dashboard-refund',payment_intent:order.paymentIntentId,amount:order.total,status:'succeeded'});
  await ref.update({nextFinancialCheckAt:Date.now()-1000});
  assert.equal((await h.service.reconcileDueOrders()).errors,0);
  assert.equal((await ref.get()).data().refundedAmount,order.total);
  assert.equal((await h.service.tickets().where('orderId','==',checkout.orderId).get()).docs[0].data().status,'refunded');
}));

test('overdue reconciliation remains visible even when the payment heartbeat is current', () => isolated(async h => {
  const eid=await h.event(), checkout=await h.service.checkout(h.request(eid),null); await h.pay(checkout.orderId);
  await h.service.order(checkout.orderId).update({nextFinancialCheckAt:Date.now()-16*60000});
  await h.db.collection('ticketingHealth').doc('maintenance').set({completedAt:Date.now()});
  assert.ok((await h.service.health(h.staff,true)).issues.some(i=>i.id==='financial-backlog'));
}));

test('retention migration is bounded, resumable and leaves unresolved work and financial records intact', () => isolated(async h => {
  const {migrate}=require('../../scripts/migrate-cost-retention.cjs');
  const expiry=Date.now()-8*86400000;
  await h.db.collection('ticketingAccess').doc('old').set({expiresAt:expiry});
  await h.db.collection('ticketingWebhookInbox').doc('pending').set({status:'pending',completedAt:expiry});
  await h.db.collection('ticketingWebhookInbox').doc('done').set({status:'done',completedAt:expiry});
  await h.db.collection('ticketingOrders').doc('ledger').set({expiresAt:expiry});
  await migrate(h.db,{apply:false,pages:1});
  assert.equal((await h.db.collection('ticketingAccess').doc('old').get()).data().deleteAfter,undefined);
  await migrate(h.db,{apply:true,pages:1});
  assert.equal((await h.db.collection('ticketingAccess').doc('old').get()).data().deleteAfter.toMillis(),expiry+7*86400000);
  assert.equal((await h.db.collection('ticketingWebhookInbox').doc('pending').get()).data().deleteAfter,undefined);
  assert.equal((await h.db.collection('ticketingOrders').doc('ledger').get()).data().deleteAfter,undefined);
  assert.ok((await h.db.collection('ticketingWebhookInbox').doc('done').get()).data().deleteAfter);
  assert.ok((await migrate(h.db,{apply:true,pages:1})).every(r=>r.changed===0));
}));

test('festival campaign continues across pages with duplicate deliveries and deduplicates recipients', () => isolated(async h => {
  const eid = await h.event(), order = await h.service.checkout(h.request(eid), null); await h.pay(order.orderId);
  for (let start = 0; start < 1001; start += 400) {
    const batch = h.db.batch();
    for (let i = start; i < Math.min(1001, start + 400); i++) batch.set(h.service.tickets().doc(`audience_${String(i).padStart(4, '0')}`), {
      eventId: eid, orderId: order.orderId, kind: 'admission', status: 'valid', holderEmail: `audience-${i % 1000}@example.test`,
    });
    await batch.commit();
  }
  const { campaignId } = await h.service.announce(eid, { title: 'Festival update', body: 'Doors are open.', attempt: h.newKey() }, h.staff);
  const ref = h.db.collection('ticketingCampaigns').doc(campaignId);
  let before, after = (await ref.get()).data(), pages = 0;
  while (campaignNeedsWork(before, after)) {
    before = after;
    await Promise.all([h.service.campaignPage(campaignId), h.service.campaignPage(campaignId)]);
    after = (await ref.get()).data();
    assert.ok(++pages < 20, 'continuations must finish without a scheduling tick');
  }
  assert.equal(after.status, 'queued');
  assert.equal(after.queued, 1001, '1000 audience emails plus the original purchaser');
  const jobs = await h.db.collection('ticketingEmailJobs').where('campaignId', '==', campaignId).get();
  assert.equal(jobs.size, 1001); assert.equal(new Set(jobs.docs.map(d => d.data().to)).size, 1001);
  await h.service.campaignPage(campaignId);
  assert.equal((await h.db.collection('ticketingEmailJobs').where('campaignId', '==', campaignId).count().get()).data().count, 1001);
}));

test('expired campaign leases are woken without clearing a new worker’s lease', () => isolated(async h => {
  const eid = await h.event(), order = await h.service.checkout(h.request(eid), null); await h.pay(order.orderId);
  const { campaignId } = await h.service.announce(eid, { title: 'Update', body: 'Check Pluto.', attempt: h.newKey() }, h.staff);
  const ref = h.db.collection('ticketingCampaigns').doc(campaignId);
  await ref.update({ leaseId: 'dead-worker', leaseUntil: Date.now() - 1 });
  const before = (await ref.get()).data(); await h.service.campaignRecovery();
  assert.equal(campaignNeedsWork(before, (await ref.get()).data()), true);
  const original = h.db.getAll.bind(h.db);
  h.db.getAll = async (...refs) => {
    await ref.update({ leaseId: 'replacement-worker', leaseUntil: Date.now() + 120000 });
    return original(...refs);
  };
  try { await h.service.campaignPage(campaignId); } finally { h.db.getAll = original; }
  const state = (await ref.get()).data();
  assert.equal(state.leaseId, 'replacement-worker'); assert.ok(state.leaseUntil > Date.now()); assert.equal(state.queued, 0);
  assert.equal((await h.db.collection('ticketingEmailJobs').where('campaignId', '==', campaignId).get()).size, 0);
}));

test('expired unsent notices cancel; uncertain sends retain their payload for review', () => isolated(async h => {
  const eid = await h.event(), order = await h.service.checkout(h.request(eid), null); await h.pay(order.orderId);
  for (const uncertain of [false, true]) {
    const { campaignId } = await h.service.announce(eid, { title: 'Reminder', body: 'Your event starts in approximately 4 hours.', attempt: h.newKey() }, h.staff);
    await h.service.campaignPage(campaignId);
    const job = (await h.db.collection('ticketingEmailJobs').where('campaignId', '==', campaignId).get()).docs[0];
    const originalPayload = { from: 'test@example.test', to: [job.data().to], subject: 'Original subject', text: 'Original body' };
    if (uncertain) await job.ref.update({ firstDeliveryAt: Date.now() - 1000, emailPayload: originalPayload });
    await h.db.collection('ticketingCampaigns').doc(campaignId).update({ kind: 'event-reminder', expiresAt: Date.now() - 1 });
    await h.service.emailJob(job.id);
    const result = (await job.ref.get()).data();
    assert.equal(result.status, uncertain ? 'review' : 'cancelled');
    assert.deepEqual(result.emailPayload, uncertain ? originalPayload : null);
    if (uncertain) await assert.rejects(() => h.service.retryHealth({ kind: 'email', jobId: job.id }, h.staff), /Do not retry/);
  }
}));

test('a budget pause resumes from the last visited record without skipping the rest of the page', () => isolated(async h => {
  const collection = h.db.collection('auditRecords');
  for (let i = 0; i < 8; i++) await collection.doc(String(i)).set({ status: 'pending' });
  let clock = 0; const visited = [];
  const first = await processBatch(h.db, 'auditRecords', ['pending'], 8, async doc => { visited.push(doc.id); clock += 2; }, new WorkBudget(1, () => clock));
  assert.deepEqual(first, { processed: 1, deferred: true });
  assert.equal((await h.db.collection('ticketingWorkerCursors').doc('auditRecords_pending').get()).data().after, '0');
  await processBatch(h.db, 'auditRecords', ['pending'], 8, async doc => { visited.push(doc.id); }, new WorkBudget(1, () => clock));
  assert.deepEqual(visited, ['0', '1', '2', '3', '4', '5', '6', '7']);
}));

test('in-flight payment checks defer campaign pages and emails without dropping recipients', () => isolated(async h => {
  const eid = await h.event(), order = await h.service.checkout(h.request(eid), null); await h.pay(order.orderId);
  const { campaignId } = await h.service.announce(eid, { title: 'Update', body: 'Check Pluto.', attempt: h.newKey() }, h.staff);
  const ref = h.service.order(order.orderId);
  await ref.update({ financialBlocked: true, financialCheckId: 'active-check', financialReviewReason: '' });
  await assert.rejects(() => h.service.campaignPage(campaignId), /reconciliation is still running/);
  assert.equal((await h.db.collection('ticketingCampaigns').doc(campaignId).get()).data().cursor, '');
  await ref.update({ financialBlocked: false }); await h.service.campaignPage(campaignId);
  const job = (await h.db.collection('ticketingEmailJobs').where('campaignId', '==', campaignId).get()).docs[0];
  await ref.update({ financialBlocked: true }); await h.service.emailJob(job.id);
  assert.equal((await job.ref.get()).data().status, 'pending');
  assert.equal((await job.ref.get()).data().firstDeliveryAt, undefined);
  await ref.update({ financialBlocked: false }); await job.ref.update({ retryAt: 0 });
  global.fetch = async () => ({ ok: true, json: async () => ({ id: randomUUID() }) });
  await h.service.emailJob(job.id); assert.equal((await job.ref.get()).data().status, 'sent');
}));

test('payment recovery completes while the email provider is blocked and stale lanes remain visible', () => isolated(async h => {
  const eid = await h.event(), first = await h.service.checkout(h.request(eid), null); await h.pay(first.orderId);
  const next = await h.service.checkout(h.request(eid), null); await h.paidSession(next.orderId);
  let release, entered;
  const blocked = new Promise(done => { release = done; }), ready = new Promise(done => { entered = done; });
  global.fetch = async () => { entered(); await blocked; return { ok: true, json: async () => ({ id: randomUUID() }) }; };
  const emails = h.service.maintenance('emails');
  try {
    await ready;
    assert.equal((await h.service.maintenance('emails')).busy, 1, 'overlapping runs do not share a cursor');
    assert.equal((await h.service.maintenance('payments')).errors, 0);
    assert.equal((await h.service.order(next.orderId).get()).data().status, 'paid');
    assert.equal((await h.service.tickets().where('orderId', '==', next.orderId).get()).size, 1);
    const health = await h.service.health(h.staff, true);
    assert.ok(health.issues.some(i => i.id === 'maintenance-emails'));
  } finally { release(); await emails; }
  assert.equal((await h.db.collection('ticketingEmailJobs').doc(`receipt_${first.orderId}`).get()).data().status, 'sent');
}));

test('a failed waitlist phase does not prevent reminder creation or campaign recovery', () => isolated(async h => {
  await h.event(d => { d.startAt = new Date(Date.now() + 23 * 3600000).toISOString(); d.admissionStartsAt = d.startAt; d.offers.forEach(o => { o.validFrom = d.startAt; }); });
  h.service.waitlistMaintenance = async () => { throw new Error('Synthetic unavailable dependency'); };
  const summary = await h.service.maintenance('communications');
  assert.equal(summary.errors, 1);
  assert.equal((await h.db.collection('ticketingCampaigns').where('kind', '==', 'event-reminder').get()).size, 1);
  assert.ok((await h.service.health(h.staff, true)).issues.some(i => i.id === 'maintenance-communications-errors'));
}));

test('one bad record does not block later rows and its failure remains actionable', () => isolated(async h => {
  for (const key of ['a', 'b', 'c']) await h.db.collection('auditRecords').doc(key).set({ status: 'pending' });
  const visited = [];
  await assert.rejects(() => processBatch(h.db, 'auditRecords', ['pending'], 10, async doc => {
    visited.push(doc.id); if (doc.id === 'b') throw Error('Broken record');
  }), /1 auditRecords records/);
  assert.deepEqual(visited, ['a', 'b', 'c']);
}));

test('manual recovery queues durable requests and provider retry-after is respected', () => isolated(async h => {
  h.service.maintenance = async () => { throw Error('The HTTP action must not run recovery inline'); };
  assert.deepEqual(await h.service.requestMaintenance(), { queued: true });
  const requests = await h.db.collection('ticketingRecoveryRequests').get();
  assert.deepEqual(requests.docs.map(d => d.data().lane).sort(), ['communications', 'emails', 'payments']);
  for (const doc of requests.docs) { assert.equal(doc.data().status, 'pending'); assert.ok(doc.data().requestedAt); }
  assert.equal((await h.db.collection('ticketingHealth').get()).size, 0, 'health writes do not enqueue work');
  const eid = await h.event(), order = await h.service.checkout(h.request(eid), null); await h.pay(order.orderId);
  let sends = 0;
  global.fetch = async () => { sends++; return { ok: false, headers: { get: key => key === 'retry-after' ? '120' : null } }; };
  const before = Date.now(), id = `receipt_${order.orderId}`;
  await h.service.emailJob(id);
  const job = (await h.db.collection('ticketingEmailJobs').doc(id).get()).data();
  assert.equal(job.status, 'pending'); assert.ok(job.retryAt >= before + 120000);
  await h.service.emailJob(id); assert.equal(sends, 1);
}));
