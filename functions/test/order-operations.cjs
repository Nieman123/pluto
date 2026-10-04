const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { harness } = require('./ticketing-harness.cjs');

async function paid(h, eventId, quantity = 1) {
  const request = h.request(eventId, { items: [{ offerId: 'weekend', quantity }] });
  const order = await h.service.checkout(request, null); await h.pay(order.orderId);
  return { ...order, request, view: await h.service.view(order.orderId, request.accessKey, null) };
}
async function collect(h, filter) {
  const found = []; let cursor = null;
  for (let page = 0; page < 30; page++) {
    const result = await h.service.allOrders({ ...filter, cursor, limit: 2 }, h.staff);
    assert.ok(result.scanned <= 500); found.push(...result.orders);
    if (!result.hasMore) return found;
    assert.ok(result.cursor); cursor = result.cursor;
  }
  throw new Error('Pagination did not end.');
}

test('all-event orders are administrator-only, filtered, safely projected and paged without losing timestamp ties', async () => {
  const h = harness(), scoped = `${h.prefix}_manager`;
  let first;
  try {
    first = await h.event(d => { d.title = `${h.prefix} First event`; });
    const second = await h.event(d => { d.title = `${h.prefix} Second event`; });
    await h.service.setStaff(first, scoped, ['manager'], h.staff);
    const purchases = [];
    for (const eid of [first, second, first, second, first]) purchases.push(await paid(h, eid));
    const at = Date.now();
    await Promise.all(purchases.map(p => h.service.order(p.orderId).update({ createdAt: at })));
    await assert.rejects(() => h.service.allOrders({}, scoped), error => error.status === 403);
    await assert.rejects(() => h.service.allOrders({}, 'unknown-staff'), error => error.status === 403);
    const orders = await collect(h, { search: h.prefix.toUpperCase() });
    assert.deepEqual(orders.map(o => o.orderId), purchases.map(p => p.orderId).sort().reverse());
    assert.equal(new Set(orders.map(o => o.orderId)).size, 5);
    assert.equal(orders.filter(o => o.eventId === second).length, 2);
    for (const order of orders) for (const key of ['accessHash', 'inputHash', 'clientSecret', 'units', 'tax', 'ownerUid']) assert.equal(key in order, false);
    const filtered = await collect(h, { search: h.prefix, eventId: first, status: 'paid' });
    assert.equal(filtered.length, 3); assert.ok(filtered.every(o => o.eventId === first && o.status === 'paid'));
    assert.equal((await collect(h, { search: h.prefix, status: 'expired' })).length, 0);
    await assert.rejects(() => h.service.allOrders({ limit: 101 }, h.staff), error => error.status === 400);
    await assert.rejects(() => h.service.allOrders({ cursor: { createdAt: -1, orderId: 'bad' } }, h.staff), error => error.status === 400);
  } finally { if (first) await h.db.collection('ticketingStaff').doc(`${first}_${scoped}`).delete(); await h.cleanup(); }
});

