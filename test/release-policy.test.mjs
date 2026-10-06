import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { releaseSettings, verifyServiceAccount, verifyProductionProtection, verifyStagingEvidence, projects, dotenvParameters } from '../scripts/release/policy.mjs';
import { browserEnvironment, ciStripeFixture } from '../scripts/ci/browser-suite.mjs';

const sha = 'a'.repeat(40);
const web = { apiKey: 'staging-public-key', appId: '1:987654:web:abcdef123', messagingSenderId: '987654', projectId: projects.staging,
  authDomain: `${projects.staging}.firebaseapp.com`, storageBucket: `${projects.staging}.firebasestorage.app` };
const env = { RELEASE_ENVIRONMENT: 'staging', RELEASE_SHA: sha, GITHUB_REF: 'refs/heads/main', DEPLOY_PROJECT_ID: projects.staging,
  DEPLOY_WEB_CONFIG: JSON.stringify(web), DEPLOY_PAYMENT_MODE: 'test', DEPLOY_STRIPE_PUBLISHABLE_KEY: 'pk_test_fakePublicFixture' };

test('release selection rejects untrusted branches, missing configuration and cross-project deployment', () => {
  assert.equal(releaseSettings(env).projectId, projects.staging);
  for (const change of [{ GITHUB_REF: 'refs/heads/native-ticketing' }, { RELEASE_SHA: 'main' }, { DEPLOY_PROJECT_ID: projects.production },
    { DEPLOY_WEB_CONFIG: '' }, { DEPLOY_PAYMENT_MODE: 'live' }, { DEPLOY_STRIPE_PUBLISHABLE_KEY: 'pk_live_fixture' }]) {
    assert.throws(() => releaseSettings({ ...env, ...change }));
  }
});
test('production requires explicit confirmation and separate approval for live payments', () => {
  const config = { ...web, projectId: projects.production, authDomain: `${projects.production}.firebaseapp.com`, storageBucket: `${projects.production}.appspot.com` };
  const production = { ...env, RELEASE_ENVIRONMENT: 'production', DEPLOY_PROJECT_ID: projects.production, DEPLOY_WEB_CONFIG: JSON.stringify(config) };
  assert.throws(() => releaseSettings(production));
  production.RELEASE_CONFIRMATION = `deploy ${projects.production}`;
  assert.equal(releaseSettings(production).mode, 'test');
  production.DEPLOY_PAYMENT_MODE = 'live'; production.DEPLOY_STRIPE_PUBLISHABLE_KEY = 'pk_live_fixture';
  assert.throws(() => releaseSettings(production));
  assert.equal(releaseSettings({ ...production, RELEASE_LIVE_APPROVED: 'true' }).mode, 'live');
});
test('deployment credential must belong to the intended Firebase project', () => {
  const account = { type: 'service_account', project_id: projects.staging, private_key: 'synthetic-fixture-only', client_email: `deploy@${projects.staging}.iam.gserviceaccount.com` };
  verifyServiceAccount(JSON.stringify(account), projects.staging);
  assert.throws(() => verifyServiceAccount(JSON.stringify(account), projects.production));
  assert.throws(() => verifyServiceAccount('{}', projects.staging));
});
test('dotenv release configuration preserves JSON and rejects newline injection', () => {
  assert.equal(dotenvParameters({ PLUTO_FIREBASE_WEB_CONFIG: JSON.stringify(web) }), `PLUTO_FIREBASE_WEB_CONFIG='${JSON.stringify(web)}'\n`);
  assert.throws(() => dotenvParameters({ TICKETING_BASE_URL: 'url\nUNEXPECTED=value' }));
  assert.throws(() => dotenvParameters({ PARAM: "can't-break-quoting" }));
});
test('production fails closed when GitHub reviewer protections are missing or bypassable', () => {
  const protection = { protection_rules: [{ type: 'required_reviewers', prevent_self_review: true, reviewers: [{ type: 'User' }] }],
    can_admins_bypass: false, deployment_branch_policy: { custom_branch_policies: true } };
  verifyProductionProtection(protection);
  for (const change of [{ can_admins_bypass: true }, { protection_rules: [] }, { deployment_branch_policy: null }]) {
    assert.throws(() => verifyProductionProtection({ ...protection, ...change }));
  }
});

const deployment = { id: 42, sha, environment: 'staging', creator: { login: 'github-actions[bot]' }, payload: {
  kind: 'pluto-validated-release', projectId: projects.staging, revision: sha, runId: '1234', runAttempt: '1' } };
