import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { apps, appSettings, buildNumber, releaseSelection, certificateFingerprint, validatePlayAccount, verifyNativeConfig, automaticSelection } from '../scripts/android/play-policy.mjs';
import { publishInternal } from '../scripts/android/publish-internal.mjs';

const revision = 'a'.repeat(40), env = { GITHUB_REF: 'refs/heads/main', PLAY_ENVIRONMENT: 'staging', PLAY_OPERATION: 'publish-internal',
  PLAY_REVISION: revision, GITHUB_RUN_NUMBER: '8', GITHUB_RUN_ATTEMPT: '1', GITHUB_REPOSITORY: 'Nieman123/pluto' };
test('release scope is merged-main only with fixed environment package and internal track', () => {
  const selected = releaseSelection(env);
  assert.equal(selected.packageName, 'events.pluto.app.staging'); assert.equal(selected.track, 'internal');
  assert.equal(releaseSelection({ ...env, PLAY_ENVIRONMENT: 'production' }).packageName, 'events.pluto.app');
  for (const change of [{ GITHUB_REF: 'refs/pull/1/merge' }, { PLAY_ENVIRONMENT: 'other' }, { PLAY_OPERATION: 'production' }, { PLAY_REVISION: 'main' }]) assert.throws(() => releaseSelection({ ...env, ...change }));
  assert.throws(() => appSettings('constructor'));
});
test('version codes are monotonic across workflow runs and attempts, including rollback code', () => {
  assert.ok(buildNumber(9, 1) > buildNumber(8, 99));
  assert.ok(buildNumber(8, 2) > buildNumber(8, 1));
  for (const [run, retry] of [[0, 1], [1, 0], [1, 100], [21_000_000, 1], ['invalid', 1]]) assert.throws(() => buildNumber(run, retry));
});
test('public config validates the intended native project and excludes emulator builds', async () => {
  for (const flavor of ['staging', 'production']) await verifyNativeConfig(appSettings(flavor));
  const config = JSON.parse(await readFile('config/android/staging.json', 'utf8'));
  for (const change of [{ PLUTO_ENVIRONMENT: 'production' }, { PLUTO_API_BASE_URL: 'https://pluto.events' }, { FIREBASE_EMULATOR_HOST: '127.0.0.1' },
    { PLUTO_FIREBASE_ANDROID_CONFIG: JSON.stringify({ projectId: apps.staging.projectId, appId: '1:702489323300:web:test' }) }]) {
    await assert.rejects(verifyNativeConfig(appSettings('staging'), async () => JSON.stringify({ ...config, ...change })));
  }
});
test('publisher credentials and certificate metadata cannot cross environments or OAuth endpoints', () => {
  const account = { type: 'service_account', project_id: apps.staging.projectId, client_email: `github-play-publisher@${apps.staging.projectId}.iam.gserviceaccount.com`,
    private_key: '-----BEGIN PRIVATE KEY-----\nsynthetic-fixture\n-----END PRIVATE KEY-----', token_uri: 'https://oauth2.googleapis.com/token' };
  validatePlayAccount(JSON.stringify(account), appSettings('staging'));
  assert.throws(() => validatePlayAccount(JSON.stringify(account), appSettings('production')));
  assert.throws(() => validatePlayAccount(JSON.stringify({ ...account, token_uri: 'https://untrusted.example/token' }), appSettings('staging')));
  assert.throws(() => validatePlayAccount(JSON.stringify({ ...account, client_email: `github-staging-deployer@${apps.staging.projectId}.iam.gserviceaccount.com` }), appSettings('staging')));
  assert.throws(() => validatePlayAccount('{}', appSettings('staging')));
  assert.equal(certificateFingerprint('ab:'.repeat(31) + 'ab'), 'AB:'.repeat(31) + 'AB');
  assert.throws(() => certificateFingerprint('debug'));
});
test('automatic updates require opt-in and exact successful staging evidence, and skip production/fork/failed runs', async () => {
  const run = { id: 10, run_attempt: 1, path: '.github/workflows/release.yml', event: 'workflow_dispatch', head_branch: 'main',
    head_repository: { full_name: 'Nieman123/pluto' }, status: 'completed', conclusion: 'success' };
  const deployment = { id: 11, environment: 'staging', sha: revision, creator: { login: 'github-actions[bot]' },
    payload: { kind: 'pluto-validated-release', projectId: apps.staging.projectId, revision, runId: '10', runAttempt: '1' } };
  let selectedRun = run, selectedDeployments = [deployment], state = 'success';
  const api = async path => path.includes('/statuses') ? [{ state }] : path.startsWith('/actions/runs/') ? selectedRun : selectedDeployments;
  const automatic = { ...env, ANDROID_STAGING_AUTO_PUBLISH: 'true' }, event = { workflow_run: { id: 10 } };
  assert.equal((await automaticSelection(automatic, event, api)).revision, revision);
  assert.equal(await automaticSelection(env, event, () => { throw new Error('must not request'); }), null);
  for (const change of [{ conclusion: 'failure' }, { head_repository: { full_name: 'attacker/fork' } }, { head_branch: 'other' }, { path: '.github/workflows/untrusted.yml' }]) {
    selectedRun = { ...run, ...change }; assert.equal(await automaticSelection(automatic, event, api), null);
  }
  selectedRun = run; selectedDeployments = [{ ...deployment, environment: 'production' }];
  assert.equal(await automaticSelection(automatic, event, api), null);
  selectedDeployments = [deployment]; state = 'in_progress'; await assert.rejects(automaticSelection(automatic, event, api));
});

