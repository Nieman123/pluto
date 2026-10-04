import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { validateWebConfig } = require('../../functions/lib/deployment-config.js');
export const projects = JSON.parse(await readFile(new URL('../../functions/src/deployment-projects.json', import.meta.url), 'utf8'));

export function releaseSettings(env) {
  const environment = env.RELEASE_ENVIRONMENT;
  if (!['staging', 'production'].includes(environment)) throw new Error('Select staging or production.');
  if (!/^[a-f0-9]{40}$/.test(env.RELEASE_SHA || '')) throw new Error('Release revision must be a full 40-character commit SHA.');
  if (env.GITHUB_REF !== 'refs/heads/main') throw new Error('Release workflows must run from main.');
  const projectId = projects[environment];
  if (env.DEPLOY_PROJECT_ID !== projectId) throw new Error('The environment Firebase project ID is missing or mismatched.');
  const web = validateWebConfig(JSON.parse(env.DEPLOY_WEB_CONFIG || '{}'), projectId, environment === 'staging');
  const mode = env.DEPLOY_PAYMENT_MODE || 'test';
  if (!['test', 'live'].includes(mode)) throw new Error('Payment mode must be test or live.');
  if (environment === 'staging' && mode !== 'test') throw new Error('Staging only accepts sandbox payments.');
  if (!new RegExp(`^pk_${mode}_[A-Za-z0-9]+$`).test(env.DEPLOY_STRIPE_PUBLISHABLE_KEY || '')) throw new Error('Stripe publishable key must match the payment mode.');
  if (environment === 'production' && env.RELEASE_CONFIRMATION !== `deploy ${projects.production}`) throw new Error('Production requires the exact deployment confirmation.');
  if (mode === 'live' && env.RELEASE_LIVE_APPROVED !== 'true') throw new Error('Live payments require explicit approval after launch acceptance.');
  return { environment, projectId, web, mode, revision: env.RELEASE_SHA,
    baseUrl: environment === 'staging' ? projects.stagingBaseUrl : projects.productionBaseUrl };
}

export function verifyServiceAccount(encoded, projectId) {
  let account;
  try { account = JSON.parse(encoded || '{}'); } catch { throw new Error('Invalid deployment service account JSON.'); }
  if (account.type !== 'service_account' || account.project_id !== projectId || !account.private_key ||
      !account.client_email?.endsWith(`@${projectId}.iam.gserviceaccount.com`)) {
    throw new Error('Use a deployment service account belonging to this environment project.');
  }
}

export function dotenvParameters(values) {
  return Object.entries(values).map(([key, value]) => {
    if (typeof value !== 'string' || /[\r\n']/.test(value)) throw new Error(`Invalid release parameter: ${key}.`);
    // Single quoting preserves public JSON without additional escaping.
    return `${key}='${value}'`;
  }).join('\n') + '\n';
}

export function verifyProductionProtection(environment) {
  const reviewers = environment.protection_rules?.find(rule => rule.type === 'required_reviewers');
  if (!reviewers?.reviewers?.length || reviewers.prevent_self_review !== true || environment.can_admins_bypass !== false) {
    throw new Error('Production requires reviewers, prevention of self-review, and disabled administrator bypass in GitHub environment settings.');
  }
  if (!environment.deployment_branch_policy?.custom_branch_policies) throw new Error('Production requires a selected main deployment branch policy.');
}

// The automatic environment deployment uses the workflow SHA, which can differ
// from a rollback revision. Only explicit, successful release evidence counts.
export async function verifyStagingEvidence(api, settings) {
  const deployments = await api(`/deployments?environment=staging&sha=${settings.revision}&per_page=100`);
  for (const deployment of deployments) {
    const payload = deployment.payload || {};
    if (deployment.sha !== settings.revision || deployment.environment !== 'staging' || deployment.creator?.login !== 'github-actions[bot]' ||
        payload.kind !== 'pluto-validated-release' || payload.projectId !== projects.staging || payload.revision !== settings.revision ||
        !/^\d+$/.test(String(payload.runId || '')) || !/^\d+$/.test(String(payload.runAttempt || ''))) continue;
    const statuses = await api(`/deployments/${deployment.id}/statuses?per_page=1`);
    if (statuses[0]?.state !== 'success') continue;
    const run = await api(`/actions/runs/${payload.runId}/attempts/${payload.runAttempt}`);
    if (run.path === '.github/workflows/release.yml' && run.event === 'workflow_dispatch' && run.head_branch === 'main' &&
        run.status === 'completed' && run.conclusion === 'success') return deployment.id;
  }
  throw new Error('This commit has no completed, successful release to the isolated staging project.');
}

export function githubApi(env, fetcher = fetch) {
  if (!env.GITHUB_TOKEN || !/^[\w.-]+\/[\w.-]+$/.test(env.GITHUB_REPOSITORY || '')) throw new Error('GitHub deployment access is required.');
  return async (path, body) => {
    const response = await fetcher(`https://api.github.com/repos/${env.GITHUB_REPOSITORY}${path}`, {
      method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`GitHub release request failed (${response.status}).`);
    return response.json();
  };
}
