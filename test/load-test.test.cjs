const test = require('node:test'), assert = require('node:assert/strict');
const { phase, percentile, stagingGuard, fixtureGuard } = require('../scripts/load-test/metrics.cjs');
const { inventoryFacade, noStripe } = require('../scripts/load-test/inventory.cjs');
const { cleanup } = require('../scripts/load-test/staging.cjs');

test('cleanup validates the entire manifest before accessing cloud data', async () => {
  const report = { runId: '0123456789abcdef', project: 'pluto-staging-92eb7', base: 'https://pluto-staging-92eb7.web.app', events: ['load_0123456789abcdef_inventory'] };
  const forbiddenDb = new Proxy({}, { get() { throw new Error('Cloud accessed before scope validation'); } });
  await assert.rejects(cleanup({ ...report, uid: 'actual-customer' }, forbiddenDb, {}), /Cleanup user mismatch/);
  await assert.rejects(cleanup({ ...report, events: [...report.events, 'actual-event'] }, forbiddenDb, {}), /Cleanup scope mismatch/);
  await assert.rejects(cleanup({ ...report, project: 'pluto-9b6ca' }, forbiddenDb, {}), /exact Pluto staging/);
});
test('inventory adapter preserves real transactions, isolates statuses and blocks providers', async () => {
  const writes = [], tx = { create: (ref, data) => { writes.push(data); return tx; }, get: ref => ref };
  const db = { runTransaction: async fn => fn(tx) }, facade = inventoryFacade(db, 'abc');
  const ref = { parent: { id: 'ticketingOrders' } }, data = { eventId: 'load_abc_inventory', status: 'provisioning' };
  await facade.runTransaction(t => { assert.equal(t.get('pool'), 'pool'); t.create(ref, data); });
  assert.deepEqual(writes[0], { eventId: data.eventId, status: 'load-test-reserved', loadTestRun: 'abc' });
  assert.equal(data.status, 'provisioning');
  await assert.rejects(facade.runTransaction(t => t.create(ref, { eventId: 'manafest-2027' })));
  assert.throws(() => noStripe().checkout);
});
test('load-test target and cleanup guards reject production and unrelated records', () => {
  const identity = { environment: 'staging', paymentMode: 'test', projectId: 'pluto-staging-92eb7' };
  stagingGuard(identity.projectId, 'https://pluto-staging-92eb7.web.app', identity);
  for (const override of [{ environment: 'production' }, { projectId: 'pluto-9b6ca' }, { paymentMode: 'live' }])
    assert.throws(() => stagingGuard(identity.projectId, 'https://pluto-staging-92eb7.web.app', { ...identity, ...override }));
  assert.throws(() => stagingGuard(identity.projectId, 'https://pluto.events', identity));
  fixtureGuard({ loadTestRun: 'abc', draft: { slug: 'load-abc-event' } }, 'abc');
  assert.throws(() => fixtureGuard({ draft: { slug: 'manafest-2027' } }, 'abc'));
});
test('bounded load phases count errors, measure all latency and never silently retry', async () => {
  let active = 0, peak = 0, calls = 0;
  const result = await phase({ name: 'test', count: 20, concurrency: 3, operation: async i => {
    active++; calls++; peak = Math.max(peak, active); await new Promise(r => setTimeout(r, 2)); active--;
    if (i === 4) throw Object.assign(new Error('Controlled failure'), { status: 503 });
    return { result: 'accepted' };
  } });
  assert.equal(calls, 20); assert.equal(peak, 3); assert.equal(result.failures, 1); assert.equal(result.successes, 19);
  assert.equal(result.outcomes.Error, 1); assert.ok(result.p95Ms >= result.p50Ms); assert.ok(result.successfulRps > 0);
  assert.equal(percentile([], .95), null); assert.equal(percentile([1, 2, 3, 4], .5), 2);
});
