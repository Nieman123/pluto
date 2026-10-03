const test = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./ticketing-harness.cjs');
function hidden(data) {
  for (const secret of ['Private secret venue', '123 Hidden Lane', 'Private directions']) assert.ok(!JSON.stringify(data).includes(secret), `${secret} withheld`);
}
test('scheduled locations are withheld across order/account/transfer/wallet and only change on publication', async () => {
  const h = harness();
  try {
    const at = new Date(Date.now() + 3600000).toISOString(), eid = await h.event(d => {
      d.startAt = d.admissionStartsAt = new Date(Date.now() + 86400000).toISOString(); d.offers.forEach(o => o.validFrom = d.startAt);
      d.venueRevealScheduled = true; d.venueRevealAt = at;
    });
    const actor = { uid: `${h.prefix}_buyer`, email: `${h.prefix}@example.test`, email_verified: true }, raw = h.request(eid), checkout = await h.service.checkout(raw, actor); await h.pay(checkout.orderId);
    let view = await h.service.view(checkout.orderId, raw.accessKey, null), tid = view.tickets[0].id;
    assert.equal(view.venue.available, false); assert.ok(view.tickets[0].qr); hidden(view); hidden(await h.service.mine(actor));
    const pass = await h.service.walletTicket({ ticketId: tid, accessKey: raw.accessKey }, null); hidden(pass); assert.equal(pass.venueAvailable, false);
    await h.service.transfer(checkout.orderId, raw.accessKey, null, tid, 'location-holder@example.test');
    const token = (await h.db.collection('ticketingEmailJobs').where('orderId', '==', checkout.orderId).get()).docs.map(d => d.data()).find(d => d.type === 'transfer').token;
    const holder = { uid: `${h.prefix}_holder`, email: 'location-holder@example.test', email_verified: true };
    hidden(await h.service.acceptTransfer(token, holder)); hidden(await h.service.holder(token, holder)); hidden(await h.service.mine(holder));
    assert.equal((await h.service.view(checkout.orderId, raw.accessKey, null)).venue, null, 'original buyer no longer holds this ticket');
    const record = await h.service.get(eid, h.staff), draft = { ...record.draft, venueRevealAt: new Date(Date.now() - 1000).toISOString() };
    await h.service.save(eid, draft, record.revision, h.staff);
    hidden(await h.service.holder(token, holder)); // Draft edits cannot reveal a published location.
    await h.service.publish(eid, 'publish', record.revision + 1, h.staff);
    view = await h.service.holder(token, holder); assert.equal(view.venue.available, true); assert.equal(view.venue.address, draft.address);
    assert.equal((await h.service.mine(holder)).tickets[0].venue.directions, draft.directions);
    assert.equal((await h.service.walletTicket({ ticketId: tid, holderToken: token }, holder)).address, draft.address);
    hidden((await h.db.collection('publishedEvents').doc(eid).get()).data());
    await h.service.tickets().doc(tid).update({ status: 'refunded', refunded: true });
    assert.equal((await h.service.mine(holder)).tickets[0].venue, null);
    await assert.rejects(h.service.holder(token, holder), e => e.status === 409);
  } finally { await h.cleanup(); }
});
test('RSVP approval is still required even after location reveal', async () => {
  const h = harness();
  try {
    const eid = await h.event(d => { d.registrationMode = 'rsvp-approval'; d.offers = [{ ...d.offers[0], unitAmount: 0, maxPerOrder: 1 }]; d.venueRevealScheduled = true; d.venueRevealAt = new Date(Date.now() - 1000).toISOString(); });
    const raw = h.request(eid), pending = await h.service.rsvp(raw, null);
    const before = await h.service.view(pending.orderId, raw.accessKey, null); assert.equal(before.venue, null); assert.deepEqual(before.tickets, []);
    await h.service.reviewRsvp(eid, pending.orderId, 'approve', '', h.staff);
    const approved = await h.service.view(pending.orderId, raw.accessKey, null); assert.equal(approved.venue.available, true); assert.ok(approved.tickets[0].qr);
  } finally { await h.cleanup(); }
});
