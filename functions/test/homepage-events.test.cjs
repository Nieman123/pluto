const assert = require('node:assert/strict');
const test = require('node:test');
const { join } = require('node:path');
const nunjucks = require('nunjucks');
const { loadHomepageEvents } = require('../lib/public-events');

const now = Date.parse('2026-10-28T02:00:00Z');
const origin = 'https://pluto.events';
const event = (id, start, end, status = 'published') => ({
  id, title: id, slug: id, status, startAt: start, endAt: end,
  city: 'Asheville', region: 'NC', registrationMode: 'free',
});

function database(published, legacy, queries = []) {
  return { collection(name) {
    return {
      where(...args) { queries.push([name, ...args]); return this; },
      async get() {
        return { docs: (name === 'publishedEvents' ? published : legacy)
          .map(({ id, ...data }) => ({ id, data: () => data })) };
      },
    };
  } };
}

test('homepage shows upcoming and ongoing publications without reviving stale native cards', async () => {
  const queries = [];
  const past = '2026-10-27T20:00:00-04:00';
  const future = '2026-10-28T02:00:00-04:00';
  const published = [
    { ...event('ended', past, past), title: 'Swamp Ass Afters' },
    event('just-ended', past, new Date(now).toISOString()),
    event('ongoing', past, future),
    event('upcoming', future, '2026-10-29T02:00:00-04:00'),
    ...['cancelled', 'archived', 'draft'].map(status => event(status, past, future, status)),
    event('invalid', past, 'invalid'),
  ];
  const legacy = [
    { id: 'native-ended', title: 'Swamp Ass Afters', isActive: true },
    { id: 'native-unpublished', title: 'Unpublished event', isActive: true },
    { id: 'native-ongoing', title: 'Stale title', isActive: true },
  ];
  const cards = await loadHomepageEvents(database(published, legacy, queries), origin, now);
  assert.deepEqual(cards.map(card => card.id), ['native-ongoing', 'native-upcoming']);
  assert.deepEqual(queries, [['publishedEvents', 'endAt', '>', new Date(now).toISOString()]]);
  assert.equal(cards[0].ticketUrl, `${origin}/events/ongoing`);
  assert.equal(cards[0].registrationMode, 'free');

  const env = nunjucks.configure(join(__dirname, '../lib/templates'), { autoescape: true });
  const html = env.render('home.njk', { events: cards, meta: {} });
  assert.match(html, /href="https:\/\/pluto.events\/events\/ongoing"/);
  assert.match(html, /href="https:\/\/pluto.events\/events\/upcoming"/);
  assert.doesNotMatch(html, /Swamp Ass Afters|Stale title|Unpublished event/);
});

test('homepage preserves legacy ordering while excluding expired, inactive and invalid schedules', async () => {
  const cards = await loadHomepageEvents(database([], [
    { id: 'old', endAt: new Date(now - 1).toISOString() },
    { id: 'just-ended', endAt: new Date(now).toISOString() },
    { id: 'timestamp-ended', endAt: { toMillis: () => now } },
    { id: 'invalid', endAt: 'not a date' },
    { id: 'inactive', isActive: false },
    { id: 'ongoing', endAt: new Date(now + 1000).toISOString(), sortOrder: 1 },
    { id: 'upcoming', endAt: { toMillis: () => now + 2000 }, sortOrder: 0 },
    { id: 'undated', sortOrder: 1, updatedAt: { toMillis: () => 1 } },
  ]), origin, now);
  assert.deepEqual(cards.map(card => card.id), ['upcoming', 'undated', 'ongoing']);
});

test('homepage renders its empty state when all events have ended', async () => {
  const cards = await loadHomepageEvents(database([
    event('ended', '2026-10-25T00:00:00Z', '2026-10-26T00:00:00Z'),
  ], [{ id: 'native-ended', title: 'Swamp Ass Afters', isActive: true }]), origin, now);
  assert.deepEqual(cards, []);
  const env = nunjucks.configure(join(__dirname, '../lib/templates'), { autoescape: true });
  const html = env.render('home.njk', { events: cards, meta: {} });
  assert.match(html, /New events are being prepared. Check back soon./);
  assert.doesNotMatch(html, /class="event-card"/);
});
