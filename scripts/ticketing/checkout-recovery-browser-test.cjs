const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const base = 'http://127.0.0.1:4173';
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    const page = await context.newPage();
    await page.goto(`${base}/events/pluto-ticketing-preview`);
    const config = await page.locator('#native-checkout-config').evaluate(e => JSON.parse(e.textContent));
    const saved = { eventId: config.eventId, accessKey: 'a'.repeat(64), items: [{ offerId: config.offers[0].id, quantity: 1 }], name: 'Checkout Guest', email: 'guest@preview.invalid', checkoutKind: 'payment' };
    let status = 'open', failed = false;
    await page.route('**/tickets/api/checkout-attempt', route => route.fulfill({ status: failed ? 503 : 200, contentType: 'application/json', body: JSON.stringify(failed ? { error: 'Network retry' } : { exists: true, orderId: 'paid-order', eventId: saved.eventId, status }) }));
    async function restore() {
      await page.evaluate(saved => localStorage.setItem(`pluto-checkout-${saved.eventId}`, JSON.stringify(saved)), saved);
      await page.reload();
    }
    for (const terminal of ['paid', 'expired', 'pending-approval']) {
      status = terminal; await restore();
      await page.getByRole('button', { name: 'Continue to payment', exact: true }).waitFor();
      assert.equal(await page.evaluate(id => localStorage.getItem(`pluto-checkout-${id}`), saved.eventId), null);
      assert.equal(await page.locator('[name=buyerName]').isDisabled(), false);
      assert.equal(await page.locator('[data-ticket-quantity]').first().inputValue(), '0');
    }
    status = 'open'; await restore();
    await page.getByRole('button', { name: 'Resume reserved checkout', exact: true }).waitFor();
    status = 'paid';
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
    await page.getByRole('button', { name: 'Continue to payment', exact: true }).waitFor();
    assert.equal(await page.evaluate(id => localStorage.getItem(`pluto-checkout-${id}`), saved.eventId), null);
    failed = true; await restore();
    await page.getByRole('button', { name: 'Resume reserved checkout', exact: true }).waitFor();
    assert.ok(await page.evaluate(id => localStorage.getItem(`pluto-checkout-${id}`), saved.eventId), 'unknown outcomes retain the same idempotent attempt');
    await context.close();
    console.log('Saved checkout regressions passed: completed and expired carts clear, bfcache restores reconcile, unknown outcomes retain the original attempt.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
