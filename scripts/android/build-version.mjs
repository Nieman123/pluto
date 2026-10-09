import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { releaseSelection } from './play-policy.mjs';

export function buildVersion(manifest, env) {
  const selected = releaseSelection(env);
  for (const key of ['environment', 'revision', 'versionCode', 'operation', 'packageName', 'projectId', 'track']) {
    if (manifest[key] !== selected[key]) throw new Error(`Build manifest ${key} differs from the current release attempt.`);
  }
  return manifest.versionCode;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const manifest = JSON.parse(await readFile('tmp/android-release/manifest.json', 'utf8'));
    console.log(buildVersion(manifest, process.env));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
