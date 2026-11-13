const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { resolve } = require('node:path');
const { createRequire } = require('node:module');
const { chromium } = require('playwright');
const { default: AxeBuilder } = require('@axe-core/playwright');
const backend = createRequire(resolve(__dirname, '../../functions/package.json'));
if (process.env.GCLOUD_PROJECT !== 'demo-pluto-ticketing' || process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8185') throw Error('Isolated demo emulator required.');
backend('firebase-admin/app').initializeApp({ projectId: 'demo-pluto-ticketing' });
const db = backend('firebase-admin/firestore').getFirestore(), base = 'http://127.0.0.1:4173';
async function field(page, path, value) {
  const input = page.locator(`[data-field="${path}"]`); await input.fill(value); await input.dispatchEvent('change');
}
async function surface(page, name) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(document.getAnimations().filter(a => a.effect?.getComputedTiming().endTime !== Infinity).map(a => a.finished.catch(() => {})));
  });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name} fits viewport`);
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  assert.deepEqual(result.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => ({ target: n.target, failure: n.failureSummary })) })), [], `${name} accessibility`);
  await page.screenshot({ path: `tmp/ticketing-${name}.png`, fullPage: true });
}
(async () => {
  const browser = await chromium.launch();
  let active;
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const admin = await context.newPage(); active = admin;
    await admin.goto(`${base}/tickets/admin`); await admin.locator('#preview-staff-sign-in').click();
    await admin.locator('#staff-controls:not([hidden])').waitFor(); await admin.locator('#event-new').click();
    await admin.locator('#event-editor-form').waitFor();
    const eventId = new URL(admin.url()).searchParams.get('event'), slug = `door-december-${randomUUID()}`, title = 'December door admission preview';
    // Switching an existing free listing must remove its generated free-entry FAQ.
    await admin.locator('[data-field=registrationMode]').selectOption('free');
    await admin.locator('[data-field=registrationMode]').selectOption('door');
    assert.equal(await admin.locator('[data-field=admissionStartsAt]').count(), 0);
    assert.equal(await admin.locator('[data-field=venueVisibility] option').count(), 1);
    assert.equal(await admin.locator('[data-field=doorPrice]').getAttribute('min'), '0.01');
    await field(admin, 'title', title); await field(admin, 'slug', slug);
    await field(admin, 'doorPrice', '5');
    await field(admin, 'admissionNotes', 'Admission handled by the venue.\nCash only.');
    await field(admin, 'venueName', 'December preview venue'); await field(admin, 'address', '123 Preview Street');
    await admin.getByRole('button', { name: 'Save draft', exact: true }).first().click();
    await admin.locator('#ticketing-message').filter({ hasText: 'Draft saved' }).waitFor();
    const { draft } = (await db.collection('ticketingEvents').doc(eventId).get()).data();
    assert.equal(draft.doorPrice, 500); assert.equal(draft.registrationMode, 'door');
    assert.ok(draft.offers.every(o => !o.active)); assert.equal(draft.waitlistEnabled, false);
    assert.ok(!JSON.stringify(draft.sections).includes('Free entry'));
    await admin.getByRole('button', { name: 'Publish', exact: true }).click();
    await admin.locator('#workspace-status').filter({ hasText: 'published' }).waitFor();
    await admin.locator('#event-orders').click(); await admin.getByRole('heading', { name: 'Event overview', exact: true }).waitFor();
    for (const id of ['event-cash', 'event-scanner-pins', 'event-waitlist']) assert.equal(await admin.locator(`#${id}`).isVisible(), false);
    await surface(admin, 'door-event-dashboard');
    const guest = await context.newPage(); active = guest; let stripeRequests = 0;
    guest.on('request', request => { if (request.url().includes('stripe.com')) stripeRequests++; });
    for (const width of [390, 1280]) {
      await guest.setViewportSize({ width, height: 844 }); await guest.goto(`${base}/events/${slug}`);
      await guest.getByRole('heading', { name: '$5 entry.', exact: true }).waitFor();
      assert.equal(await guest.locator('#native-checkout-form, #native-checkout-config, #stripe-checkout').count(), 0);
      assert.match(await guest.locator('#event-info').innerText(), /Admission handled by the venue\.\nCash only\./);
      assert.doesNotMatch(await guest.locator('main').innerText(), /FREE ENTRY|Free entry|BUY TICKETS/);
      const schema = JSON.parse(await guest.locator('script[type="application/ld+json"]').textContent());
      assert.equal(schema.isAccessibleForFree, false); assert.equal(schema.offers, undefined);
      await surface(guest, `door-event-${width}`);
    }
    assert.equal(stripeRequests, 0);
    await guest.goto(`${base}/events`);
    const card = guest.locator('.discover-card').filter({ hasText: title });
    assert.equal((await card.locator('.discover-status').textContent()).trim(), '$5 at the door');
    await card.getByRole('link', { name: 'View event', exact: false }).waitFor();
    assert.equal(await card.getByRole('link', { name: /tickets|RSVP/ }).count(), 0);
    // Edit after publication and verify both live projections and reload persistence.
    await field(admin, 'doorPrice', '7.50'); await field(admin, 'admissionNotes', 'Pay the venue on arrival.');
    await admin.getByRole('button', { name: 'Save event settings', exact: true }).first().click();
    await admin.locator('#ticketing-message').filter({ hasText: 'public page is updated' }).waitFor();
    await guest.goto(`${base}/events/${slug}`); await guest.getByRole('heading', { name: '$7.50 entry.', exact: true }).waitFor();
    await admin.reload(); await admin.locator('[data-field=doorPrice]').waitFor();
    assert.equal(await admin.locator('[data-field=doorPrice]').inputValue(), '7.5');
    const feed = await (await guest.request.get(`${base}/tickets/api/public/event-feed`)).json();
    const appCard = feed.events.find(e => e.id === `native-${eventId}`);
    assert.equal(appCard.doorPrice, 750); assert.equal(appCard.admissionNotes, 'Pay the venue on arrival.');
    // Scope the real app feed to this event so it appears in the home preview.
    const appContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await appContext.route('**/tickets/api/public/event-feed', route => route.fulfill({ json: { events: [appCard] } }));
    const app = await appContext.newPage(); active = app; await app.goto(`${base}/app/sign-on`);
    await app.locator('flt-semantics-placeholder').evaluate(e => e.click(), { timeout: 15000 }).catch(() => {});
    await app.getByRole('textbox', { name: /Email/ }).fill('staff@ticketing-preview.invalid');
    await app.getByRole('button', { name: 'Continue', exact: true }).click();
    await app.getByLabel(/Enter your password/).fill('Local-ticketing-preview-2026!');
    await app.getByRole('button', { name: 'Sign In', exact: true }).click(); await app.waitForURL(`${base}/app/`);
    // Flutter exposes the pressable event card as one combined semantic label.
    await app.getByLabel(/\$7\.50 at the door · No online sales/).first().waitFor();
    await app.getByRole('button', { name: 'View event', exact: true }).waitFor();
    await app.screenshot({ path: 'tmp/ticketing-door-event-flutter.png', fullPage: true });
    await appContext.close(); await context.close();
    console.log('Pay-at-the-door browser checks passed: create, publish, edit, reload, desktop/mobile accessibility, no checkout, discovery and Flutter labels.');
  } catch (error) {
    if (active) {
      console.error('Door-event failure URL:', active.url());
      console.error((await active.locator('body').innerText()).slice(0, 2500));
      await active.screenshot({ path: 'tmp/ticketing-door-event-failure.png' }).catch(() => {});
    }
    throw error;
  } finally { await browser.close(); }
})().then(() => process.exit(0), error => { console.error(error); process.exit(1); });
