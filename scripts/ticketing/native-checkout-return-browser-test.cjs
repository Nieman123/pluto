const assert = require('node:assert/strict');
const { randomUUID, createHash } = require('node:crypto');
const { createRequire } = require('node:module');
const { resolve } = require('node:path');
const { chromium } = require('playwright');
assert.equal(process.env.GCLOUD_PROJECT, 'demo-pluto-ticketing');
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8185');
const backend = createRequire(resolve(__dirname, '../../functions/package.json'));
backend('firebase-admin/app').initializeApp({ projectId: 'demo-pluto-ticketing' });
const db = backend('firebase-admin/firestore').getFirestore();
const { Catalog } = require('../../functions/lib/ticketing/catalog');
const { fixture } = require('../../functions/test/ticketing-fixture.cjs');
const base = 'http://127.0.0.1:4173', uid = `checkout-return-${randomUUID()}`;
const events = [];
(async () => {
  let browser;
  try {
    await db.collection('adminUsers').doc(uid).set({ role: 'admin' });
    const catalog = new Catalog();
    for (const mode of ['tickets', 'rsvp', 'rsvp-approval', 'free-ticket']) {
      const eventId = randomUUID(), draft = fixture();
      draft.slug = `native-return-${eventId}`; draft.registrationMode = mode === 'free-ticket' ? 'tickets' : mode;
      draft.offers = [draft.offers[0]];
      if (mode !== 'tickets') { draft.offers[0].unitAmount = 0; draft.offers[0].maxPerOrder = 1; }
      await catalog.save(eventId, draft, 0, uid); await catalog.publish(eventId, 'publish', 1, uid);
      events.push({ eventId, slug: draft.slug });
    }
    browser = await chromium.launch({ headless: true });
    // Provider completion is simulated; real Stripe redirect construction is
    // checked by the backend integration test with its fake Stripe service.
    for (const flow of ['paid', 'free', 'rsvp', 'pending-approval', 'cancel-paid', 'web']) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const page = await context.newPage(), requests = []; let orderId, submitted;
      await context.addInitScript(() => {
        window.Stripe = () => ({ createEmbeddedCheckoutPage: async options => {
          window.finishNativeCheckout = options.onComplete;
          return { mount() {}, destroy() {} };
        } });
      });
      await page.route('**/tickets/api/rsvp/verification', route => route.fulfill({ json: { verified: true } }));
      for (const endpoint of ['checkout', 'rsvp']) await page.route(`**/tickets/api/${endpoint}`, route => {
        submitted = route.request().postDataJSON();
        orderId = createHash('sha256').update(submitted.accessKey).digest('hex');
        return route.fulfill({ json: { orderId, status: flow === 'free' || flow === 'rsvp' || flow === 'web' ? 'paid' : flow === 'pending-approval' ? 'pending-approval' : 'open',
          clientSecret: 'fake_checkout_secret', publishableKey: 'pk_test_fixture', expiresAt: Date.now() + 1800000 } });
      });
      await page.route('**/tickets/api/cancel', route => route.fulfill({ json: { status: 'paid' } }));
      page.on('request', request => requests.push(request.url()));
      const event = events[flow === 'rsvp' ? 1 : flow === 'pending-approval' ? 2 : flow === 'free' ? 3 : 0];
      await page.goto(`${base}/events/${event.slug}${flow === 'web' ? '' : '?native_app=1'}`);
      if (flow !== 'web') assert.equal(await page.locator('#native-checkout-form a[href*="tickets"]').getAttribute('href'), 'events.pluto.app.staging://tickets');
      await page.locator('[name=buyerName]').fill('Native checkout guest');
      await page.locator('[name=email]').fill('native-checkout@preview.invalid');
      await page.locator('[data-ticket-quantity]').first().selectOption('1');
      await page.locator('#native-checkout-form [type=submit]').click();
      if (['paid', 'cancel-paid'].includes(flow)) {
        await page.waitForFunction(() => !!window.finishNativeCheckout);
        if (flow === 'paid') await page.evaluate(() => window.finishNativeCheckout());
        else await page.locator('#checkout-cancel').click();
      }
      await page.waitForURL(flow === 'web' ? '**/app/tickets?order=*' : '**/tickets/checkout-return?order=*');
      assert.equal(submitted.nativeApp, flow === 'web' ? undefined : true);
      assert.equal(new URL(page.url()).searchParams.get('order'), orderId);
      assert.equal(await page.evaluate(eventId => localStorage.getItem(`pluto-checkout-${eventId}`), event.eventId), null);
      assert.equal(await page.evaluate(order => localStorage.getItem(`pluto-order-${order}`), orderId), submitted.accessKey);
      if (flow !== 'web') {
        assert.equal(await page.locator('#native-checkout-return').getAttribute('href'), `events.pluto.app.staging://tickets?order=${orderId}`);
        assert.equal(requests.some(url => url.includes('/app/main.dart.js')), false, 'native completion never boots the Flutter web app');
        assert.equal(await page.getByRole('link', { name: 'Continue in browser' }).getAttribute('href'), `/app/tickets?order=${orderId}`);
        await page.screenshot({ path: 'tmp/native-checkout-return-mobile.png' });
      }
      await context.close();
    }
    const response = await browser.newPage();
    for (const query of ['order=invalid', `order=${'a'.repeat(64)}&order=${'b'.repeat(64)}`, '']) {
      assert.equal((await response.request.get(`${base}/tickets/checkout-return?${query}`)).status(), 400);
    }
    console.log('Native paid, free, RSVP, approval, settled cancellation and web checkout return checks passed.');
  } finally {
    await browser?.close();
    for (const event of events) {
      await db.recursiveDelete(db.collection('ticketingEvents').doc(event.eventId));
      await db.collection('publishedEvents').doc(event.eventId).delete();
      await db.collection('eventSlugs').doc(event.slug).delete();
    }
    await db.collection('adminUsers').doc(uid).delete();
  }
})().catch(error => { console.error(error); process.exit(1); });
