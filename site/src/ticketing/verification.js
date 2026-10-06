const bytes = encoded => Uint8Array.from(atob(encoded.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0));
const validId = id => typeof id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(id);
export async function importVerificationKeys(manifest) {
  if (manifest.verificationKeys) {
    const entries = Object.entries(manifest.verificationKeys);
    if (!entries.length || entries.length > 16 || manifest.legacyKeyId !== null && !validId(manifest.legacyKeyId)) throw new Error('Invalid scanner verification keys. Prepare again online.');
    const keys = new Map();
    for (const [id, jwk] of entries) {
      if (!validId(id) || jwk.kty !== 'OKP' || jwk.crv !== 'Ed25519' || Object.hasOwn(jwk, 'd') || jwk.kid && jwk.kid !== id) throw new Error('Invalid scanner verification key.');
      keys.set(id, await crypto.subtle.importKey('jwk', jwk, { name: 'Ed25519' }, false, ['verify']));
    }
    return { keys, legacyKeyId: manifest.legacyKeyId };
  }
  return { keys: new Map([['legacy', await crypto.subtle.importKey('jwk', manifest.verificationKey, { name: 'Ed25519' }, false, ['verify'])]]), legacyKeyId: 'legacy' };
}
export async function verifyTicketQr(qr, prepared) {
  if (typeof qr !== 'string' || qr.length > 3000) throw new Error('Invalid ticket signature.');
  const [prefix, data, signature, extra] = qr.split('.');
  if (!['PLUTO1', 'PLUTO2'].includes(prefix) || extra !== undefined || !data || !/^[A-Za-z0-9_-]+$/.test(data) || !/^[A-Za-z0-9_-]{86}$/.test(signature || '')) throw new Error('Invalid ticket signature.');
  let token;
  try { token = JSON.parse(new TextDecoder().decode(bytes(data))); } catch { throw new Error('Invalid ticket signature.'); }
  const legacy = prefix === 'PLUTO1';
  if (!token || typeof token !== 'object' || Array.isArray(token) || (legacy ? Object.hasOwn(token, 'kid') : !validId(token.kid))) throw new Error('Invalid ticket signature.');
  const key = prepared.keys.get(legacy ? prepared.legacyKeyId : token.kid);
  if (!key) throw new Error('This ticket uses an unavailable verification key. Reconnect and prepare the scanner again.');
  if (!await crypto.subtle.verify('Ed25519', key, bytes(signature), new TextEncoder().encode(legacy ? data : `${prefix}.${data}`))) throw new Error('Invalid ticket signature.');
  if (typeof token.id !== 'string' || typeof token.eventId !== 'string' || !Number.isInteger(token.version) || Object.hasOwn(token, 'leaseHash') || Object.hasOwn(token, 'kind')) throw new Error('Invalid ticket.');
  return token;
}
