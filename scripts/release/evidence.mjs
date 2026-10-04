import { readFile, writeFile } from 'node:fs/promises';
import { githubApi } from './policy.mjs';
const manifest = JSON.parse(await readFile('tmp/release/manifest.json', 'utf8'));
const api = githubApi(process.env);
const action = process.argv[2];
const logUrl = `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`;
if (action === 'start') {
  const deployment = await api('/deployments', { ref: manifest.revision, environment: manifest.environment,
    auto_merge: false, required_contexts: [], production_environment: manifest.environment === 'production',
    description: 'Validated Pluto release', payload: { kind: 'pluto-validated-release', revision: manifest.revision,
      projectId: manifest.projectId, runId: process.env.GITHUB_RUN_ID, runAttempt: process.env.GITHUB_RUN_ATTEMPT } });
  if (!deployment.id || deployment.sha !== manifest.revision) throw new Error('GitHub did not create evidence for the requested commit.');
  await writeFile('tmp/release/deployment-id', String(deployment.id));
  await api(`/deployments/${deployment.id}/statuses`, { state: 'in_progress', log_url: logUrl, environment_url: manifest.baseUrl });
} else {
  if (!['success', 'failure'].includes(action)) throw new Error('Unknown deployment status.');
  const id = (await readFile('tmp/release/deployment-id', 'utf8')).trim();
  if (!/^\d+$/.test(id)) throw new Error('Missing deployment identity.');
  await api(`/deployments/${id}/statuses`, { state: action, log_url: logUrl, environment_url: manifest.baseUrl, auto_inactive: false });
}