test('individual manual check-in preserves remaining tickets, is idempotent and shares the scanner duplicate ledger', async () => {
  const h = harness();
  try {
    const eid = await h.event(), purchase = await paid(h, eid, 2), detail = await h.service.staffOrder(purchase.orderId, h.staff);
    assert.equal(detail.tickets.length, 2); assert.deepEqual(detail.tickets.map(t => t.number), [1, 2]);
    assert.equal(detail.total, 20000); assert.ok(detail.paymentIntentId); assert.equal(detail.stripeFee, 320);
    assert.ok(detail.tickets.every(t => t.canCheckIn)); assert.ok(detail.permissions.canRefund);
    for (const key of ['accessHash', 'inputHash', 'clientSecret']) assert.equal(key in detail, false);
    assert.ok(detail.tickets.every(t => !('qr' in t) && !('ownerUid' in t)));
    const first = detail.tickets[0], second = detail.tickets[1], scanId = randomUUID();
    const accepted = await h.service.checkInOrderTicket(purchase.orderId, first.id, scanId, h.staff);
    assert.equal(accepted.result, 'accepted'); assert.equal(accepted.source, 'order-dashboard');
    assert.deepEqual(await h.service.checkInOrderTicket(purchase.orderId, first.id, scanId, h.staff), accepted);
    const after = await h.service.staffOrder(purchase.orderId, h.staff);
    assert.ok(after.tickets[0].admission); assert.equal(after.tickets[1].admission, null); assert.equal(after.tickets[1].canCheckIn, true);
    assert.equal(after.activity.filter(a => a.action === 'ticket-manually-checked-in').length, 1);
    assert.equal((await h.service.scan(eid, purchase.view.tickets.find(t => t.id === first.id).qr, randomUUID(), h.staff)).result, 'duplicate');
    const race = await Promise.all([h.service.checkInOrderTicket(purchase.orderId, second.id, randomUUID(), h.staff), h.service.checkInOrderTicket(purchase.orderId, second.id, randomUUID(), h.staff)]);
    assert.deepEqual(race.map(r => r.result).sort(), ['accepted', 'duplicate']);
    assert.equal((await h.service.staffOrder(purchase.orderId, h.staff)).activity.filter(a => a.action === 'ticket-manually-checked-in').length, 2);
  } finally { await h.cleanup(); }
});

test('order viewing and admission permissions stay separate and ticket membership is enforced', async () => {
  const h = harness(), staff = [], eid = await h.event();
  try {
    const purchase = await paid(h, eid), other = await paid(h, await h.event());
    for (const roles of [['cash'], ['refund'], ['admission'], ['manager'], ['cash', 'admission']]) {
      const uid = `${h.prefix}_${roles.join('_')}`; staff.push(uid); await h.service.setStaff(eid, uid, roles, h.staff);
      if (roles.length === 1 && roles[0] === 'admission') await assert.rejects(() => h.service.staffOrder(purchase.orderId, uid), error => error.status === 403);
      else {
        const view = await h.service.staffOrder(purchase.orderId, uid);
        assert.equal(view.permissions.canRefund, roles.includes('refund'));
        assert.equal(view.permissions.canCheckIn, roles.includes('manager') || roles.includes('admission'));
      }
      if (!roles.includes('manager') && !(roles.includes('cash') && roles.includes('admission'))) await assert.rejects(() => h.service.checkInOrderTicket(purchase.orderId, purchase.view.tickets[0].id, randomUUID(), uid), error => error.status === 403);
      await assert.rejects(() => h.service.staffOrder(other.orderId, uid), error => error.status === 403);
    }
    await assert.rejects(() => h.service.checkInOrderTicket(purchase.orderId, other.view.tickets[0].id, randomUUID(), h.staff), error => error.status === 409);
    assert.equal((await h.service.checkInOrderTicket(purchase.orderId, purchase.view.tickets[0].id, randomUUID(), staff.find(uid => uid.endsWith('_manager')))).result, 'accepted');
  } finally { await Promise.all(staff.map(uid => h.db.collection('ticketingStaff').doc(`${eid}_${uid}`).delete())); await h.cleanup(); }
});

