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
const db = getFirestore(), eid = randomUUID(), oid = randomUUID(), extra = [];
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
    await card.filter({ hasText: '$4,700' }).waitFor();
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
    // Pagination must not change full-event totals or truncate exports.
    const batch = db.batch(), at = Date.now();
    for (let i = 0; i < 60; i++) {
      const id = randomUUID(); extra.push(id);
      batch.set(db.collection('ticketingOrders').doc(id), { eventId: eid, eventTitle: draft.title, name: i === 59 ? 'Older page buyer' : 'Page buyer ' + i, email: 'page-' + i + '@example.test', status: 'paid', method: 'cash', total: 1000, units: [], createdAt: at - 1000 - i, paidAt: at, taxAmount: 0 });
    }
    await batch.commit();
    await card.click();
    await page.locator('#event-order-count').filter({ hasText: '50 orders shown.' }).waitFor();
    assert.equal(await page.locator('#order-rows [data-open-order]').count(), 50);
    await page.locator('#event-order-more').click();
    await page.locator('#event-order-count').filter({ hasText: '61 orders shown. End of results.' }).waitFor();
    assert.equal(await page.locator('#order-rows [data-open-order]').count(), 61);
    await page.locator('#order-filter').fill('Older page buyer');
    await page.locator('#event-order-count').filter({ hasText: '1 orders shown. End of results.' }).waitFor();
    assert.match(await page.locator('#order-rows').innerText(), /Older page buyer/);
    const download = page.waitForEvent('download'); await page.locator('#order-export').click();
    const file = await download; await file.saveAs('tmp/paginated-orders-export.csv');
    const csv = require('node:fs').readFileSync('tmp/paginated-orders-export.csv', 'utf8');
    assert.equal(csv.trim().split('\r\n').length, 62, 'CSV includes all 61 orders, even when search shows one');
    await page.locator('#order-filter').fill('');
    for (let attempt = 0; attempt < 120; attempt++) {
      const summary = (await db.collection('ticketingFinancialSummaries').doc(eid).get()).data();
      if (summary?.ready && summary.totals.gross === 530000) break;
      if (attempt === 119) throw new Error('Financial projection did not catch up');
      await new Promise(done => setTimeout(done, 250));
    }
    await page.locator('#performance-refresh').click();
    await page.locator('.revenue-heading').filter({ hasText: '$5,300' }).waitFor();
    assert.equal((await api(page, 'staff/performance', { eventId: eid })).summary.paidOrders, 61);
    const rsvpBatch = db.batch();
    for (let i = 0; i < 55; i++) {
      const id = randomUUID(); extra.push(id);
      rsvpBatch.set(db.collection('ticketingOrders').doc(id), { eventId: eid, eventTitle: draft.title, name: 'RSVP page guest ' + i, email: 'rsvp-' + i + '@example.test', status: 'pending-approval', method: 'rsvp', rsvpStatus: 'pending', total: 0, units: [], createdAt: at - i });
    }
    await rsvpBatch.commit();
    for (let attempt = 0; attempt < 120; attempt++) {
      if ((await db.collection('ticketingFinancialSummaries').doc(eid).get()).data()?.totals.rsvpPending === 55) break;
      if (attempt === 119) throw new Error('RSVP summary did not catch up');
      await new Promise(done => setTimeout(done, 250));
    }
    await page.locator('#performance-refresh').click();
    await page.locator('.rsvp-page-count').filter({ hasText: '50 RSVPs shown.' }).waitFor();
    await page.locator('.rsvp-more').click();
    await page.locator('.rsvp-page-count').filter({ hasText: '55 RSVPs shown. End of results.' }).waitFor();
    assert.equal(await page.locator('#event-rsvps .guest-row').count(), 55);
    console.log('Admin revenue, pagination beyond 50 orders/RSVPs, cross-page search, full CSV, flyer and accessibility checks passed.');
  } finally {
    await browser.close(); await db.collection('ticketingOrders').doc(oid).delete(); await Promise.all(extra.map(id => db.collection('ticketingOrders').doc(id).delete()));
    await db.recursiveDelete(db.collection('ticketingEvents').doc(eid));
    await db.collection('publishedEvents').doc(eid).delete(); await db.collection('eventSlugs').doc(`revenue-${eid}`).delete();
    await db.collection('events').doc(eid).delete();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
