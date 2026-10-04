const assert = require('node:assert/strict');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  try {
    for (const scenario of ['refunded', 'retransferred', 'temporary-failure']) {
      const context = await browser.newContext(), goodId = 'a'.repeat(64), badId = 'd'.repeat(64), badToken = 'b'.repeat(64);
      await context.addInitScript(({ goodId, badId, badToken }) => {
        localStorage.setItem(`pluto-order-${goodId}`, 'c'.repeat(64));
        localStorage.setItem(`pluto-order-${badId}`, 'e'.repeat(64));
        localStorage.setItem(`pluto-holder-${badToken}`, badToken);
      }, { goodId, badId, badToken });
      const calls = [];
      await context.route('**/tickets/api/**', route => {
        const path = new URL(route.request().url()).pathname, body = route.request().postDataJSON(); calls.push(path);
        if (path.endsWith('/holder')) return route.fulfill({ status: scenario === 'temporary-failure' ? 503 : 409, contentType: 'application/json', body: JSON.stringify(scenario === 'temporary-failure' ? { error: 'Temporarily unavailable' } : { error: 'This ticket credential is no longer valid.', code: 'ticket-access-revoked' }) });
        if (path.endsWith('/mine')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ orders: [], tickets: [] }) });
        if (body.orderId === badId) return route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: 'Use your secure order link' }) });
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ orderId: goodId, eventId: 'wallet-test', eventTitle: 'Valid wallet event', eventSlug: 'valid-wallet', status: 'paid', method: 'stripe', total: 1000, name: 'Test', email: 'test@example.test', tickets: [{ id: 'good-ticket', name: 'Valid wallet ticket', status: 'valid', amount: 1000, qr: 'test-qr', validFrom: new Date(Date.now() - 3600000).toISOString(), validUntil: new Date(Date.now() + 3600000).toISOString() }] }) });
      });
      const page = await context.newPage(); await page.goto('http://127.0.0.1:4173/app/tickets');
      await page.locator('flt-semantics-placeholder').evaluate(e => e.click(), { timeout: 20000 }).catch(() => {});
      await page.getByText('Valid wallet ticket', { exact: true }).waitFor({ timeout: 30000 });
      await page.getByText(/A saved order needs a new secure link/).waitFor();
      await page.getByText(scenario === 'temporary-failure' ? /A saved transferred ticket could not be loaded/ : /A saved transferred ticket is no longer valid/).waitFor();
      const stored = await page.evaluate(({ badId, badToken }) => ({ order: localStorage.getItem(`pluto-order-${badId}`), holder: localStorage.getItem(`pluto-holder-${badToken}`) }), { badId, badToken });
      assert.ok(stored.order, 'financial history access is retained for recovery');
      assert.equal(!!stored.holder, scenario === 'temporary-failure', 'only terminal holder credentials are removed');
      assert.ok(calls.some(path => path.endsWith('/holder'))); assert.ok(calls.some(path => path.endsWith('/order')));
      await context.close();
    }
    console.log('Wallet browser regressions passed: valid tickets remain visible beside refunded/retransferred credentials, transient failures, and recoverable financial history.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
