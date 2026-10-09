import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { smokeRequest } from './smoke-request.mjs';
const manifest = JSON.parse(await readFile('tmp/release/manifest.json', 'utf8'));
const results = [];
for (const path of ['/__deployment', '/', '/events', '/past-events', '/privacy', '/terms', '/delete-account', '/tickets/admin', '/app/', '/assets/firebase-public-config.js', '/firebase-messaging-sw.js']) {
  const { response, body, attempts } = await smokeRequest(manifest.baseUrl, path, manifest.revision);
  if (manifest.environment === 'staging') assert.match(response.headers.get('x-robots-tag') || '', /noindex/);
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
  if (['/privacy', '/terms', '/delete-account'].includes(path)) {
    assert.match(body, /Pluto Events LLC/);
    assert.match(body, /mailto:contact@pluto\.events/);
    assert.match(body, /class="legal-page"/);
  }
  if (path === '/events') assert.match(body, /href="\/past-events"/, 'Current events must link to the archive');
  if (path === '/past-events') {
    assert.match(body, /Past events \| Pluto Events/, 'Archive route must render the past-events page');
    assert.match(body, /href="\/events"/, 'Archive must link back to current events');
  }
  if (path === '/' || path === '/events' || path === '/past-events' || path === '/tickets/admin') {
    assert.match(body, /firebase-config/);
    assert.ok(body.includes(manifest.projectId));
    if (manifest.environment === 'staging') assert.ok(!body.includes('AIzaSyBLv7MumBOjUHpmAUiu9nLfhWvwmAYKorE'));
  }
  results.push({ path, status: response.status, attempts });
}
await writeFile('tmp/release/smoke.json', JSON.stringify({ revision: manifest.revision, results }, null, 2));
console.log('Deployed project, revision, public pages and notification configuration verified.');
