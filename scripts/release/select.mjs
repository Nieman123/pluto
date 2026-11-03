import { appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export function selectRelease(env) {
  if (env.GITHUB_REF !== 'refs/heads/main') throw new Error('Release workflows must run from main.');
  let environment, revision;
  if (env.GITHUB_EVENT_NAME === 'push') {
    environment = 'staging';
    revision = env.GITHUB_SHA;
  } else if (env.GITHUB_EVENT_NAME === 'workflow_dispatch') {
    environment = env.RELEASE_ENVIRONMENT;
    revision = env.RELEASE_SHA;
  } else throw new Error('Releases require a main push or manual workflow dispatch.');
  if (!['staging', 'production'].includes(environment)) throw new Error('Select staging or production.');
  if (!/^[a-f0-9]{40}$/.test(revision || '')) throw new Error('Release revision must be a full 40-character commit SHA.');
  return { environment, revision };
}

const releaseFiles = [
  'scripts/release/prepare.mjs', 'scripts/release/evidence.mjs', 'scripts/release/policy.mjs',
  'scripts/release/wait-cost-index.cjs', 'scripts/release/smoke.mjs', 'scripts/release/smoke-request.mjs',
  'scripts/release/migrate-cost-controls.mjs', 'scripts/migrate-cost-retention.cjs',
  'firebase.json', 'firestore.indexes.json', 'firestore.rules', 'storage.rules',
];

export function verifyReleaseTarget(revision, hasFile = path => {
  try {
    execFileSync('git', ['cat-file', '-e', `${revision}:${path}`], { stdio: 'ignore' });
    return true;
  } catch { return false; }
}) {
  const missing = releaseFiles.filter(path => !hasFile(path));
  if (missing.length) throw new Error(`Revision ${revision} is incompatible with this release workflow. Missing ${missing.join(', ')}. Select a compatible revision and verify it in staging.`);
}

export function main(env = process.env) {
  const selection = selectRelease(env);
  execFileSync('git', ['merge-base', '--is-ancestor', selection.revision, 'origin/main']);
  verifyReleaseTarget(selection.revision);
  appendFileSync(env.GITHUB_OUTPUT, `revision=${selection.revision}\nenvironment=${selection.environment}\n`);
  console.log(`Selected ${selection.environment} release ${selection.revision} (${env.GITHUB_EVENT_NAME}).`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
