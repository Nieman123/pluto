import { createHash, createPrivateKey, sign, X509Certificate, type KeyObject } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { toBuffer } from 'do-not-zip';
import { defineSecret } from 'firebase-functions/params';
import { baseUrl } from './config';
import { fail } from './domain';
import { cmsSignature } from './cms-signature';

export const walletCredentials = defineSecret('TICKETING_WALLET_CREDENTIALS');
export const walletSecrets = process.env.TICKETING_WALLETS_ENABLED === 'true' ? [walletCredentials] : [];
export interface WalletTicket {
  id: string; version: number; orderId: string; eventId: string; eventTitle: string; eventSlug: string;
  name: string; holderName: string; qr: string; validFrom: string; validUntil: string;
  startAt: string; endAt: string; timezone: string; venueName: string; address: string; city: string; region: string; publicVenue: boolean;
  venueAvailable?: boolean; venueRevealAt?: string | null;
}
interface AppleCredentials { passTypeIdentifier: string; teamIdentifier: string; signerCert: string; signerKey: string; wwdr: string; signerKeyPassphrase?: string }
interface GoogleCredentials { issuerId: string; clientEmail: string; privateKey: string }
interface Credentials { apple?: AppleCredentials; google?: GoogleCredentials }
function rsaKey(pem: string, passphrase?: string) {
  const key = createPrivateKey({ key: pem, passphrase });
  if (key.asymmetricKeyType !== 'rsa' || (key.asymmetricKeyDetails?.modulusLength || 0) < 2048) throw new Error('RSA 2048+ key required');
  return key;
}
function appleSigner(config: AppleCredentials) {
  const cert = new X509Certificate(config.signerCert), wwdr = new X509Certificate(config.wwdr), key = rsaKey(config.signerKey, config.signerKeyPassphrase), now = Date.now();
  if (![cert, wwdr].every(c => Date.parse(c.validFrom) <= now && Date.parse(c.validTo) > now) || !cert.checkPrivateKey(key) || !wwdr.ca || cert.issuer !== wwdr.subject || !cert.verify(wwdr.publicKey)) throw new Error('Invalid Apple certificate chain');
  if (!/^pass\.[A-Za-z0-9.-]+$/.test(config.passTypeIdentifier) || !/^[A-Z0-9]{10}$/.test(config.teamIdentifier)) throw new Error('Invalid Apple identifiers');
  const subject = Object.fromEntries(cert.subject.split('\n').map(line => { const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1)]; }));
  if (subject.UID !== config.passTypeIdentifier || subject.OU !== config.teamIdentifier) throw new Error('Apple certificate identity mismatch');
  return { cert, wwdr, key };
}
function googleSigner(config: GoogleCredentials) {
  if (!/^\d+$/.test(config.issuerId) || !/^[^\s@]+@[^\s@]+\.iam\.gserviceaccount\.com$/.test(config.clientEmail)) throw new Error('Invalid Google issuer');
  return rsaKey(config.privateKey);
}
const unavailable = () => fail('Digital wallet passes are not available yet. Your in-app ticket still works.', 503, 'wallet-unavailable');
export class DigitalWallet {
  constructor(private configured?: Credentials, private request: typeof fetch = fetch) {}
  private config(): Credentials {
    if (this.configured) return this.configured;
    if (process.env.TICKETING_WALLETS_ENABLED !== 'true') return {};
    try { return JSON.parse(Buffer.from(walletCredentials.value(), 'base64').toString('utf8')); } catch { return {}; }
  }
  options() {
    const config = this.config(); let apple = false, google = false;
    try { if (config.apple) { appleSigner(config.apple); apple = true; } } catch { /* Incomplete setup must not break the ticket wallet. */ }
    try { if (config.google) { googleSigner(config.google); google = true; } } catch { /* Only advertise a configured provider. */ }
    return { apple, google };
  }
  async apple(ticket: WalletTicket) {
    const config = this.config().apple; if (!config) return unavailable();
    let signer; try { signer = appleSigner(config); } catch { return unavailable(); }
    const date = new Intl.DateTimeFormat('en-US', { timeZone: ticket.timezone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(ticket.startAt));
    const pass = { formatVersion: 1, passTypeIdentifier: config.passTypeIdentifier, teamIdentifier: config.teamIdentifier,
      serialNumber: `${ticket.id}_v${ticket.version}`, organizationName: 'Pluto Events', description: `${ticket.eventTitle} · ${ticket.name}`,
      logoText: 'PLUTO EVENTS', foregroundColor: 'rgb(255,255,255)', backgroundColor: 'rgb(33,21,41)', labelColor: 'rgb(255,187,120)',
      sharingProhibited: true, relevantDate: ticket.startAt, expirationDate: ticket.validUntil,
      barcodes: [{ format: 'PKBarcodeFormatQR', message: ticket.qr, messageEncoding: 'iso-8859-1', altText: 'Show at the door' }],
      eventTicket: { primaryFields: [{ key: 'event', label: 'YOUR NIGHT', value: ticket.eventTitle }],
        secondaryFields: [{ key: 'ticket', label: 'ADMISSION', value: ticket.name }, { key: 'holder', label: 'GUEST', value: ticket.holderName }],
        auxiliaryFields: [{ key: 'date', label: 'EVENT TIME', value: date }, { key: 'city', label: 'CITY', value: `${ticket.city}, ${ticket.region}` }],
        backFields: [{ key: 'venue', label: 'VENUE', value: walletVenue(ticket) },
          { key: 'app', label: 'YOUR IN-APP TICKET', value: `${baseUrl()}/app/tickets` },
          { key: 'admission', label: 'ADMISSION', value: 'This pass uses your current Pluto ticket credential. Refunds and transfers invalidate the old code. First admission is recorded at the door.' }] } };
    const files: Record<string, Buffer> = { 'pass.json': Buffer.from(JSON.stringify(pass)) };
    const logo = await readFile(join(__dirname, '../content/wallet-logo.png'));
    for (const scale of [1, 2, 3]) files[`icon${scale === 1 ? '' : `@${scale}x`}.png`] = await sharp(logo).resize(29 * scale, 29 * scale, { fit: 'contain', background: '#211529' }).png().toBuffer();
    for (const scale of [1, 2]) files[`logo${scale === 1 ? '' : `@${scale}x`}.png`] = await sharp(logo).resize(50 * scale, 50 * scale, { fit: 'contain', background: '#211529' }).png().toBuffer();
    files['manifest.json'] = Buffer.from(JSON.stringify(Object.fromEntries(Object.entries(files).map(([name, data]) => [name, createHash('sha1').update(data).digest('hex')]))));
    files.signature = cmsSignature(files['manifest.json'], signer.cert, signer.key, signer.wwdr);
    return toBuffer(Object.entries(files).map(([path, data]) => ({ path, data })));
  }
  private token?: { fingerprint: string; value: string; expiresAt: number };
  private async oauth(config: GoogleCredentials, key: KeyObject, signal: AbortSignal) {
    const fingerprint = createHash('sha256').update(config.privateKey + config.clientEmail).digest('hex');
    if (this.token?.fingerprint === fingerprint && this.token.expiresAt > Date.now() + 60000) return this.token.value;
    const now = Math.floor(Date.now() / 1000), assertion = jwt({ iss: config.clientEmail, scope: 'https://www.googleapis.com/auth/wallet_object.issuer', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }, key);
    const response = await this.request('https://oauth2.googleapis.com/token', { method: 'POST', signal, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }) });
    if (!response.ok) return unavailable();
    const result = await response.json() as any;
    if (typeof result.access_token !== 'string' || !Number.isFinite(result.expires_in)) return unavailable();
    this.token = { fingerprint, value: result.access_token, expiresAt: Date.now() + result.expires_in * 1000 }; return result.access_token as string;
  }
  async google(ticket: WalletTicket) {
    const config = this.config().google; if (!config) return unavailable();
    try {
      const signal = AbortSignal.timeout(35000), key = googleSigner(config), token = await this.oauth(config, key, signal), classId = `${config.issuerId}.pluto_${ticket.eventId}`, objectId = `${config.issuerId}.pluto_${ticket.id}_v${ticket.version}`;
      const localized = (value: string) => ({ defaultValue: { language: 'en-US', value } });
      const eventClass = { id: classId, issuerName: 'Pluto Events', eventName: localized(ticket.eventTitle), hexBackgroundColor: '#211529',
        multipleDevicesAndHoldersAllowedStatus: 'ONE_USER_ALL_DEVICES',
        dateTime: { start: ticket.startAt, end: ticket.endAt }, venue: { name: localized(ticket.publicVenue ? ticket.venueName || ticket.city : ticket.city), address: localized(ticket.publicVenue ? ticket.address || `${ticket.city}, ${ticket.region}` : `${ticket.city}, ${ticket.region}`) } };
      // Objects live at Google before signing: the save JWT remains short even for dense signed QR codes.
      const object = { id: objectId, classId, state: 'ACTIVE', hexBackgroundColor: '#211529', ticketHolderName: ticket.holderName, ticketNumber: ticket.id,
        ticketType: localized(ticket.name), barcode: { type: 'QR_CODE', value: ticket.qr, alternateText: 'Show at the door' },
        validTimeInterval: { start: { date: ticket.validFrom }, end: { date: ticket.validUntil } },
        passConstraints: { screenshotEligibility: 'INELIGIBLE' },
        textModulesData: [{ id: 'venue', header: 'VENUE', body: walletVenue(ticket) }],
        linksModuleData: { uris: [{ id: 'app', uri: `${baseUrl()}/app/tickets`, description: 'Your Pluto ticket' }] } };
      await this.upsert('eventTicketClass', classId, eventClass, token, signal, true);
      await this.upsert('eventTicketObject', objectId, object, token, signal);
      const save = jwt({ iss: config.clientEmail, aud: 'google', typ: 'savetowallet', iat: Math.floor(Date.now() / 1000), origins: [new URL(baseUrl()).hostname], payload: { eventTicketObjects: [{ id: objectId }] } }, key);
      if (save.length > 1800) return unavailable();
      return `https://pay.google.com/gp/v/save/${save}`;
    } catch { return unavailable(); }
  }
  private async upsert(kind: string, id: string, data: Record<string, unknown>, token: string, signal: AbortSignal, isClass = false) {
    const root = `https://walletobjects.googleapis.com/walletobjects/v1/${kind}`, headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const call = (url: string, method: string, body?: any) => this.request(url, { method, headers, signal, ...(body ? { body: JSON.stringify(body) } : {}) });
    const found = await call(`${root}/${id}`, 'GET');
    if (found.status === 404) {
      const created = await call(root, 'POST', { ...data, ...(isClass ? { reviewStatus: 'UNDER_REVIEW' } : {}) });
      if (created.ok) return; if (created.status !== 409) return unavailable();
    } else if (!found.ok) return unavailable();
    const updated = await call(`${root}/${id}`, 'PATCH', data); if (!updated.ok) return unavailable();
  }
}
function jwt(payload: Record<string, unknown>, key: KeyObject) {
  const data = [Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url'), Buffer.from(JSON.stringify(payload)).toString('base64url')].join('.');
  return `${data}.${sign('RSA-SHA256', Buffer.from(data), key).toString('base64url')}`;
}
function walletVenue(ticket: WalletTicket) {
  if (ticket.venueAvailable === false) return `Exact venue and directions will be revealed in the Pluto app${ticket.venueRevealAt ? ` on ${new Intl.DateTimeFormat('en-US', { timeZone: ticket.timezone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(ticket.venueRevealAt))} (${ticket.timezone})` : ''}.`;
  return [ticket.venueName, ticket.address].filter(Boolean).join('\n') || `${ticket.city}, ${ticket.region}`;
}
