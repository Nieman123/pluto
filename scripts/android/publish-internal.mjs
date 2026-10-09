import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { appSettings, releaseSelection } from './play-policy.mjs';

const root = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications';
export async function publishInternal({ manifest, bundle, token, fetcher = fetch }) {
  const settings = appSettings(manifest.environment);
  if (manifest.operation !== 'publish-internal' || manifest.track !== 'internal' || manifest.packageName !== settings.packageName ||
      manifest.projectId !== settings.projectId || !/^[a-f0-9]{40}$/.test(manifest.revision || '') ||
      !Number.isSafeInteger(manifest.versionCode) || manifest.versionCode < 1 || manifest.versionCode > 2_100_000_000 ||
      createHash('sha256').update(bundle).digest('hex') !== manifest.bundleSha256) throw new Error('Release manifest or signed bundle identity is invalid.');
  if (!token || /[\r\n]/.test(token)) throw new Error('Google Play authentication is missing.');
  const base = `${root}/${settings.packageName}/edits`; let edit, committed = false;
  const request = async (url, method = 'GET', body, binary = false) => {
    const response = await fetcher(url, { method, redirect: 'error',
      headers: { Authorization: `Bearer ${token}`, ...(body !== undefined ? { 'Content-Type': binary ? 'application/octet-stream' : 'application/json' } : {}) },
      body: body === undefined ? undefined : binary ? body : JSON.stringify(body), signal: AbortSignal.timeout(binary ? 600000 : 60000) });
    if (!response.ok) {
      // Do not dump request headers, OAuth credentials or service-account JSON.
      let hint = '';
      if (response.status === 403) hint = ' Check the dedicated publisher permissions in Play Console.';
      if (response.status === 404) hint = ' Create this app and complete its first internal release in Play Console.';
      const errorBody = await response.json().catch(() => ({}));
      const message = typeof errorBody.error?.message === 'string'
        ? errorBody.error.message.split(token).join('[redacted]').replace(/[\r\n]/g, ' ').slice(0, 600) : '';
      throw new Error(`Google Play ${method} failed (${response.status}). ${message}${hint} Inspect Play Console before retrying an uncertain upload.`);
    }
    return response.status === 204 ? {} : response.json();
  };
  try {
    edit = (await request(base, 'POST', {})).id;
    if (!/^[A-Za-z0-9_-]+$/.test(edit || '')) throw new Error('Google Play returned an invalid edit ID.');
    const [tracks, bundles] = await Promise.all([request(`${base}/${edit}/tracks`), request(`${base}/${edit}/bundles`)]);
    const internal = tracks.tracks?.find(track => track.track === 'internal');
    if (!internal) throw new Error('Create the first internal testing release in Play Console before enabling uploads.');
    if (internal?.releases?.some(release => release.status !== 'completed')) throw new Error('Resolve the existing internal draft/rollout in Play Console first.');
    const used = [...(bundles.bundles || []).map(b => Number(b.versionCode)),
      ...(tracks.tracks || []).flatMap(track => (track.releases || []).flatMap(release => (release.versionCodes || []).map(Number)))];
    if (used.some(code => !Number.isSafeInteger(code) || code >= manifest.versionCode)) throw new Error('This build number is not newer than the existing Play versions. Start a new workflow run; do not rerun an older release.');
    const uploadUrl = `https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/${settings.packageName}/edits/${edit}/bundles?uploadType=media`;
    const uploaded = await request(uploadUrl, 'POST', bundle, true);
    if (Number(uploaded.versionCode) !== manifest.versionCode || uploaded.sha256?.toLowerCase() !== manifest.bundleSha256) throw new Error('Google Play bundle hash/version does not match the verified build.');
    await request(`${base}/${edit}/tracks/internal`, 'PUT', { track: 'internal', releases: [{
      name: `Pluto ${manifest.versionCode} (${manifest.revision.slice(0, 7)})`, versionCodes: [String(manifest.versionCode)],
      status: 'completed', releaseNotes: [{ language: 'en-US', text: 'Bug fixes and improvements for Pluto Events testing.' }],
    }] });
    await request(`${base}/${edit}:validate`, 'POST');
    // Do not cancel a store review someone has already submitted in the Console.
    await request(`${base}/${edit}:commit?changesInReviewBehavior=ERROR_IF_IN_REVIEW`, 'POST');
    committed = true;
    return { packageName: settings.packageName, track: 'internal', versionCode: manifest.versionCode,
      revision: manifest.revision, bundleSha256: manifest.bundleSha256, committed: true,
      testerUrl: `https://play.google.com/apps/testing/${settings.packageName}` };
  } finally {
    if (edit && !committed) await request(`${base}/${edit}`, 'DELETE').catch(() => {});
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const selected = releaseSelection(process.env);
    const manifest = JSON.parse(await readFile('tmp/android-release/manifest.json', 'utf8'));
    for (const key of ['environment', 'revision', 'versionCode', 'operation']) if (manifest[key] !== selected[key]) throw new Error('Publish manifest differs from the selected release.');
    const bundle = await readFile(`build/app/outputs/bundle/${selected.environment}Release/app-${selected.environment}-release.aab`);
    const result = await publishInternal({ manifest, bundle, token: process.env.GOOGLE_PLAY_ACCESS_TOKEN });
    await writeFile('tmp/android-release/play-result.json', JSON.stringify(result, null, 2));
    console.log(`Committed ${result.packageName} version ${result.versionCode} to internal testing.\nTester opt-in: ${result.testerUrl}`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
