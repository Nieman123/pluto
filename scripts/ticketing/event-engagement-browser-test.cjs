const assert = require('node:assert/strict');
const { randomUUID, randomBytes } = require('node:crypto');
const { createRequire } = require('node:module');
const { resolve } = require('node:path');
const { chromium } = require('playwright');
const { default: AxeBuilder } = require('@axe-core/playwright');
const backend = createRequire(resolve(__dirname, '../../functions/package.json'));
if (process.env.GCLOUD_PROJECT !== 'demo-pluto-ticketing' || process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8185') throw Error('Isolated demo emulator required.');
backend('firebase-admin/app').initializeApp({ projectId: 'demo-pluto-ticketing' });
const db = backend('firebase-admin/firestore').getFirestore(), { fixture } = require('../../functions/test/ticketing-fixture.cjs'), { hash } = require('../../functions/lib/ticketing/domain');
const base = 'http://127.0.0.1:4173', key = () => randomBytes(32).toString('hex');
async function api(page, path, data) {
  return page.evaluate(async ({ path, data }) => {
    const { getAuth } = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js');
    const { getApps } = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js');
    const token = getApps().length ? await getAuth().currentUser?.getIdToken() : null;
    const response = await fetch(`/tickets/api/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(data) });
    const body = await response.json(); if (!response.ok) throw Error(body.error); return body;
  }, { path, data });
}
async function surface(page, name) {
  await page.evaluate(async () => { await document.fonts.ready; await Promise.all(document.getAnimations().filter(a => a.effect?.getComputedTiming().endTime !== Infinity).map(a => a.finished.catch(() => {}))); });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name} fits viewport`);
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  assert.deepEqual(result.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) })), [], `${name} accessibility`);
  await page.screenshot({ path: `tmp/ticketing-${name}.png`, fullPage: true });
}
(async () => {
  const browser = await chromium.launch(); let active, stage = 'setup';
  try {
    const adminContext = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 900 } }), admin = await adminContext.newPage(); active = admin;
    await admin.goto(`${base}/tickets/admin`); await admin.locator('#preview-staff-sign-in').click(); await admin.locator('#staff-controls:not([hidden])').waitFor();
    const eid = randomUUID(), draft = fixture(true); draft.slug += `-${eid}`; draft.title = 'Waitlist and door rehearsal'; draft.registrationMode = 'rsvp-approval'; draft.waitlistEnabled = true; draft.waitlistOfferMinutes = 30;
    draft.offers = [{ ...draft.offers[0], name: 'RSVP admission', unitAmount: 0, maxPerOrder: 1 }]; draft.pools = draft.pools.filter(p => p.id !== 'vehicles').map(p => ({ ...p, capacity: 1 })); draft.promos = [];
    await api(admin, 'staff/save', { eventId: eid, draft, revision: 0 }); await api(admin, 'staff/publish', { eventId: eid, revision: 1, action: 'publish' });
    const original = await api(admin, 'rsvp', { eventId: eid, items: [{ offerId: 'weekend', quantity: 1 }], accessKey: key(), name: 'Original attendee', email: 'staff@ticketing-preview.invalid' });
    await api(admin, 'staff/rsvp/review', { eventId: eid, orderId: original.orderId, decision: 'approve', note: 'Fixture approval' });
    await admin.goto(`${base}/tickets/admin?event=${eid}`); await admin.locator('[data-field=waitlistEnabled]').waitFor({ state: 'attached' }); await admin.locator('.ticket-settings-group').filter({ hasText: 'Reminders & waitlist' }).locator('summary').click(); assert.equal(await admin.locator('[data-field=waitlistEnabled]').isChecked(), true);
    await admin.locator('[data-field=remindersEnabled]').uncheck(); await admin.getByRole('button', { name: 'Save ticketing settings', exact: true }).first().click(); await admin.locator('#ticketing-message').filter({ hasText: 'Ticketing settings saved' }).waitFor();
    await admin.getByRole('button', { name: 'Publish ticketing changes', exact: true }).click(); await admin.locator('#ticketing-message').filter({ hasText: 'Event published' }).waitFor(); assert.equal((await db.collection('publishedEvents').doc(eid).get()).data().remindersEnabled, false);
    stage = 'mobile calendar and join';
    const guestContext = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 844 } }), guest = await guestContext.newPage(); active = guest;
    await guest.goto(`${base}/events/${draft.slug}`); await guest.getByRole('button', { name: 'Join RSVP admission waitlist', exact: true }).waitFor();
    const calendar = await guest.request.get(`${base}/events/${draft.slug}/calendar.ics`), ics = await calendar.text(); assert.equal(calendar.status(), 200); assert.match(ics, /BEGIN:VCALENDAR/); assert.ok(!ics.includes(draft.address)); assert.ok(!ics.includes(draft.venueName));
    assert.ok((await guest.getByRole('link', { name: 'Google Calendar ↗', exact: true }).getAttribute('href')).includes('ctz=America%2FNew_York'));
    await surface(guest, 'engagement-sold-out-mobile');
    await guest.getByRole('button', { name: 'Join RSVP admission waitlist', exact: true }).click(); await guest.locator('[data-waitlist-join] [name=name]').fill('Waitlist Guest'); await guest.locator('[data-waitlist-join] [name=email]').fill('waitlist-browser@preview.invalid');
    const verifying = guest.waitForResponse(r => r.url().endsWith('/tickets/api/waitlist/verification')); await guest.locator('[data-waitlist-join] button').click(); const verification = await (await verifying).json();
    await surface(guest, 'engagement-waitlist-verification-mobile');
    const code = (await db.collection('ticketingEmailJobs').doc(`verify_${hash(verification.verificationToken)}`).get()).data().code; await guest.locator('[data-waitlist-join] [name=code]').fill(code);
    const reload = guest.waitForEvent('domcontentloaded'); await guest.getByRole('button', { name: 'Verify & join waitlist', exact: true }).click(); await reload; await guest.locator('#event-waitlist-status').filter({ hasText: 'waiting' }).waitFor();
    assert.equal(await guest.getByRole('button', { name: 'Claim reserved spot', exact: true }).count(), 0);
    stage = 'manager waitlist approval'; active = admin;
    await api(admin, 'staff/rsvp/withdraw', { eventId: eid, orderId: original.orderId });
    await admin.locator('#event-waitlist').click(); await admin.locator('[data-waitlist-approve]').waitFor(); await admin.locator('[data-waitlist-approve] [name=note]').fill('Approved guest');
    const approved = admin.waitForResponse(r => r.url().endsWith('/tickets/api/staff/waitlist/approve'));
    await admin.getByRole('button', { name: 'Approve for next available spot', exact: true }).click(); assert.equal((await approved).status(), 200);
    await admin.locator('#ticketing-dialog-content .order-activity').filter({ hasText: '· offered ·' }).waitFor();
    await surface(admin, 'engagement-waitlist-admin'); await admin.locator('#ticketing-dialog-close').click();
    const entry = (await db.collection('ticketingWaitlist').where('eventId', '==', eid).get()).docs[0], offer = (await db.collection('ticketingEmailJobs').where('entryId', '==', entry.id).get()).docs.find(d => d.data().type === 'waitlist-offer').data();
    stage = 'claim into approved app ticket'; active = guest;
    await guest.goto(`${base}/events/${draft.slug}#waitlist=${offer.token}`); await guest.getByRole('button', { name: 'Claim reserved spot', exact: true }).waitFor(); assert.equal(new URL(guest.url()).hash, '');
    const claimed = guest.waitForURL('**/app/tickets?order=*'); await guest.getByRole('button', { name: 'Claim reserved spot', exact: true }).click(); await claimed;
    const orderId = new URL(guest.url()).searchParams.get('order'); await guest.locator('flt-semantics-placeholder').evaluate(e => e.click(), { timeout: 20000 }).catch(() => {}); await guest.getByText('Show this code at the door', { exact: true }).waitFor({ timeout: 30000 }); await guest.getByText('Add to Calendar', { exact: true }).waitFor();
    assert.equal((await db.collection('ticketingOrders').doc(orderId).get()).data().rsvpStatus, 'approved');
    await guest.screenshot({ path: 'tmp/ticketing-engagement-approved-app.png', fullPage: true });
    const accessKey = await guest.evaluate(oid => localStorage.getItem(`pluto-order-${oid}`), orderId), view = await api(guest, 'order', { orderId, accessKey });
    stage = 'announcements and scanner attendance'; active = admin;
    await admin.locator('#event-communications').click(); await admin.locator('[data-announcement] [name=title]').fill('Doors are ready'); await admin.locator('[data-announcement] [name=body]').fill('Open Pluto for your arrival details.'); await surface(admin, 'engagement-announcement-preview'); await admin.getByRole('button', { name: 'Queue announcement emails', exact: true }).click(); await admin.locator('#ticketing-dialog-content .order-activity').filter({ hasText: 'Doors are ready' }).waitFor(); await admin.locator('#ticketing-dialog-close').click();
    await api(admin, 'staff/scan', { eventId: eid, qr: view.tickets[0].qr, scanId: randomUUID() });
    const pin = await api(admin, 'staff/scanner-pins/create', { eventId: eid, label: 'Re-entry door', expiresAt: Date.now() + 3600000 });
    const doorContext = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 844 } }), door = await doorContext.newPage(); active = door;
    await door.goto(`${base}/tickets/staff`); await door.locator('#scanner-login-form [name=pin]').fill(pin.pin); await door.locator('#scanner-login-form button').click(); await door.locator('#scanner-session:not([hidden])').waitFor(); await door.locator('#admission-attendance').click(); await door.getByRole('button', { name: 'Record exit', exact: true }).click(); await door.getByRole('button', { name: 'Record re-entry', exact: true }).waitFor(); await door.locator('#ticketing-dialog').evaluate(e => { e.scrollTop = 0; }); await surface(door, 'engagement-door-mobile'); await door.getByRole('button', { name: 'Record re-entry', exact: true }).click(); await door.getByRole('button', { name: 'Record exit', exact: true }).waitFor();
    stage = 'free event walk-up count'; active = admin;
    const fid = randomUUID(), free = fixture(true); free.slug += `-${fid}`; free.registrationMode = 'free'; free.venueVisibility = 'public'; free.offers.forEach(o => { o.active = false; });
    await api(admin, 'staff/save', { eventId: fid, draft: free, revision: 0 }); await api(admin, 'staff/publish', { eventId: fid, revision: 1, action: 'publish' }); await admin.goto(`${base}/tickets/admin?event=${fid}`); await admin.locator('#event-attendance').click(); await admin.locator('[data-walkup] [name=quantity]').fill('4'); await admin.getByRole('button', { name: 'Record walk-up count', exact: true }).click(); await admin.locator('[data-walkup]').filter({ hasText: '4 inside' }).waitFor(); await surface(admin, 'engagement-free-walkups');
    await admin.locator('[data-walkup] [name=action]').selectOption('exit'); await admin.locator('[data-walkup] [name=quantity]').fill('5'); await admin.getByRole('button', { name: 'Record walk-up count', exact: true }).click(); await admin.locator('[data-panel-error]').filter({ hasText: 'exceed' }).waitFor(); assert.equal(await admin.locator('[data-walkup] [name=quantity]').isEnabled(), true); assert.equal((await db.collection('ticketingEvents').doc(fid).collection('door').doc('walkups').get()).data().inside, 4);
    console.log('Calendar privacy, waitlist verification/approval/claim, app calendar, announcements, PIN re-entry and free walk-up browser checks passed.');
    await guestContext.close(); await doorContext.close(); await adminContext.close();
  } catch (error) { console.error(`Engagement browser failure at ${stage}`); if (active) await active.screenshot({ path: 'tmp/ticketing-engagement-failure.png', fullPage: true }).catch(() => {}); throw error; }
  finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
