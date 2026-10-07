const test = require('node:test'), assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { harness } = require('./ticketing-harness.cjs');
const { financialSummary, financialBackfillPage, syncFinancialOrder, financialRecovery, financialBackfillNeedsWork } = require('../lib/ticketing/financial-projection');
const { revenueSummary } = require('../lib/ticketing/revenue');

async function isolated(run) {
  const projectId = `demo-pagination-${randomUUID()}`, app = initializeApp({ projectId }, projectId), h = harness(getFirestore(app));
  try { await run(h); } finally { for (const collection of await h.db.listCollections()) await h.db.recursiveDelete(collection); await deleteApp(app); }
}
async function prepare(h, eid) {
  const draft = (await h.service.event(eid).get()).data().draft;
  await financialSummary(h.db, eid, draft.timezone);
  for (let page = 0; page < 30; page++) {
    await financialBackfillPage(h.db, eid);
    if ((await h.db.collection('ticketingFinancialBackfills').doc(eid).get()).data().status === 'done') return;
  }
  throw new Error('Backfill failed to finish');
}
const order = (overrides = {}) => ({ eventId: '', eventTitle: 'Festival', name: 'Buyer', email: 'buyer@example.test', createdAt: Date.now(), paidAt: Date.now(), status: 'paid', method: 'stripe', total: 10000, discount: 500, taxAmount: 500, stripeFee: null, stripeFeeStatus: 'pending', units: [{ amount: 10000 }], ...overrides });

test('stored totals handle duplicate deliveries, fees, refunds, RSVP changes and deletion', () => isolated(async h => {
  const eid = await h.event(), ref = h.db.collection('ticketingOrders').doc('financial-order');
  await ref.set(order({ eventId: eid })); await prepare(h, eid);
  let p = (await h.service.staffPerformance(eid, h.staff)).summary;
  assert.equal(p.ready, true); assert.equal(p.gross, 10000); assert.equal(p.paidOrders, 1); assert.equal(p.tickets, 1); assert.equal(p.pendingFees, 1); assert.equal(p.proceeds, 9500);
  const before = (await h.db.collection('ticketingFinancialSummaries').doc(eid).get()).data();
  await Promise.all([syncFinancialOrder(h.db, ref.id), syncFinancialOrder(h.db, ref.id)]);
  assert.deepEqual((await h.db.collection('ticketingFinancialSummaries').doc(eid).get()).data(), before, 'identical deliveries do not rewrite totals');
  await ref.update({ stripeFee: 320, stripeFeeStatus: 'confirmed', refundedAmount: 2000, refundedTaxAmount: 100 });
  await Promise.all([syncFinancialOrder(h.db, ref.id), syncFinancialOrder(h.db, ref.id)]);
  p = (await h.service.staffPerformance(eid, h.staff)).summary;
  assert.equal(p.gross, 10000); assert.equal(p.refunds, 2000); assert.equal(p.tax, 400); assert.equal(p.fees, 320); assert.equal(p.pendingFees, 0); assert.equal(p.proceeds, 7280);
  await ref.update({ externalRefundAmount: 500, financialBlocked: true }); await syncFinancialOrder(h.db, ref.id);
  p = (await h.service.staffPerformance(eid, h.staff)).summary; assert.equal(p.refunds, 2500); assert.equal(p.provisional, true);
  const revenue = (await h.service.list(h.staff, true)).events.find(e => e.id === eid).revenue;
  assert.equal(revenue.gross, 10000); assert.equal(revenue.refunds, 2500); assert.equal(revenue.salesAfterRefunds, 7500);
  const rsvp = h.db.collection('ticketingOrders').doc('rsvp'); await rsvp.set(order({ eventId: eid, total: 0, method: 'rsvp', status: 'pending-approval', rsvpStatus: 'pending' })); await syncFinancialOrder(h.db, rsvp.id);
  p = (await h.service.staffPerformance(eid, h.staff)).summary; assert.equal(p.rsvpPending, 1); assert.equal(p.paidOrders, 1);
  await rsvp.update({ status: 'paid', rsvpStatus: 'approved' }); await syncFinancialOrder(h.db, rsvp.id);
  p = (await h.service.staffPerformance(eid, h.staff)).summary; assert.equal(p.rsvpPending, 0); assert.equal(p.rsvpApproved, 1); assert.equal(p.paidOrders, 2);
  await ref.delete(); await syncFinancialOrder(h.db, ref.id);
  p = (await h.service.staffPerformance(eid, h.staff)).summary; assert.equal(p.gross, 0); assert.equal(p.refunds, 0); assert.equal(p.fees, 0); assert.equal(p.revenue.daily.reduce((n, d) => n + d.gross, 0), 0);
  const collection = h.db.collection.bind(h.db);
  h.db.collection = name => { assert.notEqual(name, 'ticketingOrders', 'normal summary reads must not scan the ledger'); return collection(name); };
  try {
    assert.equal((await h.service.staffPerformance(eid, h.staff)).summary.paidOrders, 1);
    assert.equal((await h.service.list(h.staff, true)).events.find(e => e.id === eid).revenue.gross, 0);
  } finally { h.db.collection = collection; }
}));

