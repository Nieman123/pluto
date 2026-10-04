const assert = require('node:assert/strict');
const { randomUUID, randomBytes } = require('node:crypto');
const { chromium } = require('playwright');
const { default: AxeBuilder } = require('@axe-core/playwright');
const { fixture } = require('../../functions/test/ticketing-fixture.cjs');
const backend = require('node:module').createRequire(require('node:path').resolve(__dirname, '../../functions/package.json'));
const { initializeApp } = backend('firebase-admin/app');
const { getFirestore } = backend('firebase-admin/firestore');
const { getAuth } = backend('firebase-admin/auth');
process.env.GCLOUD_PROJECT = 'demo-pluto-ticketing';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8185';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9095';
initializeApp({ projectId: process.env.GCLOUD_PROJECT });
const db = getFirestore(), prefix = `order-browser-${randomUUID()}`, eids = [], oids = [], manager = `${prefix}-manager`;
async function api(page, path, data) {
  return page.evaluate(async ({ path, data }) => {
    const { getAuth } = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js');
    const token = await getAuth().currentUser.getIdToken();
    const response = await fetch(`/tickets/api/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(data) });
    const result = await response.json(); if (!response.ok) throw new Error(result.error); return result;
  }, { path, data });
}
async function settled(page) {
  await page.evaluate(async () => { await document.fonts.ready; await Promise.all(document.getAnimations().filter(a => a.effect?.getComputedTiming().iterations !== Infinity).map(a => a.finished.catch(() => {}))); });
}
async function accessible(page, screenshot) {
  if (!await page.locator('#ticketing-dialog').evaluate(node => node.open)) await page.evaluate(() => scrollTo(0, 0));
  await settled(page);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'page fits viewport');
  const violations = (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations;
  assert.deepEqual(violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) })), []);
  await page.screenshot({ path: `tmp/${screenshot}.png`, fullPage: !await page.locator('#ticketing-dialog').evaluate(node => node.open) });
}
(async () => {
  const browser = await chromium.launch(), context = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true }), page = await context.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto('http://127.0.0.1:4173/tickets/admin');
    await page.getByRole('button', { name: 'Local preview staff sign-in' }).click();
    await page.locator('#staff-controls:not([hidden])').waitFor();
    for (const name of ['Shared arrivals', 'Second event']) {
      const eid = randomUUID(), draft = fixture(true); eids.push(eid); draft.title = `${name} · ${prefix.slice(-8)}`; draft.slug = `${prefix}-${eids.length}`;
      await api(page, 'staff/save', { eventId: eid, draft, revision: 0 });
      await api(page, 'staff/publish', { eventId: eid, revision: 1, action: 'publish' });
    }
    for (const [index, eid] of [eids[0], eids[1], eids[1]].entries()) {
      const quantity = index === 0 ? 2 : 1, comp = index === 1;
      const result = await api(page, 'staff/cash', { eventId: eid, accessKey: randomBytes(32).toString('hex'), name: `Shared buyer ${index + 1}`, email: `${prefix}-${index}@example.test`, items: [{ offerId: 'weekend', quantity }], comp, reason: comp ? 'Local browser test' : '', cashReceived: comp ? 0 : quantity * 10000 });
      oids.push(result.orderId);
    }
    await page.reload();
    await page.locator(`[data-open-event="${eids[0]}"]`).click();
    await page.locator('#event-order-list').getByRole('heading', { name: 'Orders', exact: true }).waitFor();
    assert.equal(await page.locator('#order-rows [data-open-order]').count(), 1, 'event dashboard lists only its own orders');
    await page.locator(`[data-open-order="${oids[0]}"]`).click();
    const modal = page.locator('#ticketing-dialog');
    await modal.getByRole('heading', { name: 'Individual tickets' }).waitFor();
    assert.equal(await modal.locator('[data-order-ticket]').count(), 2);
    assert.match(await modal.innerText(), /Buyer & order[\s\S]*Payment & refunds[\s\S]*\$200\.00/);
    await modal.getByRole('button', { name: 'Check in ticket 1: Weekend', exact: true }).click();
    await modal.locator('[data-order-notice]').filter({ hasText: 'Ticket checked in.' }).waitFor();
    const detail = await api(page, 'staff/order', { orderId: oids[0] });
    assert.ok(detail.tickets[0].admission); assert.equal(detail.tickets[1].admission, null);
    assert.equal(await modal.locator('[data-check-in]').count(), 1);
    await accessible(page, 'order-details-desktop');
    await page.setViewportSize({ width: 390, height: 900 }); await accessible(page, 'order-details-mobile');
    await modal.locator('#ticketing-dialog-close').click();
    await page.reload(); await page.locator(`[data-open-order="${oids[0]}"]`).click();
    await modal.getByText('✓ Checked in', { exact: true }).waitFor();
    assert.equal(await modal.locator('[data-check-in]').count(), 1, 'arrival persists across reload');
    await modal.locator('#ticketing-dialog-close').click();
    await page.locator('#events-back').click(); await page.locator('#events-index:not([hidden])').waitFor();
    // Exercise the real endpoint's cursor behavior with small pages.
    await page.route('**/tickets/api/staff/all-orders', async route => { const body = route.request().postDataJSON(); await route.continue({ postData: JSON.stringify({ ...body, limit: 2 }) }); });
    await page.locator('#orders-all').click(); await page.locator('#all-order-count').filter({ hasText: 'orders shown' }).waitFor();
    assert.match(page.url(), /view=orders/);
    const form = page.locator('#all-order-filters'); await form.locator('[name="search"]').fill(prefix);
    await form.getByRole('button', { name: 'Apply filters' }).click();
    await page.locator('#all-order-count').filter({ hasText: '2 orders shown.' }).waitFor();
    await page.locator('#all-order-more').click();
    await page.locator('#all-order-count').filter({ hasText: '3 orders shown.' }).waitFor();
    assert.equal(await page.locator('#all-order-rows [data-open-order]').count(), 3);
    assert.match(await page.locator('#all-order-rows').innerText(), /Shared arrivals/);
    assert.match(await page.locator('#all-order-rows').innerText(), /Second event/);
    await accessible(page, 'all-orders-mobile');
    await page.setViewportSize({ width: 1280, height: 900 }); await accessible(page, 'all-orders-desktop');
    await form.locator('[name="eventId"]').selectOption(eids[0]); await form.locator('[name="status"]').selectOption('paid');
    await form.getByRole('button', { name: 'Apply filters' }).click();
    await page.locator('#all-order-count').filter({ hasText: '1 order shown.' }).waitFor();
    assert.equal(await page.locator('#all-order-rows [data-open-order]').count(), 1);
    await page.locator(`[data-open-order="${oids[0]}"]`).click();
    await modal.getByRole('heading', { name: 'Individual tickets' }).waitFor();
    await modal.getByRole('button', { name: 'Check in ticket 2: Weekend', exact: true }).click();
    await modal.locator('[data-order-notice]').filter({ hasText: 'Ticket checked in.' }).waitFor();
    assert.equal((await api(page, 'staff/order', { orderId: oids[0] })).tickets.filter(t => t.admission).length, 2);
    await modal.locator('#refund-form input[name="ticket"]').first().check();
    await modal.getByRole('button', { name: 'Approve selected ticket refunds', exact: true }).click();
    await modal.getByRole('heading', { name: 'Refund history', exact: true }).waitFor();
    const refunded = await api(page, 'staff/order', { orderId: oids[0] });
    assert.equal(refunded.refundedAmount, 10000); assert.equal(refunded.tickets[0].status, 'refunded'); assert.equal(refunded.tickets[1].status, 'valid');
    assert.deepEqual(refunded.refunds[0].ticketIds, [refunded.tickets[0].id]);
    await modal.locator('#order-detail-event').click();
    await page.locator('#event-order-list').getByRole('heading', { name: 'Orders', exact: true }).waitFor();
    assert.match(page.url(), new RegExp(`event=${eids[0]}`));
    await page.goto('http://127.0.0.1:4173/tickets/admin?view=orders');
    await page.locator('#all-orders-view').getByRole('heading', { name: 'All Orders', exact: true }).waitFor();
    assert.equal(await page.locator('#event-workspace').isVisible(), false);
    await page.locator('#events-back').click(); await page.locator('#events-index:not([hidden])').waitFor();
    assert.equal(await page.locator('#events-back').isVisible(), false);
    // A scoped manager may handle assigned-event orders, but not global orders/refunds.
    const email = `${manager}@example.test`, password = 'Local-orders-test-2026!';
    await getAuth().createUser({ uid: manager, email, password, emailVerified: true });
    await api(page, 'staff/roles', { eventId: eids[0], uid: manager, roles: ['manager'] });
    await page.evaluate(async ({ email, password }) => {
      const { getAuth, signOut, signInWithEmailAndPassword } = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js');
      await signOut(getAuth()); await signInWithEmailAndPassword(getAuth(), email, password);
    }, { email, password });
    await page.reload(); await page.locator(`[data-open-event="${eids[0]}"]`).click();
    assert.equal(await page.locator('#orders-all').isVisible(), false);
    assert.equal(await page.locator(`[data-open-event="${eids[1]}"]`).count(), 0);
    await page.locator(`[data-open-order="${oids[0]}"]`).click();
    await modal.getByRole('heading', { name: 'Individual tickets' }).waitFor();
    assert.equal(await modal.locator('#refund-form').count(), 0);
    assert.deepEqual(errors, []);
    console.log('Order browser checks passed: titled per-event orders, detailed payments/tickets, split arrivals/reload, all-event filters/pagination/deep links, scoped permissions and desktop/mobile accessibility.');
  } finally {
    await browser.close();
    for (const oid of oids) {
      for (const collection of ['ticketingTickets', 'ticketingEmailJobs', 'ticketingRefunds', 'ticketingAccess']) for (const doc of (await db.collection(collection).where('orderId', '==', oid).get()).docs) await db.recursiveDelete(doc.ref);
      await db.collection('ticketingOrders').doc(oid).delete();
    }
    for (const [index, eid] of eids.entries()) {
      await db.recursiveDelete(db.collection('ticketingEvents').doc(eid)); await db.collection('publishedEvents').doc(eid).delete();
      await db.collection('eventSlugs').doc(`${prefix}-${index + 1}`).delete(); await db.collection('currentEvents').doc(`native-${eid}`).delete();
      await db.collection('ticketingStaff').doc(`${eid}_${manager}`).delete();
    }
    await getAuth().deleteUser(manager).catch(error => { if (error.code !== 'auth/user-not-found') throw error; });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