function publisherHarness(options = {}) {
  const calls = [], bundle = Buffer.from('signed bundle fixture'), manifest = { ...releaseSelection(env), bundleSha256: createHash('sha256').update(bundle).digest('hex') };
  const fetcher = async (url, request) => {
    calls.push({ url, method: request.method, body: request.body });
    assert.equal(new URL(url).host, 'androidpublisher.googleapis.com'); assert.equal(request.redirect, 'error');
    assert.equal(request.headers.Authorization, 'Bearer synthetic-token');
    if (options.failure && url.includes(options.failure)) return new Response('{}', { status: 400 });
    if (request.method === 'DELETE') return new Response(null, { status: 204 });
    let data = {};
    if (url.endsWith('/edits')) data = { id: 'edit-1' };
    else if (url.endsWith('/tracks')) data = { tracks: [{ track: 'internal', releases: options.draft ? [{ status: 'draft', versionCodes: ['2'] }] : [{ status: 'completed', versionCodes: ['2'] }] }, { track: 'production', releases: [{ status: 'completed', versionCodes: ['1'] }] }] };
    else if (url.endsWith('/bundles')) data = { bundles: [{ versionCode: options.newer ? manifest.versionCode : 2 }] };
    else if (url.includes('uploadType=media')) data = { versionCode: manifest.versionCode, sha256: options.tampered ? 'incorrect' : manifest.bundleSha256 };
    return Response.json(data);
  };
  return { calls, manifest, bundle, fetcher, token: 'synthetic-token' };
}
test('publisher binds signed hash/version, updates only internal, validates and commits without canceling reviews', async () => {
  const h = publisherHarness(), result = await publishInternal(h);
  assert.equal(result.committed, true); assert.equal(result.track, 'internal');
  const update = h.calls.find(c => c.method === 'PUT');
  assert.match(update.url, /\/tracks\/internal$/); assert.equal(JSON.parse(update.body).releases[0].status, 'completed');
  assert.ok(h.calls.some(c => c.url.endsWith(':validate')));
  assert.match(h.calls.at(-1).url, /:commit\?changesInReviewBehavior=ERROR_IF_IN_REVIEW$/);
  assert.equal(h.calls.filter(c => c.url.includes('/tracks/production')).length, 0);
});
test('drafts and stale build numbers abort before upload; failed uploads/hash mismatches never commit and clean up their edit', async () => {
  for (const options of [{ draft: true }, { newer: true }, { failure: 'uploadType=media' }, { tampered: true }, { failure: ':commit' }]) {
    const h = publisherHarness(options); await assert.rejects(publishInternal(h));
    assert.equal(h.calls.at(-1).method, 'DELETE');
    if (options.draft || options.newer) assert.ok(!h.calls.some(c => c.url.includes('/upload/')));
    if (options.failure !== ':commit') assert.ok(!h.calls.some(c => c.url.includes(':commit')));
  }
});
test('crossed package, unsupported track, bootstrap bundle and modified file fail before API authentication', async () => {
  for (const change of [{ packageName: apps.production.packageName }, { track: 'production' }, { operation: 'build-only' }, { bundleSha256: 'wrong' }]) {
    const h = publisherHarness(); h.manifest = { ...h.manifest, ...change };
    await assert.rejects(publishInternal(h)); assert.equal(h.calls.length, 0);
  }
});
