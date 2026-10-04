import type express from 'express';
import { isIP } from 'node:net';
import { hash } from './domain';

// Configure the observed proxy addresses/subnets, never every forwarded hop.
// Empty configuration intentionally ignores caller-supplied forwarding headers.
export function configureTrustedProxy(app: express.Express, value = process.env.TICKETING_TRUSTED_PROXIES || '') {
  const entries = value.split(',').map(entry => entry.trim()).filter(Boolean);
  for (const entry of entries) {
    if (['loopback', 'linklocal', 'uniquelocal'].includes(entry)) continue;
    const [address, prefix, extra] = entry.split('/'), family = isIP(address);
    if (!family || extra || (prefix !== undefined && (!/^\d+$/.test(prefix) || Number(prefix) <= 0 || Number(prefix) > (family === 4 ? 32 : 128)))) throw new Error('TICKETING_TRUSTED_PROXIES must contain explicit proxy IP addresses or subnets, not blanket trust or hop counts.');
  }
  app.set('trust proxy', entries.length ? entries : false);
}

export function clientIdentity(req: express.Request, uid?: string, scannerToken?: string) {
  if (scannerToken) return `scanner-session:${hash(scannerToken)}`;
  if (uid) return `account:${uid}`;
  const client = req.get('x-pluto-client');
  if (client && /^[a-f0-9]{64}$/.test(client)) return `client:${hash(client)}`;
  const proof = req.body?.accessKey || req.body?.token;
  if (typeof proof === 'string' && /^[a-f0-9]{64}$/.test(proof)) return `proof:${hash(proof)}`;
  // Compatibility for older clients. Network protection is a separate short burst limit.
  return `legacy-client:${hash(`${req.ip || 'unknown'}:${req.get('user-agent') || ''}`)}`;
}
