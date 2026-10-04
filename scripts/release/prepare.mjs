import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { releaseSettings, verifyServiceAccount, verifyProductionProtection, verifyStagingEvidence, githubApi, dotenvParameters } from './policy.mjs';

const settings = releaseSettings(process.env);
const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (head !== settings.revision) throw new Error('Checkout does not match the selected release revision.');
execFileSync('git', ['merge-base', '--is-ancestor', settings.revision, 'origin/main']);
verifyServiceAccount(process.env.DEPLOY_SERVICE_ACCOUNT, settings.projectId);
const api = githubApi(process.env);
let stagingDeployment;
if (settings.environment === 'production') {
  verifyProductionProtection(await api('/environments/production'));
  const policies = await api('/environments/production/deployment-branch-policies?per_page=100');
  if (policies.branch_policies?.length !== 1 || policies.branch_policies[0].name !== 'main' || policies.branch_policies[0].type !== 'branch') {
    throw new Error('Production deployment branches must be restricted to main only.');
  }
  stagingDeployment = await verifyStagingEvidence(api, settings);
}
const output = resolve('tmp/release');
await mkdir(output, { recursive: true });
const runtime = {
  PLUTO_ENVIRONMENT: settings.environment, PLUTO_FIREBASE_WEB_CONFIG: JSON.stringify(settings.web), PLUTO_RELEASE_SHA: settings.revision,
  TICKETING_BASE_URL: settings.baseUrl, TICKETING_MODE: settings.mode, TICKETING_LIVE_READY: String(settings.mode === 'live'),
  TICKETING_WALLETS_ENABLED: 'false', TICKETING_STORAGE_BUCKET: settings.web.storageBucket, WAIVER_STORAGE_BUCKET: settings.web.storageBucket,
  STRIPE_PUBLISHABLE_KEY: process.env.DEPLOY_STRIPE_PUBLISHABLE_KEY,
  TICKETING_RESEND_WEBHOOK_ENABLED: process.env.DEPLOY_RESEND_WEBHOOK_ENABLED === 'true' ? 'true' : 'false',
};
// Non-secret parameters only. Signing/provider secrets stay in this project's Secret Manager.
await writeFile(resolve('functions', `.env.${settings.projectId}`), dotenvParameters(runtime));
await writeFile(resolve(output, 'dart-defines.json'), JSON.stringify({ PLUTO_ENVIRONMENT: settings.environment, PLUTO_FIREBASE_WEB_CONFIG: JSON.stringify(settings.web) }));
const firebase = JSON.parse(await readFile('firebase.json', 'utf8'));
firebase.hosting.headers.push({ source: '/assets/firebase-public-config.js', headers: [{ key: 'Cache-Control', value: 'no-store' }] });
if (settings.environment === 'staging') firebase.hosting.headers.push({ source: '**', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] });
// Keep the generated config at the repository root: Firebase resolves all source paths relative to it.
await writeFile('firebase.release.json', JSON.stringify(firebase, null, 2) + '\n');
await writeFile(resolve(output, 'manifest.json'), JSON.stringify({ ...settings, web: undefined, stagingDeployment, workflowRun: process.env.GITHUB_RUN_ID,
  workflowAttempt: process.env.GITHUB_RUN_ATTEMPT, preparedAt: new Date().toISOString() }, null, 2));
await writeFile(resolve(output, 'runtime.json'), JSON.stringify(runtime));
if (process.env.GITHUB_ENV) await writeFile(process.env.GITHUB_ENV, Object.entries(runtime).map(([key, value]) => `${key}=${value}`).join('\n') + '\n', { flag: 'a' });
console.log(`Prepared ${settings.environment} release ${settings.revision} for ${settings.projectId} (${settings.mode} payments).`);
