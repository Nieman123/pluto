import { createHash, sign, type KeyObject, type X509Certificate } from 'node:crypto';

// Detached CMS SignedData (RFC 5652). Crypto operations use Node/OpenSSL;
// these helpers only encode the small DER container required by Apple PassKit.
const der = (tag: number, bytes: Buffer) => {
  let length = bytes.length, parts: number[] = [];
  while (length) { parts.unshift(length & 255); length >>>= 8; }
  return Buffer.concat([Buffer.from([tag, ...(bytes.length < 128 ? [bytes.length] : [128 | parts.length, ...parts])]), bytes]);
};
const sequence = (...parts: Buffer[]) => der(0x30, Buffer.concat(parts));
const set = (...parts: Buffer[]) => der(0x31, Buffer.concat(parts.sort(Buffer.compare)));
const oid = (encoded: string) => der(6, Buffer.from(encoded, 'hex'));
const dataOid = oid('2a864886f70d010701');
const sha256 = sequence(oid('608648016503040201'), der(5, Buffer.alloc(0)));
function readDer(bytes: Buffer, offset: number) {
  const start = offset, tag = bytes[offset++], first = bytes[offset++];
  let length = first;
  if (first & 128) {
    const count = first & 127; if (!count || count > 4 || offset + count > bytes.length) throw new Error('Invalid DER length');
    length = 0; for (let i = 0; i < count; i++) length = length * 256 + bytes[offset++];
  }
  const end = offset + length; if (end > bytes.length) throw new Error('Truncated DER');
  return { tag, start, content: offset, end, raw: bytes.subarray(start, end) };
}
function issuerAndSerial(cert: X509Certificate) {
  const root = readDer(cert.raw, 0), tbs = readDer(cert.raw, root.content);
  let serial = readDer(cert.raw, tbs.content);
  if (serial.tag === 0xa0) serial = readDer(cert.raw, serial.end);
  if (serial.tag !== 2) throw new Error('Invalid certificate serial');
  const signatureAlgorithm = readDer(cert.raw, serial.end), issuer = readDer(cert.raw, signatureAlgorithm.end);
  if (issuer.tag !== 0x30) throw new Error('Invalid certificate issuer');
  return sequence(issuer.raw, serial.raw);
}
export function cmsSignature(content: Buffer, cert: X509Certificate, key: KeyObject, wwdr: X509Certificate, now = new Date()) {
  if (key.asymmetricKeyType !== 'rsa' || !cert.checkPrivateKey(key)) throw new Error('Apple signing certificate/key mismatch');
  const time = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z').replace('T', '');
  const attributes = set(
    sequence(oid('2a864886f70d010903'), set(dataOid)),
    sequence(oid('2a864886f70d010904'), set(der(4, createHash('sha256').update(content).digest()))),
    sequence(oid('2a864886f70d010905'), set(der(now.getUTCFullYear() < 2050 ? 0x17 : 0x18, Buffer.from(now.getUTCFullYear() < 2050 ? time.slice(2) : time)))),
  );
  const signer = sequence(der(2, Buffer.from([1])), issuerAndSerial(cert), sha256,
    Buffer.concat([Buffer.from([0xa0]), attributes.subarray(1)]),
    sequence(oid('2a864886f70d010101'), der(5, Buffer.alloc(0))), der(4, sign('RSA-SHA256', attributes, key)));
  return sequence(oid('2a864886f70d010702'), der(0xa0, sequence(der(2, Buffer.from([1])), set(sha256), sequence(dataOid),
    der(0xa0, Buffer.concat([cert.raw, wwdr.raw].sort(Buffer.compare))), set(signer))));
}