test('batched historical backfill overlaps live updates without double counting and uses event-local days', () => isolated(async h => {
  const eid = await h.event(), at = Date.now(), records = [];
  const batch = h.db.batch();
  for (let i = 0; i < 205; i++) { const o = order({ eventId: eid, total: 100 + i, paidAt: at - i * 3600000, method: i % 2 ? 'cash' : 'stripe' }); records.push(o); batch.set(h.db.collection('ticketingOrders').doc(`history_${String(i).padStart(3, '0')}`), o); }
  await batch.commit();
  const zone = (await h.service.event(eid).get()).data().draft.timezone;
  await financialSummary(h.db, eid, zone); await financialBackfillPage(h.db, eid);
  assert.equal((await financialSummary(h.db, eid, zone)).ready, false, 'partial history must not look final');
  const last = h.db.collection('ticketingOrders').doc('history_204'); records[204].total += 700;
  await last.update({ total: records[204].total }); await syncFinancialOrder(h.db, last.id); await prepare(h, eid);
  const result = await financialSummary(h.db, eid, zone), expected = revenueSummary(records, zone, Date.now(), 90);
  assert.equal(result.paidOrders, 205); assert.equal(result.gross, records.reduce((n, o) => n + o.total, 0));
  assert.deepEqual(result.revenue.daily, expected.daily); assert.equal(result.revenue.thisWeek, expected.thisWeek); assert.equal(result.revenue.lastWeek, expected.lastWeek);
  await h.db.collection('ticketingFinancialSummaries').doc(eid).delete(); await prepare(h, eid);
  assert.equal((await financialSummary(h.db, eid, zone)).gross, result.gross, 'a removed cache rebuilds from the ledger without losing or doubling existing contributions');
  // A timezone edit invalidates the view, then rebuckets existing contributions.
  await h.service.event(eid).update({ 'draft.timezone': 'America/Los_Angeles' });
  assert.equal((await financialSummary(h.db, eid, 'America/Los_Angeles')).ready, false); await prepare(h, eid);
  const shifted = await financialSummary(h.db, eid, 'America/Los_Angeles');
  assert.equal(shifted.gross, result.gross); assert.deepEqual(shifted.revenue.daily, revenueSummary(records, 'America/Los_Angeles', Date.now(), 90).daily);
}));

