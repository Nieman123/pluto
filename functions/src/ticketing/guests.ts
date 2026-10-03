import { randomUUID } from 'node:crypto';
import { Orders } from './orders';
import { fail, hash, id, integer, receipt, text } from './domain';
import { guestEntry } from './guest-entry';
import { scannerAccess, type ScannerProof } from './scanner-access';
import type { OfflineSubmission } from './offline-proof';

export class Guests extends Orders {
  async guestList(eventId: string, identity: string | ScannerProof) {
    if (typeof identity === 'string') await this.role(identity, eventId, ['manager', 'admission']);
    else await scannerAccess(this.db, identity, eventId);
    const entries = await this.event(eventId).collection('guests').get();
    if (typeof identity !== 'string') await scannerAccess(this.db, identity, eventId);
    return { guests: entries.docs.filter(d => !d.data().deletedAt).map(d => guestEntry(d.id, d.data())).sort((a, b) => a.name.localeCompare(b.name)) };
  }
  async addGuests(eventId: string, rawNames: unknown, rawNote: unknown, attempt: unknown, uid: string) {
    await this.role(uid, eventId);
    if (!Array.isArray(rawNames) || !rawNames.length || rawNames.length > 100) fail('Add between 1 and 100 guest names at a time.');
    const names = rawNames.map(n => text(n, 'guest name', 100, true)), note = text(rawNote || '', 'door note', 300);
    const eventRef = this.event(eventId), batch = eventRef.collection('guestBatches').doc(hash(receipt(attempt))), inputHash = hash(JSON.stringify({ names, note }));
    const ids = names.map(() => randomUUID());
    return this.db.runTransaction(async tx => {
      const existing = (await tx.get(batch)).data(), event = (await tx.get(eventRef)).data();
      if (!event) fail('Event not found.', 404);
      if (existing) { if (existing.inputHash !== inputHash) fail('This guest-list attempt contains different names. Start a new attempt.', 409); return { added: existing.ids.length }; }
      names.forEach((name, index) => tx.create(eventRef.collection('guests').doc(ids[index]), { name, note, version: 1, arrival: null, createdAt: Date.now(), createdBy: uid }));
      tx.create(batch, { inputHash, ids, at: Date.now(), uid });
      tx.create(eventRef.collection('audit').doc(), { action: 'guest-list-added', guestIds: ids, uid, at: Date.now() });
      return { added: names.length };
    });
  }
  async saveGuest(eventId: string, guestId: string, rawName: unknown, rawNote: unknown, expected: unknown, uid: string, remove = false) {
    await this.role(uid, eventId);
    const name = remove ? '' : text(rawName, 'guest name', 100, true), note = remove ? '' : text(rawNote || '', 'door note', 300), version = integer(expected, 'guest version', 1);
    const ref = this.event(eventId).collection('guests').doc(id(guestId));
    await this.db.runTransaction(async tx => {
      const guest = (await tx.get(ref)).data();
      if (!guest || guest.deletedAt) fail('Guest not found.', 404);
      if (guest.version !== version) fail('This guest was edited by someone else. Refresh the list before saving.', 409);
      tx.update(ref, { ...(remove ? { deletedAt: Date.now() } : { name, note }), version: version + 1, updatedAt: Date.now(), updatedBy: uid });
      tx.create(this.event(eventId).collection('audit').doc(), { action: remove ? 'guest-list-removed' : 'guest-list-edited', guestId, uid, at: Date.now() });
    });
    return { saved: true };
  }
  async arriveGuest(eventId: string, guestId: string, scanId: unknown, identity: string | ScannerProof, offline = false, details?: OfflineSubmission & { guestVersion?: unknown }, managerReview = false) {
    if (typeof identity === 'string') await this.role(identity, eventId, managerReview ? ['manager'] : ['manager', 'admission']);
    const eventRef = this.event(eventId), guestRef = eventRef.collection('guests').doc(id(guestId)), scanRef = eventRef.collection('scans').doc(id(scanId));
    return this.db.runTransaction(async tx => {
      const access = await this.admissionAccess(identity, eventId, tx, managerReview);
      const prior = (await tx.get(scanRef)).data(), guest = (await tx.get(guestRef)).data(), event = (await tx.get(eventRef)).data();
      const version = offline ? integer(details?.guestVersion ?? guest?.version ?? 1, 'prepared guest version', 1) : guest?.version || 1;
      const evidence = offline ? await this.offlineEvidence(tx, eventId, access.uid, details, 'guest', guestId, version, managerReview) : null;
      if (prior) { if (prior.guestId !== guestId || prior.uid !== (evidence?.originUid || access.uid) || (offline && prior.offlineLeaseHash !== evidence?.leaseHash)) fail('Guest check-in attempt mismatch.', 409); return prior; }
      const draft = event?.liveDraft || event?.draft;
      const at = evidence?.at || Date.now();
      let result = 'accepted';
      if (!guest || guest.deletedAt || (offline && guest.version !== version) || !draft || ['cancelled', 'archived'].includes(event?.status)) result = 'invalid';
      else if (at < Date.parse(draft.admissionStartsAt) || at > Date.parse(draft.endAt) + 6 * 3600000) result = 'outside-window';
      else if (guest.arrival) result = 'duplicate';
      else if (evidence?.rejection) result = evidence.rejection;
      const record = { kind: 'guest', guestId, ticketId: `guest_${guestId}`, name: guest?.name || '', ...access, uid: evidence?.originUid || access.uid, at, syncedAt: Date.now(), offline, result,
        ...(evidence ? { offlineLeaseHash: evidence.leaseHash, offlineVersion: evidence.version, offlineProofVerified: evidence.verified, submittedBy: access.uid } : {}) };
      tx.create(scanRef, record);
      if (result === 'accepted') tx.update(guestRef, { arrival: { ...access, scanId: scanRef.id, at, offline } });
      return record;
    });
  }
}
