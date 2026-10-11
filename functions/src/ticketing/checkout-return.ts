// Keep redirect-based payment methods in the same flow as embedded Checkout.
// The native bridge carries a public ID, never an order access key or ticket.
export function checkoutReturnUrl(base: string, orderId: string, nativeApp = false) {
  if (!/^[a-f0-9]{64}$/.test(orderId)) throw new Error('Invalid checkout order ID.');
  return nativeApp
    ? `${base}/tickets/checkout-return?order=${orderId}`
    : `${base}/app/tickets?order=${orderId}&session_id={CHECKOUT_SESSION_ID}`;
}

export function checkoutAppScheme(environment: string) {
  if (environment === 'production') return 'events.pluto.app';
  if (environment === 'staging' || environment === 'emulator') return 'events.pluto.app.staging';
  throw new Error('Unknown checkout app environment.');
}
