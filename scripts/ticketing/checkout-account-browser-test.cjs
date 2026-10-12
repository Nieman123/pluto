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
  { uid: `checkout-missing-${suffix}`, email: `missing-${suffix}@preview.invalid` },
  { uid: `checkout-native-${suffix}`, email: `native-${suffix}@preview.invalid`, displayName: 'Native auth name' }];
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
async function submit(page, expected, status = 'paid', native = false) {
  await page.locator('[data-ticket-quantity]').first().selectOption('1');
  const navigation = page.waitForURL(native ? '**/tickets/checkout-return?order=*' : '**/app/tickets?order=*');
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
    await db.collection('userProfiles').doc(users[2].uid).set({ displayName: 'Saved native profile' });
    const catalog = new Catalog();
    for (const mode of ['tickets', 'rsvp', 'rsvp-approval']) {
      const eventId = randomUUID(), draft = fixture(); draft.registrationMode = mode; draft.slug = `account-checkout-${eventId}`;
      draft.offers = [{ ...draft.offers[0], unitAmount: 0, maxPerOrder: 1 }]; events.push({ eventId, slug: draft.slug });
      await catalog.save(eventId, draft, 0, 'ticketing-preview-admin'); await catalog.publish(eventId, 'publish', 1, 'ticketing-preview-admin');
    }
    browser = await chromium.launch();
    const nativeUser = users[2];
    const nativeLogin = await fetch('http://127.0.0.1:9095/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=preview', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: nativeUser.email, password, returnSecureToken: true }),
    });
    const { idToken } = await nativeLogin.json(); assert.ok(idToken);
    const mintNative = async slug => {
      const response = await fetch(`${base}/tickets/api/native-checkout/create`, { method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` }, body: JSON.stringify({ slug }) });
      assert.equal(response.status, 200); return (await response.json()).handoff;
    };
    assert.equal((await fetch(`${base}/tickets/api/native-checkout/create`, { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug: events[0].slug }) })).status, 401);
    let lastNativeSession;
    for (let i = 0; i < events.length; i++) {
      stage = `isolated native browser ${i}`;
      const handoff = await mintNative(events[i].slug);
      const wrongEvent = await fetch(`${base}/tickets/api/native-checkout/redeem`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handoff, eventId: events[(i + 1) % events.length].eventId }) });
      assert.equal(wrongEvent.status, 401);
      const isolated = await browser.newContext({ ignoreHTTPSErrors: true });
      await isolated.addInitScript(() => window.addEventListener('pluto-auth', () => window.checkoutAuthReady = true));
      const nativePage = await isolated.newPage(); active = nativePage;
      const redemption = nativePage.waitForResponse(r => r.url().endsWith('/tickets/api/native-checkout/redeem'));
      await nativePage.goto(`${base}/events/${events[i].slug}?native_app=1#pluto_checkout=${handoff}&anchor=tickets`);
      const redeemed = await redemption; assert.equal(redeemed.status(), 200); const session = await redeemed.json();
      lastNativeSession = session;
      await visibility(nativePage, false, false);
      if (i === 0) {
        await signIn(nativePage, users[1]);
        await visibility(nativePage, false, false);
        assert.equal(await nativePage.locator('[name=email]').inputValue(), nativeUser.email);
      }
      assert.equal(await nativePage.locator('[name=buyerName]').inputValue(), 'Saved native profile');
      assert.equal(await nativePage.locator('[name=email]').inputValue(), nativeUser.email);
      assert.equal(new URL(nativePage.url()).hash, '#tickets');
      assert.equal(await nativePage.evaluate(() => localStorage.getItem('pluto-native-checkout')), null);
      const replay = await nativePage.request.post(`${base}/tickets/api/native-checkout/redeem`, { data: { handoff, eventId: events[i].eventId } });
      assert.equal(replay.status(), 401);
      for (const [path, data] of [['staff/events', {}], ['account/delete', {}], ['checkout', { eventId: events[(i + 1) % events.length].eventId }]]) {
        const denied = await nativePage.request.post(`${base}/tickets/api/${path}`, { headers: { 'X-Pluto-Checkout': session.token }, data });
        assert.equal(denied.status(), 403, path);
      }
      // A later anonymous website-auth notification must not clear native identity.
      await nativePage.evaluate(() => window.dispatchEvent(new CustomEvent('pluto-auth', { detail: null })));
      await visibility(nativePage, false, false);
      await submit(nativePage, { name: 'Saved native profile', email: nativeUser.email, uid: nativeUser.uid }, i === 2 ? 'pending-approval' : 'paid', true);
      await isolated.close();
    }
    stage = 'disabled native account and deletion cannot keep checkout access';
    const checkNativeSession = () => fetch(`${base}/tickets/api/rsvp/verification`, { method: 'POST', headers: {
      'Content-Type': 'application/json', 'X-Pluto-Checkout': lastNativeSession.token },
      body: JSON.stringify({ eventId: lastNativeSession.eventId, email: nativeUser.email }) });
    await auth.updateUser(nativeUser.uid, { disabled: true }); assert.equal((await checkNativeSession()).status, 401);
    await auth.updateUser(nativeUser.uid, { disabled: false });
    await db.collection('accountDeletionRequests').doc(nativeUser.uid).set({ status: 'pending' });
    assert.equal((await checkNativeSession()).status, 401); await db.collection('accountDeletionRequests').doc(nativeUser.uid).delete();
    await db.collection('ticketingNativeCheckouts').doc(require('../../functions/lib/ticketing/domain').hash(lastNativeSession.token))
      .update({ expiresAt: backend('firebase-admin/firestore').Timestamp.fromMillis(Date.now() - 1000) });
    assert.equal((await checkNativeSession()).status, 401);
    stage = 'expired native handoff falls back to editable contact';
    const staleHandoff = await mintNative(events[0].slug);
    const { hash } = require('../../functions/lib/ticketing/domain');
    const { Timestamp } = backend('firebase-admin/firestore');
    await db.collection('ticketingNativeCheckouts').doc(hash(staleHandoff)).update({ expiresAt: Timestamp.fromMillis(Date.now() - 1000) });
    const staleContext = await browser.newContext({ ignoreHTTPSErrors: true });
    const stalePage = await staleContext.newPage(); active = stalePage;
    await stalePage.goto(`${base}/events/${events[0].slug}?native_app=1#pluto_checkout=${staleHandoff}`);
    await stalePage.waitForFunction(() => !document.querySelector('[name=buyerName]').disabled);
    await visibility(stalePage, true, true);
    assert.equal(new URL(stalePage.url()).hash, '');
    assert.equal(await stalePage.locator('[name=email]').inputValue(), '');
    await staleContext.close();
    stage = 'native profile without a name';
    await db.collection('userProfiles').doc(nativeUser.uid).delete(); await auth.updateUser(nativeUser.uid, { displayName: null });
    const namelessHandoff = await mintNative(events[0].slug);
    const namelessContext = await browser.newContext({ ignoreHTTPSErrors: true });
    const namelessPage = await namelessContext.newPage(); active = namelessPage;
    await namelessPage.goto(`${base}/events/${events[0].slug}?native_app=1#pluto_checkout=${namelessHandoff}`);
    await visibility(namelessPage, true, false);
    assert.equal(await namelessPage.locator('[name=buyerName]').inputValue(), '');
    assert.equal(await namelessPage.locator('[name=email]').inputValue(), nativeUser.email);
    await namelessContext.close();
    await new (require('../../functions/lib/ticketing/native-checkout').NativeCheckout)(catalog).cleanup();
    assert.equal((await db.collection('ticketingNativeCheckouts').doc(hash(staleHandoff)).get()).exists, false);
    console.log('Native account handoff passed: isolated browser autofill, app-account ownership across tickets/RSVP/approval, unrelated website login isolation, one-use/event/admin boundaries, disabled/deleting/expired denial, editable missing name, safe expired fallback and expired-record cleanup.');
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
    await page.locator('#native-checkout-form [type=submit]').click(); assert.deepEqual(await bodyReady, { ...saved, checkoutKind: 'payment' });
    stage = 'admin-only website navigation';
    await page.goto(`${base}/events`); await signIn(page, users[1]);
    const adminLinks = page.locator('[data-auth-admin]');
    assert.equal(await adminLinks.count(), 2);
    await page.waitForFunction(() => [...document.querySelectorAll('[data-auth-admin]')].every(link => link.hidden));
    await db.collection('adminUsers').doc(users[1].uid).set({ name: 'Navigation test admin' });
    await page.getByRole('link', { name: 'Ticket Admin', exact: true }).click();
    await page.waitForURL(`${base}/tickets/admin`);
    await page.locator('#staff-controls:not([hidden])').waitFor();
    assert.equal(await page.locator('.desktop-nav [data-auth-admin]').getAttribute('aria-current'), 'page');
    for (const width of [1280, 1024, 901]) {
      await page.setViewportSize({ width, height: 900 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Admin navigation fits ${width}px`);
    }
    await page.screenshot({ path: 'tmp/ticket-admin-navigation-desktop.png' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Open menu', exact: true }).click();
    await page.getByRole('navigation', { name: 'Mobile navigation' }).getByRole('link', { name: 'Ticket Admin', exact: true }).waitFor();
    await page.screenshot({ path: 'tmp/ticket-admin-navigation-mobile.png' });
    stage = 'admin navigation with Firestore connection blocked';
    const recoveryContext = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 900 } });
    await recoveryContext.addInitScript(() => window.addEventListener('pluto-auth', () => window.checkoutAuthReady = true));
    await recoveryContext.route('**/google.firestore.v1.Firestore/**', route => route.abort());
    const recovery = await recoveryContext.newPage(); active = recovery;
    await recovery.goto(`${base}/events`); await signIn(recovery, users[1]);
    const deployment = await (await recovery.request.get(`${base}/__deployment`)).json();
    assert.equal(new URL(await recovery.locator('script[src*="/assets/site.js"]').getAttribute('src'), base).searchParams.get('v'), deployment.revision);
    await recovery.getByRole('link', { name: 'Open App', exact: true }).waitFor();
    await recovery.getByRole('link', { name: 'Ticket Admin', exact: true }).waitFor();
    await recovery.screenshot({ path: 'tmp/ticket-admin-navigation-recovery.png' });
    await recovery.setViewportSize({ width: 390, height: 844 });
    await recovery.getByRole('button', { name: 'Open menu', exact: true }).click();
    await recovery.getByRole('navigation', { name: 'Mobile navigation' }).getByRole('link', { name: 'Ticket Admin', exact: true }).waitFor();
    await signIn(recovery, users[0]);
    await recovery.waitForFunction(() => [...document.querySelectorAll('[data-auth-admin]')].every(link => link.hidden));
    const otherAccount = await recovery.evaluate(async uid => {
      const { getAuth } = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js');
      const response = await fetch('/tickets/api/account/navigation', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await getAuth().currentUser.getIdToken()}` }, body: JSON.stringify({uid}) });
      return { status: response.status, cache: response.headers.get('cache-control'), body: await response.json() };
    }, users[1].uid);
    assert.deepEqual(otherAccount, { status: 200, cache: 'private, no-store', body: { admin: false } });
    assert.equal((await recovery.request.post(`${base}/tickets/api/account/navigation`, { data: {} })).status(), 401);
    await recoveryContext.close(); active = page;
    await db.collection('adminUsers').doc(users[1].uid).delete();
    await page.waitForFunction(() => [...document.querySelectorAll('[data-auth-admin]')].every(link => link.hidden));
    await db.collection('adminUsers').doc(users[1].uid).set({ name: 'Navigation test admin' });
    await page.getByRole('link', { name: 'Ticket Admin', exact: true }).waitFor();
    stage = 'backend authentication denial overrides live role';
    let denyLookup, lookupStarted;
    const heldLookup = new Promise(resolveLookup => { lookupStarted = resolveLookup; });
    await page.route('**/tickets/api/account/navigation', async route => {
      await new Promise(release => { denyLookup = release; lookupStarted(); });
      await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({error: 'Controlled authentication denial'}) });
    });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${base}/events`); await heldLookup;
    await page.getByRole('link', { name: 'Ticket Admin', exact: true }).waitFor();
    const deniedResponse = page.waitForResponse(response => response.url().endsWith('/tickets/api/account/navigation') && response.status() === 401);
    denyLookup(); await deniedResponse;
    await page.waitForFunction(() => [...document.querySelectorAll('[data-auth-admin]')].every(link => link.hidden));
    await page.unroute('**/tickets/api/account/navigation');
    await page.evaluate(async () => { const { getAuth, signOut } = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js'); await signOut(getAuth()); });
    await page.waitForFunction(() => [...document.querySelectorAll('[data-auth-admin]')].every(link => link.hidden));
    await signIn(page, users[0]);
    await page.waitForFunction(() => [...document.querySelectorAll('[data-auth-admin]')].every(link => link.hidden));
    console.log('Account checkout checks passed: saved profile/email hidden, missing fields editable, guest/free ticket/open and approval RSVP orders retain correct identity, sign-out/stale-profile isolation, immutable resumed contact and mobile accessibility.');
    console.log('Website navigation checks passed: admin-only desktop/mobile link, dashboard destination/current-page state, narrow desktop layout, blocked-Firestore recovery, own-account role lookup, backend authentication denial, live role grant/revocation, sign-out and account switching.');
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
    for (const user of users) {
      const sessions = await db.collection('ticketingNativeCheckouts').where('actor.uid', '==', user.uid).get();
      await Promise.all(sessions.docs.map(doc => doc.ref.delete()));
      await db.collection('accountDeletionRequests').doc(user.uid).delete();
      await db.collection('adminUsers').doc(user.uid).delete(); await db.collection('userProfiles').doc(user.uid).delete(); await auth.deleteUser(user.uid).catch(() => {});
    }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
