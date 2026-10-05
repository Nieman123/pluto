const test = require('node:test'), assert = require('node:assert/strict');
const { expiredCheckoutDue, followupBuyerEligible, followupEventSelling, checkoutFollowupDelay, checkoutFollowupWindow } = require('../lib/ticketing/checkout-followup');
const { fixture } = require('./ticketing-fixture.cjs');

test('only confirmed unpaid Stripe expiries between one hour and one day qualify', () => {
  const now = Date.now(), order = { status: 'expired', method: 'stripe', total: 10000, sessionId: 'cs_test', expiredAt: now - checkoutFollowupDelay };
  assert.equal(expiredCheckoutDue(order, now), true);
  for (const patch of [{ status: 'open' }, { method: 'rsvp' }, { total: 0 }, { sessionId: '' }, { expiredAt: undefined },
    { expiredAt: now - checkoutFollowupDelay + 1 }, { expiredAt: now - checkoutFollowupWindow },
    { paymentIntentId: 'pi_paid' }, { financialBlocked: true }, { reviewReason: 'Late payment' }, { financialReviewReason: 'Dispute' }])
    assert.equal(expiredCheckoutDue({ ...order, ...patch }, now), false, JSON.stringify(patch));
});

test('newer attempts and completed purchases suppress reminders but a free RSVP allows a VIP retry', () => {
  const order = { createdAt: 100 }, peers = [{ id: 'expired', order }];
  assert.equal(followupBuyerEligible('expired', order, peers), true);
  for (const status of ['provisioning', 'open', 'processing', 'expired', 'review', 'paid'])
    assert.equal(followupBuyerEligible('expired', order, [...peers, { id: 'other', order: { createdAt: 101, status, method: 'stripe' } }]), false, status);
  assert.equal(followupBuyerEligible('expired', order, [...peers, { id: 'rsvp', order: { createdAt: 101, status: 'paid', method: 'rsvp' } }]), true);
  assert.equal(followupBuyerEligible('expired', order, [...peers, { id: 'earlier-processing', order: { createdAt: 90, status: 'processing', method: 'stripe' } }]), false, 'an earlier unsettled payment must resolve before a reminder');
  assert.equal(followupBuyerEligible('expired', order, Array.from({ length: 101 }, (_, i) => ({ id: String(i), order: { createdAt: 0 } }))), false);
});

test('a published ongoing festival can send reminders only while paid inventory is on sale', () => {
  const now = Date.now(), draft = fixture(true), pools = Object.fromEntries(draft.pools.map(p => [p.id, { held: 0, sold: 0 }]));
  assert.ok(Date.parse(draft.startAt) < now);
  assert.equal(followupEventSelling(draft, 'published', pools, now), true);
  for (const status of ['draft', 'cancelled', 'archived']) assert.equal(followupEventSelling(draft, status, pools, now), false);
  assert.equal(followupEventSelling({ ...draft, registrationMode: 'free' }, 'published', pools, now), false);
  assert.equal(followupEventSelling({ ...draft, endAt: new Date(now - 1).toISOString() }, 'published', pools, now), false);
  assert.equal(followupEventSelling({ ...draft, offers: draft.offers.map(o => ({ ...o, salesEnd: new Date(now - 1).toISOString() })) }, 'published', pools, now), false);
  const full = Object.fromEntries(draft.pools.map(p => [p.id, { held: 0, sold: p.capacity }]));
  assert.equal(followupEventSelling(draft, 'published', full, now), false);
});
