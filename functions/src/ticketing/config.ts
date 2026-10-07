import Stripe from 'stripe';
import { defineSecret } from 'firebase-functions/params';
import { assertSigner, CredentialKeyUnavailable, keyPair as pair, readCredential, signCredential, validateKeyring, type SigningMaterial } from './signing';
export { verificationKeys } from './signing';
export type { SigningMaterial } from './signing';
import { fail } from './domain';
import { deploymentConfig } from '../deployment-config';

export const stripeKey = defineSecret('STRIPE_RESTRICTED_KEY');
export const webhookKey = defineSecret('STRIPE_WEBHOOK_SECRET');
export const signingKey = defineSecret('TICKETING_SIGNING_KEY');
// Opt-in: deploying compatibility support must not require changing existing secrets.
export const rotationEnabled = process.env.TICKETING_KEY_ROTATION_ENABLED === 'true';
export const verificationKeyring = rotationEnabled ? defineSecret('TICKETING_VERIFICATION_KEYRING') : undefined;
export const scannerPinKeys = rotationEnabled ? defineSecret('TICKETING_SCANNER_PIN_KEYS') : undefined;
export const resendKey = defineSecret('RESEND_API_KEY');
export const resendWebhookKey = process.env.TICKETING_RESEND_WEBHOOK_ENABLED === 'true' ? defineSecret('RESEND_WEBHOOK_SECRET') : undefined;
// Delivery tracking is opt-in; existing deployments do not need another secret.
export const resendWebhookSecrets = resendWebhookKey ? [resendWebhookKey] : [];
export const ticketingSecrets = [stripeKey, webhookKey, signingKey, resendKey, ...(verificationKeyring && scannerPinKeys ? [verificationKeyring, scannerPinKeys] : [])];
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
export function signingMaterial(material?: SigningMaterial): SigningMaterial {
  if (material !== undefined) return material;
  const privateKey = signingKey.value();
  if (!verificationKeyring) return privateKey;
  try { return { privateKey, keyring: validateKeyring(JSON.parse(verificationKeyring.value())) }; }
  catch { return fail('Ticket verification keys are not configured correctly.', 503); }
}
export function keyPair(encoded = signingKey.value()) { return pair(encoded); }
export function assertSigningConfigured(material?: SigningMaterial) { return assertSigner(signingMaterial(material)); }
export function signTicket(payload: Record<string, unknown>, material?: SigningMaterial) {
  return signCredential('PLUTO', payload, signingMaterial(material));
}
export function readTicket(qr: unknown, material?: SigningMaterial): { id: string; eventId: string; version: number; validFrom: string; validUntil: string; kid?: string } {
  const signing = signingMaterial(material);
  try {
    const parsed = readCredential('PLUTO', qr, signing);
    if (typeof parsed.id !== 'string' || typeof parsed.eventId !== 'string' || !Number.isInteger(parsed.version) || Object.hasOwn(parsed, 'leaseHash') || Object.hasOwn(parsed, 'kind')) throw new Error();
    return parsed;
  } catch (error) {
    if (error instanceof CredentialKeyUnavailable) return fail('Invalid ticket. Its signing key is no longer accepted; refresh this ticket in the app.', 409, 'ticket-key-unavailable');
    return fail('Invalid ticket.');
  }
}
