const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { revealText, walletTop } = require('./flutter-wallet-scroll.cjs');

(async () => {
  const browser = await chromium.launch();
  try {
    // Match the Flutter regression: a collapsed text leaf precedes a visible
    // accessible ticket group with the same event title.
    const semantics = await browser.newPage();
    await semantics.setContent('<span style="display:block;width:0;height:0;overflow:hidden">A Night in Orbit</span><div role="group" aria-label="A Night in Orbit · General admission · Status: valid" style="width:320px;height:100px">Ticket card</div>');
    const renderedTicket = await revealText(semantics, 'A Night in Orbit');
    assert.equal(await renderedTicket.getAttribute('role'), 'group');
    assert.equal(await renderedTicket.isVisible(), true);
    await semantics.close();
    for (const scenario of ['refunded', 'retransferred', 'temporary-failure']) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' }), goodId = 'a'.repeat(64), badId = 'd'.repeat(64), badToken = 'b'.repeat(64);
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
      await page.getByText(/A saved order needs a new secure link/).waitFor();
      await page.getByText(scenario === 'temporary-failure' ? /A saved transferred ticket could not be loaded/ : /A saved transferred ticket is no longer valid/).waitFor();
      await revealText(page, 'Valid wallet ticket');
      await page.screenshot({ path: 'tmp/wallet-lazy-mobile.png' });
      await revealText(page, page.getByRole('button', { name: /Admission QR for/ }));
      const stored = await page.evaluate(({ badId, badToken }) => ({ order: localStorage.getItem(`pluto-order-${badId}`), holder: localStorage.getItem(`pluto-holder-${badToken}`) }), { badId, badToken });
      assert.ok(stored.order, 'financial history access is retained for recovery');
      assert.equal(!!stored.holder, scenario === 'temporary-failure', 'only terminal holder credentials are removed');
      assert.ok(calls.some(path => path.endsWith('/holder'))); assert.ok(calls.some(path => path.endsWith('/order')));
      await context.close();
    }
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    const orders = ['1'.repeat(64), '2'.repeat(64)]; let reads = 0;
    await context.addInitScript(orders => orders.forEach(id => localStorage.setItem(`pluto-order-${id}`, 'c'.repeat(64))), orders);
    await context.route('**/tickets/api/order', route => {
      reads++;
      const index = orders.indexOf(route.request().postDataJSON().orderId);
      return route.fulfill({ json: { orderId: orders[index], eventId: `event-${index}`, eventTitle: index ? 'Halloween wallet test' : 'Manafest wallet test', status: 'paid', method: 'cash', total: 1000,
        tickets: [{ id: `ticket-${index}`, name: index ? 'Halloween pass' : 'Manafest pass', status: 'valid', qr: 'test-qr' }] } });
    });
    const page = await context.newPage(); await page.goto('http://127.0.0.1:4173/app/tickets');
    await page.locator('flt-semantics-placeholder').evaluate(e => e.click(), { timeout: 20000 }).catch(() => {});
    const choice = await revealText(page, 'Manafest wallet test');
    assert.equal(reads, 2);
    assert.equal(await page.getByRole('button', { name: /Admission QR for/ }).count(), 0, 'event picker builds no QR cards');
    await choice.click(); await page.waitForURL('**/app/tickets?event=event-0');
    await revealText(page, page.getByRole('button', { name: /Admission QR for Manafest pass/ }));
    assert.equal(await page.getByRole('button', { name: /Admission QR for Halloween pass/ }).count(), 0);
    await walletTop(page); await page.getByRole('button', { name: 'Orders', exact: true }).click();
    await page.waitForURL('**/app/tickets?view=orders'); await revealText(page, 'Halloween wallet test');
    assert.equal(await page.getByRole('button', { name: /Admission QR for/ }).count(), 0, 'receipt view builds no QR cards');
    assert.equal(reads, 2, 'event and receipt navigation reuse the loaded wallet');
    await page.screenshot({ path: 'tmp/wallet-orders-mobile.png' });
    await context.close();
    console.log('Wallet browser regressions passed: valid tickets remain visible beside refunded/retransferred credentials, transient failures, and recoverable financial history.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
