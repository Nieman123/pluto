// Paid orders temporarily hold admission while Stripe reconciliation runs.
// This is not a final eligibility decision for attendee communications.
export function reconciliationPending(order: any) {
  return !!order?.financialBlocked && !!order.financialCheckId && !order.financialReviewReason && !order.reviewReason;
}
