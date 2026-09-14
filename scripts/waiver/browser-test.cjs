// Browser checks against the isolated, explicitly started local Firebase preview.
const assert = require('node:assert/strict');
const { default: AxeBuilder } = require('@axe-core/playwright');
const { createRequire } = require('node:module');
const { resolve } = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const backend = createRequire(resolve(__dirname, '../../functions/package.json'));
const { initializeApp } = backend('firebase-admin/app');
const { getAuth } = backend('firebase-admin/auth');
const { getFirestore } = backend('firebase-admin/firestore');
if (process.env.GCLOUD_PROJECT !== 'demo-pluto-waiver' || !process.env.FIREBASE_AUTH_EMULATOR_HOST || !process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Isolated emulators required');
initializeApp({ projectId: 'demo-pluto-waiver' });
const base = 'http://127.0.0.1:4173';
(async () => {
  const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL || 'chrome' });
  try {
    for (const mobile of [false, true]) {
      const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 }, isMobile: mobile, hasTouch: mobile, acceptDownloads: true });
      const page = await context.newPage(), errors = [], requests = [];
      page.on('pageerror', e => errors.push(e.message)); page.on('request', r => requests.push(r.url()));
      await page.goto(`${base}/manafest-waiver`);
      await page.locator('#waiver-submit:enabled').waitFor();
      assert.equal(await page.locator('input[type=checkbox]:checked').count(), 0);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      assert.deepEqual(accessibility.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) })), []);
      await page.screenshot({ path: `tmp/waiver-${mobile ? 'mobile' : 'desktop'}-top.png` });
      await page.locator('#read-waiver').scrollIntoViewIfNeeded();
      await page.screenshot({ path: `tmp/waiver-${mobile ? 'mobile' : 'desktop'}-read.png` });
      let submits = 0; page.on('request', r => { if (r.url().endsWith('/api/submit')) submits++; });
      await page.locator('#waiver-submit').click(); assert.equal(submits, 0);
      const name = mobile ? 'Mobile Test Attendee' : 'Desktop Test Attendee';
      for (const [field, value] of Object.entries({ fullName: name, email: mobile ? 'mobile@example.com' : 'desktop@example.com', phone: '555-010-1234', emergencyName: 'Test Emergency Contact', emergencyRelationship: 'Friend', emergencyPhone: '555-010-5678' })) await page.locator(`[name=${field}]`).fill(value);
      await page.locator('[name=adult]').check(); await page.locator('[name=agreement]').check();
      await page.locator('#waiver-submit').click(); assert.equal(submits, 0);
      await page.locator('[name=electronic]').check();
      await page.locator('#waiver-submit').click(); assert.match(await page.locator('#waiver-error').innerText(), /Draw a complete signature/);
      if (mobile) {
        const canvas = page.locator('#signature-canvas'); await canvas.scrollIntoViewIfNeeded();
        const box = await canvas.boundingBox(), cdp = await context.newCDPSession(page);
        const x = box.x + 30, y = box.y + 30;
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
        for (let i = 1; i <= 20; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + i * 10, y: y + 20 + Math.sin(i) * 18 }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        assert.equal(await page.locator('#signature-state').innerText(), 'Signature drawn');
      } else {
        // Exercise mouse drawing and clearing before using the keyboard-accessible alternative.
        await page.locator('#signature-canvas').scrollIntoViewIfNeeded();
        const b = await page.locator('#signature-canvas').boundingBox();
        await page.mouse.move(b.x + 20, b.y + 30); await page.mouse.down(); await page.mouse.move(b.x + 200, b.y + 70, { steps: 10 }); await page.mouse.up();
        assert.equal(await page.locator('#signature-state').innerText(), 'Signature drawn');
        await page.locator('#clear-signature').click(); assert.equal(await page.locator('#signature-state').innerText(), 'No signature drawn');
        await page.locator('[value=typed]').check(); await page.locator('[name=typedSignature]').fill('Wrong Name');
        await page.locator('#waiver-submit').click(); assert.match(await page.locator('#waiver-error').innerText(), /must match/);
        await page.locator('[name=typedSignature]').fill(name);
      }
      await page.screenshot({ path: `tmp/waiver-${mobile ? 'mobile' : 'desktop'}-signature.png` });
      const payloads = []; let drop = true;
      await page.route('**/manafest-waiver/api/submit', async route => {
        payloads.push(route.request().postData());
        const response = await route.fetch();
        if (drop) { drop = false; assert.equal(response.status(), 200); await route.abort('connectionfailed'); }
        else await route.fulfill({ response });
      });
      await page.locator('#waiver-submit').click();
      await page.locator('#waiver-error').filter({ hasText: 'connection failed' }).waitFor();
      assert.equal(await page.locator('#waiver-confirmation').isVisible(), false);
      assert.equal(await page.locator('[name=fullName]').isDisabled(), true);
      await page.getByRole('button', { name: 'Retry signing submission' }).click();
      await page.locator('#waiver-confirmation').waitFor();
      assert.equal(payloads[0], payloads[1]);
      assert.match(await page.locator('#confirmation-number').innerText(), /^MF26-/);
      const downloadEvent = page.waitForEvent('download'); await page.locator('#download-waiver').click();
      const dl = await downloadEvent; await dl.saveAs(`tmp/pdfs/browser-${mobile ? 'drawn' : 'typed'}.pdf`);
      await page.screenshot({ path: `tmp/waiver-${mobile ? 'mobile' : 'desktop'}-confirmation.png` });
      assert.equal(requests.some(url => /google-analytics|googletagmanager/.test(url)), false);
      assert.deepEqual(errors, []);
      await page.goto(`${base}/manafest-waiver/staff`);
      await page.locator('#staff-status').filter({ hasText: 'Sign in with an authorized staff account.' }).waitFor({ timeout: 20000 });
      assert.equal(await page.locator('#staff-tools').isVisible(), false);
      const uid = `browser-${mobile ? 'mobile' : 'desktop'}-${Date.now()}`;
      await getAuth().createUser({ uid }); const token = await getAuth().createCustomToken(uid);
      await page.evaluate(async token => {
        const { getAuth, signInWithCustomToken } = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js');
        await signInWithCustomToken(getAuth(), token);
      }, token);
      await page.locator('#staff-status').filter({ hasText: 'not authorized' }).waitFor();
      assert.equal(await page.locator('#staff-tools').isVisible(), false);
      await getFirestore().collection('adminUsers').doc(uid).set({ role: 'admin' });
      await page.reload(); await page.locator('#staff-tools').waitFor();
      const staffAccessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      assert.deepEqual(staffAccessibility.violations.map(v => v.id), []);
      await page.locator('[name=query]').fill(name); await page.getByRole('button', { name: 'Search completed waivers' }).click();
      await page.locator('#staff-results li').first().waitFor();
      const staffDl = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download signed record' }).first().click(); await staffDl;
      await page.screenshot({ path: `tmp/waiver-${mobile ? 'mobile' : 'desktop'}-staff.png` });
      await getFirestore().collection('adminUsers').doc(uid).delete();
      await page.getByRole('button', { name: 'Search completed waivers' }).click();
      await page.waitForFunction(() => document.querySelector('#staff-tools').hidden);
      assert.equal(await page.locator('#staff-results li').count(), 0);
      await context.close();
      console.log(`PASS ${mobile ? 'mobile touch' : 'desktop mouse/keyboard'}: validation, signature, lost-response recovery, exact retry, confirmation, PDF, staff denied/allowed/revoked, no tracking, no overflow.`);
    }
    const narrow = await browser.newPage({ viewport: { width: 320, height: 800 } });
    await narrow.goto(`${base}/manafest-waiver`);
    assert.ok(await narrow.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await narrow.addStyleTag({ content: 'html { font-size: 200%; }' });
    assert.ok(await narrow.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await narrow.close();
    const staffPreview = await browser.newPage();
    await staffPreview.goto(`${base}/manafest-waiver/staff`);
    await staffPreview.locator('#preview-staff-login:enabled').waitFor();
    await staffPreview.locator('#preview-staff-login').click();
    await staffPreview.locator('#staff-tools').waitFor();
    await staffPreview.close();
    console.log('PASS 320px/text scaling and the emulator-only staff preview sign-in.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
