const assert = require('node:assert/strict');
const { randomUUID, randomBytes } = require('node:crypto');
const { createRequire } = require('node:module');
const { resolve } = require('node:path');
const { chromium } = require('playwright');
const { default: AxeBuilder } = require('@axe-core/playwright');
const backend = createRequire(resolve(__dirname, '../../functions/package.json'));
process.env.GCLOUD_PROJECT = 'demo-pluto-ticketing'; process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8185';
backend('firebase-admin/app').initializeApp({ projectId: 'demo-pluto-ticketing' });
const db = backend('firebase-admin/firestore').getFirestore(), eid = randomUUID(), { fixture } = require('../../functions/test/ticketing-fixture.cjs');
const base = 'http://127.0.0.1:4173';
async function api(page, path, data) {
  return page.evaluate(async ({ path, data }) => {
    const { getAuth } = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js');
    const response = await fetch(`/tickets/api/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await getAuth().currentUser.getIdToken()}` }, body: JSON.stringify(data) });
    const result = await response.json(); if (!response.ok) throw new Error(result.error); return result;
  }, { path, data });
}
(async () => {
  const browser = await chromium.launch(), context = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true }), page = await context.newPage();
  try {
    await page.goto(`${base}/tickets/admin`); await page.getByRole('button', { name: 'Local preview staff sign-in' }).click();
    await page.locator('#staff-controls:not([hidden])').waitFor();
    const draft = fixture(); draft.title = 'Scheduled location browser check'; draft.slug = `location-${eid}`;
    await api(page, 'staff/save', { eventId: eid, draft, revision: 0 });
    await page.goto(`${base}/tickets/admin?event=${eid}&view=studio`); await page.locator('#field-venueVisibility').waitFor();
    await page.locator('#field-venueRevealScheduled').check();
    const at = Date.now() + 3600000, parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: draft.timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(at)).map(p => [p.type, p.value]));
    const local = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
    await page.locator('#field-venueRevealAt').fill(local); await page.locator('#field-venueRevealAt').blur();
    await page.getByRole('button', { name: 'Save draft', exact: true }).first().click();
    await page.getByText('Saved · Revision 2', { exact: true }).first().waitFor();
    const record = await api(page, 'staff/get', { eventId: eid });
    assert.equal(record.draft.venueRevealScheduled, true); assert.ok(Math.abs(Date.parse(record.draft.venueRevealAt) - at) < 60000, 'local editor time is saved as event-timezone UTC');
    await api(page, 'staff/publish', { eventId: eid, revision: 2, action: 'publish' });
    await page.goto(`${base}/events/${draft.slug}`);
    assert.match(await page.locator('.native-location-notice').innerText(), /ticket holders only[\s\S]*Location reveal:/);
    for (const value of [draft.venueName, draft.address, draft.directions]) assert.ok(!(await page.content()).includes(value));
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.evaluate(async () => { await document.fonts.ready; await Promise.all(document.getAnimations().filter(a => a.effect?.getComputedTiming().endTime !== Infinity).map(a => a.finished.catch(() => {}))); });
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze(); assert.deepEqual(result.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => ({ target: n.target, failure: n.failureSummary })) })), []);
    await page.screenshot({ path: 'tmp/public-location-notice-phone.png', fullPage: true });
    const customer = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, ignoreHTTPSErrors: true }), oid = 'a'.repeat(64), key = randomBytes(32).toString('hex'), revealAt = Date.now() + 12000;
    await customer.addInitScript(({ oid, key }) => localStorage.setItem(`pluto-order-${oid}`, key), { oid, key });
    let requests = 0;
    await customer.route('**/tickets/api/**', route => {
      requests++; const available = Date.now() >= revealAt;
      const venue = { available, revealAt: new Date(revealAt).toISOString(), name: available ? draft.venueName : '', address: available ? draft.address : '', directions: available ? draft.directions : '' };
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ orderId: oid, status: 'paid', eventTitle: draft.title, method: 'cash', total: 10000, tickets: [{ id: 'ticket', name: 'Scheduled pass', status: 'valid', qr: 'qr-fixture', venue }], venue }) });
    });
    const tickets = await customer.newPage(); await tickets.goto(`${base}/app/tickets?order=${oid}`);
    await tickets.locator('flt-semantics-placeholder').evaluate(e => e.click(), { timeout: 20000 }).catch(() => {});
    await tickets.getByText('The exact venue and directions are being kept private until the location reveal.', { exact: true }).waitFor();
    assert.equal(await tickets.getByText(draft.address, { exact: true }).count(), 0);
    await tickets.screenshot({ path: 'tmp/holder-location-waiting-phone.png' });
    await tickets.getByText(draft.venueName, { exact: true }).waitFor({ timeout: 25000 });
    assert.ok(requests >= 2, 'ticket page refreshed automatically at reveal');
    await tickets.getByText(draft.venueName, { exact: true }).scrollIntoViewIfNeeded();
    await tickets.screenshot({ path: 'tmp/holder-location-revealed-phone.png' });
    await customer.close();
    console.log('Location browser checks passed: Studio schedule/timezone save, public hint/privacy/accessibility and automatic holder reveal.');
  } finally {
    await browser.close(); await db.recursiveDelete(db.collection('ticketingEvents').doc(eid)); await db.collection('publishedEvents').doc(eid).delete();
    await db.collection('eventSlugs').doc(`location-${eid}`).delete(); await db.collection('currentEvents').doc(`native-${eid}`).delete();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
