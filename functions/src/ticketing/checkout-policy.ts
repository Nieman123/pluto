export const checkoutHoldMs = 10 * 60_000;
export const pendingCheckoutStatuses = ['provisioning', 'open', 'processing'];

export function saleClosed(order: { saleGeneration?: number }, event?: { status?: string; saleGeneration?: number }) {
  return event?.status !== 'published' || (order.saleGeneration || 0) !== (event.saleGeneration || 0);
}
