const { performance } = require('node:perf_hooks');

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
}
async function phase({ name, count, concurrency, operation, expected = () => true, stop = () => false }) {
  const started = performance.now(), samples = [];
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(count, concurrency) }, async (_, worker) => {
    while (!stop()) {
      const index = next++; if (index >= count) break;
      const start = performance.now();
      try {
        const value = await operation(index, worker);
        samples.push({ index, ms: performance.now() - start, ok: expected(value), status: value?.statusCode || 200, outcome: value?.result || value?.status || 'ok', responseBytes: value?._loadResponseBytes || 0 });
      } catch (error) {
        samples.push({ index, ms: performance.now() - start, ok: false, status: error.status || 0, outcome: error.code || error.name || 'error' });
      }
    }
  }));
  const seconds = (performance.now() - started) / 1000, successful = samples.filter(s => s.ok), values = samples.map(s => s.ms);
  return { name, concurrency, requested: count, completed: samples.length, successes: successful.length,
    failures: samples.length - successful.length, seconds, successfulRps: successful.length / seconds,
    p50Ms: percentile(values, .5), p95Ms: percentile(values, .95), p99Ms: percentile(values, .99),
    p95ResponseBytes: percentile(samples.map(s => s.responseBytes || 0), .95),
    outcomes: samples.reduce((a, s) => { a[s.outcome] = (a[s.outcome] || 0) + 1; return a; }, {}), samples };
}
function stagingGuard(project, base, identity) {
  if (project !== 'pluto-staging-92eb7' || base !== 'https://pluto-staging-92eb7.web.app' ||
      identity.projectId !== project || identity.environment !== 'staging' || identity.paymentMode !== 'test')
    throw new Error('Load tests require the exact Pluto staging project, origin and deployed test payment mode.');
}
function fixtureGuard(event, runId) {
  if (!event || event.loadTestRun !== runId || !event.draft?.slug?.startsWith(`load-${runId}-`)) throw new Error('Refusing to modify an event outside this load-test run.');
}
module.exports = { percentile, phase, stagingGuard, fixtureGuard };
