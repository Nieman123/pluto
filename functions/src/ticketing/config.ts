import Stripe from 'stripe';
import { defineSecret } from 'firebase-functions/params';
import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { fail } from './domain';
import { deploymentConfig } from '../deployment-config';

export const stripeKey = defineSecret('STRIPE_RESTRICTED_KEY');
export const webhookKey = defineSecret('STRIPE_WEBHOOK_SECRET');
export const signingKey = defineSecret('TICKETING_SIGNING_KEY');
export const resendKey = defineSecret('RESEND_API_KEY');
export const resendWebhookKey = process.env.TICKETING_RESEND_WEBHOOK_ENABLED === 'true' ? defineSecret('RESEND_WEBHOOK_SECRET') : undefined;
// Delivery tracking is opt-in; existing deployments do not need another secret.
export const resendWebhookSecrets = resendWebhookKey ? [resendWebhookKey] : [];
export const ticketingSecrets = [stripeKey, webhookKey, signingKey, resendKey];
export const apiVersion = '2026-09-30.endive' as const;
export const baseUrl = () => deploymentConfig().baseUrl;
export const appTicketsUrl = () => `${baseUrl()}/app/tickets`;
export const isLive = () => { deploymentConfig(); return process.env.TICKETING_MODE === 'live'; };
export function stripeClient() {
  const key = stripeKey.value();
  if (!/^(rk|sk)_(test|live)_/.test(key || '')) fail('Payments are not configured yet.', 503);
  if ((key.includes('_live_')) !== isLive()) fail('Payment environment does not match the configured key.', 503);
  if (isLive() && process.env.TICKETING_LIVE_READY !== 'true') fail('Live ticket sales have not been enabled.', 503);
  return new Stripe(key, { apiVersion, maxNetworkRetries: 2, timeout: 20000 });
}
export function keyPair(encoded = signingKey.value()) {
  try {
    const privateKey = createPrivateKey({ key: Buffer.from(encoded, 'base64'), type: 'pkcs8', format: 'der' });
    if (privateKey.asymmetricKeyType !== 'ed25519') throw new Error('Wrong key type');
    const publicKey = createPublicKey(privateKey);
    return { privateKey, publicKey, jwk: publicKey.export({ format: 'jwk' }) };
  } catch { return fail('Ticket signing is not configured yet.', 503); }
}
export function signTicket(payload: Record<string, unknown>, encoded?: string) {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `PLUTO1.${data}.${sign(null, Buffer.from(data), keyPair(encoded).privateKey).toString('base64url')}`;
}
export function readTicket(qr: unknown, encoded?: string): { id: string; eventId: string; version: number; validFrom: string; validUntil: string } {
  if (typeof qr !== 'string' || qr.length > 3000) return fail('Invalid ticket.');
  const [prefix, data, signature, extra] = qr.split('.');
  try {
    if (prefix !== 'PLUTO1' || extra || !data || !signature || !verify(null, Buffer.from(data), keyPair(encoded).publicKey, Buffer.from(signature, 'base64url'))) throw new Error();
    const parsed = JSON.parse(Buffer.from(data, 'base64url').toString());
    if (typeof parsed.id !== 'string' || typeof parsed.eventId !== 'string' || !Number.isInteger(parsed.version)) throw new Error();
    return parsed;
  } catch { return fail('Invalid ticket.'); }
}
