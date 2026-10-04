const { test } = require('node:test');
const assert = require('node:assert/strict');
const { deploymentConfig, validateWebConfig, productionWebConfig } = require('../lib/deployment-config');
const projects = require('../src/deployment-projects.json');
const web = { apiKey: 'staging-public-api-key', appId: '1:987654:web:abcdef123', messagingSenderId: '987654',
  projectId: projects.staging, authDomain: `${projects.staging}.firebaseapp.com`, storageBucket: `${projects.staging}.firebasestorage.app` };
const env = { PLUTO_ENVIRONMENT: 'staging', GCLOUD_PROJECT: projects.staging, PLUTO_FIREBASE_WEB_CONFIG: JSON.stringify(web),
  TICKETING_MODE: 'test', TICKETING_LIVE_READY: 'false' };

test('staging resolves all Firebase services and URLs to its isolated project', () => {
  const config = deploymentConfig(env);
  assert.equal(config.web.projectId, projects.staging); assert.equal(config.baseUrl, projects.stagingBaseUrl);
  assert.equal(config.web.measurementId, undefined);
});
test('staging rejects missing configuration, production values, wrong runtime and live payments', () => {
  for (const change of [{ PLUTO_FIREBASE_WEB_CONFIG: '' }, { GCLOUD_PROJECT: projects.production }, { TICKETING_MODE: 'live' },
    { TICKETING_LIVE_READY: 'true' }, { TICKETING_BASE_URL: projects.productionBaseUrl }, { TICKETING_WALLETS_ENABLED: 'true' },
    { PLUTO_FIREBASE_WEB_CONFIG: JSON.stringify(productionWebConfig) }]) assert.throws(() => deploymentConfig({ ...env, ...change }));
  for (const change of [{ authDomain: productionWebConfig.authDomain }, { storageBucket: productionWebConfig.storageBucket },
    { apiKey: productionWebConfig.apiKey }, { appId: productionWebConfig.appId }, { measurementId: productionWebConfig.measurementId },
    { private_key: 'must-never-be-client-config' }]) assert.throws(() => validateWebConfig({ ...web, ...change }, projects.staging, true));
});
test('unconfigured cloud staging cannot silently fall back to production', () => {
  assert.throws(() => deploymentConfig({ GCLOUD_PROJECT: projects.staging }));
  assert.equal(deploymentConfig({ GCLOUD_PROJECT: projects.production }).web.projectId, projects.production);
});
test('emulators require demo projects and loopback endpoints', () => {
  assert.throws(() => deploymentConfig({ GCLOUD_PROJECT: projects.production, FIRESTORE_EMULATOR_HOST: '127.0.0.1:8185' }));
  assert.throws(() => deploymentConfig({ GCLOUD_PROJECT: 'demo-pluto-ticketing', FIRESTORE_EMULATOR_HOST: 'remote:8185' }));
  assert.equal(deploymentConfig({ GCLOUD_PROJECT: 'demo-pluto-ticketing', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8185' }).web.apiKey, 'demo-preview-key');
});
