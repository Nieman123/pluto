import assert from 'node:assert/strict';
import { test } from 'node:test';
import { smokeRequest } from '../scripts/release/smoke-request.mjs';

const base = 'https://staging.example.test';
const revision = 'a'.repeat(40);

function requests(sequence) {
  const urls = [], sleeps = [];
  return { urls, sleeps, options: {
    delays: [10, 20], log: () => {}, sleep: async delay => { sleeps.push(delay); },
    fetcher: async (url, options) => {
      urls.push(String(url));
      assert.equal(options.redirect, 'manual');
      assert.equal(options.headers['Cache-Control'], 'no-cache');
      const item = sequence[Math.min(urls.length - 1, sequence.length - 1)];
      if (item instanceof Error) throw item;
      return new Response(item.body || '', { status: item.status });
    },
  } };
}

test('smoke check tolerates a temporary missing Hosting route and cache-busts each attempt', async () => {
  const fixture = requests([{ status: 404 }, { status: 200, body: 'homepage' }]);
  const result = await smokeRequest(base, '/', revision, fixture.options);
  assert.equal(result.body, 'homepage');
  assert.equal(result.attempts, 2);
  assert.deepEqual(fixture.sleeps, [10]);
  assert.notEqual(fixture.urls[0], fixture.urls[1]);
  assert.ok(fixture.urls.every(url => new URL(url).searchParams.get('release') === revision));
});

test('smoke check tolerates temporary gateway and rate-limit errors', async () => {
  const fixture = requests([{ status: 503 }, { status: 429 }, { status: 200 }]);
  assert.equal((await smokeRequest(base, '/privacy', revision, fixture.options)).attempts, 3);
  assert.deepEqual(fixture.sleeps, [10, 20]);
});

test('smoke check retries transport failures but fails when the retry budget is exhausted', async () => {
  const recovered = requests([new TypeError('fetch failed'), { status: 200 }]);
  assert.equal((await smokeRequest(base, '/', revision, recovered.options)).attempts, 2);
  const failed = requests([new TypeError('fetch failed')]);
  await assert.rejects(smokeRequest(base, '/', revision, failed.options), /could not be fetched after 3 attempts/);
  assert.equal(failed.urls.length, 3);
});

test('a permanently missing route still fails the release after bounded retries', async () => {
  const fixture = requests([{ status: 404 }]);
  await assert.rejects(smokeRequest(base, '/privacy', revision, fixture.options), /must be available \(attempt 3\)/);
  assert.equal(fixture.urls.length, 3);
  assert.deepEqual(fixture.sleeps, [10, 20]);
});

test('access errors and redirects fail immediately rather than following another site', async () => {
  for (const status of [401, 403, 302]) {
    const fixture = requests([{ status }]);
    await assert.rejects(smokeRequest(base, '/privacy', revision, fixture.options), /must be available/);
    assert.equal(fixture.urls.length, 1);
    assert.deepEqual(fixture.sleeps, []);
  }
});

test('successful responses preserve their body for strict identity and page-content validation', async () => {
  const fixture = requests([{ status: 200, body: '{"revision":"wrong"}' }]);
  const result = await smokeRequest(base, '/__deployment', revision, fixture.options);
  assert.throws(() => assert.equal(JSON.parse(result.body).revision, revision));
  assert.equal(fixture.urls.length, 1);
});
