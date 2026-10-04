const { test } = require('node:test');
const assert = require('node:assert/strict');
const projects = require('../src/deployment-projects.json');
process.env.GCLOUD_PROJECT = projects.staging;
process.env.PLUTO_ENVIRONMENT = 'staging';
process.env.PLUTO_RELEASE_SHA = 'a'.repeat(40);
process.env.TICKETING_MODE = 'test';
process.env.TICKETING_LIVE_READY = 'false';
process.env.TICKETING_WALLETS_ENABLED = 'false';
process.env.PUBLIC_SITE_PREVIEW = 'true';
process.env.PLUTO_FIREBASE_WEB_CONFIG = JSON.stringify({ apiKey: 'staging-public-fixture', appId: '1:987654:web:abcdef123', messagingSenderId: '987654',
  projectId: projects.staging, authDomain: `${projects.staging}.firebaseapp.com`, storageBucket: `${projects.staging}.firebasestorage.app` });
for (const key of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST', 'FIREBASE_STORAGE_EMULATOR_HOST', 'TICKETING_BASE_URL', 'TICKETING_STORAGE_BUCKET', 'WAIVER_STORAGE_BUCKET']) delete process.env[key];
const { app } = require('../lib/index');
const { allowedSiteOrigins } = require('../lib/deployment-config');

test('staging SSR and release identity use staging Auth, no Analytics and noindex headers without cloud reads', async () => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(done => server.once('listening', done));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const identity = await (await fetch(`${base}/__deployment`)).json();
    assert.deepEqual(identity, { environment: 'staging', projectId: projects.staging, revision: 'a'.repeat(40), paymentMode: 'test' });
    for (const path of ['/', '/tickets/admin']) {
      const response = await fetch(`${base}${path}`), body = await response.text();
      assert.equal(response.status, 200); assert.match(response.headers.get('x-robots-tag'), /noindex/);
      const embedded = body.match(/<script[^>]+id="firebase-config"[^>]*>([\s\S]*?)<\/script>/);
      assert.ok(embedded); const config = JSON.parse(embedded[1]);
      assert.equal(config.projectId, projects.staging); assert.equal(config.authDomain, `${projects.staging}.firebaseapp.com`);
      assert.equal(config.measurementId, undefined); assert.ok(!body.includes('G-Y6GBW8P032'));
    }
    const response = await fetch(`${base}/tickets/api/order`, { method: 'POST', headers: { Origin: projects.productionBaseUrl, 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(response.status, 403);
    assert.ok(allowedSiteOrigins().has(projects.stagingBaseUrl)); assert.ok(!allowedSiteOrigins().has(projects.productionBaseUrl));
  } finally { await new Promise(done => server.close(done)); }
});
