import { sign, verify } from 'node:crypto';
import { keyPair } from './config';
import { fail } from './domain';

export interface OfflineItem {
  leaseHash: string; eventId: string; id: string; kind: 'ticket' | 'guest'; version: number;
  validFrom: string; validUntil: string;
}
export interface OfflineSubmission { leaseToken?: unknown; itemProof?: unknown; deviceTime?: unknown }
export function signOfflineItem(item: OfflineItem, key?: string) {
  const payload = Buffer.from(JSON.stringify(item)).toString('base64url');
  return `PLUTO-OFFLINE1.${payload}.${sign(null, Buffer.from(payload), keyPair(key).privateKey).toString('base64url')}`;
}
export function readOfflineItem(proof: unknown, key?: string): OfflineItem {
  if (typeof proof !== 'string' || proof.length > 3000) fail('Invalid offline preparation proof.', 400);
  const [prefix, payload, signature, extra] = proof.split('.');
  try {
    if (prefix !== 'PLUTO-OFFLINE1' || extra || !payload || !signature || !verify(null, Buffer.from(payload), keyPair(key).publicKey, Buffer.from(signature, 'base64url'))) throw new Error();
    const item = JSON.parse(Buffer.from(payload, 'base64url').toString()) as OfflineItem;
    if (!/^[a-f0-9]{64}$/.test(item.leaseHash) || typeof item.eventId !== 'string' || typeof item.id !== 'string' || !['ticket', 'guest'].includes(item.kind) || !Number.isInteger(item.version) || item.version < 1 || !Number.isFinite(Date.parse(item.validFrom)) || !Number.isFinite(Date.parse(item.validUntil))) throw new Error();
    return item;
  } catch { return fail('Invalid offline preparation proof.', 400); }
}
