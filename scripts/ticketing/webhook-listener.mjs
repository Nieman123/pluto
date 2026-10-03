import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
const root = resolve(import.meta.dirname, '../..'), path = resolve(root, 'functions/.secret.local');
let source = await readFile(path, 'utf8');
const key = source.match(/^STRIPE_RESTRICTED_KEY=(.*)$/m)?.[1].trim().replace(/^(['"])(.*)\1$/, '$2');
if (!/^(sk|rk)_test_/.test(key || '')) throw new Error('A local Stripe sandbox API key is required.');
// Credentials stay in the child environment and the ignored local secret file.
const events = 'checkout.session.completed,checkout.session.expired,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed,payment_intent.succeeded,payment_intent.payment_failed,payment_intent.canceled,refund.created,refund.updated,refund.failed,charge.refunded,charge.dispute.created,charge.dispute.closed';
const args = ['--cache', resolve(root, 'tmp/npm-cache'), '@stripe/cli@1.53.0', 'listen', '--events', events, '--forward-to', 'http://127.0.0.1:4173/tickets/webhook'];
if (!process.env.npm_execpath) throw new Error('Run this helper with npm run ticketing:webhooks.');
const child = spawn(process.execPath, [resolve(dirname(process.env.npm_execpath), 'npx-cli.js'), ...args], { cwd: root, env: { ...process.env, STRIPE_API_KEY: key }, windowsHide: true });
let configured = false;
async function output(chunk) {
  const value = chunk.toString(), secret = value.match(/whsec_[A-Za-z0-9]+/)?.[0];
  if (secret && !configured) {
    configured = true;
    source = await readFile(path, 'utf8');
    source = /^STRIPE_WEBHOOK_SECRET=.*$/m.test(source) ? source.replace(/^STRIPE_WEBHOOK_SECRET=.*$/m, `STRIPE_WEBHOOK_SECRET=${secret}`) : `${source.trimEnd()}\nSTRIPE_WEBHOOK_SECRET=${secret}\n`;
    await writeFile(path, source);
    console.log('Local Stripe listener ready. Signing secret saved to ignored functions/.secret.local. Restart the preview to load it.');
  }
  process.stdout.write(value.replace(/whsec_[A-Za-z0-9]+/g, '[signing secret saved locally]').replaceAll(key, '[redacted]'));
}
for (const stream of [child.stdout, child.stderr]) {
  let pending = '', processing = Promise.resolve();
  stream.on('data', chunk => {
    pending += chunk.toString();
    const lines = pending.split(/\r?\n/); pending = lines.pop();
    for (const line of lines) processing = processing.then(() => output(`${line}\n`)).catch(() => { console.error('Could not save local webhook configuration.'); child.kill(); });
  });
}
child.on('exit', code => process.exit(code || 0));
process.on('SIGINT', () => child.kill());
