import { FieldValue, type DocumentReference, type Firestore, type Transaction } from 'firebase-admin/firestore';
import { fail, integer } from './domain';

export interface TicketRewardInput {
  ref: DocumentReference; ticket: Record<string, any>; earned?: { points: number; at: number };
}

// Prepare all reads first; admission/account linking and the ledger commit together.
// The receipt lives under the stable ticket ID, not its rotating QR version.
export async function prepareCheckInRewards(db: Firestore, tx: Transaction, inputs: TicketRewardInput[]) {
  const grants: { ref: DocumentReference; prior: any; points: number; ticket: Record<string, any>; ticketId: string; at: number; uid: string }[] = [];
  for (const input of inputs) {
    if (!input.ticket.admission || input.ticket.status !== 'valid') continue;
    const ref = input.ref.collection('rewards').doc('check-in'), prior = (await tx.get(ref)).data();
    if (prior?.creditedUid || !prior && !input.earned) continue;
    const points = integer(prior?.points ?? input.earned!.points, 'check-in Pluto Points', 0, 1000000);
    if (!points) continue;
    grants.push({ ref, prior, points, ticket: input.ticket, ticketId: input.ref.id,
      at: prior?.earnedAt ?? input.earned!.at, uid: input.ticket.ownerUid || '' });
  }
  const profiles = new Map<string, { ref: DocumentReference; data: any; points: number; balance: number; lifetime: number }>();
  for (const grant of grants) {
    if (!grant.uid) continue;
    let profile = profiles.get(grant.uid);
    if (!profile) {
      const ref = db.collection('userProfiles').doc(grant.uid), data = (await tx.get(ref)).data();
      profile = { ref, data, points: 0, balance: 0, lifetime: 0 }; profiles.set(grant.uid, profile);
    }
    profile.points += grant.points;
  }
  for (const profile of profiles.values()) {
    const balance = profile.data?.pointsBalance ?? 0, lifetime = profile.data?.lifetimePoints ?? 0;
    if (![balance, lifetime, balance + profile.points, lifetime + profile.points].every(n => Number.isSafeInteger(n) && n >= 0))
      fail('Ticket rewards need organizer review: invalid Pluto Points balance.', 409, 'invalid-rewards-state');
    profile.balance = balance; profile.lifetime = lifetime;
  }
  return () => {
    for (const [uid, profile] of profiles) {
      const ticket = grants.find(g => g.uid === uid)!.ticket;
      tx.set(profile.ref, { ...(!profile.data ? { displayName: ticket.holderName || 'Pluto Member',
        homeCity: '', favoriteGenre: '', bio: '', profileImageDataUrl: '', eventsAttended: 0,
        createdAt: FieldValue.serverTimestamp() } : {}), pointsBalance: profile.balance + profile.points,
        lifetimePoints: profile.lifetime + profile.points, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
    let awarded = 0;
    for (const grant of grants) {
      const receipt = { ticketId: grant.ticketId, orderId: grant.ticket.orderId, eventId: grant.ticket.eventId,
        points: grant.points, earnedAt: grant.at, status: grant.uid ? 'credited' : 'pending-account',
        ...(grant.uid ? { creditedUid: grant.uid, creditedAt: FieldValue.serverTimestamp() } : {}) };
      if (grant.prior) tx.update(grant.ref, receipt); else tx.create(grant.ref, receipt);
      if (!grant.uid) continue;
      const profile = profiles.get(grant.uid)!; profile.balance += grant.points;
      tx.create(profile.ref.collection('pointsTransactions').doc(`ticket_checkin_${grant.ticketId}`), {
        type: 'ticket-check-in', reason: `Ticket check-in: ${grant.ticket.eventTitle} · ${grant.ticket.name}`,
        pointsDelta: grant.points, referenceId: grant.ticketId, eventId: grant.ticket.eventId,
        balanceAfter: profile.balance, createdAt: FieldValue.serverTimestamp(),
      });
      awarded += grant.points;
    }
    return awarded;
  };
}

export function checkInRewardPoints(ticket: Record<string, any>, event: Record<string, any>) {
  return integer((event.liveDraft || event.draft)?.offers?.find((o: any) => o.id === ticket.offerId)?.checkInPoints ?? 0,
    'check-in Pluto Points', 0, 1000000);
}
