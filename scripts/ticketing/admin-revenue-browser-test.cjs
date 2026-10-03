const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { chromium } = require('playwright');
const { default: AxeBuilder } = require('@axe-core/playwright');
const { fixture } = require('../../functions/test/ticketing-fixture.cjs');
const sharp = require('../../functions/node_modules/sharp');
const backend = require('node:module').createRequire(require('node:path').resolve(__dirname, '../../functions/package.json'));
const { initializeApp } = backend('firebase-admin/app');
const { getFirestore } = backend('firebase-admin/firestore');
process.env.GCLOUD_PROJECT = 'demo-pluto-ticketing';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8185';
initializeApp({ projectId: process.env.GCLOUD_PROJECT });
const db = getFirestore(), eid = randomUUID(), oid = randomUUID();
async function api(page, path, data) {
  return page.evaluate(async ({ path, data }) => {
    const { getAuth } = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js');
    const token = await getAuth().currentUser.getIdToken();
    const response = await fetch(`/tickets/api/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(data) });
    const result = await response.json(); if (!response.ok) throw new Error(result.error); return result;
  }, { path, data });
}
(async () => {
  const browser = await chromium.launch(), context = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true }), page = await context.newPage();
  try {
    await page.goto('http://127.0.0.1:4173/tickets/admin');
    await page.getByRole('button', { name: 'Local preview staff sign-in' }).click();
    await page.locator('#staff-controls:not([hidden])').waitFor();
    const draft = fixture(); draft.title = 'Revenue & flyer browser check'; draft.slug = `revenue-${eid}`;
    await api(page, 'staff/save', { eventId: eid, draft, revision: 0 });
    const image = await sharp({ create: { width: 200, height: 300, channels: 3, background: '#ffbb78' } }).png().toBuffer();
    const media = await api(page, 'staff/media', { eventId: eid, image: image.toString('base64') });
    draft.flyer = { assetId: media.assetId, alt: 'Test artist flyer', focalX: 50, focalY: 50, caption: '' };
    await api(page, 'staff/save', { eventId: eid, draft, revision: 1 });
    await api(page, 'staff/publish', { eventId: eid, revision: 2, action: 'publish' });
    await db.collection('ticketingOrders').doc(oid).set({ eventId: eid, status: 'paid', total: 470000, paidAt: Date.now(), createdAt: Date.now(), units: [], method: 'cash', taxAmount: 0, refundedAmount: 0, stripeFee: 0, name: 'Test', email: 'browser@example.test' });
    await page.reload();
    const card = page.locator(`[data-open-event="${eid}"]`); await card.waitFor();
    await page.waitForFunction(id => document.querySelector(`[data-card-flyer="${id}"]`)?.naturalWidth > 0, eid);
    assert.match(await card.innerText(), /This week[\s\S]*\$4,700/);
    assert.equal(await page.locator('#events-back').isVisible(), false);
    assert.equal(await page.getByRole('link', { name: 'Explore events', exact: true }).count(), 0);
    assert.equal(await page.getByRole('link', { name: 'My tickets', exact: true }).count(), 0);
    await card.click(); await page.locator('.revenue-chart').waitFor();
    assert.match(await page.locator('.revenue-heading').innerText(), /\$4,700/);
    assert.equal(await page.locator('#event-public-page').getAttribute('href'), `/events/${draft.slug}`);
    await page.locator('#revenue-period').selectOption('7');
    assert.equal(await page.locator('.revenue-values tbody tr').count(), 7);
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 900 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `dashboard fits ${width}`);
      const violations = (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations;
      assert.deepEqual(violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) })), []);
      await page.screenshot({ path: `tmp/admin-revenue-${width}.png`, fullPage: true });
    }
    await page.locator('#events-back').click(); await card.waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: 'tmp/admin-flyer-mobile.png', fullPage: true });
    console.log('Admin flyer, weekly revenue, chart, public link and responsive/accessibility checks passed.');
  } finally {
    await browser.close(); await db.collection('ticketingOrders').doc(oid).delete();
    await db.recursiveDelete(db.collection('ticketingEvents').doc(eid));
    await db.collection('publishedEvents').doc(eid).delete(); await db.collection('eventSlugs').doc(`revenue-${eid}`).delete();
    await db.collection('events').doc(eid).delete();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
