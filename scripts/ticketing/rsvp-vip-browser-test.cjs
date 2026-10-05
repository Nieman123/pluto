const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createRequire } = require('node:module');
const { resolve } = require('node:path');
const { chromium } = require('playwright');
const { default: AxeBuilder } = require('@axe-core/playwright');
const backend = createRequire(resolve(__dirname, '../../functions/package.json'));
if (process.env.GCLOUD_PROJECT !== 'demo-pluto-ticketing' || process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8185') throw new Error('Isolated demo emulator required.');
backend('firebase-admin/app').initializeApp({ projectId: process.env.GCLOUD_PROJECT });
const db = backend('firebase-admin/firestore').getFirestore();
const { hash } = require('../../functions/lib/ticketing/domain');
const { fixture } = require('../../functions/test/ticketing-fixture.cjs');
const base = 'http://127.0.0.1:4173';
let active, stage = 'setup';
async function api(page, path, data) {
  return page.evaluate(async ({ path, data }) => {
    const { getAuth } = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js');
    const token = await getAuth().currentUser?.getIdToken();
    const response = await fetch(`/tickets/api/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(data) });
    const body = await response.json(); if (!response.ok) throw new Error(body.error); return body;
  }, { path, data });
}
async function surface(page, name) {
  await page.evaluate(async () => { await document.fonts.ready; await Promise.all(document.getAnimations().filter(a => a.effect?.getComputedTiming().endTime !== Infinity).map(a => a.finished.catch(() => {}))); });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name} fits viewport`);
  const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  assert.deepEqual(audit.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) })), [], `${name} accessibility`);
  await page.screenshot({ path: `tmp/ticketing-${name}.png`, fullPage: true });
}
async function verify(page, path) {
  const response = page.waitForResponse(r => r.url().endsWith(`/tickets/api/${path}`));
  await page.locator('#native-checkout-form [type=submit]').click();
  const proof = await (await response).json();
  if (!proof.verified) {
    const job = (await db.collection('ticketingEmailJobs').doc(`verify_${hash(proof.verificationToken)}`).get()).data();
    await page.locator('#rsvp-email-code [name=code]').fill(job.code);
    await page.locator('#rsvp-email-code button').click();
  }
}
async function makeRsvp(page, draft, name, email) {
  await page.goto(`${base}/events/${draft.slug}`);
  await page.locator(`#offer-${draft.offers.find(o => o.unitAmount === 0 && o.active).id}`).selectOption('1');
  await page.locator('[name=buyerName]').fill(name); await page.locator('[name=email]').fill(email);
  const navigation = page.waitForURL('**/app/tickets?order=*');
  await verify(page, 'rsvp/verification'); await navigation;
  return new URL(page.url()).searchParams.get('order');
}
(async () => {
  const browser = await chromium.launch();
  try {
    const adminContext = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 900 } });
    const admin = await adminContext.newPage(); active = admin;
    await admin.goto(`${base}/tickets/admin`); await admin.locator('#preview-staff-sign-in').click(); await admin.locator('#staff-controls:not([hidden])').waitFor();
    const events = [];
    for (const mode of ['rsvp', 'rsvp-approval']) {
      stage = `${mode} VIP editor`;
      const eventId = randomUUID(), draft = fixture(true); draft.slug += `-${eventId}`; draft.title = `${mode} VIP rehearsal`; draft.registrationMode = mode;
      draft.offers = [{ ...draft.offers[0], name: 'Free RSVP', unitAmount: 0, maxPerOrder: 1 }];
      await api(admin, 'staff/save', { eventId, draft, revision: 0 });
      await admin.goto(`${base}/tickets/admin?event=${eventId}`);
      await admin.getByRole('button', { name: 'Add paid VIP option', exact: true }).click();
      assert.equal(Number(await admin.locator('[data-field="offers.1.unitAmount"]').inputValue()), 100);
      assert.equal(await admin.locator('[data-field="offers.1.kind"]').inputValue(), mode === 'rsvp' ? 'admission' : 'upgrade');
      await admin.getByRole('button', { name: 'Save ticket types', exact: true }).first().click();
      await admin.locator('#ticketing-message').filter({ hasText: 'Ticket types saved' }).waitFor();
      await admin.getByRole('button', { name: 'Publish ticketing changes', exact: true }).click();
      await admin.locator('#workspace-status').filter({ hasText: 'published' }).waitFor();
      const saved = await api(admin, 'staff/get', { eventId });
      const vip = saved.draft.offers.find(o => o.unitAmount > 0);
      if (mode === 'rsvp-approval') assert.ok(Object.keys(vip.pools).every(pool => !Object.hasOwn(saved.draft.offers[0].pools, pool)), 'VIP stock is separate from RSVP admission');
      await admin.reload(); assert.equal(Number(await admin.locator('[data-field="offers.1.unitAmount"]').inputValue()), 100);
      events.push({ eventId, draft: saved.draft, vip });
    }
    await admin.setViewportSize({ width: 390, height: 844 }); await surface(admin, 'rsvp-vip-editor-mobile');
    await admin.setViewportSize({ width: 1280, height: 900 }); await surface(admin, 'rsvp-vip-editor-desktop');

    const guestContext = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 900 } });
    // Exercise the actual frontend routing and verification, while provider payment
    // sessions are mocked here. Emulator integration tests verify real order logic.
    await guestContext.addInitScript(() => { window.Stripe = () => ({ createEmbeddedCheckoutPage: async ({ fetchClientSecret }) => {
      if (await fetchClientSecret() !== 'ci-vip-client-secret') throw new Error('Wrong payment session');
      return { mount: selector => { document.querySelector(selector).textContent = 'VIP payment ready'; }, destroy: () => { document.querySelector('#stripe-checkout').textContent = ''; } };
    } }); });
    const purchases = [];
    await guestContext.route('**/tickets/api/checkout', async route => {
      purchases.push(route.request().postDataJSON());
      await route.fulfill({ json: { orderId: randomUUID().replaceAll('-', ''), status: 'open', total: 10000, clientSecret: 'ci-vip-client-secret', publishableKey: 'pk_test_ci_ui_fixture', expiresAt: Date.now() + 1800000 } });
    });
    await guestContext.route('**/tickets/api/cancel', route => route.fulfill({ json: { status: 'expired' } }));
    const guest = await guestContext.newPage(); active = guest;
    const [open, approval] = events;
    stage = 'open RSVP or VIP choice'; await guest.goto(`${base}/events/${open.draft.slug}`);
    const openChoice = guest.locator(`label[for="offer-${open.vip.id}"]`);
    assert.match(await openChoice.innerText(), /\$100\.00/); assert.match(await openChoice.innerText(), /Includes event admission/);
    await surface(guest, 'rsvp-vip-open-desktop'); await guest.setViewportSize({ width: 390, height: 844 }); await surface(guest, 'rsvp-vip-open-mobile');
    await guest.locator('[data-ticket-quantity]').first().selectOption('1'); await guest.locator(`#offer-${open.vip.id}`).selectOption('1');
    assert.equal(await guest.locator('[data-ticket-quantity]').first().inputValue(), '0', 'choosing VIP removes the free RSVP selection');
    await guest.locator('[name=buyerName]').fill('Direct VIP Guest'); await guest.locator('[name=email]').fill(`${randomUUID()}@preview.invalid`);
    await guest.locator('[name=promoCode]').fill('SAVE');
    await guest.getByRole('button', { name: 'Continue to payment', exact: true }).click();
    await guest.getByText('VIP payment ready', { exact: true }).waitFor();
    assert.equal(purchases.length, 1); assert.equal(purchases[0].checkoutKind, 'payment'); assert.equal(purchases[0].rsvpUpgradeToken, undefined);
    assert.equal(await guest.locator('#rsvp-email-code').count(), 0, 'open VIP can purchase directly');
    await guest.locator('#checkout-cancel').click(); await guest.locator('#native-checkout-form').waitFor();
    const freeId = await makeRsvp(guest, open.draft, 'Free Open Guest', `${randomUUID()}@preview.invalid`);
    assert.equal((await db.collection('ticketingOrders').doc(freeId).get()).data().method, 'rsvp');
    assert.equal(purchases.length, 1, 'free RSVP does not create a payment checkout');

    stage = 'approval gate'; const approvedEmail = `${randomUUID()}@preview.invalid`, parentId = await makeRsvp(guest, approval.draft, 'Approved VIP Guest', approvedEmail);
    await guest.goto(`${base}/events/${approval.draft.slug}`);
    const approvalChoice = guest.locator(`label[for="offer-${approval.vip.id}"]`);
    assert.match(await approvalChoice.innerText(), /\$100\.00/); assert.match(await approvalChoice.innerText(), /Requires an approved RSVP/);
    await surface(guest, 'rsvp-vip-approval-mobile'); await guest.setViewportSize({ width: 1280, height: 900 }); await surface(guest, 'rsvp-vip-approval-desktop');
    async function selectUpgrade() {
      await guest.locator(`#offer-${approval.vip.id}`).selectOption('1');
      await guest.locator('[name=buyerName]').fill('Different input name'); await guest.locator('[name=email]').fill(approvedEmail);
    }
    await selectUpgrade(); await verify(guest, 'rsvp/upgrade/verification');
    await guest.locator('#ticket-checkout-message').filter({ hasText: 'must be approved' }).waitFor();
    assert.equal(purchases.length, 1, 'pending RSVPs never reach payment');
    assert.equal(await guest.evaluate(id => localStorage.getItem(`pluto-checkout-${id}`), approval.eventId), null);
    await api(admin, 'staff/rsvp/review', { eventId: approval.eventId, orderId: parentId, decision: 'approve', note: '' });
    await guest.goto(`${base}/app/tickets?order=${parentId}`);
    await guest.locator('flt-semantics-placeholder').evaluate(e => e.click(), { timeout: 15000 }).catch(() => {});
    await guest.getByText('Browse VIP upgrades', { exact: true }).waitFor();
    await guest.goto(`${base}/events/${approval.draft.slug}`); await selectUpgrade(); await verify(guest, 'rsvp/upgrade/verification');
    await guest.getByText('VIP payment ready', { exact: true }).waitFor();
    assert.equal(purchases.length, 2); assert.match(purchases[1].rsvpUpgradeToken, /^[a-f0-9]{64}$/);
    assert.equal(purchases[1].name, 'Approved VIP Guest', 'checkout uses the approved attendee name');
    assert.equal(purchases[1].email, approvedEmail);
    const grant = (await db.collection('ticketingRsvpUpgradeAccess').doc(hash(purchases[1].rsvpUpgradeToken)).get()).data();
    assert.equal(grant.rsvpOrderId, parentId);
    await guest.reload(); await guest.getByRole('button', { name: 'Resume reserved checkout', exact: true }).waitFor();
    await guest.getByRole('button', { name: 'Resume reserved checkout', exact: true }).click(); await guest.getByText('VIP payment ready', { exact: true }).waitFor();
    assert.equal(purchases[2].accessKey, purchases[1].accessKey, 'reloading preserves the same payment attempt');

    // A fully discounted upgrade exercises real issuance and offline admission
    // without contacting a payment provider from this isolated browser suite.
    stage = 'VIP offline admission';
    const latest = await api(admin, 'staff/get', { eventId: approval.eventId });
    latest.draft.promos.push({ code: 'VIPCOMP', type: 'percent', value: 100, limit: 10, startsAt: latest.draft.offers[0].salesStart, endsAt: latest.draft.endAt, offerIds: [approval.vip.id] });
    const revision = await api(admin, 'staff/save', { eventId: approval.eventId, draft: latest.draft, revision: latest.revision });
    await api(admin, 'staff/publish', { eventId: approval.eventId, revision: revision.revision, action: 'publish' });
    const issued = await api(admin, 'checkout', { ...purchases[1], promoCode: 'VIPCOMP' });
    assert.equal(issued.status, 'paid'); assert.equal(issued.total, 0);
    const vipOrder = await api(admin, 'order', { orderId: issued.orderId, accessKey: purchases[1].accessKey });
    const parentKey = await guest.evaluate(id => localStorage.getItem(`pluto-order-${id}`), parentId);
    const parentOrder = await api(admin, 'order', { orderId: parentId, accessKey: parentKey });
    const door = await adminContext.newPage(); active = door;
    await door.goto(`${base}/tickets/staff`); await door.locator('#staff-controls:not([hidden])').waitFor();
    await door.locator('#staff-event').selectOption(approval.eventId);
    await door.locator('#admission-sync').click(); await door.locator('#ticketing-message').filter({ hasText: 'prepared for offline use' }).waitFor();
    await door.evaluate(async () => { await navigator.serviceWorker.ready; }); await door.reload();
    await door.locator('#admission-cache-status').filter({ hasText: 'Manifest age' }).waitFor();
    await adminContext.setOffline(true); await door.reload();
    await door.locator('#ticketing-message').filter({ hasText: 'Prepared offline admission' }).waitFor();
    await door.locator('[name=qr]').fill(vipOrder.tickets[0].qr); await door.locator('#admission-form button').click();
    await door.locator('#admission-results article').first().filter({ hasText: 'Offline: queued' }).waitFor();
    await door.locator('#admission-feedback').waitFor({ state: 'hidden' });
    await door.locator('[name=qr]').fill(parentOrder.tickets[0].qr); await door.locator('#admission-form button').click();
    await door.locator('#admission-results article').first().filter({ hasText: 'DUPLICATE' }).waitFor();
    await door.reload(); await door.locator('#ticketing-message').filter({ hasText: 'Prepared offline admission' }).waitFor();
    await door.locator('[name=qr]').fill(parentOrder.tickets[0].qr); await door.locator('#admission-form button').click();
    await door.locator('#admission-results article').first().filter({ hasText: 'DUPLICATE' }).waitFor();
    // Verify the replay response and drained queue before checking the single
    // recorded arrival, rather than depending on an expiring notification.
    const replayed = door.waitForResponse(response => response.url().endsWith('/tickets/api/staff/scan') && response.request().postDataJSON()?.offline === true);
    await adminContext.setOffline(false); await door.locator('#admission-replay').click();
    const replayResponse = await replayed;
    assert.equal(replayResponse.status(), 200);
    assert.equal((await replayResponse.json()).result, 'accepted');
    await door.locator('#admission-cache-status').filter({ hasText: '0 queued scans' }).waitFor();
    assert.equal((await api(admin, 'staff/attendance', { eventId: approval.eventId })).counts.arrivals, 1);
    console.log('RSVP VIP browser checks passed: $100 VIP editor/save/publish/reload, direct open-VIP payment routing, free RSVP, approval/email gate, authoritative holder name, Flutter upgrade link, checkout resume, offline VIP/RSVP duplicate/reload/replay with one arrival, and mobile/desktop accessibility.');
    await adminContext.close(); await guestContext.close();
  } catch (error) {
    console.error('RSVP VIP browser phase:', stage);
    if (active) await active.screenshot({ path: 'tmp/ticketing-rsvp-vip-failure.png', fullPage: true }).catch(() => {});
    throw error;
  } finally { await browser.close(); }
})().then(() => process.exit(0), error => { console.error(error); process.exit(1); });
