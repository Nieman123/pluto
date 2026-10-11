const assert = require('node:assert/strict');
const test = require('node:test');
const { checkoutReturnUrl, checkoutAppScheme } = require('../lib/ticketing/checkout-return');
const order = 'a'.repeat(64);
test('Stripe redirect methods return native checkouts to the bridge and retain legacy web URLs', () => {
  for (const base of ['https://pluto.events', 'https://pluto-staging-92eb7.web.app']) {
    assert.equal(checkoutReturnUrl(base, order, true), `${base}/tickets/checkout-return?order=${order}`);
    assert.equal(checkoutReturnUrl(base, order), `${base}/app/tickets?order=${order}&session_id={CHECKOUT_SESSION_ID}`);
  }
  for (const id of ['../app', 'bad&accessKey=secret', 'A'.repeat(64), '']) assert.throws(() => checkoutReturnUrl('https://pluto.events', id, true));
});
test('native bridge selects the installed flavor, including isolated emulator tests', () => {
  assert.equal(checkoutAppScheme('production'), 'events.pluto.app');
  assert.equal(checkoutAppScheme('staging'), 'events.pluto.app.staging');
  assert.equal(checkoutAppScheme('emulator'), 'events.pluto.app.staging');
  assert.throws(() => checkoutAppScheme('other'));
});
test('frontend uses the same destination for paid, free and RSVP completion', async () => {
  const { checkoutDestination } = await import('../../site/src/ticketing/checkout-return.mjs');
  assert.equal(checkoutDestination(order, true), `/tickets/checkout-return?order=${order}`);
  assert.equal(checkoutDestination(order), `/app/tickets?order=${order}`);
  assert.throws(() => checkoutDestination('bad&accessKey=secret', true));
});
