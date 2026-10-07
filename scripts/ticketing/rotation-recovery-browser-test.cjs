const assert = require('node:assert/strict');
const { randomUUID, randomBytes } = require('node:crypto');
const { readFile } = require('node:fs/promises');
const { resolve } = require('node:path');
const { createRequire } = require('node:module');
const { chromium } = require('playwright');
const backend = createRequire(resolve(__dirname, '../../functions/package.json'));
const { fixture } = require('../../functions/test/ticketing-fixture.cjs');
process.env.GCLOUD_PROJECT = 'demo-pluto-ticketing'; process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8185';
backend('firebase-admin/app').initializeApp({ projectId: 'demo-pluto-ticketing' });
const db = backend('firebase-admin/firestore').getFirestore(), base = 'http://127.0.0.1:4173';
async function api(page, path, data) {
  return page.evaluate(async ({ path, data }) => {
    const { getAuth } = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js');
    const token = await getAuth().currentUser?.getIdToken();
    const response = await fetch(`/tickets/api/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(data) });
    const result = await response.json(); if (!response.ok) throw new Error(result.error); return result;
  }, { path, data });
}
async function queue(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const open = indexedDB.open('pluto-admission', 1); open.onerror = () => reject(open.error);
    open.onsuccess = () => { const db = open.result, request = db.transaction('queue').objectStore('queue').getAll(); request.onsuccess = () => { resolve(request.result); db.close(); }; request.onerror = () => reject(request.error); };
  }));
}
(async () => {
  const browser = await chromium.launch(); let page;
  try {
    const adminContext = await browser.newContext({ ignoreHTTPSErrors: true }), admin = await adminContext.newPage();
    await admin.goto(`${base}/tickets/admin`); await admin.locator('#preview-staff-sign-in').click(); await admin.locator('#staff-controls:not([hidden])').waitFor();
    const eventId = randomUUID(), draft = fixture(true); draft.slug += `-${eventId}`;
    await api(admin, 'staff/save', { eventId, draft, revision: 0 }); await api(admin, 'staff/publish', { eventId, action: 'publish', revision: 1 });
    const accessKey = randomBytes(32).toString('hex'), order = await api(admin, 'staff/cash', { eventId, accessKey, items: [{ offerId: 'weekend', quantity: 1 }], name: 'Recovery attendee', email: 'rotation@preview.invalid', comp: true, reason: 'Rotation recovery test' });
    const ticket = (await api(admin, 'order', { orderId: order.orderId, accessKey })).tickets[0];
    const pin = await api(admin, 'staff/scanner-pins/create', { eventId, label: 'Emergency recovery door' });
    const context = await browser.newContext({ ignoreHTTPSErrors: true }); page = await context.newPage();
    await page.goto(`${base}/tickets/staff`); await page.locator('#scanner-pin').fill(pin.pin); await page.getByRole('button', { name: 'Start scanning', exact: true }).click(); await page.locator('#scanner-session:not([hidden])').waitFor();
    await page.locator('#admission-sync').click(); await page.locator('#ticketing-message').filter({ hasText: 'prepared for offline use' }).waitFor();
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await context.setOffline(true); await page.locator('[name=qr]').fill(ticket.qr); await page.locator('#admission-form button').click();
    await page.locator('#admission-results > article').filter({ hasText: 'Offline: queued' }).waitFor();
    assert.equal((await queue(page)).length, 1);
    await context.setOffline(false);
    // The backend tests verify actual revocation. This exercises its HTTP error contract and device recovery.
    await context.route('**/tickets/api/staff/scan', route => route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'Invalid ticket. Its signing key is no longer accepted.', code: 'ticket-key-unavailable' }) }));
    await page.locator('#admission-sync').click(); await page.locator('#ticketing-message').filter({ hasText: '1 previous scan is retained' }).waitFor();
    const retained = await queue(page); assert.equal(retained.length, 1); assert.equal(retained[0].keyRotationBlocked, true); assert.equal(retained[0].qr, ticket.qr);
    await page.reload(); await page.locator('#scanner-session:not([hidden])').waitFor();
    await page.locator('[name=qr]').fill(ticket.qr); await page.locator('#admission-form button').click(); await page.locator('#ticketing-message').filter({ hasText: 'unresolved offline admission' }).waitFor();
    assert.equal((await db.collection('ticketingTickets').doc(ticket.id).get()).data().admission, null);
    const reportDownload = page.waitForEvent('download'); await page.locator('#admission-export').click();
    const report = JSON.parse(await readFile(await (await reportDownload).path(), 'utf8'));
    assert.equal(report.eventId, eventId); assert.equal(report.records[0].qr, ticket.qr); assert.equal(report.records[0].keyRotationBlocked, true);
    assert.equal(report.records[0].orderId, order.orderId);
    assert.equal(await page.locator('#admission-archive-reviewed').isVisible(), false, 'PIN staff cannot archive organizer reviews');
    await context.unroute('**/tickets/api/staff/scan');
    await page.getByRole('button', { name: 'End scanner session' }).click(); await page.locator('#scanner-login:not([hidden])').waitFor();
    await page.locator('#preview-staff-sign-in').click(); await page.locator('#staff-controls:not([hidden])').waitFor(); await page.locator('#staff-event').selectOption(eventId);
    await page.locator('#admission-sync').click(); await page.locator('#admission-archive-reviewed:not([hidden])').waitFor();
    await page.locator('#admission-archive-reviewed').click();
    await page.getByRole('button', { name: 'Review order', exact: true }).click(); await page.locator('#ticketing-dialog').getByText('Recovery attendee', { exact: true }).first().waitFor();
    await page.locator('#ticketing-dialog-close').click(); await page.locator('#admission-archive-reviewed').click();
    await page.locator('#archive-offline-form [name=note]').fill('Organizer verified no admission in the order dashboard; rejected this retained record.');
    await context.route('**/tickets/api/staff/offline-conflicts', route => route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: 'Manager access was revoked.' }) }));
    await page.locator('#archive-offline-form button').click(); await page.locator('#ticketing-message').filter({ hasText: 'Manager access was revoked' }).waitFor();
    assert.equal((await queue(page)).length, 1, 'failed current manager authorization cannot discard retained evidence');
    await context.unroute('**/tickets/api/staff/offline-conflicts');
    await page.locator('#archive-offline-form button').click(); await page.locator('#ticketing-message').filter({ hasText: 'records archived' }).waitFor();
    assert.equal((await queue(page)).length, 0); assert.equal((await db.collection('ticketingTickets').doc(ticket.id).get()).data().admission, null, 'archiving a device record never grants admission');
    const archivedDownload = page.waitForEvent('download'); await page.locator('#admission-export').click();
    const archived = JSON.parse(await readFile(await (await archivedDownload).path(), 'utf8'));
    assert.equal(archived.records[0].reviewedBy, 'ticketing-preview-admin'); assert.ok(archived.records[0].note);
    await page.locator('[name=qr]').fill(ticket.qr); await page.locator('#admission-form button').click(); await page.locator('#admission-results > article').filter({ hasText: 'ACCEPTED' }).waitFor();
    assert.ok((await db.collection('ticketingTickets').doc(ticket.id).get()).data().admission, 'a fresh authorized scan works after organizer review clears the device hold');
    console.log('Rotation recovery browser passed: refreshed keys, retained/exported blocked queue, duplicate guard, fresh manager authorization and local review without admission.');
  } catch (error) { if (page) await page.screenshot({ path: 'tmp/rotation-recovery-failure.png', fullPage: true }).catch(() => {}); throw error; }
  finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
