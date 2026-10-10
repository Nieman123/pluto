const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { resolve } = require('node:path');
const { randomUUID } = require('node:crypto');
const { chromium } = require('playwright');
const { default: AxeBuilder } = require('@axe-core/playwright');
const fillFlutterInput = require('../ci/flutter-input.cjs');
const requireFunctions = createRequire(resolve(__dirname, '../../functions/package.json'));
if (process.env.GCLOUD_PROJECT !== 'demo-pluto-ticketing' || process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9095') throw Error('Isolated demo emulators required.');
requireFunctions('firebase-admin/app').initializeApp({ projectId: process.env.GCLOUD_PROJECT });
const auth = requireFunctions('firebase-admin/auth').getAuth(), db = requireFunctions('firebase-admin/firestore').getFirestore();
const { AccountDeletion } = require('../../functions/lib/account-deletion');
const base = 'http://127.0.0.1:4173', password = 'Emulator-only-Account-2026!', users = [];
async function account() {
  const uid = `delete-browser-${randomUUID()}`, email = `${uid}@example.test`;
  await auth.createUser({ uid, email, password, emailVerified: true, displayName: 'Browser member' });
  await db.collection('userProfiles').doc(uid).set({ displayName: 'Browser member', homeCity: 'Asheville', favoriteGenre: 'House', bio: 'Original bio', profileImageDataUrl: '', pointsBalance: 25, lifetimePoints: 25, eventsAttended: 1 });
  users.push(uid); return { uid, email };
}
async function semantics(page) {
  await page.locator('flt-semantics-placeholder').evaluate(el => el.click(), { timeout: 30000 }).catch(() => {});
}
(async () => {
  const browser = await chromium.launch();
  try {
    const website = await account(), context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 844 } }), page = await context.newPage();
    await page.goto(base + '/delete-account');
    await page.locator('[data-account-deletion]').waitFor({ state: 'visible', timeout: 30000 });
    assert.equal((await page.getByRole('button', { name: 'Permanently delete account' }).count()), 0, 'signed-out confirmation is hidden');
    await page.getByLabel('Account email', { exact: true }).fill(website.email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.getByText(`Account: ${website.email}`, { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Permanently delete account' }).isDisabled(), true);
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    assert.deepEqual(axe.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) })), []);
    await page.screenshot({ path: 'tmp/delete-account-website-mobile.png', fullPage: true });
    await page.getByLabel('Confirm your password', { exact: true }).fill(password);
    await page.getByLabel('I understand this is permanent', { exact: false }).check();
    await page.getByRole('button', { name: 'Permanently delete account' }).click();
    await page.getByText('Deletion is in progress.', { exact: false }).waitFor();
    await new AccountDeletion(db).process(website.uid);
    await page.getByText('Your account has been deleted.', { exact: false }).waitFor({ timeout: 30000 });
    await page.reload();
    await page.getByText('Your account has been deleted.', { exact: false }).waitFor({ timeout: 30000 });
    await context.close();

    const appUser = await account(), appContext = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 844 } }), app = await appContext.newPage();
    await app.goto(base + '/delete-account');
    await app.locator('[data-account-deletion]').waitFor({ state: 'visible' });
    await app.getByLabel('Account email', { exact: true }).fill(appUser.email);
    await app.getByLabel('Password', { exact: true }).fill(password);
    await app.getByRole('button', { name: 'Sign in', exact: true }).click();
    await app.getByText(`Account: ${appUser.email}`, { exact: true }).waitFor();
    await app.goto(base + '/app/profile'); await semantics(app);
    await app.getByRole('button', { name: 'Edit profile', exact: true }).waitFor({ timeout: 60000 });
    await app.screenshot({ path: 'tmp/profile-summary-mobile.png' });
    await app.getByRole('button', { name: 'Edit profile', exact: true }).click();
    await app.waitForURL('**/app/profile/edit');
    const rendering = await appContext.newCDPSession(app);
    await rendering.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    for (const [label, value] of [['Display Name', 'Updated member'], ['Home City', 'Durham'], ['Favorite Genre', 'Techno'], ['Bio', 'New profile bio']]) {
      await fillFlutterInput(app, new RegExp(label), value);
    }
    await app.screenshot({ path: 'tmp/profile-editor-mobile.png' });
    await app.getByRole('button', { name: 'Save profile', exact: true }).click();
    await app.waitForURL('**/app/profile');
    const saved = (await db.collection('userProfiles').doc(appUser.uid).get()).data();
    for (const [field, value] of Object.entries({ displayName: 'Updated member', homeCity: 'Durham', favoriteGenre: 'Techno', bio: 'New profile bio' })) {
      assert.equal(saved[field], value, `${field} is committed to the member profile`);
    }
    await rendering.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    for (let i = 0; i < 8 && !await app.getByRole('button', { name: 'Delete account', exact: true }).isVisible().catch(() => false); i++) {
      await app.mouse.wheel(0, 1200); await app.waitForTimeout(250);
    }
    await app.getByRole('button', { name: 'Delete account', exact: true }).click();
    await app.waitForURL('**/app/delete-account');
    await app.screenshot({ path: 'tmp/delete-account-app-form.png' });
    await app.getByRole('textbox', { name: /Confirm your password/ }).click();
    await app.waitForTimeout(250); // Flutter attaches the native editing client after focus.
    await app.keyboard.type(password, { delay: 10 });
    await app.getByRole('checkbox').click();
    await app.waitForFunction(() => document.querySelector('[role=checkbox]')?.getAttribute('aria-checked') === 'true');
    await app.getByRole('button', { name: 'Permanently delete account', exact: true }).click();
    await app.getByText('Deletion is in progress.', { exact: false }).or(app.getByLabel(/Deletion is in progress/)).first().waitFor();
    await new AccountDeletion(db).process(appUser.uid);
    await app.getByText('Your account has been deleted.', { exact: false }).or(app.getByLabel(/Your account has been deleted/)).first().waitFor({ timeout: 30000 });
    await app.screenshot({ path: 'tmp/delete-account-app-completed.png' });
    await appContext.close();
    console.log('Website and app account deletion, completion after reload, accessible confirmation and separate profile editing passed.');
  } finally {
    await browser.close();
    for (const uid of users) {
      await auth.deleteUser(uid).catch(() => {});
      await db.recursiveDelete(db.collection('userProfiles').doc(uid));
      await db.collection('accountDeletionRequests').doc(uid).delete();
    }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
