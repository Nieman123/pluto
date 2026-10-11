import { readFile, mkdir, writeFile, appendFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { githubApi, verifyStagingEvidence, verifyProductionProtection } from '../release/policy.mjs';

export function iosReleaseSettings(env) {
  if (env.GITHUB_REF !== 'refs/heads/main' || env.GITHUB_EVENT_NAME !== 'workflow_dispatch') throw new Error('iOS releases must be manually started from main.');
  if (!['staging', 'production'].includes(env.IOS_ENVIRONMENT) || !['build-only', 'upload-testflight'].includes(env.IOS_OPERATION)) throw new Error('Select an iOS environment and supported operation.');
  if (!/^[a-f0-9]{40}$/.test(env.IOS_REVISION || '')) throw new Error('Use a full merged commit SHA.');
  const run = Number(env.GITHUB_RUN_NUMBER), attempt = Number(env.GITHUB_RUN_ATTEMPT);
  if (!Number.isInteger(run) || run < 1 || run > 9999 || !Number.isInteger(attempt) || attempt < 1 || attempt > 99) throw new Error('Invalid iOS workflow run number or attempt.');
  return { environment: env.IOS_ENVIRONMENT, operation: env.IOS_OPERATION, revision: env.IOS_REVISION,
    bundleId: `events.pluto.app${env.IOS_ENVIRONMENT === 'staging' ? '.staging' : ''}`, buildNumber: `${run}.${attempt}.0` };
}

export async function verifyIosRelease(env, api) {
  const settings = iosReleaseSettings(env);
  if (settings.environment === 'production') {
    verifyProductionProtection(await api('/environments/production'), env.PRODUCTION_APPROVAL_POLICY || 'two-person', env.GITHUB_ACTOR_ID);
    const branches = await api('/environments/production/deployment-branch-policies?per_page=100');
    if (branches.branch_policies?.length !== 1 || branches.branch_policies[0].name !== 'main' || branches.branch_policies[0].type !== 'branch') throw new Error('Production must be restricted to main.');
  }
  if (settings.operation === 'upload-testflight') await verifyStagingEvidence(api, settings);
  return settings;
}

export async function main(env = process.env) {
  const settings = await verifyIosRelease(env, githubApi(env));
  execFileSync('git', ['merge-base', '--is-ancestor', settings.revision, 'origin/main']);
  if (execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() !== settings.revision) throw new Error('iOS build checkout must match the selected SHA.');
  const config = JSON.parse(await readFile(`config/ios/${settings.environment}.json`, 'utf8'));
  const firebase = JSON.parse(config.PLUTO_FIREBASE_IOS_CONFIG);
  if (config.PLUTO_ENVIRONMENT !== settings.environment || firebase.iosBundleId !== settings.bundleId || config.FIREBASE_EMULATOR_HOST) throw new Error('iOS build identity is crossed or uses emulators.');
  await mkdir('tmp/ios-release', { recursive: true });
  await writeFile('tmp/ios-release/manifest.json', JSON.stringify(settings, null, 2));
  await appendFile(env.GITHUB_ENV, `IOS_BUILD_NUMBER=${settings.buildNumber}\n`);
  console.log(`Approved ${settings.environment} ${settings.operation}: ${settings.revision}, build ${settings.buildNumber}.`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });
