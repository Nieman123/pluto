import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { financialTotals, orderContribution } = createRequire(import.meta.url)('../functions/lib/ticketing/financial-projection.js');
const financialSummary = ([order]) => financialTotals(orderContribution(order, 'America/New_York').totals);

test('unknown fees and unmapped refunds keep dashboard proceeds provisional', () => {
  const order = { status: 'paid', method: 'stripe', total: 10000, taxAmount: 500, stripeFee: null, stripeFeeStatus: 'pending', externalRefundAmount: 2000 };
  const pending = financialSummary([order]);
  assert.equal(pending.pendingFees, 1); assert.equal(pending.provisional, true);
  assert.equal(pending.refunds, 2000); assert.equal(pending.proceeds, 7500);
  const final = financialSummary([{ ...order, stripeFee: 320, stripeFeeStatus: 'confirmed', refundedAmount: 2000, refundedTaxAmount: 100, externalRefundAmount: 0 }]);
  assert.equal(final.provisional, false); assert.equal(final.proceeds, 7280);
  assert.equal(financialSummary([{ ...order, externalRefundAmount: 0, stripeFee: 0, stripeFeeStatus: 'confirmed' }]).provisional, false, 'confirmed zero is different from unknown');
  assert.equal(financialSummary([{ ...order, method: 'cash', externalRefundAmount: 0 }]).pendingFees, 0);
});
