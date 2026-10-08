import { readFile, appendFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { automaticSelection, releaseSelection } from './play-policy.mjs';
import { githubApi } from '../release/policy.mjs';

const env = process.env;
if (env.GITHUB_REF !== 'refs/heads/main') throw new Error('Run the Android release workflow from main.');
const settings = env.GITHUB_EVENT_NAME === 'workflow_run'
  ? await automaticSelection(env, JSON.parse(await readFile(env.GITHUB_EVENT_PATH, 'utf8')), githubApi(env))
  : releaseSelection(env);
if (settings) {
  execFileSync('git', ['merge-base', '--is-ancestor', settings.revision, 'origin/main']);
  await appendFile(env.GITHUB_OUTPUT, Object.entries({ enabled: 'true', ...settings,
    source: env.GITHUB_EVENT_NAME === 'workflow_run' ? 'validated-staging-release' : 'manual' })
    .map(([key, value]) => `${key}=${value}`).join('\n') + '\n');
  console.log(`Selected ${settings.environment} ${settings.operation}: ${settings.revision} (${settings.versionCode}).`);
} else console.log('No opted-in successful staging release; no Android credentials or uploads used.');
