import { generateKeyPairSync } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '../..'), destination = resolve(root, 'functions/.secret.local');
let existing = await readFile(destination, 'utf8').catch(error => { if (error.code === 'ENOENT') return ''; throw error; });
if (/^TICKETING_SIGNING_KEY=.+$/m.test(existing)) { console.log('An existing ticket signing key is configured; it was preserved.'); }
else {
  const key = generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64');
  existing = existing.replace(/^TICKETING_SIGNING_KEY=.*(?:\r?\n|$)/m, '');
  await writeFile(destination, `${existing.trim()}\nTICKETING_SIGNING_KEY=${key}\n`, { mode: 0o600 });
  console.log('Generated a local ticket signing key in the ignored functions/.secret.local file. No private key was printed.');
}