test('manual check-in fails closed for payment, refund, event and admission-window restrictions', async () => {
  const h = harness();
  try {
    const eid = await h.event(), purchase = await paid(h, eid), ticket = purchase.view.tickets[0], ref = h.service.tickets().doc(ticket.id);
    const attempt = () => h.service.checkInOrderTicket(purchase.orderId, ticket.id, randomUUID(), h.staff);
    await h.service.order(purchase.orderId).update({ financialBlocked: true });
    assert.equal((await attempt()).result, 'invalid'); assert.equal((await h.service.staffOrder(purchase.orderId, h.staff)).tickets[0].canCheckIn, false);
    await h.service.order(purchase.orderId).update({ financialBlocked: false, status: 'open' });
    assert.equal((await attempt()).result, 'invalid');
    await h.service.order(purchase.orderId).update({ status: 'paid' });
    for (const status of ['refund-pending', 'refunded']) { await ref.update({ status }); assert.equal((await attempt()).result, 'invalid'); }
    await ref.update({ status: 'valid', validFrom: new Date(Date.now() + 3600000).toISOString() });
    assert.equal((await attempt()).result, 'outside-window');
    await ref.update({ validFrom: 'invalid-date' }); assert.equal((await attempt()).result, 'outside-window');
    await ref.update({ validFrom: new Date(Date.now() - 3600000).toISOString(), validUntil: new Date(Date.now() - 60000).toISOString() });
    assert.equal((await attempt()).result, 'outside-window');
    await ref.update({ validUntil: new Date(Date.now() + 3600000).toISOString() });
    for (const status of ['cancelled', 'archived']) { await h.service.event(eid).update({ status }); assert.equal((await attempt()).result, 'invalid'); }
    assert.equal((await ref.get()).data().admission, null);
    assert.equal((await h.service.event(eid).collection('audit').where('action', '==', 'ticket-manually-checked-in').get()).size, 0);
  } finally { await h.cleanup(); }
});

test('RSVP approvals remain required and transferred holder information is visible to staff', async () => {
  const h = harness(); let transferredTicket;
  try {
    const eid = await h.event(d => { d.registrationMode = 'rsvp-approval'; d.offers = [{ ...d.offers[0], unitAmount: 0, maxPerOrder: 1 }]; });
    const raw = h.request(eid), pending = await h.service.rsvp(raw, { uid: '', email: raw.email, email_verified: true });
    assert.equal((await h.service.staffOrder(pending.orderId, h.staff)).tickets.length, 0);
    await h.service.reviewRsvp(eid, pending.orderId, 'approve', 'Approved guest', h.staff);
    const approved = await h.service.staffOrder(pending.orderId, h.staff), ticket = approved.tickets[0];
    await h.service.order(pending.orderId).update({ rsvpStatus: 'pending' });
    assert.equal((await h.service.checkInOrderTicket(pending.orderId, ticket.id, randomUUID(), h.staff)).result, 'invalid');
    await h.service.order(pending.orderId).update({ rsvpStatus: 'approved' });
    assert.equal((await h.service.checkInOrderTicket(pending.orderId, ticket.id, randomUUID(), h.staff)).result, 'accepted');
    const transferred = await paid(h, await h.event(d => { d.startAt = d.admissionStartsAt = new Date(Date.now() + 3600000).toISOString(); d.offers.forEach(o => { o.validFrom = d.startAt; }); }));
    transferredTicket = transferred.view.tickets[0].id;
    await h.service.transfer(transferred.orderId, transferred.request.accessKey, null, transferred.view.tickets[0].id, `${h.prefix}-friend@example.test`);
    const jobs = await h.db.collection('ticketingEmailJobs').where('orderId', '==', transferred.orderId).get();
    const transfer = jobs.docs.find(d => d.data().type === 'transfer').data();
    await h.service.acceptTransfer(transfer.token, { uid: `${h.prefix}-friend`, name: 'Late friend', email: transfer.to, email_verified: true });
    const detail = await h.service.staffOrder(transferred.orderId, h.staff);
    assert.equal(detail.name, 'Test Guest'); assert.equal(detail.tickets[0].holderName, 'Late friend'); assert.equal(detail.tickets[0].holderEmail, transfer.to);
    assert.equal(detail.tickets[0].canCheckIn, false);
  } finally {
    if (transferredTicket) for (const collection of ['ticketingTransfers', 'ticketingHolderAccess']) for (const doc of (await h.db.collection(collection).where('ticketId', '==', transferredTicket).get()).docs) await doc.ref.delete();
    await h.cleanup();
  }
});
