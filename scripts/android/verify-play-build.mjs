import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash, X509Certificate } from 'node:crypto';
import { join } from 'node:path';

const manifest = JSON.parse(await readFile('tmp/android-release/manifest.json', 'utf8'));
const bundle = `build/app/outputs/bundle/${manifest.environment}Release/app-${manifest.environment}-release.aab`;
const tool = name => join(process.env.JAVA_HOME, 'bin', process.platform === 'win32' ? `${name}.exe` : name);
const verification = execFileSync(tool('jarsigner'), ['-J-Duser.language=en', '-J-Duser.country=US', '-verify', bundle], { encoding: 'utf8' });
if (!verification.includes('jar verified.') || verification.includes('jar is unsigned.')) throw new Error('App bundle signature is missing or invalid.');
const certificate = execFileSync(tool('keytool'), ['-printcert', '-jarfile', bundle, '-rfc'], { encoding: 'utf8' });
const pem = certificate.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/)?.[0];
if (!pem || new X509Certificate(pem).fingerprint256 !== manifest.uploadCertificateSha256) throw new Error('Signed bundle uses an unexpected certificate.');
manifest.bundleSha256 = createHash('sha256').update(await readFile(bundle)).digest('hex');
await writeFile('tmp/android-release/manifest.json', JSON.stringify(manifest, null, 2));
console.log(`Verified signed bundle and SHA-256 for ${manifest.packageName}.`);
