const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { appCheckGuard, appCheckMode, appCheckProtectedPaths } = require('../lib/ticketing/app-check');
const { deploymentConfig, productionAppCheckSiteKey, validateAppCheckSiteKey } = require('../lib/deployment-config');
const projects = require('../src/deployment-projects.json');

async function call(mode, path, headers = {}) {
  const verified = [];
  const app = express();
  app.use('/tickets/api', appCheckGuard({ mode: () => mode, verify: async token => { verified.push(token); if (token !== 'good-token') throw new Error('bad'); } }),
    (_req, res) => res.json({ appCheck: res.locals.appCheck || 'skipped' }));
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ code: error.code }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/tickets/api${path}`, { method: 'POST', headers });
    return { status: response.status, body: await response.json(), verified };
  } finally { await new Promise(resolve => server.close(resolve)); }
}

test('App Check enforcement rejects missing and forged tokens only on protected customer routes', async () => {
  assert.deepEqual(await call('enforce', '/checkout', { 'X-Firebase-AppCheck': 'good-token' }), { status: 200, body: { appCheck: 'verified' }, verified: ['good-token'] });
  for (const headers of [{}, { 'X-Firebase-AppCheck': 'forged' }, { 'X-Firebase-AppCheck': 'x'.repeat(5000) }]) {
    const result = await call('enforce', '/rewards/claim', headers);
    assert.equal(result.status, 401); assert.equal(result.body.code, 'app-check-failed');
  }
  for (const path of ['/staff/scan', '/order', '/scanner/login']) assert.deepEqual((await call('enforce', path)).body, { appCheck: 'skipped' }, path);
  for (const path of ['/checkout', '/rsvp', '/recover', '/rewards/claim', '/rewards/redeem', '/native-checkout/create']) assert.ok(appCheckProtectedPaths.has(path), path);
});

test('App Check monitor mode records failures without blocking; off skips verification', async () => {
  assert.deepEqual((await call('monitor', '/checkout')), { status: 200, body: { appCheck: 'unverified' }, verified: [] });
  assert.equal((await call('monitor', '/checkout', { 'X-Firebase-AppCheck': 'forged' })).body.appCheck, 'unverified');
  assert.deepEqual((await call('off', '/checkout', { 'X-Firebase-AppCheck': 'forged' })), { status: 200, body: { appCheck: 'skipped' }, verified: [] });
});

test('App Check mode defaults to monitor in deployments, off in emulators, and rejects unknown values', () => {
  assert.equal(appCheckMode({}), 'monitor');
  assert.equal(appCheckMode({ FIRESTORE_EMULATOR_HOST: '127.0.0.1:8185' }), 'off');
  assert.equal(appCheckMode({ TICKETING_APP_CHECK: 'enforce' }), 'enforce');
  assert.throws(() => appCheckMode({ TICKETING_APP_CHECK: 'true' }), /off, monitor or enforce/);
});

test('the production site key is public page config; staging cannot reuse it', () => {
  assert.equal(deploymentConfig({ GCLOUD_PROJECT: projects.production }).appCheckSiteKey, productionAppCheckSiteKey);
  assert.equal(deploymentConfig({ GCLOUD_PROJECT: projects.production, PLUTO_APP_CHECK_SITE_KEY: '' }).appCheckSiteKey, '');
  assert.equal(deploymentConfig({ GCLOUD_PROJECT: 'demo-pluto-ticketing', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8185' }).appCheckSiteKey, '');
  assert.throws(() => validateAppCheckSiteKey(productionAppCheckSiteKey, true), /production App Check/);
  assert.throws(() => validateAppCheckSiteKey('<script>', false), /malformed/);
});
