import { spawn } from 'node:child_process';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
export const ciStripeFixture = 'rk_test_ci_placeholder_not_a_usable_credential';
export function browserEnvironment(input) {
  if (input.GCLOUD_PROJECT !== 'demo-pluto-ticketing') throw new Error('Browser CI requires demo-pluto-ticketing.');
  const endpoints = { FIRESTORE_EMULATOR_HOST: '127.0.0.1:8185', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9095', FIREBASE_STORAGE_EMULATOR_HOST: '127.0.0.1:9295' };
  for (const [name, value] of Object.entries(endpoints)) if (input[name] !== value) throw new Error(`Browser CI requires ${name}=${value}.`);
  const env = { ...input, ...endpoints, TICKETING_STORAGE_BUCKET: 'demo-pluto-ticketing.appspot.com', WAIVER_STORAGE_BUCKET: 'demo-pluto-ticketing.appspot.com',
    TICKETING_MODE: 'test', TICKETING_LIVE_READY: 'false', TICKETING_WALLETS_ENABLED: 'false', TICKETING_RESEND_WEBHOOK_ENABLED: 'false', TICKETING_BASE_URL: 'http://127.0.0.1:4173', PUBLIC_SITE_PREVIEW: 'true', PORT: '4173' };
  for (const name of ['STRIPE_RESTRICTED_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_PUBLISHABLE_KEY', 'RESEND_API_KEY', 'RESEND_WEBHOOK_SECRET', 'TICKETING_WALLET_CREDENTIALS',
    'GOOGLE_APPLICATION_CREDENTIALS', 'GOOGLE_CLOUD_PROJECT', 'PLUTO_FIREBASE_WEB_CONFIG', 'PLUTO_ENVIRONMENT', 'PLUTO_RELEASE_SHA']) delete env[name];
  const { privateKey } = generateKeyPairSync('ed25519');
  env.TICKETING_SIGNING_KEY = privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');
  // Free ticket checkout initializes a Stripe client before it evaluates the
  // zero total. An inert fixture satisfies that constructor without real keys.
  env.STRIPE_RESTRICTED_KEY = ciStripeFixture;
  return env;
}

async function main() {
  const env = browserEnvironment(process.env);
  env.PLUTO_CI_PREVIEW_ID = randomUUID();
  await mkdir(resolve(root, 'tmp'), { recursive: true });
  // Do not load preview.mjs: it intentionally loads developer-only sandbox keys.
  const server = spawn(process.execPath, ['functions/scripts/preview-server.mjs'], { cwd: root, env, stdio: 'inherit' });
  let serverError;
  server.on('error', error => { serverError = error; });
  const stop = () => { if (server.exitCode === null) server.kill(); };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  const run = script => new Promise((done, reject) => {
    console.log(`Browser CI: ${script}`);
    const child = spawn(process.execPath, [script], { cwd: root, env, stdio: 'inherit' });
    const timer = setTimeout(() => { child.kill(); reject(new Error(`${script} exceeded the 10-minute browser limit.`)); }, 600000);
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('exit', code => { clearTimeout(timer); code === 0 ? done() : reject(new Error(`${script} failed (${code}).`)); });
  });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      if (serverError || server.exitCode !== null) throw serverError || new Error('CI preview failed to start. Stop any existing preview before running the suite.');
      try {
        const response = await fetch('http://127.0.0.1:4173/__deployment', { signal: AbortSignal.timeout(1000) });
        const identity = await response.json();
        if (identity.environment !== 'emulator' || identity.projectId !== env.GCLOUD_PROJECT || identity.previewInstance !== env.PLUTO_CI_PREVIEW_ID) throw new Error('Preview is not the isolated CI emulator owned by this run.');
        ready = true; break;
      } catch (error) { if (error.message.includes('isolated')) throw error; }
      await new Promise(done => setTimeout(done, 500));
    }
    if (!ready) throw new Error('CI preview did not become ready.');
    await run('scripts/ticketing/seed-preview.cjs');
    const suites = ['browser', 'account-verification-browser', 'wallet-browser', 'scanner-pin-browser', 'rsvp-browser', 'rsvp-vip-browser', 'free-events-browser', 'checkout-account-browser', 'orders-browser', 'rewards-browser', 'location-reveal-browser', 'operations-offline-browser', 'event-engagement-browser', 'event-discovery-browser'];
    const selection = process.argv.find(arg => arg.startsWith('--suites='))?.slice(9).split(',') || suites;
    if (!selection.length || selection.some(suite => !suites.includes(suite))) throw new Error('Unknown browser suite selection.');
    for (const suite of selection) await run(`scripts/ticketing/${suite}-test.cjs`);
    console.log(`${selection.length} CI browser suites passed without real provider credentials.`);
  } finally {
    stop(); process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop);
  }
}
if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) await main();
