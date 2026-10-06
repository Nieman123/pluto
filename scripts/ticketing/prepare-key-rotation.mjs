import { generateKeyPairSync, randomBytes, randomUUID } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { keyPair, validateKeyring, assertSigner } = require('../../functions/lib/ticketing/signing.js');
const { validatePinKeys } = require('../../functions/lib/ticketing/pin-keys.js');
const args = process.argv.slice(2);
const value = flag => args[args.indexOf(flag) + 1];
const has = flag => args.includes(flag);
const allowed = ['--environment', '--current-key-file', '--keyring-file', '--pin-keys-file', '--emergency'];
for (let i = 0; i < args.length; i++) {
  if (!allowed.includes(args[i])) throw new Error('Unknown argument. Use --environment staging|production --current-key-file PATH [--keyring-file PATH] [--pin-keys-file PATH] [--emergency].');
  if (args[i] !== '--emergency' && (!args[++i] || args[i].startsWith('--'))) throw new Error('Missing argument value.');
}
const environment = value('--environment');
if (!['staging', 'production'].includes(environment) || !has('--current-key-file')) throw new Error('An explicit staging or production environment and current key file are required.');
if (has('--keyring-file') !== has('--pin-keys-file')) throw new Error('For an existing rotation setup, supply both --keyring-file and --pin-keys-file to preserve verifier history and scanner PIN access.');
const current = (await readFile(resolve(value('--current-key-file')), 'utf8')).trim();
const original = keyPair(current);
const previous = has('--keyring-file') ? validateKeyring(JSON.parse(await readFile(resolve(value('--keyring-file')), 'utf8'))) : {
  version: 1, activeKeyId: 'legacy-k1', legacyKeyId: 'legacy-k1', keys: { 'legacy-k1': original.jwk }, revokedKeyIds: [],
};
assertSigner({ privateKey: current, keyring: previous });
const rotationId = `${environment}-${new Date().toISOString().slice(0, 10)}-${randomUUID().slice(0, 8)}`;
const next = generateKeyPairSync('ed25519'), newKey = next.privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64');
const prepared = validateKeyring({ ...previous, keys: { ...previous.keys, [rotationId]: next.publicKey.export({ format: 'jwk' }) } });
const activated = validateKeyring({ ...prepared, activeKeyId: rotationId,
  revokedKeyIds: has('--emergency') ? [...new Set([...prepared.revokedKeyIds, previous.activeKeyId])] : prepared.revokedKeyIds });
assertSigner({ privateKey: newKey, keyring: activated });
let pins = has('--pin-keys-file') ? validatePinKeys(JSON.parse(await readFile(resolve(value('--pin-keys-file')), 'utf8'))) :
  { version: 1, activeKeyId: 'pin-k1', keys: { 'pin-k1': randomBytes(32).toString('base64') }, ...(!has('--emergency') ? { legacySigningKey: current } : {}) };
if (has('--emergency') && pins.legacySigningKey === current) { pins = { ...pins }; delete pins.legacySigningKey; }
validatePinKeys(pins);
const destination = resolve(import.meta.dirname, '../../tmp/ticket-key-rotation', rotationId);
await mkdir(destination, { recursive: true, mode: 0o700 });
const outputs = { 'active-signing-key.txt': newKey + '\n', 'activate-keyring.json': JSON.stringify(activated, null, 2) + '\n',
  'scanner-pin-keys.secret.json': JSON.stringify(pins) + '\n', ...(!has('--emergency') ? { 'prepare-keyring.json': JSON.stringify(prepared, null, 2) + '\n' } : {}) };
for (const [name, content] of Object.entries(outputs)) await writeFile(resolve(destination, name), content, { flag: 'wx', mode: 0o600 });
console.log(`Prepared ${has('--emergency') ? 'emergency' : 'planned'} rotation files for ${environment} in ${destination}.`);
console.log('No secret values were printed, uploaded, or activated. Follow docs/ticket-signing-key-rotation.md.');
