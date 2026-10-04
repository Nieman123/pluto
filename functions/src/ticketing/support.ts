import { Rsvps } from './rsvps';
import { email, fail, hash, integer, secret, text } from './domain';

export class Support extends Rsvps {
  async correctOrder(orderId: string, raw: any, uid: string) {
    const initial = (await this.order(orderId).get()).data();
    if (!initial) fail('Order not found.', 404);
    await this.role(uid, initial.eventId, ['manager']);
    const name = text(raw.name, 'buyer name', 150, true), target = email(raw.email);
    const note = text(raw.note, 'support reason', 500, true), revision = integer(raw.revision, 'support revision', 0);
    await this.db.runTransaction(async tx => {
      const ref = this.order(orderId), order = (await tx.get(ref)).data()!;
      if ((order.supportRevision || 0) !== revision) fail('This order changed. Refresh before saving.', 409);
      if (!['paid', 'pending-approval', 'declined', 'withdrawn'].includes(order.status)) fail('Resolve the checkout before correcting buyer details.', 409);
      if (order.name === name && order.email === target) return;
      const tickets = await tx.get(this.tickets().where('orderId', '==', orderId));
      const changedEmail = order.email !== target;
      const oldContact = this.event(order.eventId).collection('rsvpContacts').doc(hash(order.email));
      const newContact = this.event(order.eventId).collection('rsvpContacts').doc(hash(target));
      const contact = order.method === 'rsvp' && changedEmail ? await tx.get(newContact) : null;
      if (contact?.exists && contact.data()!.orderId !== orderId) fail('Another RSVP already uses this email.', 409);
      if (order.method === 'rsvp' && changedEmail) {
        tx.delete(oldContact); tx.set(newContact, { orderId, at: Date.now() });
      }
      // Account ownership, financial allocations and transferred holders stay intact.
      tx.update(ref, { name, email: target, supportRevision: revision + 1, updatedAt: Date.now(),
        ...(changedEmail ? { originalEmail: order.originalEmail || order.email, accessHash: hash(secret()), accessRevision: (order.accessRevision || 0) + 1,
          ...(order.method === 'rsvp' ? { emailVerifiedAt: null } : {}) } : {}) });
      tickets.docs.filter(t => t.data().holderEmail === order.email && t.data().ownerUid === order.ownerUid)
        .forEach(t => tx.update(t.ref, { holderName: name, holderEmail: target,
          ...(changedEmail && t.data().status === 'valid' && !t.data().admission ? { version: t.data().version + 1 } : {}) }));
      tx.create(this.event(order.eventId).collection('audit').doc(), { action: 'order-contact-corrected', orderId, uid, note,
        before: { name: order.name, email: order.email }, after: { name, email: target }, at: Date.now() });
    });
    return { saved: true };
  }
  async supportResend(orderId: string, raw: any, uid: string) {
    const order = (await this.order(orderId).get()).data();
    if (!order) fail('Order not found.', 404);
    await this.role(uid, order.eventId, ['manager']);
    const note = text(raw.note, 'support reason', 500, true);
    const token = secret(), ref = this.db.collection('ticketingEmailJobs').doc(`support_${hash(token)}`);
    await this.db.runTransaction(async tx => {
      const latest = (await tx.get(this.order(orderId))).data()!;
      tx.create(this.db.collection('ticketingRecovery').doc(hash(token)), { orderId, accessRevision: latest.accessRevision || 0,
        expiresAt: Date.now() + 30 * 60000, used: false });
      tx.create(ref, { type: 'recovery', orderId, to: latest.email, token, accessRevision: latest.accessRevision || 0,
        status: 'pending', attempts: 0, createdAt: Date.now() });
      tx.create(this.event(latest.eventId).collection('audit').doc(), { action: 'support-access-resent', orderId, uid, note, at: Date.now() });
    });
    return { queued: true };
  }
  async reopenRsvp(eventId: string, orderId: string, raw: any, uid: string) {
    await this.role(uid, eventId, ['manager']);
    const note = text(raw.note, 'support reason', 500, true), revision = integer(raw.revision, 'support revision', 0);
    await this.db.runTransaction(async tx => {
      const ref = this.order(orderId), order = (await tx.get(ref)).data();
      if (!order || order.eventId !== eventId || order.method !== 'rsvp') fail('RSVP not found.', 404);
      if ((order.supportRevision || 0) !== revision) fail('This RSVP changed. Refresh before reopening.', 409);
      if (!['withdrawn', 'declined'].includes(order.rsvpStatus)) fail('Only declined or withdrawn RSVPs can be reopened.', 409);
      const event = (await tx.get(this.event(eventId))).data(), draft = event?.liveDraft || event?.draft;
      if (event?.status !== 'published' || !['rsvp', 'rsvp-approval'].includes(draft?.registrationMode) || Date.now() >= Date.parse(draft.endAt)) fail('This event is no longer open for RSVPs.', 409);
      const tickets = await tx.get(this.tickets().where('orderId', '==', orderId));
      if (tickets.docs.some(t => t.data().admission)) fail('An arrived RSVP cannot be reopened.', 409);
      // Old QR versions remain revoked. Reopening holds no capacity and needs a new approval.
      tx.update(ref, { status: 'pending-approval', rsvpStatus: 'pending', decisionNote: '', supportRevision: revision + 1, reopenedAt: Date.now() });
      tx.create(this.event(eventId).collection('audit').doc(), { action: 'rsvp-reopened', orderId, uid, note, previousStatus: order.rsvpStatus, at: Date.now() });
    });
    return { saved: true };
  }
}
