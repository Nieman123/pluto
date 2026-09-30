import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { seedRentals } from '../lib/rentals-seed.js';

const args = process.argv.slice(2);
const projectIndex = args.indexOf('--project');
const projectId = projectIndex >= 0 ? args[projectIndex + 1] : process.env.GCLOUD_PROJECT;
if (!projectId) throw new Error('Provide --project <Firebase project ID> (or GCLOUD_PROJECT).');
const write = args.includes('--write');
const initial = JSON.parse(readFileSync(resolve(fileURLToPath(new URL('../..', import.meta.url)), 'assets/rentals/initial-inventory.json'), 'utf8'));
const app = initializeApp({projectId});
const db = getFirestore(app);
try {
  const result = await seedRentals(db, initial, write);
  console.log(JSON.stringify({projectId, mode: write ? 'write' : 'dry-run', ...result}, null, 2));
} catch (error) {
  console.error(`Rental import failed: ${error.message}`);
  process.exitCode = 1;
} finally { await db.terminate(); await deleteApp(app); }
