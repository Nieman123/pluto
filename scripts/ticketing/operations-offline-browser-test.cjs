const assert = require('node:assert/strict');
const { randomUUID, randomBytes } = require('node:crypto');
const { createRequire } = require('node:module');
const { resolve } = require('node:path');
const { chromium } = require('playwright');
const { default: AxeBuilder } = require('@axe-core/playwright');
const requireFunctions = createRequire(resolve(__dirname, '../../functions/package.json'));
const { initializeApp } = requireFunctions('firebase-admin/app');
const { getFirestore } = requireFunctions('firebase-admin/firestore');
const { fixture } = require('../../functions/test/ticketing-fixture.cjs');
if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8185' || process.env.GCLOUD_PROJECT !== 'demo-pluto-ticketing') throw new Error('Isolated demo emulators required.');
initializeApp({ projectId: process.env.GCLOUD_PROJECT });
const db = getFirestore(), base = 'http://127.0.0.1:4173';
async function api(page, path, data) {
  return page.evaluate(async ({ path, data }) => {
    const { getAuth } = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js');
    const token = await getAuth().currentUser?.getIdToken();
    const res = await fetch(`/tickets/api/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(data) });
    const body = await res.json(); if (!res.ok) throw new Error(body.error); return body;
  }, { path, data });
}
async function semantics(page) { await page.locator('flt-semantics-placeholder').evaluate(e => e.click(), { timeout: 20000 }).catch(() => {}); }
(async () => {
  const browser = await chromium.launch(); let active, stage = 'setup', eid, orderId;
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const admin = await context.newPage(); active = admin;
    await admin.goto(`${base}/tickets/admin`); await admin.locator('#preview-staff-sign-in').click(); await admin.locator('#staff-controls:not([hidden])').waitFor();
    eid = randomUUID(); const draft = fixture(true); draft.slug += `-${eid}`; draft.title = 'Operations & offline rehearsal';
    await api(admin, 'staff/save', { eventId: eid, draft, revision: 0 }); await api(admin, 'staff/publish', { eventId: eid, revision: 1, action: 'publish' });
    const accessKey = randomBytes(32).toString('hex');
    ({ orderId } = await api(admin, 'staff/cash', { eventId: eid, accessKey, name: 'Browser Guest', email: 'browser-support@preview.invalid', items: [{ offerId: 'weekend', quantity: 1 }], comp: true, reason: 'Offline rehearsal', cashReceived: 0 }));
    await db.collection('ticketingEmailJobs').doc(`health_${orderId}`).set({ orderId, to: 'browser-support@preview.invalid', type: 'recovery', status: 'review', attempts: 1, createdAt: Date.now() - 3600000, lastError: 'Provider outcome requires review.' });
    stage = 'health dashboard';
    await admin.locator('#system-health').click(); await admin.getByRole('heading', { name: 'System health', exact: true }).waitFor();
    await admin.locator('[data-health-refresh]').click(); await admin.locator(`[data-health-issue="email_health_${orderId}"]`).waitFor();
    await admin.setViewportSize({ width: 390, height: 844 });
    assert.ok(await admin.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    const accessibility = await new AxeBuilder({ page: admin }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    assert.deepEqual(accessibility.violations.map(v => v.id), []);
    await admin.screenshot({ path: 'tmp/ticketing-system-health-mobile.png', fullPage: true });
    await admin.locator(`[data-health-issue="email_health_${orderId}"] [data-health-order]`).click();
    stage = 'support corrections';
    await admin.locator('[data-support-correct] [name=name]').fill('Corrected Browser Guest');
    await admin.locator('[data-support-correct] [name=email]').fill('corrected@preview.invalid');
    await admin.locator('[data-support-correct] [name=note]').fill('Customer confirmed a typo');
    await admin.locator('[data-support-correct] button').click(); await admin.getByText('Buyer details saved. Send a new access link if the email changed.', { exact: true }).waitFor();
    await admin.locator('[data-support-resend] [name=note]').fill('Customer requested access'); await admin.locator('[data-support-resend] button').click();
    await admin.getByText('New secure access email queued.', { exact: true }).waitFor();
    const job = (await db.collection('ticketingEmailJobs').where('orderId', '==', orderId).get()).docs.find(d => d.id.startsWith('support_')).data();
    const recovery = await api(admin, 'recover/accept', { token: job.token });
    await admin.locator('#ticketing-dialog-close').click();
    stage = 'offline reload';
    const guestContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await guestContext.addInitScript(({ orderId, key }) => {
      // An obsolete reference loads after the valid order in the wallet. Its
      // denial must not erase the valid order's freshly saved offline snapshot.
      localStorage.setItem(`pluto-order-${'e'.repeat(64)}`, 'f'.repeat(64));
      localStorage.setItem(`pluto-order-${orderId}`, key);
    }, { orderId, key: recovery.accessKey });
    const guest = await guestContext.newPage(); active = guest;
    await guest.goto(`${base}/app/tickets?order=${orderId}`); await semantics(guest);
    await guest.getByText('Show this code at the door', { exact: true }).waitFor({ timeout: 45000 });
    const denyOrder = route => route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: 'Use your current secure order link.' }) });
    await guest.route('**/tickets/api/order', denyOrder);
    await guest.getByRole('button', { name: 'Refresh tickets' }).click();
    await guest.getByText('Use your current secure order link.', { exact: true }).waitFor();
    assert.equal(await guest.getByText('Show this code at the door', { exact: true }).count(), 0, 'an authoritative denial must clear the QR already on screen');
    await guest.unroute('**/tickets/api/order', denyOrder);
    await guest.getByRole('button', { name: 'Refresh tickets' }).click();
    await guest.getByText('Show this code at the door', { exact: true }).waitFor();
    await guest.goto(`${base}/app/tickets`); await semantics(guest);
    await guest.getByText('Show this code at the door', { exact: true }).waitFor({ timeout: 45000 });
    await guest.getByText(/A saved order needs a new secure link/).waitFor();
    await guest.evaluate(async () => { await navigator.serviceWorker.ready; });
    await guestContext.setOffline(true); await guest.reload(); await semantics(guest);
    await guest.getByText('Saved tickets · Offline', { exact: true }).waitFor({ timeout: 45000 });
    await guest.getByText('Show this code at the door', { exact: true }).waitFor();
    await guest.screenshot({ path: 'tmp/ticketing-attendee-offline-mobile.png', fullPage: true });
    await guest.mouse.move(190, 600); await guest.mouse.wheel(0, 950); await guest.waitForTimeout(300);
    await guest.screenshot({ path: 'tmp/ticketing-attendee-offline-qr-mobile.png', fullPage: true });
    await guest.mouse.wheel(0, -2000); await guest.waitForTimeout(300);
    stage = 'refund clears saved QR';
    await guestContext.setOffline(false);
    const order = await api(admin, 'staff/order', { orderId });
    await api(admin, 'staff/refund', { orderId, ticketIds: [order.tickets[0].id], attempt: randomBytes(32).toString('hex') });
    await guest.getByRole('button', { name: 'Refresh tickets' }).click(); await guest.getByText('Status: refunded', { exact: true }).waitFor();
    assert.equal(await guest.getByText('Show this code at the door', { exact: true }).count(), 0);
    await guestContext.setOffline(true); await guest.reload(); await semantics(guest);
    await guest.getByText('Saved tickets · Offline', { exact: true }).waitFor();
    assert.equal(await guest.getByText('Show this code at the door', { exact: true }).count(), 0);
    await guestContext.close();
    console.log('Operations/offline browser checks passed: mobile health alerts, audited contact correction, new recovery access, offline app reload/QR and refund invalidation.');
  } catch (error) { console.error(`Operations/offline failure at ${stage}:`, error); await active?.screenshot({ path: 'tmp/ticketing-operations-offline-failure.png', fullPage: true }).catch(() => {}); process.exitCode = 1; }
  finally {
    if (orderId) { for (const name of ['ticketingTickets', 'ticketingEmailJobs', 'ticketingRefunds', 'ticketingRecovery', 'ticketingAccess']) for (const doc of (await db.collection(name).where('orderId', '==', orderId).get()).docs) await doc.ref.delete(); await db.collection('ticketingOrders').doc(orderId).delete(); }
    if (eid) { const event = (await db.collection('ticketingEvents').doc(eid).get()).data(); await db.recursiveDelete(db.collection('ticketingEvents').doc(eid)); await db.collection('publishedEvents').doc(eid).delete(); await db.collection('currentEvents').doc(`native-${eid}`).delete(); if (event) await db.collection('eventSlugs').doc(event.draft.slug).delete(); }
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
