const assert = require('node:assert/strict');
const { chromium } = require('playwright');
if (process.env.TICKETING_SANDBOX_TEST !== 'true') throw new Error('Set TICKETING_SANDBOX_TEST=true to authorize this real Stripe sandbox test.');
(async () => {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:4173/events/pluto-ticketing-preview');
    assert.match(await page.locator('.ticket-notice').innerText(), /Sandbox/);
    await page.locator('[name=weekend]').selectOption('1');
    await page.locator('[name=buyerName]').fill('Stripe Sandbox Guest');
    await page.locator('[name=email]').fill('delivered@resend.dev');
    await page.locator('#native-checkout-form button').click();
    await page.locator('#native-checkout-form[hidden]').waitFor({ state: 'attached', timeout: 45000 });
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('pluto-checkout-ticketing-preview-event')));
    const first = await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('pluto-order-')));
    await page.reload(); await page.locator('#native-checkout-form button').click();
    await page.locator('#native-checkout-form[hidden]').waitFor({ state: 'attached', timeout: 45000 });
    assert.deepEqual(await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('pluto-order-'))), first, 'reload resumes the same order');
    const frame = page.frames().find(f => f.url().includes('embedded-checkout-inner'));
    assert.ok(frame); await frame.locator('#payment-method-label-card').waitFor();
    await frame.locator('#payment-method-label-card').click({ force: true });
    await frame.locator('[name=cardNumber]').fill('4242424242424242');
    await frame.locator('[name=cardExpiry]').fill('1230');
    await frame.locator('[name=cardCvc]').fill('123');
    await frame.locator('[name=billingName]').fill('Stripe Sandbox Guest');
    await frame.locator('[name=billingPostalCode]').fill('28801');
    await frame.getByText('Save my information for faster checkout', { exact: true }).click({ force: true });
    await frame.locator('button[type=submit]').click();
    await page.waitForURL('**/app/tickets?order=*', { timeout: 60000 }).catch(async error => {
      await page.screenshot({ path: 'tmp/ticketing-payment-failure.png' });
      console.error('Payment status:', (await frame.locator('body').innerText()).slice(-900)); throw error;
    });
    await page.locator('flt-semantics-placeholder').evaluate(e => e.click(), { timeout: 15000 }).catch(() => {});
    await page.getByLabel(/Status: valid/).waitFor({ timeout: 45000 });
    await page.screenshot({ path: 'tmp/ticketing-sandbox-paid-app.png' });
    assert.ok(await page.evaluate(() => localStorage.getItem(`pluto-order-${new URL(location.href).searchParams.get('order')}`)) === saved.accessKey);
    console.log('Stripe sandbox card payment passed: embedded form, reload/idempotency, completion return, verified app ticket issuance.');
  } finally { await browser.close(); }
})().then(() => process.exit(0), error => { console.error(error.message); process.exit(1); });
