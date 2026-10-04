const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { resolve } = require('node:path');
const { createRequire } = require('node:module');
const { chromium } = require('playwright');
const fillFlutterInput = require('../ci/flutter-input.cjs');
const backend = createRequire(resolve(__dirname, '../../functions/package.json'));
process.env.GCLOUD_PROJECT = 'demo-pluto-ticketing';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8185';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9095';
backend('firebase-admin/app').initializeApp({ projectId: 'demo-pluto-ticketing' });
const db = backend('firebase-admin/firestore').getFirestore(), auth = backend('firebase-admin/auth').getAuth();
const uid = `rewards-browser-${randomUUID()}`, password = 'Local-rewards-test-2026!', email = `${uid}@example.test`;
const profile = db.collection('userProfiles').doc(uid), reward = db.collection('rewardItems').doc(uid), qr = db.collection('eventQrCodes').doc(uid);
let browser, page, stage;
async function semantics() { await page.locator('flt-semantics-placeholder').evaluate(e => e.click(), { timeout: 20000 }).catch(() => {}); }
(async () => {
  try {
    await auth.createUser({ uid, email, password });
    await profile.set({ displayName: 'Rewards browser guest', pointsBalance: 400, lifetimePoints: 400, eventsAttended: 0 });
    await reward.set({ name: `Browser reward ${uid}`, pointsCost: 1, inventory: 3, isActive: true });
    await qr.set({ code: uid.toUpperCase(), eventName: `Browser rewards event ${uid}`, pointsAwarded: 100, totalClaims: 0, isActive: true });
    browser = await chromium.launch(); const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 1000 } }); page = await context.newPage();
    page.on('pageerror', error => console.error('Rewards app error:', error.message));
    stage = 'sign-in'; await page.goto('http://127.0.0.1:4173/app/sign-on'); await semantics();
    await page.getByRole('textbox', { name: /Email/ }).fill(email); await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByLabel(/Enter your password/).fill(password); await page.getByRole('button', { name: 'Sign In', exact: true }).click();
    await page.getByRole('button', { name: 'Open Rewards Shop', exact: true }).waitFor();
    await page.goto('http://127.0.0.1:4173/app/shop'); await semantics(); await page.getByRole('button', { name: 'Redeem', exact: true }).first().waitFor();
    stage = 'lost response and retry';
    // Use the same catalog order as the shop without altering other preview items.
    const affordable = (await db.collection('rewardItems').get()).docs.map(d => ({ id: d.id, ...d.data() })).filter(d => d.isActive && d.pointsCost > 0 && d.pointsCost <= 400).sort((a, b) => a.pointsCost - b.pointsCost || (a.name.toLowerCase() < b.name.toLowerCase() ? -1 : a.name.toLowerCase() > b.name.toLowerCase() ? 1 : 0));
    const button = page.getByRole('button', { name: 'Redeem', exact: true }).nth(affordable.findIndex(d => d.id === uid)), attempts = []; let first = true;
    await context.route('**/tickets/api/rewards/redeem', async route => {
      const body = route.request().postDataJSON(); assert.equal(body.rewardItemId, uid); attempts.push(body.attempt);
      const response = await route.fetch(); assert.equal(response.status(), 200);
      if (first) { first = false; await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Response unavailable. Retry this reward request.' }) }); }
      else await route.fulfill({ response });
    });
    await button.click(); await page.getByText(/Redeem failed:.*Response unavailable/).waitFor();
    assert.equal((await profile.get()).data().pointsBalance, 399);
    await button.click(); await page.getByText(/Reward request submitted: Browser reward/).waitFor();
    assert.equal(attempts.length, 2); assert.equal(attempts[0], attempts[1]);
    assert.equal((await profile.get()).data().pointsBalance, 399); assert.equal((await reward.get()).data().inventory, 2); assert.equal((await profile.collection('redemptionRequests').get()).size, 1);
    stage = 'event QR claim'; await page.goto('http://127.0.0.1:4173/app/scan-qr'); await semantics();
    await fillFlutterInput(page, 'Event QR code text', uid.toLowerCase(), false); await page.getByRole('button', { name: 'Claim Pluto Points', exact: true }).click();
    await page.getByText(/Success: \+100 Pluto Points/).waitFor();
    assert.equal((await profile.get()).data().pointsBalance, 499); assert.equal((await profile.get()).data().eventsAttended, 1); assert.equal((await qr.get()).data().totalClaims, 1);
    await page.reload(); await semantics(); await fillFlutterInput(page, 'Event QR code text', uid, false);
    const duplicateResponse = page.waitForResponse(response => response.url().endsWith('/tickets/api/rewards/claim'));
    await page.getByRole('button', { name: 'Claim Pluto Points', exact: true }).click();
    const rejected = await duplicateResponse; assert.equal(rejected.status(), 409); assert.equal((await rejected.json()).code, 'already-claimed');
    await page.getByText('You already checked in for this event.', { exact: true }).waitFor();
    assert.equal((await profile.get()).data().pointsBalance, 499);
    console.log('Rewards browser checks passed: authenticated shop, committed-response loss and retry without another debit, manual event QR claim and duplicate rejection.');
  } catch (error) {
    console.error('Rewards browser phase:', stage); if (page) { console.error('URL:', page.url()); await page.screenshot({ path: 'tmp/rewards-browser-failure.png' }).catch(() => {}); console.error((await page.locator('body').innerText()).slice(0, 1600)); console.error(await page.locator('[aria-label]').evaluateAll(elements => elements.map(e => e.getAttribute('aria-label')).slice(0, 40))); } throw error;
  } finally { if (browser) await browser.close(); await db.recursiveDelete(profile); await db.recursiveDelete(qr); await reward.delete(); await auth.deleteUser(uid).catch(() => {}); }
})().then(() => process.exit(0), error => { console.error(error); process.exit(1); });
