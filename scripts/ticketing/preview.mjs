import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '../..');
// Explicit local preview never inherits production Firestore/Auth/Storage endpoints.
process.env.GCLOUD_PROJECT = 'demo-pluto-ticketing';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8185';
process.env.FIREBASE_STORAGE_EMULATOR_HOST = '127.0.0.1:9295';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9095';
process.env.TICKETING_STORAGE_BUCKET = 'demo-pluto-ticketing.appspot.com';
process.env.TICKETING_MODE = 'test';
process.env.TICKETING_BASE_URL = 'http://127.0.0.1:4173';
process.env.PUBLIC_SITE_PREVIEW = 'true';
for (const name of ['.env.local', '.secret.local']) {
  const source = await readFile(resolve(root, 'functions', name), 'utf8').catch(error => { if (error.code === 'ENOENT') return ''; throw error; });
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/); if (!match) continue;
    if (['GCLOUD_PROJECT', 'FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST', 'FIREBASE_STORAGE_EMULATOR_HOST', 'TICKETING_STORAGE_BUCKET', 'TICKETING_MODE', 'TICKETING_BASE_URL'].includes(match[1])) continue;
    process.env[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, '$2');
  }
}
await import('../../functions/scripts/preview-server.mjs');
