const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { resolve } = require('node:path');
const { createRequire } = require('node:module');
const { chromium } = require('playwright');
const { default: AxeBuilder } = require('@axe-core/playwright');
const backend = createRequire(resolve(__dirname, '../../functions/package.json'));
if (process.env.GCLOUD_PROJECT !== 'demo-pluto-ticketing' || process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8185') throw Error('Isolated demo emulator required.');
backend('firebase-admin/app').initializeApp({ projectId: 'demo-pluto-ticketing' });
const db = backend('firebase-admin/firestore').getFirestore();
const base = 'http://127.0.0.1:4173';
let active, stage = 'setup';
async function semantics(page) { await page.locator('flt-semantics-placeholder').evaluate(e => e.click(), { timeout: 15000 }).catch(() => {}); }
async function surface(page, name) {
  await page.evaluate(async () => { await document.fonts.ready; await Promise.all(document.getAnimations().filter(a => a.effect?.getComputedTiming().endTime !== Infinity).map(a => a.finished.catch(() => {}))); });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name} fits viewport`);
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  assert.deepEqual(result.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) })), [], `${name} accessibility`);
  await page.screenshot({ path: `tmp/ticketing-${name}.png`, fullPage: true });
}
async function field(page, path, value) {
  const input = page.locator(`[data-field="${path}"]`); await input.fill(value); await input.dispatchEvent('change');
}

(async () => {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 900 } });
    const admin = await context.newPage(); active = admin;
    await admin.goto(`${base}/tickets/admin`); await admin.locator('#preview-staff-sign-in').click();
    await admin.locator('#staff-controls:not([hidden])').waitFor();
    stage = 'free event creation'; await admin.locator('#event-new').click();
    await admin.locator('#event-editor-form').waitFor();
    const eventId = new URL(admin.url()).searchParams.get('event'), slug = `free-halloween-${randomUUID()}`, title = 'Brew Pump Halloween preview';
    await admin.locator('[data-field=registrationMode]').selectOption('free');
    assert.equal(await admin.locator('[data-field=admissionStartsAt]').count(), 0);
    assert.equal(await admin.locator('[data-field=venueVisibility]').inputValue(), 'public');
    assert.equal(await admin.locator('[data-field=venueVisibility] option').count(), 1);
    await field(admin, 'title', title); await field(admin, 'slug', slug);
    await field(admin, 'subtitle', 'A free Halloween block party. Bring your friends.');
    await field(admin, 'venueName', 'Brew Pump preview venue'); await field(admin, 'address', '123 Preview Party Street');
    await field(admin, 'directions', 'Walk up to the block party. No check-in required.');
    await admin.locator('[data-upload=flyer]').setInputFiles(resolve(__dirname, '../../web/gallery/manafest-2026-pink-stage.webp'));
    await admin.locator('[data-field="flyer.alt"]').waitFor(); await field(admin, 'flyer.alt', 'Free block party flyer');
    await admin.getByRole('button', { name: 'Save draft', exact: true }).first().click();
    await admin.locator('#ticketing-message').filter({ hasText: 'Draft saved' }).waitFor();
    const event = (await db.collection('ticketingEvents').doc(eventId).get()).data();
    assert.equal(event.draft.registrationMode, 'free'); assert.ok(event.draft.offers.every(o => !o.active));
    assert.ok(!event.draft.sections[0].bodyHtml.includes('Bring your ticket'));
    await admin.getByRole('button', { name: 'Publish', exact: true }).click();
    await admin.locator('#workspace-status').filter({ hasText: 'published' }).waitFor();
    await admin.locator('#event-orders').click(); await admin.getByRole('heading', { name: 'Event overview', exact: true }).waitFor();
    assert.equal(await admin.locator('#event-cash').isVisible(), false);
    assert.equal(await admin.locator('#event-ticket-settings fieldset').count(), 0);
    assert.equal(await admin.locator('#setup-rsvp-pass').count(), 0);
    await surface(admin, 'free-event-dashboard');

    stage = 'public landing and discovery';
    const guestContext = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 844 } });
    const guest = await guestContext.newPage(); active = guest; let stripeRequests = 0;
    guest.on('request', request => { if (request.url().includes('stripe.com')) stripeRequests++; });
    await guest.goto(`${base}/events/${slug}`); await guest.getByRole('heading', { name: 'Just show up.', exact: true }).waitFor();
    assert.equal(await guest.locator('#native-checkout-form, #native-checkout-config, #stripe-checkout').count(), 0);
    assert.equal(await guest.getByRole('textbox').count(), 0);
    assert.ok((await guest.locator('body').innerText()).includes('123 Preview Party Street'));
    assert.equal(stripeRequests, 0);
    await surface(guest, 'free-event-landing-mobile');
    await guest.setViewportSize({ width: 1280, height: 900 }); await surface(guest, 'free-event-landing-desktop');
    await guest.goto(`${base}/events`);
    const card = guest.locator('.discover-card').filter({ hasText: title });
    await card.getByRole('link', { name: 'View event', exact: false }).waitFor();
    assert.equal((await card.locator('.discover-status').textContent()).trim(), 'Free entry · Just show up');
    assert.equal(await card.getByRole('link', { name: /View event & tickets|View event & RSVP/ }).count(), 0);
    assert.equal(await card.locator('.discover-flyer img').count(), 1);
    // The CI preview serves a static homepage fixture. Its card template is
    // covered with the actual published projection in free-events.cjs.
    await guestContext.close();

    stage = 'Flutter navigation and old editor removal';
    const appContext = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 900 } });
    const app = await appContext.newPage(); active = app;
    await app.goto(`${base}/app/sign-on`); await semantics(app);
    await app.getByRole('textbox', { name: /Email/ }).fill('staff@ticketing-preview.invalid');
    await app.getByRole('button', { name: 'Continue', exact: true }).click();
    await app.getByLabel(/Enter your password/).fill('Local-ticketing-preview-2026!');
    await app.getByRole('button', { name: 'Sign In', exact: true }).click();
    await app.getByRole('button', { name: 'Open Admin', exact: true }).waitFor();
    await app.goto(`${base}/app/`); await semantics(app);
    await app.getByRole('button', { name: 'View event', exact: true }).waitFor();
    await app.goto(`${base}/app/admin/events`); await semantics(app);
    await app.getByRole('button', { name: 'Open Event Studio', exact: true }).waitFor();
    assert.equal(await app.getByRole('button', { name: 'Save Event', exact: true }).count(), 0);
    assert.equal(await app.getByRole('textbox', { name: /Title|Ticket URL/ }).count(), 0);
    await app.screenshot({ path: 'tmp/ticketing-flutter-event-studio-link.png', fullPage: true });
    await app.getByRole('button', { name: 'Open Event Studio', exact: true }).click();
    await app.waitForURL(`${base}/tickets/admin`);
    await appContext.close(); await context.close();
    console.log('Free-event browser checks passed: Studio creation/publishing, public venue, no registration or payment form, discovery/app labels, flyer, desktop/mobile accessibility and Flutter Studio navigation without the old editor.');
  } catch (error) { console.error('Free-event browser phase:', stage); if (active) await active.screenshot({ path: 'tmp/ticketing-free-event-failure.png' }).catch(() => {}); throw error; }
  finally { await browser.close(); }
})().then(() => process.exit(0), error => { console.error(error); process.exit(1); });
