import { createPrivateKey, createPublicKey, sign, verify, type JsonWebKey } from 'node:crypto';
import { fail } from './domain';

export interface VerificationKeyring {
  version: 1;
  activeKeyId: string;
  legacyKeyId: string | null;
  keys: Record<string, JsonWebKey>;
  revokedKeyIds: string[];
}
export type SigningMaterial = string | { privateKey: string; keyring: VerificationKeyring };
const keyId = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(value);
export class CredentialKeyUnavailable extends Error {}
export function keyPair(encoded: string) {
  try {
    const privateKey = createPrivateKey({ key: Buffer.from(encoded, 'base64'), type: 'pkcs8', format: 'der' });
    if (privateKey.asymmetricKeyType !== 'ed25519') throw new Error();
    const publicKey = createPublicKey(privateKey);
    return { privateKey, publicKey, jwk: publicKey.export({ format: 'jwk' }) };
  } catch { return fail('Ticket signing is not configured yet.', 503); }
}
export function validateKeyring(raw: unknown): VerificationKeyring {
  try {
    const ring = raw as VerificationKeyring;
    if (!ring || ring.version !== 1 || !keyId(ring.activeKeyId) || !(ring.legacyKeyId === null || keyId(ring.legacyKeyId)) || !ring.keys || typeof ring.keys !== 'object' || Array.isArray(ring.keys) || !Array.isArray(ring.revokedKeyIds)) throw new Error();
    const entries = Object.entries(ring.keys);
    if (!entries.length || entries.length > 16 || !entries.some(([id]) => id === ring.activeKeyId) || ring.legacyKeyId && !Object.hasOwn(ring.keys, ring.legacyKeyId)) throw new Error();
    if (ring.revokedKeyIds.length > 16 || new Set(ring.revokedKeyIds).size !== ring.revokedKeyIds.length || ring.revokedKeyIds.some(id => !keyId(id) || !Object.hasOwn(ring.keys, id)) || ring.revokedKeyIds.includes(ring.activeKeyId)) throw new Error();
    for (const [id, jwk] of entries) {
      if (!keyId(id) || !jwk || jwk.kty !== 'OKP' || jwk.crv !== 'Ed25519' || typeof jwk.x !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(jwk.x) || Object.hasOwn(jwk, 'd') || jwk.kid && jwk.kid !== id) throw new Error();
      if (createPublicKey({ key: jwk, format: 'jwk' }).asymmetricKeyType !== 'ed25519') throw new Error();
    }
    if (new Set(entries.map(([, jwk]) => jwk.x)).size !== entries.length) throw new Error();
    return ring;
  } catch { return fail('Ticket verification keys are not configured correctly.', 503); }
}
export function verificationKeys(material: SigningMaterial) {
  if (typeof material === 'string') return { verificationKey: keyPair(material).jwk };
  const ring = validateKeyring(material.keyring);
  return { verificationKeys: Object.fromEntries(Object.entries(ring.keys).filter(([id]) => !ring.revokedKeyIds.includes(id))),
    legacyKeyId: ring.legacyKeyId && !ring.revokedKeyIds.includes(ring.legacyKeyId) ? ring.legacyKeyId : null,
    activeKeyId: ring.activeKeyId };
}
export function credentialKeyId(material: SigningMaterial, kid?: string): string | null {
  return typeof material === 'string' ? null : kid || validateKeyring(material.keyring).legacyKeyId;
}
export function assertVerificationKeyAccepted(material: SigningMaterial, id: unknown) {
  if (typeof material === 'string') return;
  const ring = validateKeyring(material.keyring), selected = id == null ? ring.legacyKeyId : id;
  if (typeof selected !== 'string' || !Object.hasOwn(ring.keys, selected) || ring.revokedKeyIds.includes(selected)) fail('This preparation uses a retired or revoked signing key. Reject the conflict and verify admission manually.', 409);
}
export function assertSigner(material: SigningMaterial) {
  const pair = keyPair(typeof material === 'string' ? material : material.privateKey);
  if (typeof material !== 'string') {
    const ring = validateKeyring(material.keyring), expected = ring.keys[ring.activeKeyId];
    if (pair.jwk.x !== expected.x) fail('The active ticket signing key does not match its key ID.', 503);
  }
  return pair;
}
export function signCredential(prefix: 'PLUTO' | 'PLUTO-OFFLINE', payload: Record<string, unknown>, material: SigningMaterial) {
  const pair = assertSigner(material);
  const body = typeof material === 'string' ? payload : { ...payload, kid: material.keyring.activeKeyId };
  const version = typeof material === 'string' ? 1 : 2;
  const marker = `${prefix}${version}`, data = Buffer.from(JSON.stringify(body)).toString('base64url');
  const input = version === 1 ? data : `${marker}.${data}`;
  return `${marker}.${data}.${sign(null, Buffer.from(input), pair.privateKey).toString('base64url')}`;
}
export function readCredential(prefix: 'PLUTO' | 'PLUTO-OFFLINE', raw: unknown, material: SigningMaterial): any {
  if (typeof raw !== 'string' || raw.length > 3000) throw new Error('Invalid credential');
  const [marker, data, signature, extra] = raw.split('.');
  if (![`${prefix}1`, `${prefix}2`].includes(marker) || extra !== undefined || !data || !signature || !/^[A-Za-z0-9_-]+$/.test(data) || !/^[A-Za-z0-9_-]{86}$/.test(signature)) throw new Error('Invalid credential');
  const parsed = JSON.parse(Buffer.from(data, 'base64url').toString());
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid credential');
  const legacy = marker === `${prefix}1`;
  if (legacy ? Object.hasOwn(parsed, 'kid') : !keyId(parsed.kid)) throw new Error('Invalid credential key');
  let publicKey;
  if (typeof material === 'string') {
    if (!legacy) throw new CredentialKeyUnavailable('Unknown credential key');
    publicKey = keyPair(material).publicKey;
  } else {
    const ring = validateKeyring(material.keyring), id = legacy ? ring.legacyKeyId : parsed.kid;
    if (!id || !Object.hasOwn(ring.keys, id) || ring.revokedKeyIds.includes(id)) throw new CredentialKeyUnavailable('Unknown or revoked credential key');
    publicKey = createPublicKey({ key: ring.keys[id], format: 'jwk' });
  }
  if (!verify(null, Buffer.from(legacy ? data : `${marker}.${data}`), publicKey, Buffer.from(signature, 'base64url'))) throw new Error('Invalid credential signature');
  return parsed;
}