test('event order pagination preserves timestamp ties, ignores other events and binds cursors to filters', () => isolated(async h => {
  const eid = await h.event(), other = await h.event(), at = Date.now(), batch = h.db.batch();
  for (let i = 0; i < 125; i++) batch.set(h.db.collection('ticketingOrders').doc(`page_${String(i).padStart(3, '0')}`), order({ eventId: eid, createdAt: at, status: i === 124 ? 'expired' : 'paid' }));
  batch.set(h.db.collection('ticketingOrders').doc('other'), order({ eventId: other, createdAt: at + 1 })); await batch.commit();
  const found = []; let cursor = null;
  do { const p = await h.service.staffOrders(eid, h.staff, { cursor, limit: 50, excludeExpired: true }); assert.ok(p.orders.length <= 50); assert.ok(p.scanned <= 500); found.push(...p.orders); cursor = p.cursor; } while (cursor);
  assert.equal(found.length, 124); assert.equal(new Set(found.map(o => o.orderId)).size, 124); assert.ok(found.every(o => o.eventId === eid));
  assert.deepEqual(found.map(o => o.orderId), found.map(o => o.orderId).sort().reverse());
  for (const key of ['units', 'accessHash', 'clientSecret', 'inputHash', 'ownerUid']) assert.equal(key in found[0], false);
  const first = await h.service.staffOrders(eid, h.staff, { limit: 1 });
  await assert.rejects(h.service.staffOrders(other, h.staff, { cursor: first.cursor }), e => e.status === 400);
  await assert.rejects(h.service.staffOrders(eid, h.staff, { cursor: first.cursor, search: 'Buyer' }), e => e.status === 400);
  await assert.rejects(h.service.staffOrders(eid, 'outsider'), e => e.status === 403);
  await assert.rejects(h.service.staffPerformance(eid, 'outsider'), e => e.status === 403);
}));

test('sparse searches expose empty-page continuation and RSVP pagination has independent scope', () => isolated(async h => {
  const eid = await h.event(), batch1 = h.db.batch(), batch2 = h.db.batch(), at = Date.now();
  for (let i = 0; i < 605; i++) (i < 400 ? batch1 : batch2).set(h.db.collection('ticketingOrders').doc(`sparse_${String(i).padStart(3, '0')}`), order({ eventId: eid, name: i === 604 ? 'Needle guest' : 'Other guest', createdAt: at - i, method: i % 2 ? 'cash' : 'rsvp', rsvpStatus: 'pending', status: 'pending-approval' }));
  await batch1.commit(); await batch2.commit();
  const first = await h.service.staffOrders(eid, h.staff, { search: 'Needle' }); assert.equal(first.orders.length, 0); assert.equal(first.scanned, 500); assert.equal(first.hasMore, true);
  const next = await h.service.staffOrders(eid, h.staff, { search: 'Needle', cursor: first.cursor }); assert.equal(next.orders.length, 1); assert.equal(next.orders[0].name, 'Needle guest');
  const rsvps = await h.service.staffOrders(eid, h.staff, { method: 'rsvp', rsvpStatus: 'pending', limit: 50 }); assert.equal(rsvps.orders.length, 50); assert.ok(rsvps.orders.every(o => o.method === 'rsvp')); assert.equal(rsvps.hasMore, true);
}));

test('backfill reads preserve progress; dead leases recover and removed events stop their jobs', () => isolated(async h => {
  const eid = await h.event(), job = h.db.collection('ticketingFinancialBackfills').doc(eid), zone = (await h.service.event(eid).get()).data().draft.timezone;
  await financialSummary(h.db, eid, zone);
  await job.update({ cursor: 'old-progress', leaseId: 'dead-worker', leaseUntil: Date.now() - 1 });
  const before = (await job.get()).data();
  await financialSummary(h.db, eid, zone);
  assert.equal((await job.get()).data().cursor, 'old-progress', 'reading incomplete totals does not restart the backfill');
  await financialRecovery(h.db);
  assert.equal(financialBackfillNeedsWork(before, (await job.get()).data()), true);
  await financialBackfillPage(h.db, eid); assert.equal((await job.get()).data().status, 'done');
  await job.set({ status: 'pending', cursor: '', timezone: zone, leaseUntil: 0, wakeRevision: Date.now() });
  await h.service.event(eid).delete(); await financialBackfillPage(h.db, eid);
  assert.equal((await job.get()).data().status, 'cancelled'); assert.equal((await job.get()).data().leaseUntil, 0);
}));
