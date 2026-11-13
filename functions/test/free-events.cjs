const test = require('node:test');
const assert = require('node:assert/strict');
const { resolve } = require('node:path');
const express = require('express');
const nunjucks = require('nunjucks');
const { harness } = require('./ticketing-harness.cjs');
const { ticketingRouter } = require('../lib/ticketing/routes');
const { normalizeEvent } = require('../lib/public-data');

for (const mode of ['free', 'door']) test(`${mode} events publish without inventory, reject issuance, and render public details with no checkout`, async () => {
  const door = mode === 'door';
  const h = harness(); let server;
  try {
    const eid = await h.event(d => {
      d.registrationMode = mode; d.doorPrice = 500; d.admissionNotes = 'Admission handled by the venue. <script>not markup</script>';  d.venueVisibility = 'public'; d.title = `Free block party ${h.prefix}`;
      d.offers = []; d.pools = []; d.promos = [];
    });
    const event = (await h.db.collection('publishedEvents').doc(eid).get()).data();
    assert.equal(event.registrationMode, mode); assert.deepEqual(event.offers, []);
    const card = (await h.db.collection('currentEvents').doc(`native-${eid}`).get()).data();
    assert.equal(card.registrationMode, mode); assert.ok(card.ticketUrl.endsWith(`/events/${event.slug}`));
    const actor = { uid: `${h.prefix}-buyer`, email: 'buyer@example.test', name: 'Buyer', email_verified: true };
    for (const method of ['stripe', 'cash', 'comp']) await assert.rejects(h.service.checkout(h.request(eid, { cashReceived: 100000, reason: 'test' }), actor, method, h.staff), door ? /Pay at the door/ : /free entry/);
    await assert.rejects(h.service.rsvp(h.request(eid), actor), /RSVPs are not open/);
    assert.equal(h.sessions.size, 0, 'no Stripe session is created');
    assert.equal((await h.db.collection('ticketingOrders').where('eventId', '==', eid).get()).size, 0);
    assert.equal((await h.service.event(eid).collection('pools').get()).size, 0);

    const app = express(); app.set('view engine', 'njk');
    const env = nunjucks.configure(resolve(__dirname, '../lib/templates'), { autoescape: true, express: app });
    const home = env.render('home.njk', { events: [normalizeEvent(`native-${eid}`, card)] });
    assert.match(home, door ? /\$5 at the door · No online sales/ : /Free entry · No RSVP required/);
    assert.match(home, />View event<\/a>/); assert.ok(!home.includes('>Get tickets</a>'));
    app.set('nunjucksEnv', env); app.use(ticketingRouter(() => ({}), h.service));
    server = await new Promise(done => { const s = app.listen(0, '127.0.0.1', () => done(s)); });
    const url = `http://127.0.0.1:${server.address().port}`;
    const originalEvent = h.service.event;
    h.service.event = () => { throw Error('Free public pages must not read private inventory'); };
    let html;
    try { const result = await fetch(`${url}/events/${event.slug}`); assert.equal(result.status, 200); html = await result.text(); }
    finally { h.service.event = originalEvent; }
    assert.match(html, door ? /\$5 entry\./ : /Free entry — no ticket or RSVP required/);
    if (door) {
      assert.match(html, /PAY AT THE DOOR/); assert.doesNotMatch(html, /FREE ENTRY|Free entry/);
      assert.match(html, /&lt;script&gt;not markup&lt;\/script&gt;/);
      assert.equal(card.doorPrice, 500); assert.equal(card.admissionNotes, event.admissionNotes);
      const { NativeCheckout } = require('../lib/ticketing/native-checkout');
      assert.deepEqual(await new NativeCheckout(h.service).create(event.slug, actor), { handoff: null });
      await assert.rejects(h.service.requestRsvpVerification({ eventId: eid, email: actor.email }, actor, 'waitlist'), /not open/);
    }
    assert.match(html, /123 Hidden Lane/); // Fixture address is deliberately public for this event.
    for (const marker of ['native-checkout-form', 'native-checkout-config', 'stripe-checkout', 'BUY TICKETS HERE', 'Test payments only', 'data-ticket-quantity']) assert.ok(!html.includes(marker), marker);
    const schema = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
    assert.equal(schema.isAccessibleForFree, !door); assert.equal(schema.offers, undefined);
    const discovery = await (await fetch(`${url}/events`)).text();
    assert.match(discovery, door ? /\$5 at the door/ : /Free entry · Just show up/);
    const cardHtml = discovery.split(`<h2><a href="/events/${event.slug}">`)[1].split('</article>')[0];
    assert.match(cardHtml, />View event<span/); assert.ok(!cardHtml.includes('View event &amp; tickets'));
    if (door) {
      // Dashboard changes must update both live projections without publishing unrelated Studio edits.
      const saved = await h.service.save(eid, { doorPrice: 750, admissionNotes: 'Cash only.' }, 1, h.staff, true);
      assert.equal(saved.appliedToPublicPage, true);
      const updated = await (await fetch(`${url}/events/${event.slug}`)).text();
      assert.match(updated, /\$7.50 entry\./); assert.match(updated, /Cash only\./);
      assert.equal((await h.db.collection('currentEvents').doc(`native-${eid}`).get()).data().doorPrice, 750);
      const restored = await h.service.restore(eid, 1, 2, h.staff);
      assert.equal(restored.draft.doorPrice, 750); assert.equal(restored.draft.admissionNotes, 'Cash only.');
    }
    await h.service.publish(eid, 'cancel', door ? 3 : 1, h.staff);
    assert.match(await (await fetch(`${url}/events/${event.slug}`)).text(), /This event has been cancelled/);
  } finally { if (server) await new Promise(done => server.close(done)); await h.cleanup(); }
});
