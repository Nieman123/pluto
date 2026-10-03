import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';
import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import { allMedia, fail, hash, id, integer, publicEvent, text, validateDraft, type EventDraft } from './domain';
import { baseUrl, isLive } from './config';

export class Catalog {
  constructor(public db: Firestore = getFirestore()) {}
  event(eventId: string) { return this.db.collection('ticketingEvents').doc(id(eventId)); }
  async actor(token: string, optional = false): Promise<DecodedIdToken | null> {
    if (!token && optional) return null;
    try { return await getAuth().verifyIdToken(token, true); } catch { return fail('Sign in to continue.', 401); }
  }
  async role(uid: string, eventId: string, roles = ['manager']) {
    if ((await this.db.collection('adminUsers').doc(uid).get()).exists) return;
    const scope = (await this.db.collection('ticketingStaff').doc(`${id(eventId)}_${uid}`).get()).data();
    if (!scope || !roles.some(role => scope.roles?.includes(role))) fail('This account does not have access to this event.', 403);
  }
  async admin(uid: string) { if (!(await this.db.collection('adminUsers').doc(uid).get()).exists) fail('Administrator access is required.', 403); }
  async rateLimit(identity: string, lane: string, limit = 120) {
    const hour = Math.floor(Date.now() / 3600000), ref = this.db.collection('ticketingRateLimits').doc(hash(`${hour}:${lane}:${identity}`));
    await this.db.runTransaction(async tx => {
      const count = (await tx.get(ref)).data()?.count || 0;
      if (count >= limit) fail('Too many requests. Please try again later.', 429);
      tx.set(ref, { count: count + 1, expiresAtMs: (hour + 2) * 3600000 });
    });
  }
  async list(uid: string) {
    const admin = (await this.db.collection('adminUsers').doc(uid).get()).exists;
    const scopes = admin ? [] : (await this.db.collection('ticketingStaff').where('uid', '==', uid).get()).docs.map(d => d.data());
    const snapshot = admin ? await this.db.collection('ticketingEvents').get() : null;
    const events = snapshot ? snapshot.docs : (await Promise.all(scopes.map(s => this.event(s.eventId).get()))).filter(d => d.exists);
    return { admin, events: events.map(d => { const e = d.data()!; return { id: d.id, title: e.draft.title, slug: e.draft.slug, startAt: e.draft.startAt, city: e.draft.city, region: e.draft.region, status: e.status, revision: e.revision, roles: admin ? ['manager', 'cash', 'refund', 'admission'] : scopes.find(s => s.eventId === d.id)?.roles || [] }; }) };
  }
  async get(eventId: string, uid: string) { await this.role(uid, eventId); const s = await this.event(eventId).get(); if (!s.exists) fail('Event not found.', 404); return { id: s.id, ...s.data() }; }
  async save(eventId: string, raw: any, expectedRevision: unknown, uid: string) {
    const draft = validateDraft(raw), ref = this.event(eventId), revision = integer(expectedRevision, 'revision');
    if (!(await ref.get()).exists) await this.admin(uid); else await this.role(uid, eventId);
    await this.db.runTransaction(async tx => {
      const old = (await tx.get(ref)).data();
      if ((old?.revision || 0) !== revision) fail('Another editor saved this event. Reload before saving.', 409);
      const poolSnapshots = await Promise.all(draft.pools.map(p => tx.get(ref.collection('pools').doc(p.id))));
      const promoSnapshots = await Promise.all(draft.promos.map(p => tx.get(ref.collection('promos').doc(p.code))));
      draft.pools.forEach((p, i) => { const counts = poolSnapshots[i].data() || { held: 0, sold: 0 }; if (p.capacity < counts.held + counts.sold) fail('Capacity cannot be below sold and reserved inventory.', 409); });
      draft.promos.forEach((p, i) => { const counts = promoSnapshots[i].data() || { held: 0, used: 0 }; if (p.limit < counts.held + counts.used) fail('Promotion limit cannot be below used and reserved redemptions.', 409); });
      // Old pool/promo counters remain for pending orders even when removed from the draft.
      draft.pools.forEach((p, i) => { if (!poolSnapshots[i].exists) tx.create(ref.collection('pools').doc(p.id), { ...p, held: 0, sold: 0 }); });
      draft.promos.forEach((p, i) => { if (!promoSnapshots[i].exists) tx.create(ref.collection('promos').doc(p.code), { ...p, held: 0, used: 0 }); });
      tx.set(ref.collection('revisions').doc(String(revision + 1)), { draft, savedAt: Date.now(), savedBy: uid });
      tx.set(ref, { draft, revision: revision + 1, status: old?.status || 'draft', updatedAt: Date.now(), updatedBy: uid, createdAt: old?.createdAt || Date.now() }, { merge: true });
    });
    return { id: eventId, revision: revision + 1 };
  }
  async revisions(eventId: string, uid: string) { await this.role(uid, eventId); return (await this.event(eventId).collection('revisions').get()).docs.map(d => ({ revision: Number(d.id), savedAt: d.data().savedAt, savedBy: d.data().savedBy })).sort((a, b) => b.revision - a.revision); }
  async restore(eventId: string, revision: number, expected: number, uid: string) {
    await this.role(uid, eventId);
    const prior = (await this.event(eventId).collection('revisions').doc(String(integer(revision, 'revision', 1))).get()).data();
    const current = (await this.event(eventId).get()).data();
    if (!prior || !current) fail('Revision not found.', 404);
    return this.save(eventId, { ...prior.draft, offers: current.draft.offers, pools: current.draft.pools, promos: current.draft.promos, tax: current.draft.tax }, expected, uid);
  }
  async duplicate(eventId: string, uid: string) {
    await this.role(uid, eventId); await this.admin(uid);
    const source = (await this.event(eventId).get()).data(); if (!source) fail('Event not found.', 404);
    const newId = randomUUID(), startAt = Date.now() + 7 * 86400000, shift = startAt - Date.parse(source.draft.startAt);
    const shifted = (value: string) => new Date(Date.parse(value) + shift).toISOString();
    const draft = { ...source.draft, title: `${source.draft.title} (copy)`, slug: `${source.draft.slug}-${newId.slice(0, 8)}`,
      startAt: shifted(source.draft.startAt), endAt: shifted(source.draft.endAt), admissionStartsAt: shifted(source.draft.admissionStartsAt),
      offers: source.draft.offers.map((o: any) => ({ ...o, active: false, salesStart: new Date().toISOString(), salesEnd: shifted(o.salesEnd), validFrom: shifted(o.validFrom), validUntil: shifted(o.validUntil), stripeProductId: '', stripeTaxRateIds: [] })),
      promos: source.draft.promos.map((p: any) => ({ ...p, startsAt: new Date().toISOString(), endsAt: shifted(p.endsAt) })), tax: { mode: 'sandbox', confirmed: false, performanceLocationId: '' } };
    const result = await this.save(newId, draft, 0, uid);
    const bucket = getStorage().bucket(process.env.TICKETING_STORAGE_BUCKET || 'pluto-9b6ca.appspot.com');
    for (const m of allMedia(source.draft)) {
      const media = (await this.event(eventId).collection('media').doc(m.assetId).get()).data(); if (!media) continue;
      const path = `private/ticketing/${newId}/${m.assetId}.webp`; await bucket.file(media.path).copy(bucket.file(path));
      await this.event(newId).collection('media').doc(m.assetId).set({ ...media, path, uploadedBy: uid, at: Date.now() });
    }
    return result;
  }
  async publish(eventId: string, action: string, expected: number, uid: string) {
    await this.role(uid, eventId);
    if (!['publish', 'unpublish', 'archive', 'cancel'].includes(action)) fail('Invalid publication action.');
    const ref = this.event(eventId), before = (await ref.get()).data(); if (!before) fail('Event not found.', 404);
    const draft = validateDraft(before.draft);
    if (action === 'publish') {
      if (!draft.city || !draft.region || !draft.descriptionHtml || !draft.offers.length) fail('Add location, description and tickets before publishing.');
      if (draft.offers.some(o => Date.parse(o.validFrom) < Date.parse(draft.admissionStartsAt))) fail('The first admission time must be no later than any ticket admission window.');
      if (isLive() && (!draft.tax.confirmed || draft.tax.mode === 'sandbox')) fail('Confirm the event tax configuration before live sales.');
      if (draft.tax.mode === 'automatic' && (!draft.tax.confirmed || !draft.tax.performanceLocationId || draft.offers.some(o => !o.taxCode || !o.stripeProductId))) fail('Automatic tax needs confirmed venue, registration and product configuration.');
      if (draft.tax.mode === 'manual' && (!draft.tax.confirmed || draft.offers.some(o => !o.stripeTaxRateIds.length))) fail('Manual tax needs confirmed inclusive rates for every offer.');
      for (const m of allMedia(draft)) if (!(await ref.collection('media').doc(m.assetId).get()).exists) fail('An image is missing. Upload it again.');
      if (draft.venueVisibility === 'holders') {
        const visible = JSON.stringify(publicEvent(eventId, draft, 'published', expected));
        if ([draft.address, draft.venueName].some(v => v.length > 5 && visible.toLowerCase().includes(v.toLowerCase()))) fail('Private venue details appear in public content. Remove them before publishing.');
      }
    }
    await this.db.runTransaction(async tx => {
      const current = (await tx.get(ref)).data();
      if (current?.revision !== expected || current?.revision !== before.revision) fail('Event changed. Reload before publishing.', 409);
      const releasedDraft = action === 'publish' ? draft : (current?.liveDraft || draft) as EventDraft;
      const slugRef = this.db.collection('eventSlugs').doc(releasedDraft.slug), slug = (await tx.get(slugRef)).data();
      if (slug && slug.eventId !== eventId) fail('This event URL is already in use.', 409);
      const poolSnapshots = await Promise.all(draft.pools.map(p => tx.get(ref.collection('pools').doc(p.id))));
      const promoSnapshots = await Promise.all(draft.promos.map(p => tx.get(ref.collection('promos').doc(p.code))));
      if (action === 'publish') {
        draft.pools.forEach((p, i) => { const counters = poolSnapshots[i].data() || { held: 0, sold: 0 }; if (p.capacity < counters.held + counters.sold) fail('Capacity cannot be below sold and reserved inventory.', 409); });
        draft.promos.forEach((p, i) => { const counters = promoSnapshots[i].data() || { held: 0, used: 0 }; if (p.limit < counters.held + counters.used) fail('Promotion limit cannot be below held/used redemptions.', 409); });
      }
      const status = action === 'publish' ? 'published' : action === 'unpublish' ? 'draft' : action === 'cancel' ? 'cancelled' : 'archived';
      const published = publicEvent(eventId, releasedDraft, status, action === 'publish' ? expected : current!.publishedRevision || expected);
      tx.update(ref, { status, publishedSlug: releasedDraft.slug, ...(action === 'publish' ? { publishedRevision: expected, liveDraft: draft } : {}), updatedAt: Date.now() });
      if (action === 'publish') {
        draft.pools.forEach((p, i) => tx.set(ref.collection('pools').doc(p.id), { ...p, held: poolSnapshots[i].data()?.held || 0, sold: poolSnapshots[i].data()?.sold || 0 }));
        draft.promos.forEach((p, i) => tx.set(ref.collection('promos').doc(p.code), { ...p, held: promoSnapshots[i].data()?.held || 0, used: promoSnapshots[i].data()?.used || 0 }));
      }
      tx.set(slugRef, { eventId, slug: releasedDraft.slug });
      if (current?.publishedSlug && current.publishedSlug !== releasedDraft.slug) tx.set(this.db.collection('eventSlugs').doc(current.publishedSlug), { eventId, redirect: releasedDraft.slug });
      if (status === 'draft') tx.delete(this.db.collection('publishedEvents').doc(eventId));
      else tx.set(this.db.collection('publishedEvents').doc(eventId), published);
      const card = this.db.collection('currentEvents').doc(`native-${eventId}`);
      if (status === 'published') tx.set(card, { title: draft.title, details: `${draft.subtitle}\n${draft.city}, ${draft.region}`, ticketUrl: `${baseUrl()}/events/${draft.slug}`,
        flyerImageUrl: draft.flyer || draft.hero ? `${baseUrl()}/events/${draft.slug}/media/${(draft.flyer || draft.hero)!.assetId}` : '', isActive: true, isManaFest: false, sortOrder: 0, updatedAt: new Date() });
      else tx.delete(card);
      tx.create(ref.collection('audit').doc(), { action, uid, at: Date.now(), revision: expected });
    });
    return { status: action === 'publish' ? 'published' : action === 'unpublish' ? 'draft' : action === 'cancel' ? 'cancelled' : 'archived' };
  }
  async upload(eventId: string, value: unknown, uid: string) {
    await this.role(uid, eventId);
    const input = text(value, 'image', 7100000, true), bytes = Buffer.from(input, 'base64');
    if (!bytes.length || bytes.length > 5 * 1024 * 1024) fail('Images must be smaller than 5 MB.');
    let output: Buffer;
    try { output = await sharp(bytes, { limitInputPixels: 25000000 }).rotate().resize(1800, 1800, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toBuffer(); }
    catch { return fail('Upload a valid JPEG, PNG or WebP image.'); }
    const assetId = hash(output.toString('base64')), path = `private/ticketing/${eventId}/${assetId}.webp`;
    await getStorage().bucket(process.env.TICKETING_STORAGE_BUCKET || 'pluto-9b6ca.appspot.com').file(path).save(output, { resumable: false, contentType: 'image/webp', metadata: { cacheControl: 'private, no-store' } });
    await this.event(eventId).collection('media').doc(assetId).set({ path, size: output.length, uploadedBy: uid, at: Date.now() });
    return { assetId, alt: '', caption: '', focalX: 50, focalY: 50 };
  }
  async media(eventId: string, assetId: string, uid?: string) {
    if (uid) await this.role(uid, eventId);
    else { const projection = (await this.db.collection('publishedEvents').doc(id(eventId)).get()).data(); if (!projection || !allMedia(projection as EventDraft).some(m => m.assetId === assetId)) fail('Image not found.', 404); }
    const record = (await this.event(eventId).collection('media').doc(id(assetId)).get()).data(); if (!record) fail('Image not found.', 404);
    return (await getStorage().bucket(process.env.TICKETING_STORAGE_BUCKET || 'pluto-9b6ca.appspot.com').file(record.path).download())[0];
  }
  async setStaff(eventId: string, staffUid: string, roles: unknown, uid: string, promoterId = '') {
    await this.admin(uid); id(staffUid); id(eventId);
    if (!Array.isArray(roles) || roles.some(r => !['manager', 'cash', 'refund', 'admission', 'promoter'].includes(r))) fail('Invalid staff roles.');
    const ref = this.db.collection('ticketingStaff').doc(`${eventId}_${staffUid}`);
    if (!roles.length) await ref.delete(); else await ref.set({ eventId, uid: staffUid, roles, promoterId: promoterId ? id(promoterId) : '' });
    return { saved: true };
  }
}
