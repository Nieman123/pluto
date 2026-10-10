const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createRequire } = require('node:module');
const { resolve } = require('node:path');
const { chromium } = require('playwright');
const fill = require('../ci/flutter-input.cjs');
const { revealText, walletTop } = require('./flutter-wallet-scroll.cjs');
const backend = createRequire(resolve(__dirname, '../../functions/package.json'));
if (process.env.GCLOUD_PROJECT !== 'demo-pluto-ticketing' || process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8185' || process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9095') throw new Error('Isolated demo emulators required.');
backend('firebase-admin/app').initializeApp({ projectId: 'demo-pluto-ticketing' });
const db = backend('firebase-admin/firestore').getFirestore(), auth = backend('firebase-admin/auth').getAuth();
const { seedAppReview } = require('../../functions/lib/app-review');
const uid = `review-browser-${randomUUID()}`, email = `${uid}@example.test`, password = 'Local-demo-browser-2026!';
const registry = db.collection('appReviewAccounts').doc(uid), profile = registry.collection('userProfiles').doc(uid);
let browser, page, stage = 'setup';
async function semantics() { await page.locator('flt-semantics-placeholder').evaluate(e => e.click(), { timeout: 20000 }).catch(() => {}); }
(async () => {
  try {
    await auth.createUser({ uid, email, password, emailVerified: true });
    await seedAppReview(db, uid, email);
    browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
    page = await context.newPage();
    stage = 'sign-in'; await page.goto('http://127.0.0.1:4173/app/sign-on'); await semantics();
    await page.getByRole('textbox', { name: /Email/ }).fill(email); await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByLabel(/Enter your password/).fill(password); await page.getByRole('button', { name: 'Sign In', exact: true }).click();
    await page.waitForURL('http://127.0.0.1:4173/app/');
    await semantics();
    await page.getByText('Demo account • sample data only').or(page.getByLabel('Demo account • sample data only')).filter({ visible: true }).first().waitFor();
    stage = 'sample event and wallet';
    await (await revealText(page, 'Orbit • sample event')).click();
    await page.getByRole('button', { name: 'View sample ticket', exact: true }).click();
    await page.waitForURL(/app\/tickets\?event=review-orbit/);
    await revealText(page, 'Sample QR · Not valid for admission');
    assert.equal(await page.getByRole('button', { name: 'Transfer ticket', exact: true }).count(), 0);
    await walletTop(page);
    await page.goto('http://127.0.0.1:4173/app/tickets?view=orders'); await semantics();
    await (await revealText(page, 'Orbit • sample event')).click();
    await page.waitForURL(/order=review-orbit-order/);
    await revealText(page, 'Total $35.00');
    assert.equal(await page.getByRole('button', { name: 'Resend confirmation', exact: true }).count(), 0);
    stage = 'sample rewards';
    await page.goto('http://127.0.0.1:4173/app/shop'); await semantics();
    await page.getByRole('button', { name: 'Redeem', exact: true }).first().click();
    await page.getByText(/Reward request submitted: Demo Pluto sticker/).waitFor();
    assert.equal((await profile.get()).data().pointsBalance, 400);
    assert.equal((await db.collection('userProfiles').doc(uid).get()).exists, false);
    stage = 'scavenger hunt'; await page.goto('http://127.0.0.1:4173/app/scan-qr'); await semantics();
    await fill(page, 'Event QR code text', 'PLUTO-REVIEW', false);
    await page.getByRole('button', { name: 'Claim Pluto Points', exact: true }).click();
    await page.getByText(/Success: \+100 Pluto Points/).waitFor();
    assert.equal((await profile.get()).data().pointsBalance, 500);
    stage = 'profile history'; await page.goto('http://127.0.0.1:4173/app/profile'); await semantics();
    await revealText(page, 'Redeemed Demo Pluto sticker');
    stage = 'refill guide';
    await profile.update({ pointsBalance: 100 });
    await page.getByRole('button', { name: 'Demo guide', exact: true }).click();
    await page.getByRole('button', { name: 'Refill demo points', exact: true }).click();
    await page.getByText('Your sample points are ready.', { exact: true }).filter({ visible: true }).first().waitFor();
    assert.equal((await profile.get()).data().pointsBalance, 500);
    console.log('Demo browser checks passed: real sign-in, sample home event, ticket QR, orders, isolated rewards, hunt claim, profile history and refill.');
  } catch (error) {
    console.error('Demo browser phase:', stage);
    if (page) { await page.screenshot({ path: 'tmp/app-review-browser-failure.png' }).catch(() => {}); console.error((await page.locator('body').innerText()).slice(0, 1800)); console.error(await page.locator('[aria-label]').evaluateAll(elements => elements.map(e => e.getAttribute('aria-label')).slice(0, 55))); }
    throw error;
  } finally {
    if (browser) await browser.close();
    await db.recursiveDelete(registry); await db.collection('userProfiles').doc(uid).delete(); await auth.deleteUser(uid).catch(() => {});
  }
})().then(() => process.exit(0), error => { console.error(error); process.exit(1); });
