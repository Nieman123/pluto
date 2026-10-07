const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createRequire } = require('node:module');
const { resolve } = require('node:path');
const requireFunctions = createRequire(resolve(__dirname, '../../functions/package.json'));
const { initializeApp } = requireFunctions('firebase-admin/app');
const { getFirestore } = requireFunctions('firebase-admin/firestore');
const { hash } = require('../../functions/lib/ticketing/domain');
if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8185' || process.env.GCLOUD_PROJECT !== 'demo-pluto-ticketing') throw new Error('Isolated demo emulator required.');
initializeApp({ projectId: process.env.GCLOUD_PROJECT });
const { chromium } = require('playwright');
const { default: AxeBuilder } = require('@axe-core/playwright');
const { fixture } = require('../../functions/test/ticketing-fixture.cjs');
const base = 'http://127.0.0.1:4173';
let stage = 'setup', active;
async function api(page, path, data) {
  return page.evaluate(async ({ path, data }) => {
    const { getAuth } = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js');
    const token = await getAuth().currentUser?.getIdToken();
    const response = await fetch(`/tickets/api/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(data) });
    const body = await response.json(); if (!response.ok) throw new Error(body.error); return body;
  }, { path, data });
}
async function semantics(page) { await page.locator('flt-semantics-placeholder').evaluate(e => e.click(), { timeout: 15000 }).catch(() => {}); }
async function surface(page, name) {
  await page.evaluate(async () => { await document.fonts.ready; await Promise.all(document.getAnimations().filter(a => a.effect?.getComputedTiming().endTime !== Infinity).map(a => a.finished.catch(() => {}))); });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  assert.deepEqual(result.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) })), [], `${name} accessibility`);
  await page.screenshot({ path: `tmp/ticketing-${name}.png`, fullPage: true });
}
async function submit(page, slug, name) {
  await page.goto(`${base}/events/${slug}`);
  await page.locator('[data-ticket-quantity]').first().selectOption('1');
  await page.locator('[name=buyerName]').fill(name); await page.locator('[name=email]').fill(`${randomUUID()}@preview.invalid`);
  const navigation = page.waitForURL('**/app/tickets?order=*');
  const verifying = page.waitForResponse(r => r.url().endsWith('/tickets/api/rsvp/verification'));
  await page.locator('#native-checkout-form [type=submit]').click();
  const verification = await (await verifying).json();
  if (!verification.verified) {
    const job = (await getFirestore().collection('ticketingEmailJobs').doc(`verify_${hash(verification.verificationToken)}`).get()).data();
    await page.locator('#rsvp-email-code [name=code]').fill(job.code); await page.locator('#rsvp-email-code button').click();
  }
  await navigation;
  const orderId = new URL(page.url()).searchParams.get('order'); assert.match(orderId, /^[a-f0-9]{64}$/);
  await semantics(page); return { orderId };
}
(async () => {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 900 } });
    const admin = await context.newPage(); active = admin;
    await admin.goto(`${base}/tickets/admin`); await admin.locator('#preview-staff-sign-in').click(); await admin.locator('#staff-controls:not([hidden])').waitFor();
    const eventId = randomUUID(), draft = fixture(true); draft.slug += `-${eventId}`; draft.title = 'RSVP approval rehearsal';
    await api(admin, 'staff/save', { eventId, draft, revision: 0 });
    await admin.goto(`${base}/tickets/admin?event=${eventId}`);
    stage = 'registration editor'; await admin.locator('[data-field=registrationMode]').selectOption('rsvp-approval');
    await admin.locator('#setup-rsvp-pass').click();
    await admin.locator('#event-ticket-settings-form > .ticket-toolbar [type=submit]').click();
    await admin.locator('#ticketing-message').filter({ hasText: 'Ticketing settings saved' }).waitFor();
    await admin.locator('#event-studio').click(); await admin.locator('#event-editor-form').waitFor(); await admin.getByRole('button', { name: 'Publish', exact: true }).click();
    await admin.locator('#workspace-status').filter({ hasText: 'published' }).waitFor(); await admin.locator('#event-orders').click(); await admin.locator('#event-ticket-settings-form').waitFor();
    await admin.reload(); assert.equal(await admin.locator('[data-field=registrationMode]').inputValue(), 'rsvp-approval');
    const guestContext = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 844 } });
    const guest = await guestContext.newPage(); active = guest; let stripeRequests = 0;
    guest.on('request', request => { if (request.url().includes('stripe.com')) stripeRequests++; });
    stage = 'pending attendee'; await guest.goto(`${base}/events/${draft.slug}`);
    await surface(guest, 'rsvp-approval-landing-mobile'); assert.equal(await guest.locator('[name=promoCode]').count(), 0);
    const pending = await submit(guest, draft.slug, 'Pending RSVP Guest');
    await guest.getByText('RSVP · Awaiting approval', { exact: true }).waitFor({ timeout: 30000 });
    assert.equal(await guest.getByText('Show this code at the door · Tap to enlarge', { exact: true }).count(), 0);
    assert.equal(await guest.getByText(/Your ticket is ready to use/).count(), 0, 'pending RSVP must not claim a usable ticket');
    await guest.reload(); await semantics(guest); await guest.getByText('RSVP · Awaiting approval', { exact: true }).waitFor();
    await guest.screenshot({ path: 'tmp/ticketing-rsvp-pending-app.png', fullPage: true });
    await admin.locator('#event-rsvps .rsvp-refresh').click();
    await admin.getByRole('button', { name: 'Approve RSVP: Pending RSVP Guest', exact: true }).waitFor();
    await surface(admin, 'rsvp-admin-desktop'); await admin.setViewportSize({ width: 390, height: 844 }); await surface(admin, 'rsvp-admin-mobile'); await admin.setViewportSize({ width: 1280, height: 900 });
    stage = 'approval'; active = admin; await admin.getByRole('button', { name: 'Approve RSVP: Pending RSVP Guest', exact: true }).click();
    await admin.locator('#rsvp-decision-form [name=note]').fill('Welcome to Pluto'); await admin.locator('#rsvp-decision-form [type=submit]').click();
    await admin.locator('#ticketing-message').filter({ hasText: 'RSVP approved' }).waitFor();
    active = guest; await guest.getByRole('button', { name: 'Refresh tickets' }).click();
    await guest.getByText('RSVP · Approved', { exact: true }).waitFor(); await guest.getByText('Show this code at the door · Tap to enlarge', { exact: true }).waitFor();
    assert.equal(await guest.getByRole('button', { name: 'Transfer ticket', exact: true }).count(), 0);
    await guest.screenshot({ path: 'tmp/ticketing-rsvp-approved-app.png', fullPage: true });
    stage = 'withdrawal'; await guest.getByRole('button', { name: 'Withdraw RSVP', exact: true }).click();
    await guest.getByRole('button', { name: 'Withdraw RSVP', exact: true }).last().click();
    await guest.getByText('RSVP · Withdrawn', { exact: true }).waitFor(); assert.equal(await guest.getByText('Show this code at the door · Tap to enlarge', { exact: true }).count(), 0);
    stage = 'decline'; const declined = await submit(guest, draft.slug, 'Declined RSVP Guest');
    await guest.getByText('RSVP · Awaiting approval', { exact: true }).waitFor();
    await admin.locator('#event-rsvps .rsvp-refresh').click(); await admin.getByRole('button', { name: 'Decline RSVP: Declined RSVP Guest', exact: true }).click();
    await admin.locator('#rsvp-decision-form [name=note]').fill('Private event at capacity'); await admin.locator('#rsvp-decision-form [type=submit]').click();
    await admin.locator('#ticketing-message').filter({ hasText: 'RSVP declined' }).waitFor();
    await guest.getByRole('button', { name: 'Refresh tickets' }).click(); await guest.getByText('RSVP · Declined', { exact: true }).waitFor();
    assert.equal(await guest.getByText('Show this code at the door · Tap to enlarge', { exact: true }).count(), 0);
    stage = 'open RSVP'; const openEvent = randomUUID(), openDraft = fixture(true); openDraft.slug += `-${openEvent}`; openDraft.title = 'Open RSVP rehearsal'; openDraft.registrationMode = 'rsvp'; openDraft.offers = [{ ...openDraft.offers[0], unitAmount: 0, maxPerOrder: 1 }];
    await api(admin, 'staff/save', { eventId: openEvent, draft: openDraft, revision: 0 }); await api(admin, 'staff/publish', { eventId: openEvent, revision: 1, action: 'publish' });
    await guest.goto(`${base}/events/${openDraft.slug}`); await guest.setViewportSize({ width: 1280, height: 900 }); await surface(guest, 'rsvp-open-landing-desktop');
    const open = await submit(guest, openDraft.slug, 'Open RSVP Guest'); await guest.getByText('RSVP · Approved', { exact: true }).waitFor(); await guest.getByText('Show this code at the door · Tap to enlarge', { exact: true }).waitFor();
    const stored = await guest.evaluate(id => localStorage.getItem(`pluto-order-${id}`), open.orderId);
    const view = await api(admin, 'order', { orderId: open.orderId, accessKey: stored }); assert.ok(view.tickets[0].qr);
    stage = 'PIN door admission'; const pin = await api(admin, 'staff/scanner-pins/create', { eventId: openEvent, label: 'RSVP door', expiresAt: Date.now() + 3600000 });
    const doorContext = await browser.newContext({ ignoreHTTPSErrors: true }); await doorContext.route('https://www.gstatic.com/firebasejs/**', route => route.abort());
    const door = await doorContext.newPage(); active = door; await door.goto(`${base}/tickets/staff`); await door.locator('#scanner-pin').fill(pin.pin); await door.locator('#scanner-login-form [type=submit]').click();
    await door.locator('#scanner-session:not([hidden])').waitFor(); await door.locator('[name=qr]').fill(view.tickets[0].qr); await door.locator('#admission-form button').click();
    await door.locator('#admission-results > article').first().filter({ hasText: 'accepted' }).waitFor();
    const confirmation = door.locator('#admission-feedback'); await confirmation.waitFor();
    assert.equal(await confirmation.locator('h2').innerText(), 'Ticket scanned');
    assert.equal(await confirmation.locator('[data-scan-holder]').innerText(), 'Open RSVP Guest');
    assert.equal(await confirmation.locator('[data-scan-type]').innerText(), view.tickets[0].name);
    assert.equal(stripeRequests, 0, 'RSVP submission never loads Stripe');
    assert.equal((await api(admin, 'order', { orderId: pending.orderId, accessKey: await guest.evaluate(id => localStorage.getItem(`pluto-order-${id}`), pending.orderId) })).rsvpStatus, 'withdrawn');
    assert.equal((await api(admin, 'order', { orderId: declined.orderId, accessKey: await guest.evaluate(id => localStorage.getItem(`pluto-order-${id}`), declined.orderId) })).tickets.length, 0);
    console.log('RSVP browser checks passed: mode setup/save/reload, open/approval landing pages, pending wallet/reload without QR, approve/decline/withdrawal, named pass, account-free PIN admission, zero Stripe requests and desktop/mobile accessibility.');
  } catch (error) { console.error(`RSVP browser failure at ${stage}:`, error); if (active) await active.screenshot({ path: 'tmp/ticketing-rsvp-failure.png', fullPage: true }).catch(() => {}); process.exitCode = 1; }
  finally { await browser.close(); }
})();
