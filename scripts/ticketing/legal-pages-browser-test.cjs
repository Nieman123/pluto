const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { default: AxeBuilder } = require('@axe-core/playwright');
const { mkdirSync } = require('node:fs');
const { resolve } = require('node:path');
const base = 'http://127.0.0.1:4173';
if (process.env.GCLOUD_PROJECT !== 'demo-pluto-ticketing') throw Error('Isolated demo preview required.');

(async () => {
  const browser = await chromium.launch();
  const screenshots = resolve(__dirname, '../../tmp/privacy-preview');
  mkdirSync(screenshots, { recursive: true });
  try {
    for (const width of [1280, 390]) {
      const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width, height: 900 }, javaScriptEnabled: false });
      const page = await context.newPage();
      for (const path of ['/privacy', '/terms', '/delete-account']) {
        const response = await page.goto(base + path);
        assert.equal(response.status(), 200);
        await page.locator('.legal-heading h1').waitFor();
        assert.ok((await page.locator('main').innerText()).includes('Pluto Events LLC'));
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        assert.ok(await page.getByRole('link', { name: 'contact@pluto.events', exact: true }).count());
        await page.screenshot({ path: `${screenshots}/${path.slice(1)}-${width}.png`, fullPage: true });
      }
      await page.getByRole('navigation', { name: 'Policies', exact: true }).getByRole('link', { name: 'Privacy Policy' }).click();
      await page.waitForURL('**/privacy');
      await context.close();
    }
    const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 900 } });
    const page = await context.newPage();
    for (const path of ['/privacy', '/terms', '/delete-account']) {
      await page.goto(base + path);
      const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      assert.deepEqual(result.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) })), []);
    }
    await page.goto(base + '/app/sign-up');
    await page.locator('flt-semantics-placeholder').evaluate(el => el.click(), { timeout: 15000 });
    await page.getByRole('button', { name: 'Privacy Policy', exact: true }).waitFor({ timeout: 60000 });
    const popup = page.waitForEvent('popup');
    await page.getByRole('button', { name: 'Privacy Policy', exact: true }).click();
    const policy = await popup;
    await policy.waitForURL('**/privacy');
    await policy.locator('h1').waitFor();
    assert.equal(await page.getByRole('button', { name: 'Terms of Use', exact: true }).count(), 1);
    await policy.close();
    await page.goto(base + '/privacy');
    await page.evaluate(async () => {
      const { getApps, initializeApp } = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js');
      const { getAuth, connectAuthEmulator, signInWithEmailAndPassword } = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js');
      const config = JSON.parse(document.getElementById('firebase-config').textContent);
      const auth = getAuth(getApps()[0] || initializeApp(config));
      if (!auth.emulatorConfig) connectAuthEmulator(auth, config.authEmulatorUrl, { disableWarnings: true });
      await signInWithEmailAndPassword(auth, 'staff@ticketing-preview.invalid', 'Local-ticketing-preview-2026!');
    });
    await page.goto(base + '/app/profile');
    await page.locator('flt-semantics-placeholder').evaluate(el => el.click(), { timeout: 15000 });
    for (let attempt = 0; attempt < 8 && !await page.getByRole('button', { name: 'Request account deletion', exact: true }).count(); attempt++) {
      await page.mouse.wheel(0, 1600);
      await page.waitForTimeout(250);
    }
    const deletionPopup = page.waitForEvent('popup');
    await page.getByRole('button', { name: 'Request account deletion', exact: true }).click();
    const deletion = await deletionPopup;
    await deletion.waitForURL('**/delete-account');
    await deletion.getByRole('link', { name: 'Request account deletion', exact: true }).waitFor();
    await context.close();
    console.log('Public policies work without JavaScript or sign-in on desktop/mobile; accessibility, signup policy and signed-in profile deletion links passed.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
