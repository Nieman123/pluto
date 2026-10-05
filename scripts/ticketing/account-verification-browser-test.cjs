const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createRequire } = require('node:module');
const { resolve } = require('node:path');
const { chromium } = require('playwright');
const { default: AxeBuilder } = require('@axe-core/playwright');
const fill = require('../ci/flutter-input.cjs');
const backend = createRequire(resolve(__dirname, '../../functions/package.json'));
process.env.GCLOUD_PROJECT = 'demo-pluto-ticketing';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8185';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9095';
backend('firebase-admin/app').initializeApp({ projectId: 'demo-pluto-ticketing' });
const auth = backend('firebase-admin/auth').getAuth(), db = backend('firebase-admin/firestore').getFirestore();
const base = 'http://127.0.0.1:4173', emulator = 'http://127.0.0.1:9095';
const emails = [], password = 'Local-verification-2026!';
let browser, active, stage = 'setup';
const feedback = (page, text) => page.getByLabel(text).or(page.getByText(text)).first();
async function semantics(page) {
  await page.locator('flt-semantics-placeholder').evaluate(el => el.click(), { timeout: 15000 }).catch(() => {});
}
async function codes(page, email) {
  const response = await page.request.get(`${emulator}/emulator/v1/projects/demo-pluto-ticketing/oobCodes`);
  return (await response.json()).oobCodes.filter(c => c.email === email && c.requestType === 'VERIFY_EMAIL');
}
async function received(page, email, count) {
  let result;
  for (let attempt = 0; attempt < 40; attempt++) {
    result = await codes(page, email);
    if (result.length === count) return result;
    await new Promise(done => setTimeout(done, 100));
  }
  assert.equal(result.length, count, 'expected verification requests issued to Firebase');
}
async function profile(page) {
  await page.goto(`${base}/app/profile`); await semantics(page);
  await page.getByRole('button', { name: 'Send verification email', exact: true }).waitFor();
}
async function blockEmail(page) {
  await page.route('**/accounts:sendOobCode?*', route => route.request().method() === 'OPTIONS' ? route.continue() : route.fulfill({ status: 400, contentType: 'application/json',
    headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: { code: 400, message: 'TOO_MANY_ATTEMPTS_TRY_LATER' } }) }));
}
async function fullSignup(page, email) {
  await page.goto(`${base}/app/sign-up`); await semantics(page);
  await fill(page, 'Name', 'Verification Tester'); await fill(page, 'Email', email);
  await fill(page, 'Password', password); await fill(page, 'Confirm password', password);
  await page.getByRole('button', { name: 'Create Account', exact: true }).last().click();
  await page.waitForURL(`${base}/app/`);
}
(async () => {
  browser = await chromium.launch();
  try {
    const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 900 } });
    active = await context.newPage();
    stage = 'email/password signup in sign-on';
    const email = `verify-sign-on-${randomUUID()}@preview.invalid`; emails.push(email);
    await active.goto(`${base}/app/sign-on`); await semantics(active);
    await active.getByRole('textbox', { name: /Email/ }).fill(email);
    await active.getByRole('button', { name: 'Create account', exact: true }).click();
    await active.getByRole('textbox', { name: /Password/i }).fill(password);
    await active.getByRole('button', { name: 'Create Account', exact: true }).last().click();
    await active.getByText(/Verification email sent/).waitFor();
    const initial = await received(active, email, 1);
    assert.equal(new URL(initial[0].oobLink).searchParams.get('continueUrl'), `${base}/app/profile`);
    assert.equal((await auth.getUserByEmail(email)).emailVerified, false, 'sending a link never verifies the account');
    stage = 'existing-account profile check and resend'; await profile(active);
    await active.getByRole('button', { name: 'I’ve verified my email', exact: true }).click();
    await feedback(active, /Your email is not verified yet/).waitFor();
    await blockEmail(active);
    await active.getByRole('button', { name: 'Send verification email', exact: true }).click();
    await feedback(active, /Please wait a little before trying again/).waitFor();
    assert.equal((await codes(active, email)).length, 1, 'failed resend does not claim another email was sent');
    await active.unroute('**/accounts:sendOobCode?*');
    await active.getByRole('button', { name: 'Send verification email', exact: true }).click();
    await feedback(active, /Verification email sent/).waitFor();
    const resent = await received(active, email, 2);
    stage = 'real verification action and token refresh';
    const verified = await active.request.post(`${emulator}/identitytoolkit.googleapis.com/v1/accounts:update?key=demo-key`, { data: { oobCode: resent.at(-1).oobCode } });
    assert.equal(verified.status(), 200, 'Firebase accepts the actual verification email code');
    await active.getByRole('button', { name: 'I’ve verified my email', exact: true }).click();
    await feedback(active, /Email verified/).waitFor();
    assert.equal((await auth.getUserByEmail(email)).emailVerified, true);
    assert.equal(await active.getByRole('button', { name: 'Send verification email', exact: true }).count(), 0);
    await active.reload(); await semantics(active); await feedback(active, /Email verified/).waitFor();
    await context.close();
    stage = 'full signup automatically requests verification';
    const fullContext = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 844 } });
    active = await fullContext.newPage();
    const fullEmail = `verify-sign-up-${randomUUID()}@preview.invalid`; emails.push(fullEmail);
    await fullSignup(active, fullEmail); await received(active, fullEmail, 1);
    await profile(active);
    await active.getByRole('button', { name: 'Send verification email', exact: true }).scrollIntoViewIfNeeded();
    assert.ok(await active.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'profile verification fits mobile');
    const axe = await new AxeBuilder({ page: active }).include('[role="button"]').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    assert.deepEqual(axe.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) })), []);
    await active.screenshot({ path: 'tmp/account-verification-mobile.png', fullPage: true });
    await fullContext.close();
    stage = 'verification-send failure preserves successful signup';
    const failureContext = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 900 } });
    active = await failureContext.newPage(); await blockEmail(active);
    const failureEmail = `verify-failure-${randomUUID()}@preview.invalid`; emails.push(failureEmail);
    await fullSignup(active, failureEmail);
    await active.getByText(/Your account was created, but the verification email could not be sent/).last().waitFor();
    const created = await auth.getUserByEmail(failureEmail);
    assert.equal(created.emailVerified, false); assert.equal((await codes(active, failureEmail)).length, 0);
    await active.unroute('**/accounts:sendOobCode?*'); await profile(active);
    await active.getByRole('button', { name: 'Send verification email', exact: true }).click();
    await feedback(active, /Verification email sent/).waitFor(); await received(active, failureEmail, 1);
    assert.equal((await auth.getUserByEmail(failureEmail)).uid, created.uid, 'retry uses the existing account');
    await failureContext.close();
    console.log('Account verification browser checks passed: both signup paths send automatically, existing-account profile resend/error/retry, actual email code verification, refresh/reload, mobile layout/action accessibility and failed email preserves successful signup.');
  } catch (error) {
    console.error(`Account verification failure at ${stage}:`, error);
    await active?.screenshot({ path: 'tmp/account-verification-failure.png', fullPage: true }).catch(() => {});
    process.exitCode = 1;
  } finally {
    await browser.close();
    for (const email of emails) {
      const user = await auth.getUserByEmail(email).catch(() => null);
      if (user) { await db.collection('userProfiles').doc(user.uid).delete(); await auth.deleteUser(user.uid); }
    }
  }
})();
