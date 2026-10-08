import { readFile } from 'node:fs/promises';
import { verifyStagingEvidence } from '../release/policy.mjs';

export const apps = Object.freeze({
  staging: { packageName: 'events.pluto.app.staging', projectId: 'pluto-staging-92eb7' },
  production: { packageName: 'events.pluto.app', projectId: 'pluto-9b6ca' },
});
export function appSettings(environment) {
  if (!Object.hasOwn(apps, environment)) throw new Error('Select staging or production.');
  return { environment, ...apps[environment], track: 'internal' };
}
export function buildNumber(runNumber, attempt) {
  const run = Number(runNumber), retry = Number(attempt);
  if (!Number.isSafeInteger(run) || run < 1 || !Number.isInteger(retry) || retry < 1 || retry > 99) throw new Error('Invalid workflow run number/attempt.');
  const version = 1_000_000 + run * 100 + retry;
  if (version > 2_100_000_000) throw new Error('Android version code exceeds the Play limit.');
  return version;
}
export function releaseSelection(env) {
  if (env.GITHUB_REF !== 'refs/heads/main') throw new Error('Android releases must run from main.');
  const settings = appSettings(env.PLAY_ENVIRONMENT);
  if (!/^[a-f0-9]{40}$/.test(env.PLAY_REVISION || '')) throw new Error('Use a full merged commit SHA.');
  if (!['build-only', 'publish-internal'].includes(env.PLAY_OPERATION)) throw new Error('Unknown Android release operation.');
  return { ...settings, revision: env.PLAY_REVISION, operation: env.PLAY_OPERATION,
    versionCode: buildNumber(env.GITHUB_RUN_NUMBER, env.GITHUB_RUN_ATTEMPT) };
}
export function certificateFingerprint(value) {
  if (!/^([A-Fa-f0-9]{2}:){31}[A-Fa-f0-9]{2}$/.test(value || '')) throw new Error('Set the upload certificate SHA-256 fingerprint.');
  return value.toUpperCase();
}
export function validatePlayAccount(raw, settings) {
  let account;
  try { account = JSON.parse(raw || '{}'); } catch { throw new Error('Invalid Google Play service account JSON.'); }
  if (account.type !== 'service_account' || account.project_id !== settings.projectId ||
      account.client_email !== `github-play-publisher@${settings.projectId}.iam.gserviceaccount.com` ||
      !account.private_key?.includes('BEGIN PRIVATE KEY') ||
      account.token_uri !== 'https://oauth2.googleapis.com/token') throw new Error('Use the dedicated Play publisher from this environment project.');
  return account;
}
export async function verifyNativeConfig(settings, reader = readFile) {
  const config = JSON.parse(await reader(`config/android/${settings.environment}.json`, 'utf8'));
  const firebase = JSON.parse(config.PLUTO_FIREBASE_ANDROID_CONFIG || '{}');
  if (config.PLUTO_ENVIRONMENT !== settings.environment || firebase.projectId !== settings.projectId || !/:android:/.test(firebase.appId || '') ||
      config.PLUTO_API_BASE_URL !== (settings.environment === 'staging' ? 'https://pluto-staging-92eb7.web.app' : 'https://pluto.events') ||
      config.FIREBASE_EMULATOR_HOST) throw new Error('Android compile-time configuration is crossed or uses emulators.');
}
export async function automaticSelection(env, event, api) {
  if (env.ANDROID_STAGING_AUTO_PUBLISH !== 'true') return null;
  const id = event.workflow_run?.id;
  if (!Number.isSafeInteger(id) || id < 1) throw new Error('Missing upstream release identity.');
  const run = await api(`/actions/runs/${id}`);
  if (run.path !== '.github/workflows/release.yml' || run.event !== 'workflow_dispatch' ||
      run.head_branch !== 'main' || run.head_repository?.full_name?.toLowerCase() !== env.GITHUB_REPOSITORY?.toLowerCase() ||
      run.status !== 'completed' || run.conclusion !== 'success') return null;
  const deployments = await api('/deployments?environment=staging&per_page=100');
  const deployment = deployments.find(d => d.environment === 'staging' && d.creator?.login === 'github-actions[bot]' &&
    d.payload?.kind === 'pluto-validated-release' && String(d.payload.runId) === String(id) &&
    String(d.payload.runAttempt) === String(run.run_attempt) && d.payload.projectId === apps.staging.projectId &&
    d.sha === d.payload.revision);
  // Production website releases must never silently ship the staging app.
  if (!deployment) return null;
  const settings = releaseSelection({ ...env, PLAY_ENVIRONMENT: 'staging', PLAY_REVISION: deployment.sha, PLAY_OPERATION: 'publish-internal' });
  await verifyStagingEvidence(api, settings);
  return settings;
}
