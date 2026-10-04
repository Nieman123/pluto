import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
const manifest = JSON.parse(await readFile('tmp/release/manifest.json', 'utf8'));
const results = [];
for (const path of ['/__deployment', '/', '/events', '/tickets/admin', '/app/', '/assets/firebase-public-config.js', '/firebase-messaging-sw.js']) {
  const response = await fetch(`${manifest.baseUrl}${path}?release=${manifest.revision}&probe=${Date.now()}`, { redirect: 'error',
    headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(30000) });
  assert.equal(response.status, 200, `${path} must be available`);
  if (manifest.environment === 'staging') assert.match(response.headers.get('x-robots-tag') || '', /noindex/);
  const body = await response.text();
  if (path === '/__deployment') {
    const identity = JSON.parse(body);
    assert.equal(identity.projectId, manifest.projectId); assert.equal(identity.environment, manifest.environment);
    assert.equal(identity.revision, manifest.revision); assert.equal(identity.paymentMode, manifest.mode);
  }
  if (path === '/assets/firebase-public-config.js') {
    assert.ok(body.includes(`"projectId":"${manifest.projectId}"`));
    if (manifest.environment === 'staging') assert.ok(!body.includes('pluto-9b6ca'));
  }
  if (path === '/firebase-messaging-sw.js') assert.ok(body.includes('/assets/firebase-public-config.js'));
  if (path === '/' || path === '/events' || path === '/tickets/admin') {
    assert.match(body, /firebase-config/);
    assert.ok(body.includes(manifest.projectId));
    if (manifest.environment === 'staging') assert.ok(!body.includes('AIzaSyBLv7MumBOjUHpmAUiu9nLfhWvwmAYKorE'));
  }
  results.push({ path, status: response.status });
}
await writeFile('tmp/release/smoke.json', JSON.stringify({ revision: manifest.revision, results }, null, 2));
console.log('Deployed project, revision, public pages and notification configuration verified.');
