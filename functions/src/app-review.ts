import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { Rewards } from './rewards';
import { fail } from './ticketing/domain';
import { baseUrl } from './ticketing/config';

// Explicitly enrolled demo identities only. Public discovery and live ledgers
// never contain these fixtures; no production signing credentials are minted.
export class AppReview {
  constructor(private db: Firestore) {}
  account(uid: string) { return this.db.collection('appReviewAccounts').doc(uid); }
  async enrolled(uid: string): Promise<boolean> { return (await this.account(uid).get()).exists; }
  async requireEnabled(uid: string) {
    if ((await this.account(uid).get()).data()?.enabled !== true) fail('Demo access is disabled. Contact Pluto support.', 403, 'demo-disabled');
  }
  events() {
    const start = new Date(Math.floor(Date.now() / 86400000) * 86400000 + 7 * 86400000 + 22 * 3600000).toISOString();
    const end = new Date(Date.parse(start) + 6 * 3600000).toISOString();
    return [
      { id: 'review-orbit', title: 'Orbit • sample event', details: 'A dance music gathering in Asheville. Demo tickets only; no real event or purchase.', registrationMode: 'tickets' },
      { id: 'review-underworld', title: 'Underworld • sample RSVP', details: 'Explore a confirmed RSVP for a sample community gathering. No real admission.', registrationMode: 'rsvp' },
    ].map((e, sortOrder) => ({ ...e, demo: true, startAt: start, endAt: end, isActive: true, sortOrder, ticketUrl: `/app/tickets?event=${e.id}`, flyerDataUrl: '',
      flyerImageUrl: `${baseUrl()}/gallery/${sortOrder ? 'manafest-2026-light-canopy' : 'manafest-2026-pink-stage'}.webp` }));
  }
  wallet(actor: DecodedIdToken) {
    const events = this.events();
    const orders = events.map((e, i) => ({ demo: true, orderId: `${e.id}-order`, eventId: e.id, eventTitle: e.title,
      status: 'paid', method: i ? 'rsvp' : 'demo', rsvpStatus: i ? 'approved' : '', total: i ? 0 : 3500, createdAt: Date.now() - (i + 1) * 86400000 }));
    const tickets = events.map((e, i) => ({ demo: true, id: `${e.id}-ticket`, version: 1, eventId: e.id, orderId: orders[i].orderId,
      eventTitle: e.title, name: i ? 'Confirmed RSVP' : 'General admission', holderName: actor.name || 'Pluto demo guest', status: 'valid',
      validFrom: e.startAt, validUntil: e.endAt, transferable: false, calendarUrl: '',
      venue: { name: 'Sample venue', available: true, address: 'Demo location • no real event', directions: 'These tickets are for app review only.' },
      qr: `pluto-review:${actor.uid}:${e.id}:not-valid-for-admission` }));
    return { demo: true, orders, tickets };
  }
  async handle(path: string, raw: any, actor: DecodedIdToken): Promise<unknown> {
    await this.requireEnabled(actor.uid);
    switch (path) {
      case '/account/navigation': return { admin: false, demo: true };
      case '/mine': return this.wallet(actor);
      case '/order': {
        const wallet = this.wallet(actor), order = wallet.orders.find(o => o.orderId === raw.orderId);
        if (!order) fail('Sample order not found.', 404);
        return { ...order, name: actor.name || 'Pluto demo guest', email: actor.email || '', refundedAmount: 0, taxAmount: 0,
          tickets: wallet.tickets.filter(t => t.orderId === order.orderId) };
      }
      case '/claim': return { claimed: 0, demo: true };
      case '/wallet/options': return { apple: false, google: false };
      case '/rewards/redeem': return new Rewards(this.db, Date.now, actor.uid).redeem(raw, actor);
      case '/rewards/claim': return new Rewards(this.db, Date.now, actor.uid).claim(raw, actor);
      case '/review/refill': return this.db.runTransaction(async tx => {
        const registry = await tx.get(this.account(actor.uid));
        if (registry.data()?.enabled !== true) fail('Demo access is disabled.', 403, 'demo-disabled');
        const profile = this.account(actor.uid).collection('userProfiles').doc(actor.uid);
        const balance = (await tx.get(profile)).data()?.pointsBalance;
        if (!Number.isSafeInteger(balance) || balance < 0) fail('Sample profile needs repair.', 409);
        if (balance < 500) {
          tx.update(profile, { pointsBalance: 500, updatedAt: FieldValue.serverTimestamp() });
          tx.create(profile.collection('pointsTransactions').doc(), { type: 'demo', reason: 'Sample points refill (no real value)',
            pointsDelta: 500 - balance, createdAt: FieldValue.serverTimestamp() });
        }
        return { demo: true, message: 'Your sample points are ready.', newPointsBalance: Math.max(balance, 500) };
      });
      default: return fail('This demo account cannot make live purchases, send emails, transfer tickets or manage real events.', 403, 'demo-only');
    }
  }
}

// Used by the explicit operator enrollment command, never an HTTP endpoint.
export async function seedAppReview(db: Firestore, uid: string, email: string) {
  const registry = db.collection('appReviewAccounts').doc(uid);
  await db.runTransaction(async tx => {
    const existing = await tx.get(registry);
    if (existing.exists) {
      if (existing.data()?.email !== email) fail('The enrolled email does not match.', 409);
      return; // Preserve balances, profile edits and disabled state on repeat runs.
    }
    const profile = registry.collection('userProfiles').doc(uid);
    tx.create(profile, { displayName: 'Pluto demo guest', homeCity: 'Asheville', favoriteGenre: 'Dance music',
      bio: 'Sample account for exploring Pluto Events.', profileImageDataUrl: '', pointsBalance: 500, lifetimePoints: 500, eventsAttended: 2,
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    tx.create(profile.collection('pointsTransactions').doc('welcome'), { type: 'demo', reason: 'Welcome sample points (no real value)', pointsDelta: 500, createdAt: FieldValue.serverTimestamp() });
    tx.create(registry.collection('rewardItems').doc('review-sticker'), { name: 'Demo Pluto sticker', description: 'Practice redeeming a reward. No physical item is shipped.',
      pointsCost: 100, isActive: true, inventory: null, category: 'Sample merchandise', imageDataUrl: '' });
    tx.create(registry.collection('rewardItems').doc('review-shirt'), { name: 'Demo Pluto shirt', description: 'Sample merchandise redemption; no real inventory or fulfillment.',
      pointsCost: 250, isActive: true, inventory: null, category: 'Sample merchandise', imageDataUrl: '' });
    tx.create(registry.collection('eventQrCodes').doc('review-hunt'), { eventName: 'Sample scavenger hunt', code: 'PLUTO-REVIEW', pointsAwarded: 100, isActive: true, totalClaims: 0 });
    tx.create(registry, { enabled: true, email, schemaVersion: 1, createdAt: FieldValue.serverTimestamp() });
  });
}
