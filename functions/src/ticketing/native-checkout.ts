import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';
import { Timestamp } from 'firebase-admin/firestore';
import type { Catalog } from './catalog';
import { fail, hash, id, receipt, secret } from './domain';

const eventPaths = new Set(['/checkout', '/rsvp', '/rsvp/verification', '/rsvp/upgrade/verification', '/rsvp/upgrade-access', '/waitlist/verification', '/waitlist/join']);
const orderPaths = new Set(['/order', '/cancel', '/checkout-attempt']);
const expired = () => fail('Your app checkout session expired. Reopen this event from the Pluto app to continue.', 401, 'native-checkout-expired');

// These capabilities authorize checkout for one event, never account or staff APIs.
// Store verified claims, not the app's ID token or a refresh token.
export class NativeCheckout {
  constructor(private service: Catalog, private auth = () => getAuth()) {}
  private ref(token: unknown) { return this.service.db.collection('ticketingNativeCheckouts').doc(hash(receipt(token))); }
  async create(slug: unknown, actor: DecodedIdToken) {
    const eventId = (await this.service.db.collection('eventSlugs').doc(id(slug)).get()).data()?.eventId;
    if (!eventId) fail('Event not found.', 404);
    const event = (await this.service.event(eventId).get()).data();
    if (!event || event.status !== 'published') fail('Event not found.', 404);
    if ((event.liveDraft || event.draft).registrationMode === 'free') return { handoff: null };
    const handoff = secret(), expiresAt = Math.min(Date.now() + 120000, actor.exp * 1000);
    if (expiresAt <= Date.now()) expired();
    await this.ref(handoff).create({ kind: 'handoff', eventId, actor, expiresAt: Timestamp.fromMillis(expiresAt) });
    return { handoff };
  }
  private async validActor(actor: DecodedIdToken): Promise<DecodedIdToken> {
    if (!actor || actor.exp * 1000 <= Date.now()) return expired();
    const user = await this.auth().getUser(actor.uid).catch(() => null);
    if (!user || user.disabled || actor.auth_time * 1000 < Date.parse(user.tokensValidAfterTime || '1970-01-01') ||
        user.email !== actor.email || user.emailVerified !== !!actor.email_verified ||
        (await this.service.db.collection('accountDeletionRequests').doc(actor.uid).get()).exists) return expired();
    return actor;
  }
  async redeem(handoff: unknown, eventId: unknown) {
    const ref = this.ref(handoff), token = secret();
    const actor = await this.service.db.runTransaction(async tx => {
      const entry = (await tx.get(ref)).data();
      if (!entry || entry.kind !== 'handoff' || entry.expiresAt.toMillis() <= Date.now() || entry.eventId !== id(eventId)) return expired();
      const actor = await this.validActor(entry.actor);
      tx.delete(ref);
      tx.create(this.ref(token), { kind: 'session', eventId: entry.eventId, actor,
        expiresAt: Timestamp.fromMillis(Math.min(Date.now() + 45 * 60000, actor.exp * 1000)) });
      return actor;
    });
    const profile = (await this.service.db.collection('userProfiles').doc(actor.uid).get()).data();
    const user = await this.auth().getUser(actor.uid);
    return { token, eventId, account: { uid: actor.uid, email: user.email || '', displayName: profile?.displayName || user.displayName || '' } };
  }
  async actor(token: string, path: string, body: Record<string, unknown>) {
    if (!eventPaths.has(path) && !orderPaths.has(path)) fail('App checkout access is limited to this event.', 403);
    const entry = (await this.ref(token).get()).data();
    if (!entry || entry.kind !== 'session' || entry.expiresAt.toMillis() <= Date.now()) return expired();
    if (eventPaths.has(path)) {
      if (id(body.eventId) !== entry.eventId) fail('App checkout access is limited to this event.', 403);
    } else {
      const orderId = path === '/checkout-attempt' ? hash(receipt(body.accessKey)) : id(body.orderId);
      const order = (await this.service.db.collection('ticketingOrders').doc(orderId).get()).data();
      if (order && order.eventId !== entry.eventId) fail('App checkout access is limited to this event.', 403);
    }
    return this.validActor(entry.actor);
  }
  async cleanup() {
    const entries = await this.service.db.collection('ticketingNativeCheckouts').where('expiresAt', '<=', Timestamp.now()).limit(500).get();
    if (!entries.empty) { const batch = this.service.db.batch(); entries.docs.forEach(doc => batch.delete(doc.ref)); await batch.commit(); }
  }
}
