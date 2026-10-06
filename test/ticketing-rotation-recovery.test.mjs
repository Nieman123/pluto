import test from 'node:test';
import assert from 'node:assert/strict';
import { holdUnresolvedScans, isUnavailableKey } from '../site/src/ticketing/rotation-recovery.js';

test('scanner refresh holds retained ticket/guest admissions without marking new attendees admitted', () => {
  const original = { eventId: 'event', tickets: [{ id: 'ticket', admitted: false }, { id: 'other', admitted: false }, { id: 'vip', rsvpTicketId: 'ticket', admitted: false }], guests: [{ id: 'guest', arrived: null }] };
  const queue = [{ eventId: 'event', ticketId: 'vip', keyRotationBlocked: true }, { eventId: 'event', kind: 'guest', guestId: 'guest', keyRotationBlocked: true }, { eventId: 'other-event', ticketId: 'other', keyRotationBlocked: true }];
  const prepared = holdUnresolvedScans(original, queue);
  assert.equal(prepared.tickets[0].reviewPending, true); assert.equal(prepared.tickets[0].admitted, false);
  assert.equal(prepared.tickets[1].reviewPending, false); assert.equal(prepared.guests[0].reviewPending, true);
  assert.equal(prepared.tickets[2].reviewPending, true, 'VIP and its parent RSVP share the unresolved admission hold');
  assert.equal(holdUnresolvedScans(original, [{ eventId: 'event', ticketId: 'ticket', keyRotationBlocked: true }]).tickets[2].reviewPending, true, 'an unresolved RSVP also holds its VIP upgrade');
  assert.equal(original.tickets[0].reviewPending, undefined);
  const reviewed = holdUnresolvedScans(prepared, []);
  assert.equal(reviewed.tickets[0].reviewPending, false); assert.equal(reviewed.guests[0].reviewPending, false);
});
test('only explicit unavailable-key responses permit preparation while retaining rejected queues', () => {
  for (const code of ['ticket-key-unavailable', 'offline-key-unavailable']) assert.equal(isUnavailableKey({ status: 409, code }), true);
  for (const error of [{ status: 401, code: 'ticket-key-unavailable' }, { status: 403, code: 'offline-key-unavailable' }, { status: 503, code: 'offline-key-unavailable' }, { status: 409, code: 'outside-window' }, new Error('Network failure')]) assert.equal(isUnavailableKey(error), false);
});
