const test = require('node:test');
const assert = require('node:assert/strict');
const { resolve } = require('node:path');
const express = require('express');
const nunjucks = require('nunjucks');
const { harness } = require('./ticketing-harness.cjs');
const { ticketingRouter } = require('../lib/ticketing/routes');
const { normalizeEvent } = require('../lib/public-data');

test('free events publish without inventory, reject issuance, and render public details with no checkout', async () => {
  const h = harness(); let server;
  try {
    const eid = await h.event(d => {
      d.registrationMode = 'free'; d.venueVisibility = 'public'; d.title = `Free block party ${h.prefix}`;
      d.offers = []; d.pools = []; d.promos = [];
    });
    const event = (await h.db.collection('publishedEvents').doc(eid).get()).data();
    assert.equal(event.registrationMode, 'free'); assert.deepEqual(event.offers, []);
    const card = (await h.db.collection('currentEvents').doc(`native-${eid}`).get()).data();
    assert.equal(card.registrationMode, 'free'); assert.ok(card.ticketUrl.endsWith(`/events/${event.slug}`));
    const actor = { uid: `${h.prefix}-buyer`, email: 'buyer@example.test', name: 'Buyer', email_verified: true };
    for (const method of ['stripe', 'cash', 'comp']) await assert.rejects(h.service.checkout(h.request(eid, { cashReceived: 100000, reason: 'test' }), actor, method, h.staff), /free entry/);
    await assert.rejects(h.service.rsvp(h.request(eid), actor), /RSVPs are not open/);
    assert.equal(h.sessions.size, 0, 'no Stripe session is created');
    assert.equal((await h.db.collection('ticketingOrders').where('eventId', '==', eid).get()).size, 0);
    assert.equal((await h.service.event(eid).collection('pools').get()).size, 0);

    const app = express(); app.set('view engine', 'njk');
    const env = nunjucks.configure(resolve(__dirname, '../lib/templates'), { autoescape: true, express: app });
    const home = env.render('home.njk', { events: [normalizeEvent(`native-${eid}`, card)] });
    assert.match(home, /Free entry · No RSVP required/);
    assert.match(home, />View event<\/a>/); assert.ok(!home.includes('>Get tickets</a>'));
    app.set('nunjucksEnv', env); app.use(ticketingRouter(() => ({}), h.service));
    server = await new Promise(done => { const s = app.listen(0, '127.0.0.1', () => done(s)); });
    const url = `http://127.0.0.1:${server.address().port}`;
    const originalEvent = h.service.event;
    h.service.event = () => { throw Error('Free public pages must not read private inventory'); };
    let html;
    try { const result = await fetch(`${url}/events/${event.slug}`); assert.equal(result.status, 200); html = await result.text(); }
    finally { h.service.event = originalEvent; }
    assert.match(html, /Free entry — no ticket or RSVP required/);
    assert.match(html, /123 Hidden Lane/); // Fixture address is deliberately public for this event.
    for (const marker of ['native-checkout-form', 'native-checkout-config', 'stripe-checkout', 'BUY TICKETS HERE', 'Test payments only', 'data-ticket-quantity']) assert.ok(!html.includes(marker), marker);
    const schema = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
    assert.equal(schema.isAccessibleForFree, true); assert.equal(schema.offers, undefined);
    const discovery = await (await fetch(`${url}/events`)).text();
    assert.match(discovery, /Free entry · Just show up/);
    const cardHtml = discovery.split(`<h2><a href="/events/${event.slug}">`)[1].split('</article>')[0];
    assert.match(cardHtml, />View event<span/); assert.ok(!cardHtml.includes('View event &amp; tickets'));
    await h.service.publish(eid, 'cancel', 1, h.staff);
    assert.match(await (await fetch(`${url}/events/${event.slug}`)).text(), /This event has been cancelled/);
  } finally { if (server) await new Promise(done => server.close(done)); await h.cleanup(); }
});
