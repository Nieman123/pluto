const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const sharp = require('../../functions/node_modules/sharp');
const { QRCodeReader, RGBLuminanceSource, HybridBinarizer, BinaryBitmap } = require('@zxing/library');
const { qr } = require('../../test/fixtures/ticket-qr.json');
(async () => {
  const browser = await chromium.launch();
  try {
    const walletEnabled = process.env.TICKETING_WALLET_UI_ENABLED === 'true';
    for (const platform of walletEnabled ? ['pending', 'apple', 'google'] : ['hidden']) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, ignoreHTTPSErrors: true }), oid = 'a'.repeat(64), key = 'b'.repeat(64), calls = [];
      await context.addInitScript(({ oid, key }) => localStorage.setItem(`pluto-order-${oid}`, key), { oid, key });
      await context.route('**/tickets/api/**', route => {
        const path = new URL(route.request().url()).pathname, data = route.request().postDataJSON(); calls.push({ path, data });
        const options = { apple: platform === 'apple', google: platform === 'google' };
        let result;
        if (path.endsWith('/wallet/options')) result = options;
        else if (path.endsWith('/wallet/apple')) result = { url: 'http://127.0.0.1:4173/tickets/wallet/apple/test-download' };
        else if (path.endsWith('/wallet/google')) result = { url: 'https://pay.google.com/gp/v/save/test-token' };
        else result = { orderId: oid, eventId: 'wallet-test', eventTitle: 'A Night in Orbit', eventSlug: 'orbit', status: 'paid', method: 'cash', total: 10000, name: 'Test Guest', email: 'guest@example.test', tickets: [{ id: 'ticket-123', orderId: oid, name: 'Weekend pass', holderName: 'Test Guest', transferable: true, status: 'valid', amount: 10000, qr }] };
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify(result) });
      });
      for (const url of ['**/tickets/wallet/apple/test-download', 'https://pay.google.com/gp/v/save/test-token']) await context.route(url, route => route.fulfill({ contentType: 'text/html', body: '<p>Wallet provider flow</p>' }));
      const page = await context.newPage(); await page.goto('http://127.0.0.1:4173/app/tickets');
      await page.locator('flt-semantics-placeholder').evaluate(e => e.click(), { timeout: 20000 }).catch(() => {});
      await page.getByText('Weekend pass', { exact: false }).waitFor({ timeout: 30000 });
      await page.mouse.move(190, 600); await page.mouse.wheel(0, 500);
      await page.getByRole('button', { name: /Admission QR for Weekend pass/ }).click();
      const code = page.getByRole('img', { name: 'Enlarged Admission QR for Weekend pass' }); await code.waitFor();
      const screenshot = await code.screenshot();
      const { data, info } = await sharp(screenshot).flatten({ background: '#fff' }).greyscale().raw().toBuffer({ resolveWithObject: true });
      assert.equal(new QRCodeReader().decode(new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(new Uint8ClampedArray(data), info.width, info.height)))).getText(), qr);
      assert.equal(await page.getByText(/YOUR NIGHT AWAITS/).count(), 0);
      if (platform === 'pending' || platform === 'hidden') await page.screenshot({ path: 'tmp/ticket-qr-phone.png' });
      await page.getByRole('button', { name: 'Close enlarged QR', exact: true }).click();
      await page.mouse.wheel(0, 200);
      if (!walletEnabled) {
        assert.equal(await page.getByRole('button', { name: 'Add to Wallet', exact: true }).count(), 0);
        const enlarge = await page.getByRole('button', { name: /Admission QR for Weekend pass/ }).boundingBox(), transfer = await page.getByRole('button', { name: 'Transfer ticket', exact: true }).boundingBox();
        assert.equal(await page.getByRole('button', { name: 'Enlarge QR', exact: true }).count(), 0); assert.ok(enlarge.width >= 260 && transfer.width >= 290, 'QR has a large tap target and transfer fills the phone card');
        assert.ok(Math.abs(enlarge.x + enlarge.width / 2 - transfer.x - transfer.width / 2) < 2, 'QR and ticket action stay centered');
        await page.getByRole('button', { name: 'Transfer ticket', exact: true }).scrollIntoViewIfNeeded();
        await page.screenshot({ path: 'tmp/ticket-actions-phone.png' });
        await context.close(); continue;
      }
      await page.getByRole('button', { name: 'Add to Wallet', exact: true }).click();
      const apple = page.getByRole('button', { name: 'Add to Apple Wallet', exact: true }), google = page.getByRole('button', { name: 'Add to Google Wallet', exact: true });
      assert.equal(await apple.isDisabled(), platform !== 'apple'); assert.equal(await google.isDisabled(), platform !== 'google');
      if (platform === 'pending') { await page.getByText(/Digital wallet passes are coming soon/).waitFor(); await page.screenshot({ path: 'tmp/wallet-pending-phone.png' }); }
      else {
        await (platform === 'apple' ? apple : google).click(); await page.getByText('Wallet provider flow').waitFor();
        const request = calls.find(c => c.path.endsWith(`/wallet/${platform}`)); assert.equal(request.data.accessKey, key); assert.equal(request.data.ticketId, 'ticket-123');
      }
      await context.close();
    }
    console.log(walletEnabled ? 'Digital wallet browser checks passed: pending setup, Apple/Google navigation and proof, enlarged phone QR decode.' : 'Ticket browser checks passed: PLUTO heading, full-width centered actions, hidden Wallet button and enlarged phone QR decode.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
