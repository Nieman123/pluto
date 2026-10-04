import test from 'node:test';
import assert from 'node:assert/strict';
import { updateEventSchedule } from '../site/src/ticketing/event-schedule.js';

function draft() {
  return { startAt: '2026-10-11T12:56:00.392Z', admissionStartsAt: '2026-10-11T12:56:00.392Z', endAt: '2026-10-11T20:56:00.392Z', offers: [
    { id: 'general', validFrom: '2026-10-11T12:56:00.392Z', validUntil: '2026-10-11T20:56:00.392Z', salesEnd: '2026-10-11T20:56:00.392Z' },
    { id: 'saturday', validFrom: '2027-09-18T13:00:00.000Z', validUntil: '2027-09-18T22:00:00.000Z', salesEnd: '2027-09-18T12:00:00.000Z' },
  ] };
}

test('rescheduling a new event follows default ticket windows and sales end, preserving custom day passes', () => {
  const d = draft(), custom = structuredClone(d.offers[1]);
  updateEventSchedule(d, 'startAt', '2027-09-17T13:00:00.000Z');
  assert.equal(d.admissionStartsAt, d.startAt);
  updateEventSchedule(d, 'endAt', '2027-09-19T20:56:00.000Z');
  updateEventSchedule(d, 'admissionStartsAt', '2027-09-17T11:56:00.000Z');
  assert.equal(d.offers[0].validFrom, d.admissionStartsAt);
  assert.equal(d.offers[0].validUntil, d.endAt);
  assert.equal(d.offers[0].salesEnd, d.endAt);
  assert.deepEqual(d.offers[1], custom);
});

test('a separate first admission time is preserved when event start changes', () => {
  const d = draft();
  updateEventSchedule(d, 'admissionStartsAt', '2026-10-11T11:56:00.000Z');
  updateEventSchedule(d, 'startAt', '2027-09-17T13:00:00.000Z');
  assert.equal(d.admissionStartsAt, '2026-10-11T11:56:00.000Z');
  assert.equal(d.offers[0].validFrom, d.admissionStartsAt);
});

test('changing a ticket window directly never changes other tickets or the event schedule', () => {
  const d = draft(), before = structuredClone(d);
  assert.equal(updateEventSchedule(d, 'offers.0.validFrom', '2027-09-17T11:56:00.000Z'), false);
  assert.deepEqual(d, before);
});
