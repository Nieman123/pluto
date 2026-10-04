const assert = require('node:assert/strict');
const { randomUUID, randomBytes } = require('node:crypto');
const { createRequire } = require('node:module');
const { resolve } = require('node:path');
const { chromium } = require('playwright');
const { default: AxeBuilder } = require('@axe-core/playwright');
const backend = createRequire(resolve(__dirname, '../../functions/package.json'));
process.env.GCLOUD_PROJECT = 'demo-pluto-ticketing';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8185';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9095';
backend('firebase-admin/app').initializeApp({ projectId: 'demo-pluto-ticketing' });
const db = backend('firebase-admin/firestore').getFirestore(), auth = backend('firebase-admin/auth').getAuth();
const { Catalog } = require('../../functions/lib/ticketing/catalog');
const { fixture } = require('../../functions/test/ticketing-fixture.cjs');
const base = 'http://127.0.0.1:4173', password = 'Local-checkout-account-2026!', suffix = randomUUID();
const users = [{ uid: `checkout-full-${suffix}`, email: `full-${suffix}@preview.invalid`, displayName: 'Old auth name' },
  { uid: `checkout-missing-${suffix}`, email: `missing-${suffix}@preview.invalid` }];
const events = [], orders = [];
let active, stage = 'setup';
async function signIn(page, user) {
  await page.waitForFunction(() => window.checkoutAuthReady);
  await page.evaluate(async ({ email, password }) => {
    const { getAuth, signInWithEmailAndPassword } = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js');
    await signInWithEmailAndPassword(getAuth(), email, password);
  }, { email: user.email, password });
}
async function visibility(page, nameVisible, emailVisible) {
  await page.waitForFunction(({ nameVisible, emailVisible }) => {
    const form = document.querySelector('#native-checkout-form');
    return !form.elements.buyerName.closest('label').hidden === nameVisible && !form.elements.email.closest('label').hidden === emailVisible;
  }, { nameVisible, emailVisible });
}
async function submit(page, expected, status = 'paid') {
  await page.locator('[data-ticket-quantity]').first().selectOption('1');
  const navigation = page.waitForURL('**/app/tickets?order=*');
  await page.locator('#native-checkout-form [type=submit]').click(); await navigation;
  const orderId = new URL(page.url()).searchParams.get('order'); orders.push(orderId);
  const order = (await db.collection('ticketingOrders').doc(orderId).get()).data();
  assert.equal(order.name, expected.name); assert.equal(order.email, expected.email); assert.equal(order.ownerUid, expected.uid || ''); assert.equal(order.status, status);
}
(async () => {
  let browser;
  try {
    for (const user of users) await auth.createUser({ ...user, password, emailVerified: true });
    await db.collection('userProfiles').doc(users[0].uid).set({ displayName: 'Saved Pluto profile name' });
    const catalog = new Catalog();
    for (const mode of ['tickets', 'rsvp', 'rsvp-approval']) {
      const eventId = randomUUID(), draft = fixture(); draft.registrationMode = mode; draft.slug = `account-checkout-${eventId}`;
      draft.offers = [{ ...draft.offers[0], unitAmount: 0, maxPerOrder: 1 }]; events.push({ eventId, slug: draft.slug });
      await catalog.save(eventId, draft, 0, 'ticketing-preview-admin'); await catalog.publish(eventId, 'publish', 1, 'ticketing-preview-admin');
    }
    browser = await chromium.launch();
    const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 900 } });
    await context.addInitScript(() => window.addEventListener('pluto-auth', () => window.checkoutAuthReady = true));
    const page = await context.newPage(); active = page;
    stage = 'guest checkout'; await page.goto(`${base}/events/${events[0].slug}`); await page.waitForFunction(() => window.checkoutAuthReady);
    await visibility(page, true, true); await page.locator('[name=buyerName]').fill('Guest buyer');
    const guestEmail = `guest-${suffix}@preview.invalid`; await page.locator('[name=email]').fill(guestEmail);
    await submit(page, { name: 'Guest buyer', email: guestEmail });
    for (let i = 0; i < events.length; i++) {
      stage = `saved account ${i}`; await page.goto(`${base}/events/${events[i].slug}`);
      if (i === 0) await signIn(page, users[0]);
      await page.waitForFunction(() => document.querySelector('[name=buyerName]').value === 'Saved Pluto profile name');
      await visibility(page, false, false);
      assert.equal(await page.locator('[name=email]').inputValue(), users[0].email);
      if (i === 0) {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.evaluate(async () => { await document.fonts.ready; await Promise.all(document.getAnimations().filter(a => a.effect?.getComputedTiming().endTime !== Infinity).map(a => a.finished.catch(() => {}))); });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze(); assert.deepEqual(axe.violations.map(v => v.id), []);
        await page.locator('#tickets').scrollIntoViewIfNeeded(); await page.screenshot({ path: 'tmp/checkout-saved-account-phone.png' });
        await page.setViewportSize({ width: 1280, height: 900 });
      }
      await submit(page, { name: 'Saved Pluto profile name', email: users[0].email, uid: users[0].uid }, i === 2 ? 'pending-approval' : 'paid');
    }
    stage = 'missing name and account changes'; await page.goto(`${base}/events/${events[0].slug}`); await signIn(page, users[1]);
    await visibility(page, true, false); assert.equal(await page.locator('[name=buyerName]').inputValue(), '');
    await page.evaluate(uid => window.dispatchEvent(new CustomEvent('pluto-profile', { detail: { uid, displayName: 'Stale other account' } })), users[0].uid);
    await visibility(page, true, false); await page.locator('[name=buyerName]').fill('Entered missing name');
    await submit(page, { name: 'Entered missing name', email: users[1].email, uid: users[1].uid });
    stage = 'sign out restores editable fields'; await page.goto(`${base}/events/${events[0].slug}`); await visibility(page, true, false);
    await page.evaluate(async () => { const { getAuth, signOut } = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js'); await signOut(getAuth()); });
    await visibility(page, true, true); assert.equal(await page.locator('[name=email]').inputValue(), '');
    stage = 'saved checkout preserves contact'; await signIn(page, users[0]);
    await page.waitForFunction(() => document.querySelector('[name=buyerName]').value === 'Saved Pluto profile name');
    const saved = { eventId: events[0].eventId, accessKey: randomBytes(32).toString('hex'), items: [{ offerId: 'weekend', quantity: 1 }], promoCode: '', name: 'Reserved buyer', email: 'reserved@preview.invalid' };
    await page.evaluate(saved => localStorage.setItem(`pluto-checkout-${saved.eventId}`, JSON.stringify(saved)), saved);
    await page.reload(); await page.waitForFunction(() => window.checkoutAuthReady); await visibility(page, true, true);
    assert.equal(await page.locator('[name=buyerName]').inputValue(), saved.name); assert.equal(await page.locator('[name=email]').inputValue(), saved.email);
    assert.ok(await page.locator('[name=buyerName]').isDisabled());
    const bodyReady = new Promise(resolveBody => page.route('**/tickets/api/checkout', route => {
      resolveBody(route.request().postDataJSON()); return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Controlled retry check' }) });
    }));
    await page.locator('#native-checkout-form [type=submit]').click(); assert.deepEqual(await bodyReady, saved);
    console.log('Account checkout checks passed: saved profile/email hidden, missing fields editable, guest/free ticket/open and approval RSVP orders retain correct identity, sign-out/stale-profile isolation, immutable resumed contact and mobile accessibility.');
  } catch (error) {
    console.error(`Account checkout failure at ${stage}:`, error);
    if (active) await active.screenshot({ path: 'tmp/checkout-account-failure.png', fullPage: true }).catch(() => {});
    process.exitCode = 1;
  } finally {
    await browser?.close();
    for (const orderId of orders) {
      const tickets = await db.collection('ticketingTickets').where('orderId', '==', orderId).get(); await Promise.all(tickets.docs.map(t => t.ref.delete()));
      const jobs = await db.collection('ticketingEmailJobs').where('orderId', '==', orderId).get(); await Promise.all(jobs.docs.map(j => j.ref.delete()));
      await db.collection('ticketingOrders').doc(orderId).delete();
    }
    for (const event of events) {
      await db.recursiveDelete(db.collection('ticketingEvents').doc(event.eventId)); await db.collection('publishedEvents').doc(event.eventId).delete();
      await db.collection('eventSlugs').doc(event.slug).delete(); await db.collection('currentEvents').doc(`native-${event.eventId}`).delete();
    }
    for (const user of users) { await db.collection('userProfiles').doc(user.uid).delete(); await auth.deleteUser(user.uid).catch(() => {}); }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
