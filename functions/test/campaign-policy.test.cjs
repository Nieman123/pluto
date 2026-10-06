const test = require('node:test'), assert = require('node:assert/strict');
const { campaignNeedsWork, campaignExpired, reminderBody } = require('../lib/ticketing/campaign-policy');
test('campaign triggers continue progress and recovery, ignoring lease-only writes and terminal states', () => {
  const pending = { status: 'pending', phase: 'tickets', cursor: '', wakeRevision: 0 };
  assert.equal(campaignNeedsWork(undefined, pending), true);
  assert.equal(campaignNeedsWork(pending, { ...pending, leaseUntil: 123, leaseId: 'lease' }), false);
  assert.equal(campaignNeedsWork(pending, { ...pending, cursor: 'next' }), true);
  assert.equal(campaignNeedsWork(pending, { ...pending, phase: 'orders' }), true);
  assert.equal(campaignNeedsWork(pending, { ...pending, wakeRevision: 1 }), true);
  assert.equal(campaignNeedsWork(pending, { ...pending, status: 'queued' }), false);
  assert.equal(campaignNeedsWork(pending, undefined), false);
});
test('legacy reminders expire at the start, location notices at the end, and explicit deadlines take precedence', () => {
  const draft = { startAt: '2027-09-17T13:00:00Z', endAt: '2027-09-19T20:00:00Z', timezone: 'America/New_York' };
  const start = Date.parse(draft.startAt), end = Date.parse(draft.endAt);
  assert.equal(campaignExpired({ kind: 'event-reminder' }, draft, start - 1), false);
  assert.equal(campaignExpired({ kind: 'event-reminder' }, draft, start), true);
  assert.equal(campaignExpired({ kind: 'event-location' }, draft, end - 1), false);
  assert.equal(campaignExpired({ kind: 'event-location' }, draft, end), true);
  assert.equal(campaignExpired({ kind: 'event-reminder', expiresAt: start - 3600000 }, draft, start - 1000), true);
  assert.equal(campaignExpired({ kind: 'event-cancelled' }, draft, end + 1), false);
  assert.match(reminderBody(draft), /2027/);
  assert.match(reminderBody(draft), /America\/New_York/);
  assert.doesNotMatch(reminderBody(draft), /approximately|in 4 hours|in 24 hours/);
});
