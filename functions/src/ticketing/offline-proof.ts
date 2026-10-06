import { signingMaterial, type SigningMaterial } from './config';
import { readCredential, signCredential } from './signing';
import { fail } from './domain';

export interface OfflineItem {
  leaseHash: string; eventId: string; id: string; kind: 'ticket' | 'guest'; version: number;
  validFrom: string; validUntil: string; kid?: string;
}
export interface OfflineSubmission { leaseToken?: unknown; itemProof?: unknown; deviceTime?: unknown }
export function signOfflineItem(item: OfflineItem, key?: SigningMaterial) {
  return signCredential('PLUTO-OFFLINE', { ...item }, signingMaterial(key));
}
export function readOfflineItem(proof: unknown, key?: SigningMaterial): OfflineItem {
  const material = signingMaterial(key);
  try {
    const item = readCredential('PLUTO-OFFLINE', proof, material) as OfflineItem;
    if (!/^[a-f0-9]{64}$/.test(item.leaseHash) || typeof item.eventId !== 'string' || typeof item.id !== 'string' || !['ticket', 'guest'].includes(item.kind) || !Number.isInteger(item.version) || item.version < 1 || !Number.isFinite(Date.parse(item.validFrom)) || !Number.isFinite(Date.parse(item.validUntil))) throw new Error();
    return item;
  } catch { return fail('Invalid offline preparation proof.', 400); }
}
