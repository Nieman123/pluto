import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { cart, fail, hash, receipt, type EventDraft } from './domain';
export const waitlistEligible = (draft: EventDraft, offerId: string) => draft.offers.some(o => o.id === offerId && o.active && o.kind === 'admission' && !o.requiresOfferIds.length);
export function currentWaitlistOffer(entry: any, draft: EventDraft | undefined, status: string, now = Date.now()) {
  if (!draft || status !== 'published' || !draft.waitlistEnabled || entry.status !== 'offered' || entry.offerExpiresAt <= now || entry.registrationMode !== draft.registrationMode || !waitlistEligible(draft, entry.offerId) || draft.registrationMode === 'rsvp-approval' && !entry.approvedBy) return false;
  try { return entry.offerHash === hash(JSON.stringify(cart(draft, [{ offerId: entry.offerId, quantity: 1 }], '', now))); } catch { return false; }
}
export async function waitlistHold(tx: Transaction, db: Firestore, raw: any, eventId: string, contact: string, draft: EventDraft, now: number) {
  if (!raw.waitlistToken) return null;
  const token = hash(receipt(raw.waitlistToken)), invitation = (await tx.get(db.collection('ticketingWaitlistTokens').doc(token))).data();
  if (!invitation) fail('This waitlist offer is not valid.', 403);
  const ref = db.collection('ticketingWaitlist').doc(invitation.entryId), entry = (await tx.get(ref)).data();
  if (!entry || entry.eventId !== eventId || entry.email !== contact || entry.inviteHash !== token || !currentWaitlistOffer(entry, draft, 'published', now)) fail('This waitlist offer has expired or changed.', 409);
  if (!Array.isArray(raw.items) || raw.items.length !== 1 || raw.items[0].offerId !== entry.offerId || raw.items[0].quantity !== 1 || raw.promoCode) fail('A waitlist offer reserves one named admission pass, without a promotion.', 409);
  if (!waitlistEligible(draft, entry.offerId) || entry.offerHash !== hash(JSON.stringify(cart(draft, raw.items, '', now)))) fail('Ticket settings changed. Request a new waitlist offer.', 409);
  if (draft.registrationMode === 'rsvp-approval' && !entry.approvedBy) fail('Organizer approval is required for this waitlist spot.', 403);
  return { ref, entry };
}
export function withoutWaitlistHold(pools: Record<string, any>, hold: Awaited<ReturnType<typeof waitlistHold>>) {
  return Object.fromEntries(Object.entries(pools).map(([key, pool]) => { if (pool && pool.held < (hold?.entry.consumption[key] || 0)) fail('Waitlist inventory needs review.', 409); return [key, pool ? { ...pool, held: pool.held - (hold?.entry.consumption[key] || 0) } : pool]; }));
}
