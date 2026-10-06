import { FieldPath, type Transaction } from 'firebase-admin/firestore';
import { Door } from './door';
import { fail, hash, id, receipt, text, type EventDraft } from './domain';
import { noticeVersion } from './event-notice';
import { deploymentConfig } from '../deployment-config';
import { renderTicketingEmail, type EmailKind } from './email';
import { rotatingBatch } from './worker-batch';
import { currentWaitlistOffer } from './waitlist-hold';
import type { Order } from './orders';
import { expiredCheckoutDue, followupBuyerEligible, followupEventSelling } from './checkout-followup';

export class Communications extends Door {
  private async checkoutFollowupState(tx: Transaction, orderId: string, now: number, to?: string) {
    const order = (await tx.get(this.order(orderId))).data() as Order | undefined;
    if (!order || !expiredCheckoutDue(order, now) || to && order.email !== to) return null;
    const event = (await tx.get(this.event(order.eventId))).data(), draft = event?.liveDraft as EventDraft | undefined;
    if (!draft || event?.status !== 'published') return null;
    const peers = await tx.get(this.db.collection('ticketingOrders').where('eventId', '==', order.eventId).where('email', '==', order.email).limit(101));
    if (!followupBuyerEligible(orderId, order, peers.docs.map(doc => ({ id: doc.id, order: doc.data() as Order })))) return null;
    if (!await this.validUpgradeParent(tx, order)) return null;
    const poolDocs = await tx.get(this.event(order.eventId).collection('pools'));
    const pools = Object.fromEntries(poolDocs.docs.map(doc => [doc.id, doc.data() as { held: number; sold: number }]));
    return followupEventSelling(draft, event.status, pools, now) ? { order, draft } : null;
  }
  async checkoutFollowupMaintenance() {
    const expired = await rotatingBatch(this.db, 'ticketingOrders', ['expired'], 100);
    let queued = 0;
    for (const doc of expired.docs) {
      const order = doc.data() as Order, now = Date.now();
      if (!expiredCheckoutDue(order, now)) continue;
      // One reminder per event + buyer, even across duplicate expiries or worker retries.
      const ref = this.db.collection('ticketingEmailJobs').doc(`expired_${hash(JSON.stringify([order.eventId, order.email]))}`);
      const created = await this.db.runTransaction(async tx => {
        if ((await tx.get(ref)).exists) return false;
        const state = await this.checkoutFollowupState(tx, doc.id, now, order.email);
        if (!state || state.order.eventId !== order.eventId) return false;
        tx.create(ref, { type: 'checkout-expired', eventId: order.eventId, orderId: doc.id, to: order.email, status: 'pending', attempts: 0, createdAt: now });
        return true;
      });
      if (created) queued++;
    }
    return queued;
  }
  private async checkoutExpiredEmail(job: any) {
    // Reconcile Stripe again before delivery: never ask someone with a late payment to pay twice.
    const session = await this.verifySession(job.orderId);
    if (session?.status !== 'expired' || session.payment_status !== 'unpaid') return null;
    const state = await this.db.runTransaction(tx => this.checkoutFollowupState(tx, job.orderId, Date.now(), job.to));
    if (!state || state.order.eventId !== job.eventId) return null;
    const config = deploymentConfig();
    return { from: process.env.TICKETING_EMAIL_FROM || 'Pluto Events <tickets@pluto.events>', to: [job.to],
      ...renderTicketingEmail({ kind: 'checkout-expired', order: state.order, event: state.draft, orderId: job.orderId,
        actionUrl: `${config.baseUrl}/events/${encodeURIComponent(state.draft.slug)}`, baseUrl: config.baseUrl, staging: config.environment === 'staging' }) };
  }
  async communications(eventId: string, uid: string) {
    await this.role(uid, eventId);
    const campaigns = await this.db.collection('ticketingCampaigns').where('eventId', '==', eventId).orderBy('createdAt', 'desc').limit(20).get();
    const active = await this.tickets().where('eventId', '==', eventId).where('kind', '==', 'admission').where('status', '==', 'valid').count().get();
    return { activePasses: active.data().count, campaigns: campaigns.docs.map(d => { const c = d.data(); return { id: d.id, title: c.title, kind: c.kind, body: c.body, status: c.status, queued: c.queued || 0, createdAt: c.createdAt }; }) };
  }
  async announce(eventId: string, raw: any, uid: string) {
    await this.role(uid, eventId);
    const title = text(raw.title, 'announcement title', 150, true), body = text(raw.body, 'announcement message', 3000, true), ref = this.db.collection('ticketingCampaigns').doc(hash(receipt(raw.attempt))), inputHash = hash(JSON.stringify({ eventId, title, body }));
    return this.db.runTransaction(async tx => {
      const prior = (await tx.get(ref)).data(), event = (await tx.get(this.event(eventId))).data(), draft = event?.liveDraft as EventDraft;
      if (prior) { if (prior.inputHash !== inputHash || prior.createdBy !== uid) fail('This announcement retry has different content.', 409); return { campaignId: ref.id }; }
      if (!event || !draft || !['published', 'cancelled'].includes(event.status)) fail('Publish the event before sending announcements.', 409);
      if (draft.venueVisibility === 'holders' && [draft.venueName, draft.address, draft.directions].some(v => v.length > 5 && `${title}\n${body}`.toLowerCase().includes(v.toLowerCase()))) fail('Keep exact private venue details in Pluto. Link attendees to My tickets instead.', 409);
      tx.create(ref, { eventId, title, body, kind: 'announcement', inputHash, version: noticeVersion(draft, event.status), status: 'pending', phase: 'tickets', cursor: '', queued: 0, createdAt: Date.now(), createdBy: uid });
      tx.create(this.event(eventId).collection('audit').doc(), { action: 'announcement-queued', campaignId: ref.id, uid, at: Date.now() });
      return { campaignId: ref.id };
    });
  }
  async communicationMaintenance() {
    const cursorRef = this.db.collection('ticketingWorkerCursors').doc('communication-events'), state = (await cursorRef.get()).data();
    const query = this.db.collection('publishedEvents').where('status', '==', 'published').orderBy(FieldPath.documentId()).limit(50);
    let events = await (state?.after ? query.startAfter(state.after) : query).get(); if (events.empty && state?.after) events = await query.get();
    for (const doc of events.docs) {
      const event = (await this.event(doc.id).get()).data(), draft = event?.liveDraft as EventDraft; if (!draft || event?.status !== 'published') continue;
      const now = Date.now(), starts = Date.parse(draft.startAt), reveal = draft.venueRevealScheduled && draft.venueVisibility === 'holders' && draft.venueRevealAt ? Date.parse(draft.venueRevealAt) : null;
      const notices: { kind: string; discriminator: string; body: string }[] = [];
      if (draft.remindersEnabled !== false) for (const hours of [24, 4]) if (starts > now && now >= starts - hours * 3600000 && now < starts - hours * 3600000 + 2 * 3600000) notices.push({ kind: 'event-reminder', discriminator: `${draft.startAt}:${hours}`, body: `Your event starts in approximately ${hours} hours. Check Pluto for the current schedule, save your tickets online, and bring a photo ID.` });
      if (reveal && now >= reveal && now < Date.parse(draft.endAt)) notices.push({ kind: 'event-location', discriminator: `${draft.venueRevealAt}:${hash(`${draft.venueName}:${draft.address}`)}`, body: 'Your event location is now available in Pluto. Open My tickets while connected to see the venue and directions.' });
      for (const notice of notices) {
        const ref = this.db.collection('ticketingCampaigns').doc(hash(`${doc.id}:${notice.kind}:${notice.discriminator}:${noticeVersion(draft, event.status)}`));
        await this.db.runTransaction(async tx => { if (!(await tx.get(ref)).exists) tx.create(ref, { eventId: doc.id, title: draft.title, kind: notice.kind, body: notice.body, version: noticeVersion(draft, event.status), status: 'pending', phase: 'tickets', cursor: '', queued: 0, createdAt: now, createdBy: 'maintenance' }); });
      }
    }
    await cursorRef.set({ after: events.size === 50 ? events.docs[events.docs.length - 1].id : '', updatedAt: Date.now() });
    const campaigns = await rotatingBatch(this.db, 'ticketingCampaigns', ['pending'], 50);
    for (const doc of campaigns.docs) await this.campaignPage(doc.id);
    return campaigns.size;
  }
  async campaignPage(campaignId: string) {
    const ref = this.db.collection('ticketingCampaigns').doc(id(campaignId));
    const campaign = await this.db.runTransaction(async tx => { const c = (await tx.get(ref)).data(); if (!c || c.status !== 'pending' || (c.leaseUntil || 0) > Date.now()) return null; tx.update(ref, { leaseUntil: Date.now() + 120000 }); return c; });
    if (!campaign) return;
    try {
      const event = (await this.event(campaign.eventId).get()).data(), draft = event?.liveDraft as EventDraft;
      if (!event || !draft || noticeVersion(draft, event.status) !== campaign.version || !['published', 'cancelled'].includes(event.status) || campaign.kind === 'event-reminder' && draft.remindersEnabled === false) { await ref.update({ status: 'superseded', leaseUntil: 0 }); return; }
      let query = (campaign.phase === 'tickets' ? this.tickets() : this.db.collection('ticketingOrders')).where('eventId', '==', campaign.eventId).orderBy(FieldPath.documentId()).limit(25);
      if (campaign.cursor) query = query.startAfter(campaign.cursor);
      const rows = await query.get(), recipients = new Map<string, any>();
      for (const row of rows.docs) {
        const value = row.data();
        if (campaign.phase === 'tickets') {
          const order = (await this.order(value.orderId).get()).data();
          if (value.kind !== 'admission' || value.status !== 'valid' || order?.status !== 'paid' || order.financialBlocked && campaign.kind !== 'event-cancelled' || value.rsvp && order.rsvpStatus !== 'approved') continue;
          recipients.set(value.holderEmail, { ticketId: row.id });
        } else if (value.method === 'rsvp' && value.rsvpStatus === 'pending') recipients.set(value.email, { pendingOrderId: row.id });
      }
      await this.db.runTransaction(async tx => {
        const latest = (await tx.get(ref)).data(); if (!latest || latest.cursor !== campaign.cursor || latest.phase !== campaign.phase || latest.status !== 'pending') return;
        const jobs = [...recipients].map(([to, proof]) => ({ to, proof, ref: this.db.collection('ticketingEmailJobs').doc(`campaign_${campaignId}_${hash(to)}`) }));
        const existing = jobs.length ? await tx.getAll(...jobs.map(j => j.ref)) : [];
        jobs.forEach((job, index) => { if (!existing[index].exists) tx.create(job.ref, { type: 'campaign', campaignId, eventId: campaign.eventId, to: job.to, ...job.proof, status: 'pending', attempts: 0, createdAt: Date.now() }); });
        const nextPhase = rows.size < 25 && campaign.phase === 'tickets' && campaign.kind === 'event-cancelled' ? 'orders' : campaign.phase;
        tx.update(ref, { leaseUntil: 0, queued: (latest.queued || 0) + existing.filter(d => !d.exists).length, cursor: nextPhase !== campaign.phase || rows.size < 25 ? '' : rows.docs[rows.docs.length - 1].id, phase: nextPhase, status: rows.size < 25 && nextPhase === campaign.phase ? 'queued' : 'pending' });
      });
    } catch (error) { await ref.update({ leaseUntil: 0, lastErrorAt: Date.now() }); throw error; }
  }
  async engagementEmail(job: any) {
    if (job.type === 'checkout-expired') return this.checkoutExpiredEmail(job);
    const event = (await this.event(job.eventId).get()).data(), draft = event?.liveDraft as EventDraft;
    if (!event || !draft) return null;
    let kind: EmailKind, note: string, title = draft.title, actionUrl = `${deploymentConfig().baseUrl}/app/tickets`;
    if (job.type === 'waitlist-offer') {
      const entry = (await this.db.collection('ticketingWaitlist').doc(job.entryId).get()).data();
      if (!entry || entry.email !== job.to || entry.inviteHash !== hash(job.token) || !currentWaitlistOffer(entry, draft, event.status)) return null;
      kind = 'waitlist-offer'; note = `One ${entry.offerName} pass is reserved until ${new Intl.DateTimeFormat('en-US', { timeZone: draft.timezone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(entry.offerExpiresAt))} (${draft.timezone}). Complete registration before then. A waitlist offer itself is not an admission pass.`;
      actionUrl = `${deploymentConfig().baseUrl}/events/${encodeURIComponent(draft.slug)}#waitlist=${job.token}`;
    } else {
      const campaign = (await this.db.collection('ticketingCampaigns').doc(job.campaignId).get()).data();
      if (!campaign || campaign.status === 'superseded' || noticeVersion(draft, event.status) !== campaign.version || campaign.kind === 'event-reminder' && draft.remindersEnabled === false) return null;
      let eligible = false;
      if (job.pendingOrderId && campaign.kind === 'event-cancelled') { const order = (await this.order(job.pendingOrderId).get()).data(); eligible = order?.method === 'rsvp' && order.rsvpStatus === 'pending' && order.email === job.to; }
      if (!eligible) {
        const tickets = await this.tickets().where('eventId', '==', job.eventId).where('holderEmail', '==', job.to).where('status', '==', 'valid').limit(50).get();
        for (const ticket of tickets.docs) { const t = ticket.data(), order = (await this.order(t.orderId).get()).data(); if (t.kind === 'admission' && order?.status === 'paid' && (!order.financialBlocked || campaign.kind === 'event-cancelled') && (!t.rsvp || order.rsvpStatus === 'approved')) { eligible = true; break; } }
      }
      if (!eligible) return null;
      kind = campaign.kind; note = campaign.body; title = campaign.title;
    }
    return { from: process.env.TICKETING_EMAIL_FROM || 'Pluto Events <tickets@pluto.events>', to: [job.to], ...renderTicketingEmail({ kind, order: { eventTitle: draft.title, total: 0, currency: 'usd', units: [] }, event: draft, orderId: '', actionUrl, baseUrl: deploymentConfig().baseUrl, note, heading: title, staging: deploymentConfig().environment === 'staging' }) };
  }
}
