const test = require('node:test'), assert = require('node:assert/strict');
const { discoveryEvents, activeAppEventCards } = require('../lib/ticketing/event-discovery');
test('public discovery separates completed/archived events while keeping ongoing festivals visible', () => {
  const now = Date.parse('2027-09-18T12:00:00Z');
  const event = (id, start, end, status = 'published') => ({ id, startAt: new Date(start).toISOString(), endAt: new Date(end).toISOString(), status });
  const records = [event('oldest', now - 5000, now - 4000), event('just-ended', now - 1000, now), event('ongoing', now - 1000, now + 1000), event('future', now + 2000, now + 3000), event('archived', now + 4000, now + 5000, 'archived'), event('draft', now, now + 5000, 'draft'), { id: 'invalid', startAt: 'invalid', endAt: 'invalid', status: 'published' }];
  assert.deepEqual(discoveryEvents(records, false, now).map(e => e.id), ['ongoing', 'future']);
  assert.deepEqual(discoveryEvents(records, true, now).map(e => e.id), ['archived', 'just-ended', 'oldest']);
});

test('app discovery uses current published schedules instead of stale native card projections', () => {
  const now = Date.parse('2027-09-18T12:00:00Z'), origin = 'https://pluto.example';
  const event = (id, end, status = 'published') => ({ id, title: id, subtitle: 'Music', city: 'Asheville', region: 'NC',
    slug: id, status, startAt: new Date(now - 1000).toISOString(), endAt: new Date(end).toISOString(),
    flyer: { assetId: 'flyer-1' }, registrationMode: 'rsvp', address: 'PRIVATE', buyerEmail: 'PRIVATE', promos: ['PRIVATE'] });
  const published = [event('ended', now), event('live', now + 1000), event('cancelled', now + 1000, 'cancelled'),
    event('archived', now + 1000, 'archived'), event('draft', now + 1000, 'draft')];
  const legacy = [{ id: 'native-ended', title: 'Old projection', isActive: true },
    { id: 'native-unpublished', isActive: true }, { id: 'legacy', title: 'Legacy event', isActive: true },
    { id: 'inactive', isActive: false }, { id: 'old', endAt: new Date(now).toISOString() }];
  const cards = activeAppEventCards(published, legacy, origin, now);
  assert.deepEqual(cards.map(e => e.id), ['native-live', 'legacy']);
  assert.equal(cards[0].ticketUrl, `${origin}/events/live`);
  assert.equal(cards[0].flyerImageUrl, `${origin}/events/live/media/flyer-1`);
  assert.equal(cards[0].registrationMode, 'rsvp');
  assert.ok(!JSON.stringify(cards).includes('PRIVATE'));
});
