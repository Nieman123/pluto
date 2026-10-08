import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { randomBytes, X509Certificate } from 'node:crypto';

const environment = process.argv[2];
if (!['staging', 'production'].includes(environment)) throw new Error('Usage: node scripts/android/generate-upload-key.mjs staging|production');
if (!process.env.JAVA_HOME) throw new Error('Set JAVA_HOME to JDK 21 first.');
const folder = resolve('android-credentials', environment);
await mkdir(folder, { recursive: true });
const password = randomBytes(32).toString('base64url'), alias = 'pluto-upload';
// Exclusive files prevent silently rotating an existing upload key.
await writeFile(join(folder, 'store-password.txt'), password, { flag: 'wx', mode: 0o600 });
await writeFile(join(folder, 'key-password.txt'), password, { flag: 'wx', mode: 0o600 });
const tool = join(process.env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'keytool.exe' : 'keytool');
const toolEnv = { ...process.env, PLUTO_GENERATED_UPLOAD_PASSWORD: password };
const keystore = join(folder, 'upload.jks');
execFileSync(tool, ['-genkeypair', '-storetype', 'JKS', '-keystore', keystore, '-alias', alias, '-keyalg', 'RSA', '-keysize', '2048',
  '-validity', '10000', '-dname', `CN=Pluto Events ${environment}, O=Pluto Events, C=US`, '-storepass:env', 'PLUTO_GENERATED_UPLOAD_PASSWORD',
  '-keypass:env', 'PLUTO_GENERATED_UPLOAD_PASSWORD'], { env: toolEnv, stdio: ['ignore', 'pipe', 'pipe'] });
const pem = execFileSync(tool, ['-exportcert', '-rfc', '-keystore', keystore, '-alias', alias, '-storepass:env', 'PLUTO_GENERATED_UPLOAD_PASSWORD'], { env: toolEnv, encoding: 'utf8' });
await writeFile(join(folder, 'upload-certificate.pem'), pem, { flag: 'wx' });
await writeFile(join(folder, 'keystore-base64.txt'), (await readFile(keystore)).toString('base64'), { flag: 'wx', mode: 0o600 });
const certificate = new X509Certificate(pem);
await writeFile(join(folder, 'public-info.json'), JSON.stringify({ environment, alias, sha1: certificate.fingerprint, sha256: certificate.fingerprint256 }, null, 2), { flag: 'wx' });
console.log(`Created ${environment} upload key in ignored ${folder}. Back up this directory securely.\nPublic upload SHA-256: ${certificate.fingerprint256}\nPasswords and private key contents were not printed.`);