const completed = { path: '.github/workflows/release.yml', event: 'workflow_dispatch', head_branch: 'main', status: 'completed', conclusion: 'success' };
function fakeApi(record = deployment, state = 'success', run = completed) {
  return async path => path.startsWith('/deployments?') ? [record] : path.includes('/statuses') ? [{ state }] : run;
}
test('production accepts only completed staging release evidence for the exact commit and project', async () => {
  assert.equal(await verifyStagingEvidence(fakeApi(), { revision: sha }), 42);
  const changes = [{ sha: 'b'.repeat(40) }, { environment: 'production' }, { creator: { login: 'someone' } },
    { payload: {} }, { payload: { ...deployment.payload, projectId: projects.production } }, { payload: { ...deployment.payload, revision: 'b'.repeat(40) } }];
  for (const change of changes) await assert.rejects(verifyStagingEvidence(fakeApi({ ...deployment, ...change }), { revision: sha }));
  for (const state of ['failure', 'in_progress', 'inactive']) await assert.rejects(verifyStagingEvidence(fakeApi(deployment, state), { revision: sha }));
  for (const change of [{ status: 'in_progress' }, { conclusion: 'failure' }, { path: '.github/workflows/build.yml' }, { head_branch: 'native-ticketing' }, { event: 'pull_request' }]) {
    await assert.rejects(verifyStagingEvidence(fakeApi(deployment, 'success', { ...completed, ...change }), { revision: sha }));
  }
});
test('CI browser runner refuses cloud endpoints and discards payment and email credentials', () => {
  const input = { GCLOUD_PROJECT: 'demo-pluto-ticketing', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8185', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9095', FIREBASE_STORAGE_EMULATOR_HOST: '127.0.0.1:9295',
    STRIPE_RESTRICTED_KEY: 'sk_live_mustNotBeInherited', RESEND_API_KEY: 'real-key-placeholder' };
  const output = browserEnvironment(input);
  assert.equal(output.STRIPE_RESTRICTED_KEY, ciStripeFixture); assert.equal(output.RESEND_API_KEY, undefined);
  assert.ok(output.TICKETING_SIGNING_KEY); assert.equal(output.TICKETING_MODE, 'test');
  assert.notEqual(browserEnvironment(input).TICKETING_SIGNING_KEY, output.TICKETING_SIGNING_KEY);
  for (const change of [{ GCLOUD_PROJECT: projects.production }, { FIREBASE_AUTH_EMULATOR_HOST: 'remote:9095' }, { FIREBASE_STORAGE_EMULATOR_HOST: '' }]) {
    assert.throws(() => browserEnvironment({ ...input, ...change }));
  }
});
test('PR workflow has no deployment, credential inheritance or privileged PR trigger', async () => {
  const pr = await readFile('.github/workflows/build.yml', 'utf8');
  const validation = await readFile('.github/workflows/validate.yml', 'utf8');
  assert.ok(pr.includes('pull_request:')); assert.ok(pr.includes('merge_group:'));
  for (const text of [pr, validation]) assert.doesNotMatch(text, /pull_request_target|secrets: inherit|secrets\.|deployments: write|firebase-tools[^\n]+ deploy/);
  assert.match(validation, /test:ci:browser/);
  const aliases = JSON.parse(await readFile('.firebaserc', 'utf8'));
  assert.equal(aliases.projects.staging, projects.staging);
  const flutter = await readFile('lib/firebase_options.dart', 'utf8');
  assert.ok(flutter.includes(projects.staging));
});
test('release adds required indexes without forcing deletion of existing indexes or TTL overrides', async () => {
  const release = await readFile('.github/workflows/release.yml', 'utf8');
  const deployments = [...release.matchAll(/run: ([^\n]*firebase-tools[^\n]* deploy[^\n]*)/g)].map(m => m[1]);
  const indexDeploys = deployments.filter(command => command.includes('firestore:indexes'));
  assert.equal(indexDeploys.length, 1); assert.match(indexDeploys[0], /--non-interactive/); assert.doesNotMatch(indexDeploys[0], /--force/);
  assert.ok(deployments.some(command => command.includes('functions:ticketingMaintenance') && command.includes('--force')));
  for (const name of ['ticketingFinancialWorker', 'ticketingFinancialBackfillWorker', 'ticketingCampaignWorker', 'ticketingRecoveryWorker', 'ticketingCommunicationMaintenance', 'ticketingEmailMaintenance']) {
    assert.ok(deployments.some(command => command.includes(`functions:${name}`)), `Release includes ${name}`);
  }
});

test('current and past events reach the server through Firebase Hosting and release probes', async () => {
  const config = JSON.parse(await readFile('firebase.json', 'utf8'));
  for (const path of ['/events', '/past-events']) {
    const rewrite = config.hosting.rewrites.find(rule => rule.source === path);
    assert.deepEqual(rewrite?.function, { functionId: 'publicSite', region: 'us-central1' }, `${path} must reach publicSite`);
  }
  const smoke = await readFile('scripts/release/smoke.mjs', 'utf8');
  assert.match(smoke, /'\/past-events'/, 'Release must check the deployed archive route');
});
