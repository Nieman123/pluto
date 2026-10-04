import type { DecodedIdToken } from 'firebase-admin/auth';
import type { DocumentSnapshot, Transaction } from 'firebase-admin/firestore';
import { Guests } from './guests';
import type { Order } from './orders';
import { assertCapacity, cart, email, fail, hash, id, receipt, text, ticketId, type EventDraft } from './domain';
import { isLive, keyPair } from './config';
import { randomInt } from 'node:crypto';
import { secret } from './domain';

export class Rsvps extends Guests {
  async requestRsvpVerification(raw: any, actor: DecodedIdToken | null) {
    const target = email(raw.email), eventId = id(raw.eventId), event = (await this.event(eventId).get()).data(), draft = event?.liveDraft || event?.draft;
    if (event?.status !== 'published' || !['rsvp', 'rsvp-approval'].includes(draft?.registrationMode) || Date.now() >= Date.parse(draft.endAt)) fail('RSVPs are not open for this event.', 409);
    if (actor?.email_verified && actor.email?.toLowerCase() === target) return { verified: true };
    const token = secret(), code = String(randomInt(1000000)).padStart(6, '0'), expiresAt = Date.now() + 15 * 60000;
    const batch = this.db.batch(), verificationId = hash(token);
    batch.create(this.db.collection('ticketingRsvpVerification').doc(verificationId), { eventId, email: target, codeHash: hash(`${token}:${code}`), expiresAt, attempts: 0, used: false });
    batch.create(this.db.collection('ticketingEmailJobs').doc(`verify_${verificationId}`), { type: 'rsvp-verification', verificationId, eventId, eventTitle: draft.title, to: target, code, status: 'pending', attempts: 0, createdAt: Date.now() });
    await batch.commit(); return { verificationToken: token, expiresAt };
  }
  private async rsvpProof(raw: any, actor: DecodedIdToken | null) {
    const target = email(raw.email);
    if (actor?.email_verified && actor.email?.toLowerCase() === target) return null;
    if (typeof raw.verificationToken !== 'string' || !/^[a-f0-9]{64}$/.test(raw.verificationToken) || typeof raw.verificationCode !== 'string' || !/^\d{6}$/.test(raw.verificationCode)) fail('Verify your RSVP email before submitting.', 403, 'rsvp-email-verification');
    const ref = this.db.collection('ticketingRsvpVerification').doc(hash(raw.verificationToken));
    const valid = await this.db.runTransaction(async tx => {
      const proof = (await tx.get(ref)).data();
      if (!proof || proof.used || proof.expiresAt <= Date.now() || proof.attempts >= 10 || proof.eventId !== raw.eventId || proof.email !== target) return false;
      const matches = proof.codeHash === hash(`${raw.verificationToken}:${raw.verificationCode}`);
      tx.update(ref, { attempts: proof.attempts + 1 }); return matches;
    });
    if (!valid) fail('That email code is invalid or expired. Request a new code.', 403, 'rsvp-email-verification');
    return ref;
  }
  private issueRsvp(tx: Transaction, orderId: string, order: Order, pools: DocumentSnapshot[]) {
    pools.forEach(pool => tx.update(pool.ref, { sold: pool.data()!.sold + order.consumption[pool.id] }));
    order.units.forEach((unit, index) => tx.set(this.tickets().doc(ticketId(orderId, index)), {
      ...unit, orderId, eventId: order.eventId, eventTitle: order.eventTitle, ownerUid: order.ownerUid,
      holderEmail: order.email, holderName: order.name, transferCutoff: order.transferCutoff || unit.validFrom,
      rsvp: true, version: (order as any).rsvpTicketVersion || 1, status: 'valid', admission: null, refunded: false, index,
    }));
    tx.create(this.db.collection('ticketingEmailJobs').doc(`receipt_${orderId}${((order as any).rsvpTicketVersion || 1) > 1 ? `_${(order as any).rsvpTicketVersion}` : ''}`), { type: 'receipt', orderId, to: order.email, status: 'pending', createdAt: Date.now(), attempts: 0 });
  }
  async rsvp(raw: any, actor: DecodedIdToken | null) {
    const eventId = id(raw.eventId), accessKey = receipt(raw.accessKey), orderId = hash(accessKey), ref = this.order(orderId);
    const contact = { email: email(raw.email), name: text(raw.name, 'name', 150, true), ownerUid: actor?.uid || '' };
    if (!Array.isArray(raw.items) || raw.items.length !== 1 || raw.items[0]?.quantity !== 1 || raw.promoCode) fail('RSVP once per person. Choose one admission pass.');
    const inputHash = hash(JSON.stringify({ eventId, ...contact, offerId: id(raw.items[0].offerId) }));
    keyPair(this.signing());
    const previousAttempt = (await ref.get()).data();
    if (!previousAttempt) {
      const preflight = (await this.event(eventId).get()).data(), draft = preflight?.liveDraft || preflight?.draft;
      if (preflight?.status !== 'published' || !['rsvp', 'rsvp-approval'].includes(draft?.registrationMode) || Date.now() >= Date.parse(draft.endAt)) fail('RSVPs are not open for this event.', 409);
    }
    const proofRef = previousAttempt ? null : await this.rsvpProof(raw, actor);
    await this.db.runTransaction(async tx => {
      const existing = (await tx.get(ref)).data() as Order | undefined;
      if (existing) { if (existing.method !== 'rsvp' || existing.inputHash !== inputHash) fail('This RSVP attempt has different details. Use the original request or start a new attempt.', 409); return; }
      if (!proofRef && !(actor?.email_verified && actor.email?.toLowerCase() === contact.email)) fail('Verify your RSVP email before submitting.', 403, 'rsvp-email-verification');
      const eventRef = this.event(eventId), event = (await tx.get(eventRef)).data(), now = Date.now();
      if (!event || event.status !== 'published') fail('RSVPs are not open for this event.', 409);
      const draft = (event.liveDraft || event.draft) as EventDraft;
      if (!['rsvp', 'rsvp-approval'].includes(draft.registrationMode) || now >= Date.parse(draft.endAt)) fail('RSVPs are not open for this event.', 409);
      const priced = cart(draft, raw.items, '', now);
      if (priced.total !== 0 || priced.units.some(u => u.kind !== 'admission')) fail('This event is not configured for free RSVP admission.', 409);
      const contactRef = eventRef.collection('rsvpContacts').doc(hash(contact.email)), previous = await tx.get(contactRef);
      const proof = proofRef ? (await tx.get(proofRef)).data() : null;
      if (proofRef && (!proof || proof.used || proof.expiresAt <= now || proof.email !== contact.email || proof.eventId !== eventId)) fail('This email code has already been used or expired.', 403, 'rsvp-email-verification');
      if (previous.exists) fail('An RSVP already exists for this email. Open it in My tickets or recover it with your email.', 409);
      const pools = await Promise.all(Object.keys(priced.consumption).map(key => tx.get(eventRef.collection('pools').doc(key))));
      assertCapacity(priced.consumption, Object.fromEntries(pools.map(p => [p.id, p.data()])));
      const pending = draft.registrationMode === 'rsvp-approval';
      const order: Order = { eventId, eventTitle: draft.title, eventSlug: draft.slug, ...contact, accessHash: hash(accessKey), inputHash,
        ...priced, tax: draft.tax, currency: 'usd', livemode: isLive(), status: pending ? 'pending-approval' : 'paid', method: 'rsvp',
        rsvpStatus: pending ? 'pending' : 'approved', approvalRequired: pending, createdAt: now, expiresAt: Date.parse(draft.endAt),
        promoterId: '', transferCutoff: draft.admissionStartsAt, taxAmount: 0, refundedAmount: 0 };
      if (!pending) this.issueRsvp(tx, orderId, order, pools);
      else tx.create(this.db.collection('ticketingEmailJobs').doc(`rsvppending_${orderId}`), { type: 'rsvp-pending', orderId, to: order.email, status: 'pending', createdAt: now, attempts: 0 });
      tx.create(ref, { ...order, revision: event.publishedRevision, ...(pending ? {} : { paidAt: now }) });
      tx.update(ref, { emailVerifiedAt: now });
      if (proofRef) tx.update(proofRef, { used: true, usedAt: now });
      tx.create(contactRef, { orderId, at: now });
      tx.create(eventRef.collection('audit').doc(), { action: pending ? 'rsvp-requested' : 'rsvp-confirmed', orderId, uid: actor?.uid || '', at: now });
    });
    const order = (await ref.get()).data() as Order;
    return { orderId, status: order.status, rsvpStatus: order.rsvpStatus, total: 0 };
  }
  async reviewRsvp(eventId: string, orderId: string, decision: unknown, rawNote: unknown, uid: string) {
    await this.role(uid, eventId);
    if (!['approve', 'decline'].includes(decision as string)) fail('Choose approve or decline.');
    const note = text(rawNote || '', 'decision note', 500), approved = decision === 'approve';
    keyPair(this.signing());
    await this.db.runTransaction(async tx => {
      const ref = this.order(orderId), order = (await tx.get(ref)).data() as Order | undefined;
      if (!order || order.eventId !== eventId || order.method !== 'rsvp') fail('RSVP not found.', 404);
      if (order.rsvpStatus === (approved ? 'approved' : 'declined')) return;
      if (order.rsvpStatus !== 'pending' || order.status !== 'pending-approval') fail('This RSVP has already been resolved. Refresh the list.', 409);
      const eventRef = this.event(eventId), event = (await tx.get(eventRef)).data(), draft = (event?.liveDraft || event?.draft) as EventDraft;
      if (approved && (!event || event.status !== 'published' || !['rsvp', 'rsvp-approval'].includes(draft.registrationMode) || Date.now() >= Date.parse(draft.endAt))) fail('This event is not open for RSVP approval.', 409);
      const offer = draft?.offers.find(o => o.id === order.units[0].offerId && o.active);
      if (approved && (!offer || offer.unitAmount !== 0 || Date.now() >= Date.parse(offer.validUntil))) fail('The requested RSVP pass is no longer available.', 409);
      // Pending requests hold no stock. Approval uses the currently published admission pass and capacity.
      const admission = approved ? { ...order, units: [{ ...order.units[0], pools: offer!.pools, validFrom: offer!.validFrom, validUntil: offer!.validUntil }], consumption: offer!.pools } : order;
      const pools = approved ? await Promise.all(Object.keys(admission.consumption).map(key => tx.get(eventRef.collection('pools').doc(key)))) : [];
      const existingTickets = approved ? await tx.get(this.tickets().where('orderId', '==', orderId)) : null;
      if (existingTickets?.docs.some(t => t.data().status !== 'revoked' || t.data().admission)) fail('Existing RSVP admission needs staff review.', 409);
      if (approved) (admission as any).rsvpTicketVersion = Math.max(0, ...(existingTickets?.docs.map(t => t.data().version) || [])) + 1;
      if (approved) { assertCapacity(admission.consumption, Object.fromEntries(pools.map(p => [p.id, p.data()]))); this.issueRsvp(tx, orderId, admission, pools); }
      else tx.create(this.db.collection('ticketingEmailJobs').doc(`rsvpdeclined_${orderId}_${(order as any).supportRevision || 0}`), { type: 'rsvp-declined', orderId, to: order.email, note, status: 'pending', createdAt: Date.now(), attempts: 0 });
      tx.update(ref, { status: approved ? 'paid' : 'declined', rsvpStatus: approved ? 'approved' : 'declined', decisionNote: note,
        decidedAt: Date.now(), decidedBy: uid, ...(approved ? { units: admission.units, consumption: admission.consumption, paidAt: Date.now() } : {}) });
      tx.create(eventRef.collection('audit').doc(), { action: approved ? 'rsvp-approved' : 'rsvp-declined', orderId, note, uid, at: Date.now() });
    });
    return { saved: true };
  }
  override async cancel(orderId: string, key: unknown, actor: DecodedIdToken | null) {
    const order = await this.authorize(orderId, key, actor);
    if (order.method !== 'rsvp') return super.cancel(orderId, key, actor);
    return this.withdrawRsvpOrder(orderId, actor?.uid || '');
  }
  async withdrawRsvp(eventId: string, orderId: string, uid: string) {
    await this.role(uid, eventId);
    const order = (await this.order(orderId).get()).data();
    if (!order || order.eventId !== eventId || order.method !== 'rsvp') fail('RSVP not found.', 404);
    return this.withdrawRsvpOrder(orderId, uid);
  }
  private async withdrawRsvpOrder(orderId: string, uid: string) {
    await this.db.runTransaction(async tx => {
      const ref = this.order(orderId), latest = (await tx.get(ref)).data() as Order;
      if (['withdrawn', 'declined'].includes(latest.rsvpStatus || '')) return;
      const tickets = await tx.get(this.tickets().where('orderId', '==', orderId));
      if (tickets.docs.some(t => t.data().admission)) fail('An RSVP that has already arrived cannot be withdrawn.', 409);
      const pools = latest.rsvpStatus === 'approved' ? await Promise.all(Object.keys(latest.consumption).map(key => tx.get(this.event(latest.eventId).collection('pools').doc(key)))) : [];
      pools.forEach(pool => tx.update(pool.ref, { sold: Math.max(0, pool.data()!.sold - latest.consumption[pool.id]) }));
      tickets.docs.forEach(t => tx.update(t.ref, { status: 'revoked', version: t.data().version + 1 }));
      tx.update(ref, { status: 'withdrawn', rsvpStatus: 'withdrawn', withdrawnAt: Date.now() });
      tx.create(this.event(latest.eventId).collection('audit').doc(), { action: 'rsvp-withdrawn', orderId, uid, at: Date.now() });
    });
    return { status: (await this.order(orderId).get()).data()!.status };
  }
}
