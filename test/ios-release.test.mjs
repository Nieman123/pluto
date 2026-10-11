import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { iosReleaseSettings, verifyIosRelease } from '../scripts/ios/release-policy.mjs';

const sha = 'a'.repeat(40);
const env = { GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: 'workflow_dispatch', IOS_ENVIRONMENT: 'staging',
  IOS_OPERATION: 'upload-testflight', IOS_REVISION: sha, GITHUB_RUN_NUMBER: '2', GITHUB_RUN_ATTEMPT: '1' };
test('iOS release identities isolate flavors and reject untrusted triggers, revisions and operations', () => {
  assert.equal(iosReleaseSettings(env).bundleId, 'events.pluto.app.staging');
  assert.equal(iosReleaseSettings({ ...env, IOS_ENVIRONMENT: 'production' }).bundleId, 'events.pluto.app');
  for (const change of [{ GITHUB_REF: 'refs/pull/1/merge' }, { GITHUB_EVENT_NAME: 'pull_request' }, { IOS_ENVIRONMENT: 'other' },
    { IOS_OPERATION: 'submit-review' }, { IOS_REVISION: 'main' }, { IOS_REVISION: `a\n${sha}` }]) assert.throws(() => iosReleaseSettings({ ...env, ...change }));
});
test('build numbers stay unique and increase for retries and later runs within Apple version limits', () => {
  assert.equal(iosReleaseSettings(env).buildNumber, '2.1.0');
  assert.equal(iosReleaseSettings({ ...env, GITHUB_RUN_ATTEMPT: '2' }).buildNumber, '2.2.0');
  assert.equal(iosReleaseSettings({ ...env, GITHUB_RUN_NUMBER: '3' }).buildNumber, '3.1.0');
  for (const change of [{ GITHUB_RUN_NUMBER: '0' }, { GITHUB_RUN_NUMBER: '10000' }, { GITHUB_RUN_ATTEMPT: '100' }, { GITHUB_RUN_NUMBER: '2.5' }]) assert.throws(() => iosReleaseSettings({ ...env, ...change }));
});
function api({ state = 'success', trusted = true, production = true, upstreamEvent = 'workflow_dispatch' } = {}) {
  return async path => {
    if (path === '/environments/production') return production ? { can_admins_bypass: false,
      deployment_branch_policy: { custom_branch_policies: true }, protection_rules: [{ type: 'required_reviewers', prevent_self_review: false,
        reviewers: [{ type: 'User', reviewer: { id: 123 } }] }] } : {};
    if (path.includes('deployment-branch-policies')) return { branch_policies: [{ name: 'main', type: 'branch' }] };
    if (path.includes('/statuses')) return [{ state }];
    if (path.includes('/actions/runs/')) return { path: '.github/workflows/release.yml', event: upstreamEvent, head_sha: sha, head_branch: 'main', status: 'completed', conclusion: 'success' };
    return trusted ? [{ id: 42, environment: 'staging', sha, creator: { login: 'github-actions[bot]' },
      payload: { kind: 'pluto-validated-release', projectId: 'pluto-staging-92eb7', revision: sha, runId: '10', runAttempt: '1' } }] : [];
  };
}
test('both flavors need exact successful staging evidence before upload', async () => {
  for (const settings of [env, { ...env, IOS_ENVIRONMENT: 'production', PRODUCTION_APPROVAL_POLICY: 'solo-maintainer', GITHUB_ACTOR_ID: '123' }]) {
    assert.equal((await verifyIosRelease(settings, api())).revision, sha);
    assert.equal((await verifyIosRelease(settings, api({ upstreamEvent: 'push' }))).revision, sha);
    for (const failure of [{ state: 'failure' }, { state: 'in_progress' }, { trusted: false }]) await assert.rejects(verifyIosRelease(settings, api(failure)), /no completed/);
  }
});
test('production build-only still requires protected manual approval; no automatic Apple submission', async () => {
  const settings = { ...env, IOS_ENVIRONMENT: 'production', IOS_OPERATION: 'build-only', PRODUCTION_APPROVAL_POLICY: 'solo-maintainer', GITHUB_ACTOR_ID: '123' };
  await assert.rejects(verifyIosRelease(settings, api({ production: false })), /requires reviewers/);
  assert.equal((await verifyIosRelease(settings, api({ trusted: false }))).operation, 'build-only');
  await assert.rejects(verifyIosRelease({ ...settings, GITHUB_ACTOR_ID: '999' }, api()), /triggering user/);
});
test('workflow verifies ancestry before executing the selected revision and scopes credentials to protected environments', async () => {
  const workflow = await readFile('.github/workflows/ios-release.yml', 'utf8');
  assert.match(workflow, /ref: main/);
  assert.ok(workflow.indexOf('git merge-base --is-ancestor') < workflow.indexOf('git checkout --detach'));
  assert.ok(workflow.indexOf('git checkout --detach') < workflow.indexOf('npm ci'));
  assert.match(workflow, /name: \$\{\{ inputs.environment \}\}/);
  assert.match(workflow, /Xcode_26\.3/);
  assert.match(workflow, /if: \$\{\{ always\(\) \}\}[\s\S]*release-signing.py cleanup/);
  assert.doesNotMatch(workflow, /workflow_run:|pull_request:|appStoreVersionSubmissions|submit.*review/i);
  const validation = await readFile('.github/workflows/validate.yml', 'utf8');
  assert.match(validation, /actionlint.*ios-release\.yml/);
});
