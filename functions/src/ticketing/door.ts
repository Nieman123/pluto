import { FieldPath } from 'firebase-admin/firestore';
import { Support } from './support';
import { fail, hash, id, integer, receipt, text } from './domain';
import type { ScannerProof } from './scanner-access';
import { scannerAccess } from './scanner-access';

export class Door extends Support {
  private async doorAccess(eventId: string, identity: string | ScannerProof) {
    if (typeof identity === 'string') await this.role(identity, eventId, ['manager', 'admission']);
    else await scannerAccess(this.db, identity, eventId);
  }
  async attendance(eventId: string, raw: any, identity: string | ScannerProof) {
    await this.doorAccess(eventId, identity);
    const eventRef = this.event(eventId), event = (await eventRef.get()).data(); if (!event) fail('Event not found.', 404);
    const admitted = this.tickets().where('eventId', '==', eventId).where('kind', '==', 'admission').where('admission.at', '>', 0);
    const [ticketCount, rsvpCount, guestCount, outside, walkup] = await Promise.all([admitted.count().get(), admitted.where('rsvp', '==', true).count().get(), eventRef.collection('guests').where('arrival.at', '>', 0).count().get(), eventRef.collection('doorStates').where('inside', '==', false).count().get(), eventRef.collection('door').doc('walkups').get()]);
    const page = async (query: FirebaseFirestore.Query, cursor: unknown) => {
      if (cursor === 'done') return { docs: [], cursor: 'done' };
      const result = await (cursor ? query.startAfter(id(cursor)) : query).limit(51).get();
      return { docs: result.docs.slice(0, 50), cursor: result.size > 50 ? result.docs[49].id : 'done' };
    };
    const [tickets, guests] = await Promise.all([page(this.tickets().where('eventId', '==', eventId).orderBy(FieldPath.documentId()), raw.cursor?.tickets), page(eventRef.collection('guests').orderBy(FieldPath.documentId()), raw.cursor?.guests)]);
    const rows = [...tickets.docs.filter(d => d.data().kind === 'admission').map(d => ({ key: `ticket_${d.id}`, kind: 'ticket', id: d.id, name: d.data().holderName || d.data().name, pass: d.data().name, source: d.data().rsvp ? 'RSVP' : 'Ticket', arrivedAt: d.data().admission?.at || null, valid: d.data().status === 'valid' })),
      ...guests.docs.filter(d => !d.data().deletedAt || d.data().arrival).map(d => ({ key: `guest_${d.id}`, kind: 'guest', id: d.id, name: d.data().name, pass: 'Guest list', source: 'Guest list', arrivedAt: d.data().arrival?.at || null, valid: !d.data().deletedAt }))];
    const states = rows.length ? await this.db.getAll(...rows.map(row => eventRef.collection('doorStates').doc(row.key))) : [];
    const w = walkup.data() || { arrivals: 0, inside: 0, exits: 0, reentries: 0, version: 0 };
    return { eventId, checkedAt: Date.now(), free: (event.liveDraft || event.draft).registrationMode === 'free', rows: rows.map((row, index) => ({ ...row, inside: !!row.arrivedAt && states[index]?.data()?.inside !== false, version: states[index]?.data()?.version || 0 })),
      cursor: tickets.cursor === 'done' && guests.cursor === 'done' ? null : { tickets: tickets.cursor, guests: guests.cursor }, walkups: w,
      counts: { tickets: ticketCount.data().count - rsvpCount.data().count, rsvps: rsvpCount.data().count, guests: guestCount.data().count, walkups: w.arrivals, arrivals: ticketCount.data().count + guestCount.data().count + w.arrivals, inside: Math.max(0, ticketCount.data().count + guestCount.data().count - outside.data().count + w.inside) } };
  }
  async doorMovement(eventId: string, raw: any, identity: string | ScannerProof) {
    await this.doorAccess(eventId, identity);
    const kind = text(raw.kind, 'attendance kind', 10), action = text(raw.action, 'door action', 10), quantity = integer(raw.quantity ?? 1, 'quantity', 1, 500), version = integer(raw.version, 'attendance version');
    if (!['ticket', 'guest', 'walkup'].includes(kind) || !['exit', 'reenter', 'arrive'].includes(action) || kind !== 'walkup' && (action === 'arrive' || quantity !== 1)) fail('Choose a valid door action.');
    const eventRef = this.event(eventId), key = kind === 'walkup' ? 'walkups' : `${kind}_${id(raw.id)}`, stateRef = kind === 'walkup' ? eventRef.collection('door').doc(key) : eventRef.collection('doorStates').doc(key), auditRef = eventRef.collection('doorActions').doc(hash(receipt(raw.attempt)));
    const inputHash = hash(JSON.stringify({ key, action, quantity, version }));
    return this.db.runTransaction(async tx => {
      const access = await this.admissionAccess(identity, eventId, tx), old = (await tx.get(auditRef)).data();
      if (old) { if (old.inputHash !== inputHash || old.uid !== access.uid) fail('Door action retry mismatch.', 409); return old.result; }
      const event = (await tx.get(eventRef)).data(), state = (await tx.get(stateRef)).data(), draft = event?.liveDraft || event?.draft;
      if (!event || (state?.version || 0) !== version) fail('Attendance changed. Refresh before trying again.', 409);
      let result: any;
      if (kind === 'walkup') {
        if (draft.registrationMode !== 'free') fail('Walk-up counting is for free events. Issue a ticket or add a guest for other events.', 409);
        const w = state || { arrivals: 0, inside: 0, exits: 0, reentries: 0 };
        if (action === 'exit' && quantity > w.inside || action === 'reenter' && quantity > w.arrivals - w.inside) fail('That would exceed the recorded walk-up count.', 409);
        if (action !== 'exit' && (event.status !== 'published' || Date.now() < Date.parse(draft.admissionStartsAt) || Date.now() > Date.parse(draft.endAt) + 6 * 3600000)) fail('This event is not open for arrival.', 409);
        result = { arrivals: w.arrivals + (action === 'arrive' ? quantity : 0), inside: w.inside + (action === 'exit' ? -quantity : quantity), exits: w.exits + (action === 'exit' ? quantity : 0), reentries: w.reentries + (action === 'reenter' ? quantity : 0), version: version + 1 };
      } else {
        const person = (await tx.get(kind === 'ticket' ? this.tickets().doc(id(raw.id)) : eventRef.collection('guests').doc(id(raw.id)))).data();
        const order = kind === 'ticket' && person ? (await tx.get(this.order(person.orderId))).data() : null;
        if (!person || kind === 'ticket' && (person.eventId !== eventId || person.kind !== 'admission') || !(kind === 'ticket' ? person.admission : person.arrival)) fail('Record first admission before tracking exits or re-entry.', 409);
        const inside = state?.inside !== false;
        if (action === 'exit' && !inside || action === 'reenter' && inside) fail('That arrival or exit is already recorded.', 409);
        const from = Date.parse(kind === 'ticket' ? person.validFrom : draft.admissionStartsAt), until = Date.parse(kind === 'ticket' ? person.validUntil : draft.endAt) + (kind === 'guest' ? 6 * 3600000 : 0);
        if (action === 'reenter' && (['cancelled', 'archived'].includes(event.status) || !Number.isFinite(from) || !Number.isFinite(until) || Date.now() < from || Date.now() > until || kind === 'guest' && person.deletedAt || kind === 'ticket' && (person.status !== 'valid' || order?.status !== 'paid' || order.financialBlocked || person.rsvp && order.rsvpStatus !== 'approved'))) fail('This pass cannot re-enter.', 409);
        result = { inside: action === 'reenter', version: version + 1, kind, id: raw.id, at: Date.now(), uid: access.uid };
      }
      tx.set(stateRef, result);
      tx.create(auditRef, { inputHash, ...access, key, action, quantity, at: Date.now(), result });
      return result;
    });
  }
}
