const assert = require('node:assert/strict');
const { randomUUID, randomBytes } = require('node:crypto');
const { resolve } = require('node:path');
const { createRequire } = require('node:module');
const { chromium } = require('playwright');
const { default: AxeBuilder } = require('@axe-core/playwright');
const backend = createRequire(resolve(__dirname, '../../functions/package.json'));
process.env.GCLOUD_PROJECT = 'demo-pluto-ticketing';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8185';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9095';
backend('firebase-admin/app').initializeApp({ projectId: 'demo-pluto-ticketing' });
const db = backend('firebase-admin/firestore').getFirestore();
const { fixture } = require('../../functions/test/ticketing-fixture.cjs');
const base = 'http://127.0.0.1:4173';
let page, stage = 'admin';
async function api(admin, path, data = {}) {
  return admin.evaluate(async ({ path, data }) => {
    const { getAuth } = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js');
    const token = await getAuth().currentUser?.getIdToken();
    const response = await fetch(`/tickets/api/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(data) });
    const body = await response.json(); if (!response.ok) throw new Error(body.error); return body;
  }, { path, data });
}
async function surface(target, name) {
  await target.evaluate(async () => { await document.fonts.ready; await Promise.all(document.getAnimations().filter(a => a.effect?.getComputedTiming().endTime !== Infinity).map(a => a.finished.catch(() => {}))); });
  assert.ok(await target.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name} fits viewport`);
  const result = await new AxeBuilder({ page: target }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  assert.deepEqual(result.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) })), [], `${name} accessibility`);
  await target.screenshot({ path: `tmp/ticketing-${name}.png`, fullPage: true });
}
async function scan(target, qr, expected) {
  await target.locator('[name=qr]').fill(qr);
  // Scanner deliberately suppresses camera/manual duplicate submissions for 1.8 seconds.
  await target.waitForTimeout(1900);
  await target.locator('#admission-form button').click();
  await target.locator('#admission-results > article').first().filter({ hasText: expected }).waitFor();
}
(async () => {
  const browser = await chromium.launch();
  try {
    const adminContext = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
    const admin = await adminContext.newPage(); page = admin;
    await admin.goto(`${base}/tickets/admin`); await admin.locator('#preview-staff-sign-in').click(); await admin.locator('#staff-controls:not([hidden])').waitFor();
    const eventId = randomUUID(), draft = fixture(true); draft.slug += `-${eventId}`; draft.title = 'Scanner PIN rehearsal';
    await api(admin, 'staff/save', { eventId, draft, revision: 0 }); await api(admin, 'staff/publish', { eventId, action: 'publish', revision: 1 });
    const accessKey = randomBytes(32).toString('hex');
    const order = await api(admin, 'staff/cash', { eventId, accessKey, items: [{ offerId: 'weekend', quantity: 3 }], name: 'PIN test guest', email: 'pin-door@preview.invalid', comp: true, reason: 'Scanner PIN browser test' });
    const tickets = (await api(admin, 'order', { orderId: order.orderId, accessKey })).tickets;
    await admin.goto(`${base}/tickets/admin?event=${eventId}`);
    stage = 'guest list editing';
    await admin.locator('#event-guestlist [name=names]').fill('Guest Alex\nGuest Blair\nRemoved Offline Guest');
    await admin.locator('#event-guestlist [name=note]').fill('Friends of the artists');
    await admin.locator('#event-guestlist').getByRole('button', { name: 'Add guests', exact: true }).click();
    await admin.locator('#event-guestlist .guest-list-count').filter({ hasText: '3 guests' }).waitFor();
    await admin.getByRole('button', { name: 'Edit guest: Guest Alex', exact: true }).click();
    await admin.locator('#guest-edit-form [name=name]').fill('Guest Alex Updated'); await admin.locator('#guest-edit-form [name=note]').fill('Artist guest');
    await admin.getByRole('button', { name: 'Save guest', exact: true }).click(); await admin.locator('#event-guestlist').getByText('Guest Alex Updated', { exact: true }).waitFor();
    await surface(admin, 'guestlist-admin-desktop'); await admin.setViewportSize({ width: 390, height: 844 }); await surface(admin, 'guestlist-admin-mobile'); await admin.setViewportSize({ width: 1280, height: 900 });
    await admin.reload(); await admin.locator('#event-guestlist').getByText('Guest Alex Updated', { exact: true }).waitFor();
    const guestRecords = (await db.collection('ticketingEvents').doc(eventId).collection('guests').get()).docs;
    const guestId = name => guestRecords.find(d => d.data().name === name).id;
    await admin.locator('#event-scanner-pins').click();
    await admin.locator('#scanner-pin-create [name=label]').fill('Sam · Main door');
    await admin.getByRole('button', { name: 'Generate scanner PIN' }).click(); await admin.locator('#new-scanner-pin').waitFor();
    const pin = (await admin.locator('#new-scanner-pin').inputValue()).replaceAll(' ', ''); assert.match(pin, /^\d{8}$/);
    await admin.getByRole('button', { name: 'Copy PIN', exact: true }).click();
    assert.equal(await admin.evaluate(() => navigator.clipboard.readText()), pin);
    await admin.getByRole('button', { name: 'Copy text message' }).click();
    const instructions = await admin.evaluate(() => navigator.clipboard.readText()); assert.ok(instructions.includes('/tickets/staff') && instructions.includes('No account needed'));
    await surface(admin, 'scanner-pin-admin-desktop'); await admin.setViewportSize({ width: 390, height: 844 }); await surface(admin, 'scanner-pin-admin-mobile');
    await admin.locator('#ticketing-dialog-close').click(); await admin.locator('#event-scanner-pins').click();
    assert.equal(await admin.locator('#new-scanner-pin').count(), 0, 'PIN is shown once');
    await admin.locator('#scanner-pin-list').filter({ hasText: 'Sam · Main door' }).waitFor();
    stage = 'account-free login';
    const doorContext = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 900 } });
    // Door access must work even if Firebase account sign-in cannot load.
    await doorContext.route('https://www.gstatic.com/firebasejs/**', route => route.abort());
    const door = await doorContext.newPage(); page = door;
    door.on('request', request => { if (['/staff/scan', '/staff/guestlist', '/staff/guestlist/arrive'].some(path => request.url().endsWith(path))) assert.equal(request.headers().authorization, undefined, 'PIN admission never requires a Firebase account'); });
    await door.goto(`${base}/tickets/staff`); await surface(door, 'scanner-pin-login-desktop');
    await door.setViewportSize({ width: 390, height: 844 }); await surface(door, 'scanner-pin-login-mobile');
    await door.locator('#scanner-pin').fill('invalid'); await door.locator('#scanner-login-form').evaluate(f => { f.noValidate = true; });
    await door.getByRole('button', { name: 'Start scanning', exact: true }).click(); await door.locator('#ticketing-message').filter({ hasText: 'valid 8-digit' }).waitFor();
    await door.locator('#scanner-pin').fill(`${pin.slice(0, 4)} ${pin.slice(4)}`); await door.getByRole('button', { name: 'Start scanning', exact: true }).click();
    await door.locator('#scanner-session:not([hidden])').waitFor();
    assert.equal(await door.locator('#staff-event').inputValue(), eventId); assert.ok(await door.locator('#staff-event').isDisabled());
    assert.equal(await door.locator('#ticketing-auth').isVisible(), false); await surface(door, 'scanner-pin-scanning-mobile');
    const doorGuests = door.locator('#door-guestlist');
    await doorGuests.getByRole('searchbox', { name: 'Search guests' }).fill('Alex');
    assert.equal(await doorGuests.locator('.guest-row').count(), 1);
    await doorGuests.getByRole('button', { name: 'Mark arrived: Guest Alex Updated', exact: true }).click();
    await doorGuests.locator('.guest-list-count').filter({ hasText: '1 arrived' }).waitFor();
    assert.ok((await db.collection('ticketingEvents').doc(eventId).collection('guests').doc(guestId('Guest Alex Updated')).get()).data().arrival);
    await doorGuests.getByRole('searchbox', { name: 'Search guests' }).fill('');
    assert.ok(await doorGuests.getByRole('button', { name: 'Arrived: Guest Alex Updated', exact: true }).isDisabled());
    await admin.locator('#ticketing-dialog-close').click(); await admin.locator('#event-guestlist').getByRole('button', { name: 'Refresh guest list' }).click();
    await admin.locator('#event-guestlist .guest-list-count').filter({ hasText: '1 arrived' }).waitFor(); await admin.locator('#event-scanner-pins').click();
    assert.ok(!(await door.evaluate(() => localStorage.getItem('pluto-scanner-session'))).includes(pin), 'only high-entropy session proof is persisted');
    await scan(door, tickets[0].qr, 'ACCEPTED'); await scan(door, tickets[0].qr, 'DUPLICATE');
    await door.reload(); await door.locator('#scanner-session:not([hidden])').waitFor();
    await door.setViewportSize({ width: 1280, height: 900 }); await surface(door, 'scanner-pin-scanning-desktop');
    stage = 'PIN offline admission';
    await door.locator('#admission-sync').click(); await door.locator('#ticketing-message').filter({ hasText: 'prepared for offline use' }).waitFor();
    await door.evaluate(async () => { await navigator.serviceWorker.ready; }); await door.reload(); await door.locator('#scanner-session:not([hidden])').waitFor();
    await doorContext.setOffline(true); await door.reload(); await door.locator('#staff-controls:not([hidden])').waitFor();
    await scan(door, tickets[1].qr, 'Offline: queued');
    await doorGuests.getByRole('button', { name: 'Mark arrived: Guest Blair', exact: true }).click();
    await doorGuests.locator('.guest-row').filter({ hasText: 'Guest Blair' }).filter({ hasText: 'Awaiting sync' }).waitFor();
    await api(admin, 'staff/guestlist/remove', { eventId, guestId: guestId('Removed Offline Guest'), version: 1 });
    await doorGuests.getByRole('button', { name: 'Mark arrived: Removed Offline Guest', exact: true }).click();
    await doorGuests.locator('.guest-row').filter({ hasText: 'Removed Offline Guest' }).filter({ hasText: 'Awaiting sync' }).waitFor();
    await door.reload(); await door.locator('#staff-controls:not([hidden])').waitFor(); await scan(door, tickets[1].qr, 'DUPLICATE');
    assert.ok(await doorGuests.getByRole('button', { name: 'Arrived: Guest Blair', exact: true }).isDisabled(), 'offline guest arrival survives reload');
    await doorContext.setOffline(false); await door.locator('#admission-replay').click(); await door.locator('#ticketing-message').filter({ hasText: 'Synced 2 admissions' }).waitFor();
    await door.locator('#admission-conflicts').filter({ hasText: 'Guest: Removed Offline Guest' }).waitFor();
    await door.locator('[data-conflict-note]').fill('Removed guest checked against organizer list.'); await door.locator('[data-review-conflict]').click(); await door.locator('#admission-conflicts').filter({ hasText: 'Reviewed' }).waitFor();
    assert.ok((await db.collection('ticketingEvents').doc(eventId).collection('guests').doc(guestId('Guest Blair')).get()).data().arrival.offline);
    await doorGuests.locator('.guest-list-count').filter({ hasText: '2 guests · 2 arrived' }).waitFor();
    const admitted = (await db.collection('ticketingTickets').doc(tickets[1].id).get()).data().admission;
    assert.ok(admitted.offline && admitted.scannerLabel === 'Sam · Main door');
    stage = 'PIN sign-out and revocation';
    const priorToken = await door.evaluate(() => JSON.parse(localStorage.getItem('pluto-scanner-session')).token);
    await door.getByRole('button', { name: 'End scanner session' }).click(); await door.locator('#scanner-login:not([hidden])').waitFor();
    const check = await door.evaluate(async token => (await fetch('/tickets/api/scanner/session', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Pluto-Scanner': token }, body: '{}' })).status, priorToken);
    assert.equal(check, 401, 'sign-out revokes server session');
    await door.locator('#scanner-pin').fill(pin); await door.getByRole('button', { name: 'Start scanning', exact: true }).click(); await door.locator('#scanner-session:not([hidden])').waitFor();
    await admin.getByRole('button', { name: 'Revoke PIN for Sam · Main door' }).click(); await admin.locator('#scanner-pin-list').filter({ hasText: 'Revoked' }).waitFor();
    await door.waitForTimeout(1900);
    await door.locator('[name=qr]').fill(tickets[2].qr); await door.locator('#admission-form button').click();
    await door.locator('#scanner-login:not([hidden])').waitFor(); await door.locator('#ticketing-message').filter({ hasText: 'revoked' }).waitFor();
    assert.equal((await db.collection('ticketingTickets').doc(tickets[2].id).get()).data().admission, null, 'a revoked PIN cannot downgrade to offline scanning');
    assert.equal(await door.evaluate(() => localStorage.getItem('pluto-scanner-session')), null);
    stage = 'offline lease expiration';
    const leasePin = await api(admin, 'staff/scanner-pins/create', { eventId, label: 'Lease test' });
    await door.locator('#scanner-pin').fill(leasePin.pin); await door.getByRole('button', { name: 'Start scanning', exact: true }).click(); await door.locator('#scanner-session:not([hidden])').waitFor();
    await door.locator('#admission-sync').click(); await door.locator('#ticketing-message').filter({ hasText: 'prepared for offline use' }).waitFor();
    await door.evaluate(eventId => new Promise((resolve, reject) => {
      const request = indexedDB.open('pluto-admission', 1);
      request.onsuccess = () => { const db = request.result, tx = db.transaction('state', 'readwrite'), store = tx.objectStore('state'), manifest = store.get(`manifest-${eventId}`);
        manifest.onsuccess = () => store.put({ ...manifest.result, offlineUntil: Date.now() - 1 }, `manifest-${eventId}`);
        tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error); };
    }), eventId);
    await doorContext.setOffline(true); await door.reload(); await door.locator('#scanner-login:not([hidden])').waitFor();
    assert.equal(await door.locator('#staff-controls').isVisible(), false, 'expired offline leases cannot open the scanner');
    await doorContext.setOffline(false);
    console.log('Scanner PIN and guest-list browser checks passed: admin PIN/guest editing and bulk add, guest search/arrival/reload, account-free event-scoped admission, offline ticket/guest reload/replay/removed-guest review, lease expiry, revocation and desktop/mobile accessibility.');
    await adminContext.close(); await doorContext.close();
  } catch (error) {
    console.error('Scanner browser phase:', stage);
    if (page) { await page.screenshot({ path: 'tmp/ticketing-scanner-failure.png', fullPage: true }).catch(() => {}); console.error((await page.locator('body').innerText()).slice(0, 1800)); }
    throw error;
  } finally { await browser.close(); }
})().then(() => process.exit(0), error => { console.error(error); process.exit(1); });
