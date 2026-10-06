import type { EventDraft } from './domain';
import type { Order } from './orders';

export const checkoutFollowupDelay = 60 * 60000;
export const checkoutFollowupWindow = 24 * 3600000;

/** Only confirmed, unpaid Stripe expiries qualify; an overdue open order does not. */
export function expiredCheckoutDue(order: Order, now: number) {
  const expiredAt = order.expiredAt;
  return order.status === 'expired' && order.method === 'stripe' && order.total > 0 && !!order.sessionId &&
    Number.isFinite(expiredAt) && now >= expiredAt! + checkoutFollowupDelay && now < expiredAt! + checkoutFollowupWindow &&
    !order.paymentIntentId && !order.financialBlocked && !order.reviewReason && !order.financialReviewReason;
}

export function followupEventSelling(draft: EventDraft, status: string, pools: Record<string, { held: number; sold: number }>, now: number) {
  return status === 'published' && draft.registrationMode !== 'free' && Date.parse(draft.endAt) > now &&
    draft.offers.some(offer => offer.active && offer.unitAmount > 0 && Date.parse(offer.salesStart) <= now &&
      Date.parse(offer.salesEnd) > now && Date.parse(offer.validUntil) > now && Object.entries(offer.pools).every(([key, units]) => {
        const capacity = draft.pools.find(pool => pool.id === key)?.capacity, usage = pools[key];
        return capacity !== undefined && !!usage && capacity - usage.held - usage.sold >= units;
      }));
}

export function followupBuyerEligible(orderId: string, order: Order, peers: { id: string; order: Order }[]) {
  // Fail closed if the bounded lookup cannot inspect all of this buyer's attempts.
  return peers.length <= 100 && !peers.some(peer => peer.id !== orderId && (
    peer.order.status === 'review' || peer.order.financialBlocked || !!peer.order.paymentIntentId || !!peer.order.financialReviewReason || !!peer.order.reviewReason ||
    // A free confirmed RSVP is the prerequisite for a VIP purchase, not a completed upgrade.
    peer.order.status === 'paid' && peer.order.method !== 'rsvp' ||
    ['provisioning', 'open', 'processing'].includes(peer.order.status) ||
    peer.order.createdAt >= order.createdAt && peer.order.status === 'expired'
  ));
}
