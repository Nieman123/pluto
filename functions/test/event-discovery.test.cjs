const test = require('node:test'), assert = require('node:assert/strict');
const { discoveryEvents } = require('../lib/ticketing/event-discovery');
test('public discovery separates completed/archived events while keeping ongoing festivals visible', () => {
  const now = Date.parse('2027-09-18T12:00:00Z');
  const event = (id, start, end, status = 'published') => ({ id, startAt: new Date(start).toISOString(), endAt: new Date(end).toISOString(), status });
  const records = [event('oldest', now - 5000, now - 4000), event('just-ended', now - 1000, now), event('ongoing', now - 1000, now + 1000), event('future', now + 2000, now + 3000), event('archived', now + 4000, now + 5000, 'archived'), event('draft', now, now + 5000, 'draft'), { id: 'invalid', startAt: 'invalid', endAt: 'invalid', status: 'published' }];
  assert.deepEqual(discoveryEvents(records, false, now).map(e => e.id), ['ongoing', 'future']);
  assert.deepEqual(discoveryEvents(records, true, now).map(e => e.id), ['archived', 'just-ended', 'oldest']);
});
