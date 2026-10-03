const test = require('node:test');
const assert = require('node:assert/strict');
const { revenueSummary } = require('../lib/ticketing/revenue');
const paid = (at, total = 1000) => ({ status: 'paid', total, paidAt: Date.parse(at) });
test('event-local Monday boundaries use payment dates and zero-fill daily sales', () => {
  const orders = [paid('2026-10-05T03:59:00Z'), paid('2026-10-05T04:00:00Z', 2000),
    { ...paid('2026-10-05T05:00:00Z', 3000), createdAt: Date.parse('2026-09-01') },
    paid('2026-10-06T10:00:00Z', 9900), { status: 'pending', total: 9000, createdAt: Date.parse('2026-10-05') }];
  const r = revenueSummary(orders, 'America/New_York', Date.parse('2026-10-05T12:00:00Z'), 7);
  assert.equal(r.weekStart, '2026-10-05'); assert.equal(r.thisWeek, 5000); assert.equal(r.lastWeek, 1000);
  assert.equal(r.gross, 6000); assert.equal(r.daily.length, 7); assert.equal(r.daily.at(-1).gross, 5000);
  assert.equal(r.daily.at(-1).orders, 2); assert.equal(r.daily[0].gross, 0);
});
test('DST calendar days, legacy payment dates and undated totals are explicit', () => {
  const r = revenueSummary([paid('2026-11-01T05:30:00Z'), paid('2026-11-01T06:30:00Z'),
    { status: 'paid', total: 500, createdAt: Date.parse('2026-10-31T18:00:00Z') }, { status: 'paid', total: 250 },
    { status: 'paid', total: 0 }, { status: 'paid', total: -50 }], 'America/New_York', Date.parse('2026-11-02T16:00:00Z'), 7);
  assert.equal(r.daily.find(d => d.date === '2026-11-01').gross, 2000);
  assert.equal(r.thisWeek, 0); assert.equal(r.lastWeek, 2500); assert.equal(r.gross, 2750);
  assert.equal(r.legacyDates, 1); assert.equal(r.missingDates, 1);
});
