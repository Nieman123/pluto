const test = require('node:test'), assert = require('node:assert/strict');
const express = require('express');
const { ticketingRouter } = require('../lib/ticketing/routes');

test('anonymous app discovery queries unexpired publications and cannot revive stale native cards', async () => {
  const now = Date.now(), filters = [];
  const native = { id: 'live', slug: 'live', title: 'Live event', startAt: new Date(now - 1000).toISOString(),
    endAt: new Date(now + 86400000).toISOString(), status: 'published', city: 'Asheville', region: 'NC',
    address: 'DO NOT EXPOSE', buyerEmail: 'DO NOT EXPOSE' };
  const service = { db: { collection(name) {
    const query = {
      where(...args) { filters.push([name, ...args]); return query; },
      async get() { return { docs: name === 'publishedEvents'
        ? [{ id: native.id, data: () => native }]
        : [{ id: 'native-ended', data: () => ({ title: 'Ended event', isActive: true }) }] }; },
    };
    return query;
  } } };
  const app = express(); app.use(ticketingRouter(() => ({}), service));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/tickets/api/public/events`);
    assert.equal(response.status, 200);
    const { events } = await response.json();
    assert.deepEqual(events.map(e => e.id), ['native-live']);
    assert.equal(filters[0][0], 'publishedEvents'); assert.equal(filters[0][1], 'endAt'); assert.equal(filters[0][2], '>');
    assert.ok(Number.isFinite(Date.parse(filters[0][3])));
    assert.ok(!JSON.stringify(events).includes('DO NOT EXPOSE'));
  } finally { await new Promise(resolve => server.close(resolve)); }
});
