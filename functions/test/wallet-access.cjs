const test = require('node:test');
const assert = require('node:assert/strict');
const { Timestamp } = require('firebase-admin/firestore');
const { harness } = require('./ticketing-harness.cjs');
const { hash } = require('../lib/ticketing/domain');
test('wallet export and download are scoped to the current holder and ticket version', async () => {
  const h = harness(); let token;
  try {
    const eid = await h.event(d => { d.startAt = d.admissionStartsAt = new Date(Date.now() + 86400000).toISOString(); d.offers.forEach(o => o.validFrom = d.startAt); }), raw = h.request(eid), checkout = await h.service.checkout(raw, null); await h.pay(checkout.orderId);
    const view = await h.service.view(checkout.orderId, raw.accessKey, null), tid = view.tickets[0].id;
    await assert.rejects(h.service.walletTicket({ ticketId: tid }, null), e => e.status === 403);
    const proof = { ticketId: tid, accessKey: raw.accessKey }, current = await h.service.walletTicket(proof, null); assert.equal(current.qr, view.tickets[0].qr);
    const link = await h.service.appleDownload(proof, null); token = link.url.split('/').at(-1); assert.equal((await h.service.walletDownload(token)).qr, current.qr);
    await h.service.transfer(checkout.orderId, raw.accessKey, null, tid, 'new-holder@example.test');
    const transferDoc = (await h.db.collection('ticketingEmailJobs').where('orderId', '==', checkout.orderId).get()).docs.map(d => d.data()).find(d => d.type === 'transfer');
    await h.service.acceptTransfer(transferDoc.token, null);
    await assert.rejects(h.service.walletTicket(proof, null), e => e.status === 403);
    await assert.rejects(h.service.walletDownload(token), e => e.status === 409);
    const holder = await h.service.walletTicket({ ticketId: tid, holderToken: transferDoc.token }, null); assert.notEqual(holder.qr, current.qr);
    await h.service.order(checkout.orderId).update({ financialBlocked: true });
    await assert.rejects(h.service.walletTicket({ ticketId: tid, holderToken: transferDoc.token }, null), e => e.status === 409);
    await h.service.order(checkout.orderId).update({ financialBlocked: false });
    const download = await h.service.appleDownload({ ticketId: tid, holderToken: transferDoc.token }, null), expired = download.url.split('/').at(-1);
    await h.db.collection('ticketingWalletDownloads').doc(hash(expired)).update({ expiresAt: Timestamp.fromMillis(Date.now() - 1) });
    await assert.rejects(h.service.walletDownload(expired), e => e.status === 410); await h.db.collection('ticketingWalletDownloads').doc(hash(expired)).delete();
    await h.service.tickets().doc(tid).update({ status: 'refunded' });
    await assert.rejects(h.service.walletTicket({ ticketId: tid, holderToken: transferDoc.token }, null), e => e.status === 409);
  } finally { if (token) await h.db.collection('ticketingWalletDownloads').doc(hash(token)).delete(); await h.cleanup(); }
});
test('wallet export excludes pending RSVPs, expired and admitted tickets', async () => {
  const h = harness();
  try {
    const eid = await h.event(), raw = h.request(eid), checkout = await h.service.checkout(raw, null); await h.pay(checkout.orderId);
    const tid = (await h.service.view(checkout.orderId, raw.accessKey, null)).tickets[0].id, proof = { ticketId: tid, accessKey: raw.accessKey };
    await h.service.order(checkout.orderId).update({ method: 'rsvp', rsvpStatus: 'pending' });
    await assert.rejects(h.service.walletTicket(proof, null), e => e.status === 409);
    await h.service.order(checkout.orderId).update({ rsvpStatus: 'approved' }); assert.ok((await h.service.walletTicket(proof, null)).qr);
    await h.service.tickets().doc(tid).update({ admission: { at: Date.now() } }); await assert.rejects(h.service.walletTicket(proof, null), e => e.status === 409);
    await h.service.tickets().doc(tid).update({ admission: null, validUntil: new Date(Date.now() - 1000).toISOString() }); await assert.rejects(h.service.walletTicket(proof, null), e => e.status === 409);
  } finally { await h.cleanup(); }
});
test('event index financial summaries are withheld from admission-only staff', async () => {
  const h = harness(), door = `${h.prefix}_door`;
  try {
    const eid = await h.event(), raw = h.request(eid), checkout = await h.service.checkout(raw, null); await h.pay(checkout.orderId);
    await h.db.collection('ticketingStaff').doc(`${eid}_${door}`).set({ uid: door, eventId: eid, roles: ['admission'] });
    assert.equal((await h.service.list(door, true)).events[0].revenue, undefined);
    const admin = (await h.service.list(h.staff, true)).events.find(e => e.id === eid); assert.equal(admin.revenue.gross, 10000);
  } finally { for (const doc of (await h.db.collection('ticketingStaff').where('uid', '==', door).get()).docs) await doc.ref.delete(); await h.cleanup(); }
});
