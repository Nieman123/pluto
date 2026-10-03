export function financialSummary(orders) {
  const paid = orders.filter(order => order.status === 'paid');
  const sum = key => paid.reduce((total, order) => total + (order[key] || 0), 0);
  const pendingFees = paid.filter(order => order.method === 'stripe' && order.total > 0 &&
    (order.stripeFeeStatus !== 'confirmed' || !Number.isSafeInteger(order.stripeFee))).length;
  const gross = sum('total'), refunds = sum('refundedAmount') + sum('externalRefundAmount');
  const tax = sum('taxAmount') - sum('refundedTaxAmount'), fees = sum('stripeFee');
  return { paid, gross, refunds, tax, fees, pendingFees,
    provisional: pendingFees > 0 || paid.some(order => order.financialBlocked || order.externalRefundAmount > 0),
    proceeds: gross - refunds - tax - fees, discounts: sum('discount') };
}
