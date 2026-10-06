import { createHmac } from 'node:crypto';
import { keyPair, type SigningMaterial } from './signing';
import { fail } from './domain';

export interface ScannerPinKeys {
  version: 1; activeKeyId: string; keys: Record<string, string>;
  // Temporary migration only. Existing PINs were hashed with this PKCS8 key.
  legacySigningKey?: string;
}
export function validatePinKeys(raw: unknown): ScannerPinKeys {
  try {
    const config = raw as ScannerPinKeys;
    if (!config || config.version !== 1 || typeof config.activeKeyId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(config.activeKeyId) || !config.keys || typeof config.keys !== 'object' || Array.isArray(config.keys) || !Object.hasOwn(config.keys, config.activeKeyId)) throw new Error();
    const entries = Object.entries(config.keys);
    if (!entries.length || entries.length > 8) throw new Error();
    for (const [id, key] of entries) if (!/^[A-Za-z0-9_-]{1,64}$/.test(id) || typeof key !== 'string' || key.length > 512 || Buffer.from(key, 'base64').length < 32 || Buffer.from(key, 'base64').toString('base64') !== key) throw new Error();
    if (config.legacySigningKey !== undefined) keyPair(config.legacySigningKey);
    return config;
  } catch { return fail('Scanner PIN keys are not configured correctly.', 503); }
}
export function pinLookupHashes(pin: string, config: ScannerPinKeys | undefined, signing: SigningMaterial): string[] {
  const legacy = (key: string) => createHmac('sha256', keyPair(key).privateKey.export({ type: 'pkcs8', format: 'der' })).update(`pluto-scanner-pin-v1:${pin}`).digest('hex');
  if (!config) {
    if (typeof signing !== 'string') fail('Independent scanner PIN keys are required for ticket key rotation.', 503);
    return [legacy(signing)];
  }
  const keys = validatePinKeys(config);
  const ids = [keys.activeKeyId, ...Object.keys(keys.keys).filter(id => id !== keys.activeKeyId)];
  return [...ids.map(id => `pin2_${id}_${createHmac('sha256', Buffer.from(keys.keys[id], 'base64')).update(`pluto-scanner-pin-v2:${pin}`).digest('hex')}`),
    ...(keys.legacySigningKey ? [legacy(keys.legacySigningKey)] : [])];
}
