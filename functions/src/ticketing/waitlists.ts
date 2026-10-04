import type { DecodedIdToken } from 'firebase-admin/auth';
import { FieldPath } from 'firebase-admin/firestore';
import { Rsvps } from './rsvps';
import { cart, email, fail, hash, id, integer, receipt, secret, text, type EventDraft } from './domain';
import { currentWaitlistOffer, waitlistEligible } from './waitlist-hold';
import { rotatingBatch } from './worker-batch';

export class Waitlists extends Rsvps {
  async joinWaitlist(raw: any, actor: DecodedIdToken | null) {
    const eventId = id(raw.eventId), offerId = id(raw.offerId), target = email(raw.email), name = text(raw.name, 'name', 150, true), accessHash = hash(receipt(raw.accessKey));
    const ref = this.db.collection('ticketingWaitlist').doc(hash(`${eventId}:${offerId}:${target}`));
    const previous = (await ref.get()).data(), resume = previous?.accessHash === accessHash && ['waiting', 'approved', 'offered'].includes(previous.status);
    const proofRef = resume ? null : await this.rsvpProof(raw, actor, 'waitlist');
    return this.db.runTransaction(async tx => {
      const entry = (await tx.get(ref)).data(), event = (await tx.get(this.event(eventId))).data(), draft = event?.liveDraft as EventDraft, now = Date.now();
      if (resume && entry?.accessHash !== accessHash) fail('Waitlist access changed. Verify your email again.', 403);
      if (!draft || event?.status !== 'published' || !draft.waitlistEnabled || !waitlistEligible(draft, offerId) || now >= Date.parse(draft.endAt)) fail('This waitlist is not open.', 409);
      const priced = cart(draft, [{ offerId, quantity: 1 }], '', now);
      const proof = proofRef ? (await tx.get(proofRef)).data() : null;
      if (!resume && proofRef && (!proof || proof.used || proof.expiresAt <= now || proof.eventId !== eventId || proof.email !== target || proof.purpose !== 'waitlist')) fail('Verify your waitlist email again.', 403);
      if (!proofRef && !resume && !(actor?.email_verified && actor.email?.toLowerCase() === target)) fail('Verify your waitlist email first.', 403);
      if (entry?.status === 'claimed') fail('You already claimed this waitlist offer.', 409);
      const active = entry && ['waiting', 'approved', 'offered'].includes(entry.status);
      const pools = await Promise.all(Object.keys(priced.consumption).map(key => tx.get(this.event(eventId).collection('pools').doc(key))));
      if (!active && pools.every(pool => { const p = pool.data(); return p && p.sold + p.held + priced.consumption[pool.id] <= p.capacity; })) fail('This pass is available. Register on the event page.', 409);
      if (proofRef) tx.update(proofRef, { used: true, usedAt: now });
      if (active) { if (resume && entry.accessHash !== accessHash) fail('Waitlist access changed. Verify your email again.', 403); tx.update(ref, { accessHash }); }
      else tx.set(ref, { eventId, eventTitle: draft.title, offerId, offerName: priced.units[0].name, email: target, name, accessHash, ownerUid: actor?.uid || '', status: 'waiting', createdAt: now, emailVerifiedAt: now, approvedBy: '', offerAttempt: entry?.offerAttempt || 0 });
      return { entryId: ref.id, status: active ? entry.status : 'waiting', approvalRequired: draft.registrationMode === 'rsvp-approval' };
    });
  }
  async waitlistView(raw: any) {
    let entryId = raw.entryId, invitation;
    if (raw.token) { invitation = (await this.db.collection('ticketingWaitlistTokens').doc(hash(receipt(raw.token))).get()).data(); entryId = invitation?.entryId; }
    if (!entryId) fail('Waitlist entry not found.', 404);
    const entry = (await this.db.collection('ticketingWaitlist').doc(id(entryId)).get()).data();
    if (!entry || (raw.token ? entry.inviteHash !== hash(raw.token) : entry.accessHash !== hash(receipt(raw.accessKey)))) fail('Use your current waitlist link.', 403);
    const event = (await this.event(entry.eventId).get()).data(), draft = event?.liveDraft;
    return { entryId, eventId: entry.eventId, title: entry.eventTitle, slug: draft?.slug || '', name: entry.name, email: entry.email, offerId: entry.offerId, offerName: entry.offerName, status: entry.status,
      canClaim: !!raw.token && currentWaitlistOffer(entry, draft, event?.status),
      offerExpiresAt: entry.offerExpiresAt || null, registrationMode: draft?.registrationMode, orderId: entry.status === 'claimed' ? entry.orderId : null };
  }
  async expireWaitlist(entryId: string, withdrawn = false, expectedAttempt?: number) {
    const ref = this.db.collection('ticketingWaitlist').doc(id(entryId));
    await this.db.runTransaction(async tx => {
      const entry = (await tx.get(ref)).data(); if (!entry || ['claimed', 'withdrawn', 'expired'].includes(entry.status) || expectedAttempt !== undefined && (entry.status !== 'offered' || entry.offerAttempt !== expectedAttempt)) return;
      const pools = entry.status === 'offered' ? await Promise.all(Object.keys(entry.consumption).map(key => tx.get(this.event(entry.eventId).collection('pools').doc(key)))) : [];
      pools.forEach(pool => { if (!pool.exists || pool.data()!.held < entry.consumption[pool.id]) fail('Waitlist inventory needs review.', 409); });
      pools.forEach(pool => tx.update(pool.ref, { held: pool.data()!.held - entry.consumption[pool.id] }));
      tx.update(ref, { status: withdrawn ? 'withdrawn' : 'expired', endedAt: Date.now() });
    });
  }
  async withdrawWaitlist(raw: any) { const entry = await this.waitlistView(raw); await this.expireWaitlist(entry.entryId, true); return { saved: true }; }
  async staffWaitlist(eventId: string, uid: string, cursor = '') {
    await this.role(uid, eventId);
    let query = this.db.collection('ticketingWaitlist').where('eventId', '==', eventId).orderBy(FieldPath.documentId()).limit(101);
    if (cursor) query = query.startAfter(id(cursor));
    const rows = (await query.get()).docs;
    return { entries: rows.slice(0, 100).map(d => { const e = d.data(); return { id: d.id, name: e.name, email: e.email, offerName: e.offerName, status: e.status, createdAt: e.createdAt, offerExpiresAt: e.offerExpiresAt || null, approvedBy: e.approvedBy || '' }; }).sort((a, b) => a.createdAt - b.createdAt), nextCursor: rows.length > 100 ? rows[99].id : null };
  }
  async approveWaitlist(eventId: string, entryId: string, uid: string, note: unknown) {
    await this.role(uid, eventId); const reason = text(note, 'approval reason', 500, true), ref = this.db.collection('ticketingWaitlist').doc(id(entryId));
    await this.db.runTransaction(async tx => { const entry = (await tx.get(ref)).data(); if (!entry || entry.eventId !== eventId || !['waiting', 'approved'].includes(entry.status)) fail('Refresh this waitlist entry.', 409); tx.update(ref, { status: 'approved', approvedBy: uid, approvedAt: Date.now() }); tx.create(this.event(eventId).collection('audit').doc(), { action: 'waitlist-approved', entryId, uid, note: reason, at: Date.now() }); });
    await this.offerWaitlist(entryId); return { saved: true };
  }
  async offerWaitlist(entryId: string) {
    const ref = this.db.collection('ticketingWaitlist').doc(id(entryId)), token = secret();
    return this.db.runTransaction(async tx => {
      const entry = (await tx.get(ref)).data(); if (!entry || !['waiting', 'approved'].includes(entry.status)) return false;
      const event = (await tx.get(this.event(entry.eventId))).data(), draft = event?.liveDraft as EventDraft, now = Date.now();
      if (!draft || !draft.waitlistEnabled || event?.status !== 'published' || !waitlistEligible(draft, entry.offerId) || draft.registrationMode === 'rsvp-approval' && !entry.approvedBy) return false;
      const head = await tx.get(this.db.collection('ticketingWaitlist').where('eventId', '==', entry.eventId).where('offerId', '==', entry.offerId).where('status', draft.registrationMode === 'rsvp-approval' ? '==' : 'in', draft.registrationMode === 'rsvp-approval' ? 'approved' : ['waiting', 'approved']).orderBy('createdAt').limit(1));
      if (head.docs[0]?.id !== entryId) return false;
      const offer = draft.offers.find(o => o.id === entry.offerId)!;
      if (now < Date.parse(offer.salesStart) || now >= Date.parse(offer.salesEnd) || now >= Date.parse(draft.endAt)) return false;
      const priced = cart(draft, [{ offerId: entry.offerId, quantity: 1 }], '', now), offerExpiresAt = Math.min(now + (draft.waitlistOfferMinutes || 30) * 60000, Date.parse(offer.salesEnd), Date.parse(draft.endAt));
      if (offerExpiresAt <= now + 60000) return false;
      const pools = await Promise.all(Object.keys(priced.consumption).map(key => tx.get(this.event(entry.eventId).collection('pools').doc(key))));
      if (pools.some(pool => { const p = pool.data(); return !p || p.sold + p.held + priced.consumption[pool.id] > p.capacity; })) return false;
      const attempt = (entry.offerAttempt || 0) + 1;
      pools.forEach(pool => tx.update(pool.ref, { held: pool.data()!.held + priced.consumption[pool.id] }));
      tx.update(ref, { status: 'offered', consumption: priced.consumption, offerHash: hash(JSON.stringify(priced)), inviteHash: hash(token), offerExpiresAt, offeredAt: now, offerAttempt: attempt, registrationMode: draft.registrationMode });
      tx.create(this.db.collection('ticketingWaitlistTokens').doc(hash(token)), { entryId, expiresAt: offerExpiresAt });
      tx.create(this.db.collection('ticketingEmailJobs').doc(`waitlist_${entryId}_${attempt}`), { type: 'waitlist-offer', eventId: entry.eventId, entryId, token, to: entry.email, offerExpiresAt, status: 'pending', attempts: 0, createdAt: now });
      return true;
    });
  }
  async waitlistMaintenance() {
    const expired = await this.db.collection('ticketingWaitlist').where('status', '==', 'offered').where('offerExpiresAt', '<=', Date.now()).orderBy('offerExpiresAt').limit(100).get();
    for (const doc of expired.docs) await this.expireWaitlist(doc.id, false, doc.data().offerAttempt);
    const offered = await rotatingBatch(this.db, 'ticketingWaitlist', ['offered'], 100);
    for (const doc of offered.docs) {
      const e = doc.data(), event = (await this.event(e.eventId).get()).data(), draft = event?.liveDraft as EventDraft;
      if (!currentWaitlistOffer(e, draft, event?.status)) await this.expireWaitlist(doc.id, false, e.offerAttempt);
    }
    const waiting = await rotatingBatch(this.db, 'ticketingWaitlist', ['waiting', 'approved'], 100);
    for (const doc of [...waiting.docs].sort((a, b) => a.data().createdAt - b.data().createdAt || a.id.localeCompare(b.id))) await this.offerWaitlist(doc.id);
    return offered.size + waiting.size;
  }
}
