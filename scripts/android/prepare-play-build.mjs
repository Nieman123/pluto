import { appendFile, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { X509Certificate } from 'node:crypto';
import { certificateFingerprint, releaseSelection, validatePlayAccount, verifyNativeConfig } from './play-policy.mjs';
import { githubApi, verifyStagingEvidence, verifyProductionProtection } from '../release/policy.mjs';

const env = process.env, settings = releaseSelection(env);
if (execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() !== settings.revision) throw new Error('Android build checkout does not match selected SHA.');
execFileSync('git', ['merge-base', '--is-ancestor', settings.revision, 'origin/main']);
await verifyNativeConfig(settings);
const api = githubApi(env);
if (settings.environment === 'production') {
  verifyProductionProtection(await api('/environments/production'), env.PRODUCTION_APPROVAL_POLICY || 'two-person', env.GITHUB_ACTOR_ID);
  const branches = await api('/environments/production/deployment-branch-policies?per_page=100');
  if (branches.branch_policies?.length !== 1 || branches.branch_policies[0].name !== 'main' || branches.branch_policies[0].type !== 'branch') throw new Error('Production environment must be restricted to main.');
}
if (settings.operation === 'publish-internal') {
  validatePlayAccount(env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON, settings);
  await verifyStagingEvidence(api, settings);
}
if (env.PLUTO_UNSIGNED_VALIDATION === 'true') throw new Error('An unsigned validation bundle cannot be released.');
if (!env.ANDROID_UPLOAD_KEYSTORE_BASE64 || !env.PLUTO_UPLOAD_STORE_PASSWORD || !env.PLUTO_UPLOAD_KEY_PASSWORD ||
    !/^[A-Za-z0-9_-]{1,100}$/.test(env.PLUTO_UPLOAD_KEY_ALIAS || '')) throw new Error('Configure the Android upload keystore, passwords and alias in this GitHub environment.');
const encoded = env.ANDROID_UPLOAD_KEYSTORE_BASE64.trim();
if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length % 4 !== 0) throw new Error('Upload keystore must be a base64 file, not a pathname.');
const expected = certificateFingerprint(env.ANDROID_UPLOAD_CERT_SHA256);
const folder = await mkdtemp(join(env.RUNNER_TEMP, 'pluto-android-signing-'));
const keystore = join(folder, 'upload.jks');
await writeFile(keystore, Buffer.from(encoded, 'base64'), { mode: 0o600 });
await appendFile(env.GITHUB_ENV, `PLUTO_UPLOAD_KEYSTORE=${keystore}\n`);
const keytool = join(env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'keytool.exe' : 'keytool');
const pem = execFileSync(keytool, ['-exportcert', '-rfc', '-keystore', keystore, '-alias', env.PLUTO_UPLOAD_KEY_ALIAS,
  '-storepass:env', 'PLUTO_UPLOAD_STORE_PASSWORD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
if (new X509Certificate(pem).fingerprint256 !== expected) throw new Error('Upload keystore certificate does not match the configured environment fingerprint.');
await mkdir(resolve('tmp/android-release'), { recursive: true });
await writeFile('tmp/android-release/manifest.json', JSON.stringify({ ...settings, uploadCertificateSha256: expected,
  workflowRun: env.GITHUB_RUN_ID, workflowAttempt: env.GITHUB_RUN_ATTEMPT }, null, 2));
console.log(`Prepared signed ${settings.environment} bundle ${settings.versionCode}. No debug signing fallback.`);
