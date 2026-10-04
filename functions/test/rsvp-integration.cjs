const assert = require('node:assert/strict');
const { generateKeyPairSync, randomBytes, randomUUID } = require('node:crypto');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
if (!process.env.FIRESTORE_EMULATOR_HOST?.startsWith('127.0.0.1:') || !process.env.GCLOUD_PROJECT?.startsWith('demo-')) throw new Error('Demo Firebase emulators required.');
initializeApp({ projectId: process.env.GCLOUD_PROJECT });
const { Operations } = require('../lib/ticketing/operations');
const { ticketingRouter } = require('../lib/ticketing/routes');
const { signTicket, readTicket } = require('../lib/ticketing/config');
const { ticketId } = require('../lib/ticketing/domain');
const { fixture } = require('./ticketing-fixture.cjs');
const db = getFirestore(), staff = `rsvp-admin-${randomUUID()}`, signingKey = generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64');
const service = new Operations(db, { signingKey, stripe: {} });
const accessKey = () => randomBytes(32).toString('hex');
const request = (eventId, overrides = {}) => ({ eventId, accessKey: accessKey(), name: 'RSVP Attendee', email: `${randomUUID()}@example.test`, items: [{ offerId: 'weekend', quantity: 1 }], ...overrides });
async function event(mode, capacity = 2) {
  const eventId = randomUUID(), draft = fixture(true); draft.slug += `-${eventId}`; draft.registrationMode = mode;
  draft.offers = [{ ...draft.offers[0], unitAmount: 0, maxPerOrder: 1 }]; draft.pools[0].capacity = capacity; draft.pools[1].capacity = capacity;
  await service.save(eventId, draft, 0, staff); await service.publish(eventId, 'publish', 1, staff); return eventId;
}
const pool = async eid => (await service.event(eid).collection('pools').doc('friday').get()).data();
async function main() {
  await db.collection('adminUsers').doc(staff).set({ role: 'admin' });
  const open = await event('rsvp', 1), openRequest = request(open), confirmed = await service.rsvp(openRequest, null);
  assert.equal(confirmed.status, 'paid'); await service.rsvp(openRequest, null);
  let view = await service.view(confirmed.orderId, openRequest.accessKey, null);
  assert.equal(view.tickets.length, 1); assert.ok(view.tickets[0].qr); assert.equal(view.tickets[0].transferable, false); assert.ok(view.venue);
  assert.equal((await pool(open)).sold, 1); assert.equal((await pool(open)).held, 0);
  await assert.rejects(() => service.rsvp(request(open), null), /not enough/);
  await assert.rejects(() => service.transfer(confirmed.orderId, openRequest.accessKey, null, view.tickets[0].id, 'unapproved@example.test'), /cannot be transferred/);
  const revokedQr = view.tickets[0].qr; await service.cancel(confirmed.orderId, openRequest.accessKey, null); await service.cancel(confirmed.orderId, openRequest.accessKey, null);
  assert.equal((await pool(open)).sold, 0); assert.equal((await service.scan(open, revokedQr, randomUUID(), staff)).result, 'invalid');
  assert.equal((await service.view(confirmed.orderId, openRequest.accessKey, null)).rsvpStatus, 'withdrawn');
  assert.equal((await service.view(confirmed.orderId, openRequest.accessKey, null)).venue, null, 'withdrawn RSVPs no longer expose private venue details');
  const approval = await event('rsvp-approval', 1), first = request(approval), second = request(approval);
  const buyer = { uid: `rsvp-buyer-${randomUUID()}`, email: first.email, email_verified: true };
  const pending = await service.rsvp(first, buyer), other = await service.rsvp(second, null);
  assert.equal(pending.status, 'pending-approval'); assert.equal((await pool(approval)).sold, 0); assert.equal((await pool(approval)).held, 0);
  view = await service.view(pending.orderId, first.accessKey, null); assert.deepEqual(view.tickets, []); assert.equal(view.venue, null);
  assert.equal((await service.mine(buyer)).tickets.length, 0); assert.equal((await service.mine(buyer)).orders[0].rsvpStatus, 'pending');
  assert.equal((await service.manifest(approval, staff)).tickets.length, 0);
  const forgedQr = signTicket({ id: ticketId(pending.orderId, 0), eventId: approval, version: 1, validFrom: fixture(true).startAt, validUntil: fixture(true).endAt }, signingKey);
  assert.equal((await service.scan(approval, forgedQr, randomUUID(), staff)).result, 'invalid', 'even a signed QR cannot admit a pending request without a ticket record');
  await assert.rejects(() => service.fulfill(pending.orderId, {}), /approval flow/);
  await assert.rejects(() => service.checkout(request(approval), null), /cannot be bypassed/);
  await assert.rejects(() => service.checkout({ ...request(approval), reason: 'Bypass' }, null, 'comp', staff), /cannot be bypassed/);
  await assert.rejects(() => service.rsvp({ ...first, name: 'Changed' }, buyer), /different details/);
  await assert.rejects(() => service.rsvp({ ...first, accessKey: accessKey() }, null), /already exists/);
  await assert.rejects(() => service.rsvp(request(approval, { items: [{ offerId: 'weekend', quantity: 2 }] }), null), /once per person/);
  await assert.rejects(() => service.reviewRsvp(approval, pending.orderId, 'approve', '', buyer.uid), /does not have access/);
  await assert.rejects(() => service.reviewRsvp(open, pending.orderId, 'approve', '', staff), /not found/);
  const manager = `rsvp-manager-${randomUUID()}`; await service.setStaff(approval, manager, ['manager'], staff);
  const race = await Promise.allSettled([service.reviewRsvp(approval, pending.orderId, 'approve', 'See you there', manager), service.reviewRsvp(approval, other.orderId, 'approve', '', manager)]);
  assert.equal(race.filter(r => r.status === 'fulfilled').length, 1, 'approval cannot oversell the last place');
  const winner = race[0].status === 'fulfilled' ? { result: pending, request: first } : { result: other, request: second }, loser = race[0].status === 'rejected' ? pending : other;
  await service.reviewRsvp(approval, winner.result.orderId, 'approve', 'Retry', manager);
  assert.equal((await pool(approval)).sold, 1); assert.equal((await service.manifest(approval, staff)).tickets.length, 1);
  assert.equal((await service.view(loser.orderId, loser === pending ? first.accessKey : second.accessKey, null)).tickets.length, 0);
  await service.reviewRsvp(approval, loser.orderId, 'decline', 'No space available', manager);
  const declined = (await service.order(loser.orderId).get()).data(); assert.equal(declined.rsvpStatus, 'declined');
  await assert.rejects(() => service.reviewRsvp(approval, loser.orderId, 'approve', '', manager), /already been resolved/);
  view = await service.view(winner.result.orderId, winner.request.accessKey, null);
  assert.equal((await service.scan(approval, view.tickets[0].qr, randomUUID(), staff)).result, 'accepted');
  await assert.rejects(() => service.withdrawRsvp(approval, winner.result.orderId, manager), /already arrived/);
  await assert.rejects(() => service.refund(winner.result.orderId, [view.tickets[0].id], accessKey(), staff), /no payment to refund/);
  const withdrawEvent = await event('rsvp-approval'), withdrawing = request(withdrawEvent), withdrawn = await service.rsvp(withdrawing, null);
  await service.cancel(withdrawn.orderId, withdrawing.accessKey, null); assert.equal((await pool(withdrawEvent)).sold, 0);
  await assert.rejects(() => service.reviewRsvp(withdrawEvent, withdrawn.orderId, 'approve', '', staff), /already been resolved/);
  const duplicateEmail = `${randomUUID()}@example.test`, attempts = await Promise.allSettled([service.rsvp(request(withdrawEvent, { email: duplicateEmail }), null), service.rsvp(request(withdrawEvent, { email: duplicateEmail }), null)]);
  assert.equal(attempts.filter(r => r.status === 'fulfilled').length, 1, 'concurrent email retries cannot create two RSVPs');
  assert.equal((await service.guestList(approval, staff)).guests.length, 0, 'pending/declined RSVPs never become guest-list entries');
  const pin = await service.createScannerPin(approval, 'RSVP door', Date.now() + 3600000, staff), login = await service.scannerLogin(pin.pin, `rsvp-${randomUUID()}`);
  const express = require('express'), app = express(); app.use(ticketingRouter(() => ({}), service)); const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  try {
    const endpoint = `http://127.0.0.1:${server.address().port}`;
    for (const path of ['staff/rsvp/review', 'staff/rsvp/withdraw']) {
      const response = await fetch(`${endpoint}/tickets/api/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Pluto-Scanner': login.token }, body: JSON.stringify({ eventId: approval, orderId: pending.orderId, decision: 'approve' }) });
      assert.equal(response.status, 401, 'scanner PIN cannot make RSVP decisions');
    }
  } finally { await new Promise(resolve => server.close(resolve)); }
  const originalFetch = global.fetch, sent = [];
  process.env.RESEND_API_KEY = 'test-rsvp-provider-key';
  global.fetch = async (url, options) => { assert.equal(url, 'https://api.resend.com/emails'); sent.push(JSON.parse(options.body)); return { ok: true }; };
  try {
    await service.emailJob(`rsvppending_${pending.orderId}`); await service.emailJob(`receipt_${winner.result.orderId}`); await service.emailJob(`rsvpdeclined_${loser.orderId}`);
    assert.match(sent[0].text, /approval is required/i); assert.match(sent[1].text, /RSVP is confirmed/); assert.match(sent[2].text, /declined/);
    for (const email of sent) { assert.ok(!email.attachments); assert.ok(!email.text.includes('PLUTO1.')); assert.match(email.text, /QR codes stay in the app/); }
  } finally { global.fetch = originalFetch; }
  assert.equal(readTicket(view.tickets[0].qr, signingKey).eventId, approval);
  console.log('RSVP integration passed: open/pending/approval/decline/withdrawal, no preapproval credentials or private venue, capacity and duplicate races, no checkout/comp/transfer bypass, manager/PIN boundaries, scanner admission and link-only email notices.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
