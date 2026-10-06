const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { resolve } = require('node:path');

const ticketingSecrets = ['RESEND_API_KEY', 'STRIPE_RESTRICTED_KEY', 'STRIPE_WEBHOOK_SECRET', 'TICKETING_SIGNING_KEY'];

function discover(walletFlag, deliveryFlag, rotationFlag) {
  const env = { ...process.env, GCLOUD_PROJECT: 'pluto-staging-92eb7', PLUTO_ENVIRONMENT: 'staging',
    TICKETING_MODE: 'test', TICKETING_LIVE_READY: 'false', PUBLIC_SITE_PREVIEW: 'true',
    PLUTO_FIREBASE_WEB_CONFIG: JSON.stringify({ apiKey: 'staging-public-fixture', appId: '1:987654:web:abcdef123',
      messagingSenderId: '987654', projectId: 'pluto-staging-92eb7', authDomain: 'pluto-staging-92eb7.firebaseapp.com',
      storageBucket: 'pluto-staging-92eb7.firebasestorage.app' }) };
  for (const name of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST', 'FIREBASE_STORAGE_EMULATOR_HOST',
    'TICKETING_WALLET_CREDENTIALS', 'TICKETING_WALLETS_ENABLED', 'TICKETING_BASE_URL', 'TICKETING_STORAGE_BUCKET',
    'WAIVER_STORAGE_BUCKET']) delete env[name];
  if (walletFlag !== undefined) env.TICKETING_WALLETS_ENABLED = walletFlag;
  delete env.RESEND_WEBHOOK_SECRET; delete env.TICKETING_RESEND_WEBHOOK_ENABLED;
  delete env.TICKETING_KEY_ROTATION_ENABLED; delete env.TICKETING_VERIFICATION_KEYRING; delete env.TICKETING_SCANNER_PIN_KEYS;
  if (rotationFlag !== undefined) env.TICKETING_KEY_ROTATION_ENABLED = rotationFlag;
  if (deliveryFlag !== undefined) env.TICKETING_RESEND_WEBHOOK_ENABLED = deliveryFlag;
  if (walletFlag === 'true') {
    // Staging intentionally prohibits wallet exports. Check opt-in discovery in production.
    env.GCLOUD_PROJECT = 'pluto-9b6ca';
    env.PLUTO_ENVIRONMENT = 'production';
    delete env.PLUTO_FIREBASE_WEB_CONFIG;
  }
  // Use the installed SDK's discovery loader, as the Firebase CLI does before deployment.
  // A fresh process is necessary because parameter declarations are global to the SDK.
  const child = spawnSync(process.execPath, ['-e', `
    const { dirname, join } = require('node:path');
    const { loadStack } = require(join(dirname(require.resolve('firebase-functions/params')), '..', 'runtime', 'loader.js'));
    loadStack(process.cwd()).then(stack => process.stdout.write(JSON.stringify({
      params: (stack.params || []).map(param => param.name).sort(),
      endpoints: Object.fromEntries(Object.entries(stack.endpoints).map(([name, endpoint]) =>
        [name, (endpoint.secretEnvironmentVariables || []).map(secret => secret.key).sort()]))
    }), () => process.exit(0))).catch(error => { console.error(error.message); process.exit(1); });
  `], { cwd: resolve(__dirname, '..'), env, encoding: 'utf8', timeout: 20000 });
  assert.equal(child.status, 0, child.stderr || String(child.error));
  return JSON.parse(child.stdout);
}

test('Firebase discovery does not require wallet credentials when wallet exports are disabled or unset', () => {
  for (const flag of ['false', undefined]) {
    const manifest = discover(flag);
    assert.deepEqual(manifest.params, ticketingSecrets);
    for (const endpoint of ['ticketingFinancialWorker', 'ticketingFinancialBackfillWorker']) assert.deepEqual(manifest.endpoints[endpoint], [], `${endpoint} requires no payment/email credentials`);
    for (const endpoint of ['publicSite', 'ticketingWebhookWorker', 'ticketingEmailWorker', 'ticketingCampaignWorker', 'ticketingRecoveryWorker', 'ticketingMaintenance', 'ticketingCommunicationMaintenance', 'ticketingEmailMaintenance']) {
      assert.deepEqual(manifest.endpoints[endpoint], ticketingSecrets);
    }
  }
});

test('rotation discovery binds both optional migration secrets to every ticketing runtime', () => {
  const manifest = discover('false', undefined, 'true');
  const withRotation = [...ticketingSecrets, 'TICKETING_VERIFICATION_KEYRING', 'TICKETING_SCANNER_PIN_KEYS'].sort();
  assert.deepEqual(manifest.params, withRotation);
  for (const [endpoint, secrets] of Object.entries(manifest.endpoints)) {
    if (endpoint === 'publicSite' || endpoint.startsWith('ticketing') && !endpoint.startsWith('ticketingFinancial')) assert.deepEqual(secrets, withRotation, endpoint);
  }
});

test('Firebase discovery requires enabled wallet credentials only on the public site function', () => {
  const manifest = discover('true');
  const withWallet = [...ticketingSecrets, 'TICKETING_WALLET_CREDENTIALS'].sort();
  assert.deepEqual(manifest.params, withWallet);
  assert.deepEqual(manifest.endpoints.publicSite, withWallet);
  for (const endpoint of ['ticketingWebhookWorker', 'ticketingEmailWorker', 'ticketingCampaignWorker', 'ticketingRecoveryWorker', 'ticketingMaintenance', 'ticketingCommunicationMaintenance', 'ticketingEmailMaintenance']) {
    assert.deepEqual(manifest.endpoints[endpoint], ticketingSecrets);
  }
});
test('Resend webhook secret is declared only when delivery tracking is enabled', () => {
  const manifest = discover('false', 'true'), withDelivery = [...ticketingSecrets, 'RESEND_WEBHOOK_SECRET'].sort();
  assert.deepEqual(manifest.params, withDelivery); assert.deepEqual(manifest.endpoints.publicSite, withDelivery);
  for (const endpoint of ['ticketingWebhookWorker', 'ticketingEmailWorker', 'ticketingCampaignWorker', 'ticketingRecoveryWorker', 'ticketingMaintenance', 'ticketingCommunicationMaintenance', 'ticketingEmailMaintenance']) assert.deepEqual(manifest.endpoints[endpoint], ticketingSecrets);
});
