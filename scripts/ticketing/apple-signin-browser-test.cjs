const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createRequire } = require('node:module');
const { resolve } = require('node:path');
const { chromium } = require('playwright');
const { default: AxeBuilder } = require('@axe-core/playwright');
if (process.env.GCLOUD_PROJECT !== 'demo-pluto-ticketing' || process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9095' || process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8185') throw new Error('Isolated demo Auth and Firestore emulators required.');
const backend = createRequire(resolve(__dirname, '../../functions/package.json'));
backend('firebase-admin/app').initializeApp({ projectId: 'demo-pluto-ticketing' });
const auth = backend('firebase-admin/auth').getAuth(), db = backend('firebase-admin/firestore').getFirestore();
const base = 'http://127.0.0.1:4173', emails = [];
let browser, page, stage = 'setup';
async function screen(page, path) {
  await page.goto(`${base}/app/${path}`);
  await page.locator('flt-semantics-placeholder').evaluate(el => el.click(), { timeout: 15000 }).catch(() => {});
  await page.getByRole('button', { name: 'Sign in with Apple', exact: true }).waitFor();
}
async function popup(page) {
  const opened = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Sign in with Apple', exact: true }).click();
  const dialog = await opened;
  await dialog.waitForURL('http://127.0.0.1:9095/emulator/auth/handler?*');
  assert.equal(new URL(dialog.url()).searchParams.get('providerId'), 'apple.com');
  return dialog;
}
async function authorize(dialog, email) {
  // This is Firebase's simulated provider UI, never a real Apple account.
  await dialog.locator('#add-account-button').click();
  await dialog.locator('#email-input').fill(email);
  await dialog.locator('#display-name-input').fill('Apple Browser Tester');
  await dialog.locator('#main-form button[type=submit]').click();
}
(async () => {
  browser = await chromium.launch();
  try {
    stage = 'web signup and cancellation';
    const signup = await browser.newContext({ viewport: { width: 390, height: 844 } });
    page = await signup.newPage(); await screen(page, 'sign-up');
    const cancelled = await popup(page); await cancelled.close();
    await page.getByText('Sign-up was closed before it finished.', { exact: true }).last().waitFor();
    const violations = await new AxeBuilder({ page }).include('[role="button"]').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    assert.deepEqual(violations.violations.map(v => v.id), []);
    const email = `apple-signup-${randomUUID()}@preview.invalid`; emails.push(email);
    await authorize(await popup(page), email);
    await page.waitForURL(`${base}/app/`);
    const user = await auth.getUserByEmail(email);
    assert.ok(user.providerData.some(provider => provider.providerId === 'apple.com'));
    assert.ok((await db.collection('userProfiles').doc(user.uid).get()).exists, 'Apple signup creates the member profile');
    await signup.close();

    stage = 'web sign-in returns to tickets';
    const login = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    page = await login.newPage(); await screen(page, 'sign-on?returnTo=%2Ftickets');
    const loginEmail = `apple-login-${randomUUID()}@preview.invalid`; emails.push(loginEmail);
    await authorize(await popup(page), loginEmail);
    await page.waitForURL(`${base}/app/tickets`);
    assert.ok((await auth.getUserByEmail(loginEmail)).providerData.some(provider => provider.providerId === 'apple.com'));
    const restored = page.waitForResponse(response => response.url() === `${base}/tickets/api/mine` && response.request().method() === 'POST');
    await page.reload();
    await page.waitForURL(`${base}/app/tickets`);
    await page.locator('flt-semantics-placeholder').evaluate(el => el.click(), { timeout: 15000 }).catch(() => {});
    const wallet = await restored;
    assert.equal(wallet.status(), 200, 'restored Apple session is accepted by the ticket API');
    assert.ok(wallet.request().headers().authorization?.startsWith('Bearer '), 'reload retains the authenticated session');
    await login.close();
    console.log('Apple web auth passed: mobile signup, cancellation/retry, profile creation, Apple popup provider, ticket return and persisted sign-in.');
  } catch (error) {
    console.error(`Apple browser failure at ${stage}:`, error);
    await page?.screenshot({ path: 'tmp/apple-signin-failure.png', fullPage: true }).catch(() => {});
    process.exitCode = 1;
  } finally {
    await browser.close();
    for (const email of emails) {
      const user = await auth.getUserByEmail(email).catch(() => null);
      if (user) { await db.recursiveDelete(db.collection('userProfiles').doc(user.uid)); await auth.deleteUser(user.uid); }
    }
  }
})();
