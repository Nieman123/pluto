export function checkoutDestination(orderId, nativeApp = false) {
  if (!/^[a-f0-9]{64}$/.test(orderId)) throw new Error('Invalid checkout order ID.');
  return `${nativeApp ? '/tickets/checkout-return' : '/app/tickets'}?order=${orderId}`;
}

export function initCheckoutReturn() {
  const button = document.querySelector('#native-checkout-return');
  if (!button) return;
  // Let the completion screen finish loading before leaving the browser. Some
  // browsers cancel their load event when a scheme launch starts in a defer script.
  const open = () => setTimeout(() => location.assign(button.href), 0);
  if (document.readyState === 'complete') open();
  else window.addEventListener('load', open, { once: true });
}
