import Stripe from 'stripe';
import { randomUUID } from 'node:crypto';
import { type DecodedIdToken } from 'firebase-admin/auth';
import { FieldPath, Timestamp, type Firestore, type Transaction } from 'firebase-admin/firestore';
import { Catalog } from './catalog';
import { orderPage } from './order-page';
import { financialSummary } from './financial-projection';
import { apiVersion, appTicketsUrl, baseUrl, isLive, keyPair, readTicket, signTicket, stripeClient } from './config';
import { assertCapacity, cart, email, fail, hash, holderVenue, id, integer, receipt, secret, text, ticketId, type EventDraft, type Unit } from './domain';
import { scannerAccess, type ScannerProof } from './scanner-access';
import { guestEntry } from './guest-entry';
import { readOfflineItem, signOfflineItem, type OfflineSubmission } from './offline-proof';
import type { WalletTicket } from './digital-wallet';
import { waitlistHold, withoutWaitlistHold } from './waitlist-hold';
import { approvedRsvpParent, assertRsvpPayment } from './rsvp-upgrade';
import { plutoCheckoutBranding } from './checkout-branding';

export interface Order {
  eventId: string; eventTitle: string; eventSlug: string; ownerUid: string; email: string; name: string; accessHash: string; inputHash: string;
  status: string; method: string; units: Unit[]; consumption: Record<string, number>; promoCode: string; total: number; discount: number;
  tax: EventDraft['tax']; currency: string; livemode: boolean; createdAt: number; expiresAt: number; promoterId: string;
  sessionId?: string; clientSecret?: string; paymentIntentId?: string; receiptUrl?: string; stripeFee?: number | null; taxAmount?: number;
  stripeFeeStatus?: 'pending' | 'confirmed'; financialBlocked?: boolean; financialCheckId?: string; financialReviewReason?: string;
  providerState?: string; provisioningLeaseUntil?: number; provisioningAttemptId?: string; expiredAt?: number;
  checkoutBranding?: Stripe.Checkout.SessionCreateParams.BrandingSettings;
  refundedAmount?: number; refundedTaxAmount?: number; reviewReason?: string;
  transferCutoff?: string;
  rsvpStatus?: 'pending' | 'approved' | 'declined' | 'withdrawn';
  approvalRequired?: boolean; decisionNote?: string;
  rsvpOrderId?: string; rsvpTicketId?: string; rsvpTicketVersion?: number;
  taxTransactionId?: string; taxCustomerAddress?: { country: string; state: string; postal_code: string; line1: string; city: string } | null;
}
type Dependencies = { stripe?: Stripe; signingKey?: string };
export class Orders extends Catalog {
  constructor(db?: Firestore, private dependencies: Dependencies = {}) { super(db); }
  stripe() { return this.dependencies.stripe || stripeClient(); }
  signing() { return this.dependencies.signingKey; }
  order(orderId: string) { return this.db.collection('ticketingOrders').doc(id(orderId)); }
  tickets() { return this.db.collection('ticketingTickets'); }
  protected async validUpgradeParent(tx: Transaction, upgrade: any) {
    if (!upgrade.rsvpOrderId) return true;
    if (!upgrade.rsvpTicketId) return false;
    const parent = (await tx.get(this.order(upgrade.rsvpOrderId))).data(), ticket = (await tx.get(this.tickets().doc(upgrade.rsvpTicketId))).data();
    return approvedRsvpParent(parent, ticket, upgrade);
  }
  async checkoutAttempt(key: unknown) {
    const proof = receipt(key), order = (await this.order(hash(proof)).get()).data();
    return { exists: !!order };
  }
  async authorize(orderId: string, key: unknown, actor: DecodedIdToken | null) {
    const order = (await this.order(orderId).get()).data() as Order | undefined;
    if (!order) fail('Order not found.', 404);
    if (actor && order.ownerUid === actor.uid) return order;
    if (typeof key === 'string' && /^[a-f0-9]{64}$/.test(key)) {
      if (hash(key) === order.accessHash) return order;
      const access = (await this.db.collection('ticketingAccess').doc(hash(key)).get()).data();
      if (access?.orderId === orderId && access.expiresAt > Date.now() && (access.accessRevision || 0) === ((order as any).accessRevision || 0)) return order;
    }
    return fail('Use your secure order link or sign in with the purchasing account.', 403);
  }
  async walletTicket(raw: any, actor: DecodedIdToken | null): Promise<WalletTicket> {
    const ticketId = id(raw.ticketId);
    return this.db.runTransaction(async tx => {
      const ticket = (await tx.get(this.tickets().doc(ticketId))).data(); if (!ticket) fail('Ticket not found.', 404);
      const order = (await tx.get(this.order(ticket.orderId))).data(); if (!order) fail('Order not found.', 404);
      let authorized = !!actor && ticket.ownerUid === actor.uid;
      if (raw.holderToken) {
        const access = (await tx.get(this.db.collection('ticketingHolderAccess').doc(hash(receipt(raw.holderToken))))).data();
        authorized ||= access?.ticketId === ticketId && access?.version === ticket.version;
      }
      // An order receipt never grants access to a ticket transferred to someone else.
      if (ticket.holderEmail === order.email) {
        authorized ||= !!actor && order.ownerUid === actor.uid;
        if (typeof raw.accessKey === 'string' && /^[a-f0-9]{64}$/.test(raw.accessKey)) {
          const proofHash = hash(raw.accessKey);
          if (proofHash === order.accessHash) authorized = true;
          else { const access = (await tx.get(this.db.collection('ticketingAccess').doc(proofHash))).data(); authorized ||= access?.orderId === ticket.orderId && access?.expiresAt > Date.now() && (access?.accessRevision || 0) === (order.accessRevision || 0); }
        }
      }
      if (!authorized) fail('Use your secure ticket link or sign in as the current ticket holder.', 403);
      return this.walletSnapshot(tx, ticketId, ticket, order);
    });
  }
  private async walletSnapshot(tx: Transaction, ticketId: string, ticket: any, order: any): Promise<WalletTicket> {
    const event = (await tx.get(this.event(ticket.eventId))).data(), draft = event?.liveDraft || event?.draft;
    if (!event || !draft || ['cancelled', 'archived'].includes(event.status) || ticket.status !== 'valid' || ticket.admission || order.status !== 'paid' || order.financialBlocked ||
      (order.method === 'rsvp' && order.rsvpStatus !== 'approved') || !await this.validUpgradeParent(tx, order) || !Number.isFinite(Date.parse(ticket.validUntil)) || Date.parse(ticket.validUntil) <= Date.now())
      fail('This ticket is not available for digital wallet admission.', 409, 'ticket-access-revoked');
    const venue = holderVenue(draft)!;
    return { id: ticketId, version: ticket.version, orderId: ticket.orderId, eventId: ticket.eventId, eventTitle: ticket.eventTitle,
      eventSlug: event.publishedSlug || ticket.eventSlug || draft.slug, name: ticket.name, holderName: ticket.holderName || order.name,
      qr: this.credential(ticket, ticketId), validFrom: ticket.validFrom, validUntil: ticket.validUntil, startAt: draft.startAt, endAt: draft.endAt,
      timezone: draft.timezone, venueName: venue.name, address: venue.address, venueAvailable: venue.available, venueRevealAt: venue.revealAt, city: draft.city, region: draft.region, publicVenue: draft.venueVisibility === 'public' };
  }
  async appleDownload(raw: any, actor: DecodedIdToken | null) {
    const ticket = await this.walletTicket(raw, actor), token = secret(), expiresAt = Date.now() + 5 * 60000;
    await this.db.collection('ticketingWalletDownloads').doc(hash(token)).create({ ticketId: ticket.id, version: ticket.version, expiresAt: Timestamp.fromMillis(expiresAt) });
    return { url: `${baseUrl()}/tickets/wallet/apple/${token}`, expiresAt };
  }
  async walletDownload(token: unknown) {
    return this.db.runTransaction(async tx => {
      const grant = (await tx.get(this.db.collection('ticketingWalletDownloads').doc(hash(receipt(token))))).data();
      if (!grant || grant.expiresAt.toMillis() <= Date.now()) fail('This wallet download link has expired. Open your ticket to try again.', 410);
      const ticket = (await tx.get(this.tickets().doc(grant.ticketId))).data();
      if (!ticket || ticket.version !== grant.version) fail('This ticket credential is no longer valid.', 409, 'ticket-access-revoked');
      const order = (await tx.get(this.order(ticket.orderId))).data(); if (!order) fail('Order not found.', 404);
      return this.walletSnapshot(tx, grant.ticketId, ticket, order);
    });
  }
  async checkout(raw: any, actor: DecodedIdToken | null, method = 'stripe', staffUid = '') {
    if (raw.waitlistToken && method !== 'stripe') fail('Claim waitlist offers through the event page.', 409);
    const eventId = id(raw.eventId), accessKey = receipt(raw.accessKey), orderId = hash(accessKey), ref = this.order(orderId);
    const contact = { email: email(raw.email), name: text(raw.name, 'name', 150, true), ownerUid: actor?.uid || '' };
    const requestHash = hash(JSON.stringify({ eventId, items: raw.items, promoCode: raw.promoCode || '', ...contact, method, ...(raw.waitlistToken ? { waitlist: hash(receipt(raw.waitlistToken)) } : {}), ...(raw.rsvpUpgradeToken ? { rsvpUpgrade: hash(receipt(raw.rsvpUpgradeToken)) } : {}),
      ...(method !== 'stripe' ? { cashReceived: raw.cashReceived || 0, reason: raw.reason || '', taxState: raw.taxState || '', taxPostalCode: raw.taxPostalCode || '', taxCity: raw.taxCity || '', taxLine1: raw.taxLine1 || '' } : {}) }));
    // Configuration fails before inventory is reserved or payment is accepted.
    keyPair(this.signing()); if (method === 'stripe') this.stripe();
    if (method !== 'stripe') await this.role(staffUid, eventId, ['cash']);
    const now = Date.now();
    let preflightRevision: number | undefined;
    if (!(await ref.get()).exists) {
      const event = (await this.event(eventId).get()).data();
      if (!event || event.status !== 'published') fail('Ticket sales are not open for this event.', 409);
      const draft = (event.liveDraft || event.draft) as EventDraft;
      if (draft.registrationMode === 'free') fail('This event has free entry. No ticket or RSVP is required.', 409);
      const priced = cart(draft, raw.items, raw.promoCode, now);
      assertRsvpPayment(draft, priced.units, method);
      if (draft.registrationMode === 'rsvp-approval' && !raw.rsvpUpgradeToken) fail('Verify your approved RSVP before purchasing VIP.', 403);
      if (priced.total > 0 && method !== 'comp') await this.checkTaxConfiguration({ tax: draft.tax, units: priced.units, livemode: isLive() });
      preflightRevision = event.publishedRevision;
    }
    await this.db.runTransaction(async tx => {
      const existing = (await tx.get(ref)).data() as Order | undefined;
      if (existing) { if (existing.inputHash !== requestHash) fail('This checkout attempt has different details. Use the original cart or start a new attempt.', 409); return; }
      const event = (await tx.get(this.event(eventId))).data();
      if (!event || event.status !== 'published') fail('Ticket sales are not open for this event.', 409);
      if (preflightRevision !== undefined && event.publishedRevision !== preflightRevision) fail('Ticket settings changed during checkout. Retry to use the current settings.', 409);
      const draft = (event.liveDraft || event.draft) as EventDraft;
      if (draft.registrationMode === 'free') fail('This event has free entry. No ticket or RSVP is required.', 409);
      if (now >= Date.parse(draft.endAt)) fail('This event has ended.', 409);
      if (isLive() && (!draft.tax.confirmed || draft.tax.mode === 'sandbox')) fail('Live sales need confirmed event taxes.', 503);
      const priced = cart(draft, raw.items, raw.promoCode, now);
      assertRsvpPayment(draft, priced.units, method);
      let rsvpLink: { rsvpOrderId: string; rsvpTicketId: string; rsvpTicketVersion: number } | undefined;
      let upgradeGrant: FirebaseFirestore.DocumentReference | undefined, upgradeParent: FirebaseFirestore.DocumentData | undefined;
      if (draft.registrationMode === 'rsvp-approval') {
        upgradeGrant = this.db.collection('ticketingRsvpUpgradeAccess').doc(hash(receipt(raw.rsvpUpgradeToken)));
        const grant = (await tx.get(upgradeGrant)).data();
        if (!grant || grant.eventId !== eventId || grant.email !== contact.email || grant.expiresAt <= Date.now() || grant.usedBy) fail('Your VIP verification expired or was already used. Verify your approved RSVP again.', 403);
        upgradeParent = (await tx.get(this.order(grant.rsvpOrderId))).data();
        if (!upgradeParent || (upgradeParent.accessRevision || 0) !== grant.parentAccessRevision || !await this.validUpgradeParent(tx, grant)) fail('An approved RSVP is required before purchasing VIP.', 409);
        contact.name = upgradeParent.name; contact.ownerUid = grant.ownerUid;
        rsvpLink = { rsvpOrderId: grant.rsvpOrderId, rsvpTicketId: grant.rsvpTicketId, rsvpTicketVersion: grant.rsvpTicketVersion };
        const parentTicket = (await tx.get(this.tickets().doc(grant.rsvpTicketId))).data()!;
        priced.units.forEach(unit => {
          unit.validFrom = new Date(Math.max(Date.parse(unit.validFrom), Date.parse(parentTicket.validFrom))).toISOString();
          unit.validUntil = new Date(Math.min(Date.parse(unit.validUntil), Date.parse(parentTicket.validUntil))).toISOString();
          if (unit.validFrom >= unit.validUntil || Date.parse(unit.validUntil) <= Date.now()) fail('This VIP option is outside your approved RSVP admission window.', 409);
        });
      }
      if (method === 'cash' && integer(raw.cashReceived, 'cash received', 0, 100000000) < priced.total) fail('Cash received must cover the order total.');
      if (method === 'comp') {
        text(raw.reason, 'comp reason', 500, true);
        priced.units.forEach(unit => { unit.discount = unit.originalAmount; unit.amount = 0; });
        priced.discount = priced.units.reduce((n, u) => n + u.originalAmount, 0); priced.total = 0;
      }
      const taxCustomerAddress = method === 'cash' && draft.tax.mode === 'automatic' && priced.total > 0 ? { country: 'US', state: text(raw.taxState, 'billing state', 2, true).toUpperCase(), postal_code: text(raw.taxPostalCode, 'billing ZIP', 10, true), line1: text(raw.taxLine1, 'billing street', 500, true), city: text(raw.taxCity, 'billing city', 100, true) } : null;
      if (taxCustomerAddress && (!/^[A-Z]{2}$/.test(taxCustomerAddress.state) || !/^\d{5}(?:-\d{4})?$/.test(taxCustomerAddress.postal_code))) fail('Check the US billing state and ZIP for the cash tax calculation.');
      const hold = await waitlistHold(tx, this.db, raw, eventId, contact.email, draft, now);
      const poolSnapshots = await Promise.all(Object.keys(priced.consumption).map(key => tx.get(this.event(eventId).collection('pools').doc(key))));
      const pools: Record<string, any> = Object.fromEntries(poolSnapshots.map(s => [s.id, s.data()])); assertCapacity(priced.consumption, withoutWaitlistHold(pools, hold));
      const promoRef = priced.promoCode ? this.event(eventId).collection('promos').doc(priced.promoCode) : null;
      const promotion = promoRef ? (await tx.get(promoRef)).data() : null;
      if (promoRef && (!promotion || promotion.held + promotion.used >= promotion.limit)) fail('This promotion has reached its redemption limit.', 409);
      let promoterId = '';
      if (raw.promoterId && Number.isFinite(raw.promoterClickedAt) && raw.promoterClickedAt <= now && now - raw.promoterClickedAt <= 30 * 86400000) {
        const promoter = (await tx.get(this.event(eventId).collection('promoters').doc(id(raw.promoterId)))).data();
        if (promoter?.active === true) promoterId = id(raw.promoterId);
      }
      for (const [key, count] of Object.entries(priced.consumption)) tx.update(this.event(eventId).collection('pools').doc(key), { held: pools[key].held + count - (hold?.entry.consumption[key] || 0) });
      if (hold) tx.update(hold.ref, { status: 'claimed', orderId, claimedAt: now });
      if (promoRef) tx.update(promoRef, { held: promotion!.held + 1 });
      if (upgradeGrant && rsvpLink) {
        tx.update(upgradeGrant, { usedBy: orderId, usedAt: Date.now() });
        // Serialize a new checkout against RSVP withdrawal, including concurrent requests.
        tx.update(this.order(rsvpLink.rsvpOrderId), { rsvpUpgradeRevision: (upgradeParent!.rsvpUpgradeRevision || 0) + 1 });
      }
      tx.create(ref, { eventId, eventTitle: draft.title, eventSlug: draft.slug, ...contact, accessHash: hash(accessKey), inputHash: requestHash,
        ...(rsvpLink || {}),
        ...(method === 'stripe' && priced.total > 0 ? { checkoutBranding: { ...plutoCheckoutBranding } } : {}),
        ...priced, tax: draft.tax, taxCustomerAddress, currency: 'usd', livemode: isLive(), status: 'provisioning', method, createdAt: now, expiresAt: now + 35 * 60000,
        promoterId, staffUid, transferCutoff: draft.admissionStartsAt, cashReceived: method === 'cash' ? raw.cashReceived : 0, compReason: method === 'comp' ? raw.reason : '', refundedAmount: 0, revision: event.publishedRevision, apiVersion, providerState: method === 'stripe' ? 'not-sent' : 'not-required' });
    });
    let order = (await ref.get()).data() as Order;
    if (order.status === 'provisioning') {
      if (order.total === 0 || method !== 'stripe') {
        await this.fulfillNonCard(orderId, order);
      } else await this.provision(orderId, order);
    }
    order = (await ref.get()).data() as Order;
    return { orderId, status: order.status, total: order.total, discount: order.discount, expiresAt: order.expiresAt,
      clientSecret: order.status === 'open' ? order.clientSecret : undefined, publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '', livemode: order.livemode };
  }
  async provision(orderId: string, order: Order) {
    if (order.providerState === 'rejected' || (order.providerState === 'not-sent' && Date.now() - order.createdAt > 4 * 60000)) {
      await this.release(orderId, ['not-sent', 'rejected']);
      return fail('No payment session was created. The reservation was released; start a new checkout.', 409);
    }
    if (Date.now() - order.createdAt > 23 * 3600000) { await this.order(orderId).update({ reviewReason: 'Unresolved creation exceeded the safe idempotency window.' }); return fail('Checkout needs staff review. Start no further payment attempts for this order.', 409); }
    const parameters: Stripe.Checkout.SessionCreateParams = {
      mode: 'payment', ui_mode: 'embedded_page', customer_email: order.email, client_reference_id: orderId,
      // Legacy attempts omit this field, retaining their original Stripe request.
      ...(order.checkoutBranding ? { branding_settings: order.checkoutBranding } : {}),
      return_url: `${appTicketsUrl()}?order=${orderId}&session_id={CHECKOUT_SESSION_ID}`,
      expires_at: Math.floor((order.createdAt + 35 * 60000) / 1000),
      integration_identifier: `pluto_ticketing_${orderId.slice(0, 8).replace(/[0-9]/g, n => String.fromCharCode(97 + Number(n)))}`,
      metadata: { pluto_order_id: orderId, pluto_event_id: order.eventId }, payment_intent_data: { metadata: { pluto_order_id: orderId, pluto_event_id: order.eventId } },
      line_items: order.units.map((unit, index) => ({ quantity: 1, metadata: { pluto_unit_index: String(index), pluto_offer_id: unit.offerId },
        price_data: { currency: 'usd', unit_amount: unit.amount, tax_behavior: 'inclusive',
          ...(unit.stripeProductId ? { product: unit.stripeProductId } : { product_data: { name: `${order.eventTitle} — ${unit.name}`, ...(unit.taxCode ? { tax_code: unit.taxCode } : {}) } }) },
        ...(order.tax.mode === 'manual' ? { tax_rates: unit.stripeTaxRateIds } : {}) })),
      ...(order.tax.mode === 'automatic' ? { automatic_tax: { enabled: true } } : {}),
      ...(process.env.STRIPE_PAYMENT_METHOD_CONFIGURATION ? { payment_method_configuration: process.env.STRIPE_PAYMENT_METHOD_CONFIGURATION } : {}),
      // Delayed methods need a separately designed inventory policy; never silently enable them.
      excluded_payment_method_types: ['us_bank_account', 'sepa_debit', 'bacs_debit', 'acss_debit', 'au_becs_debit', 'boleto', 'konbini', 'oxxo'],
    };
    // A worker can recover a timed-out creation after the original expiry parameter is too old to reuse.
    let recovered: Stripe.Checkout.Session | undefined;
    if (Date.now() - order.createdAt > 4 * 60000) {
      const listed = this.stripe().checkout.sessions.list({ created: { gte: Math.floor(order.createdAt / 1000) - 5, lte: Math.ceil((order.createdAt + 10 * 60000) / 1000) }, limit: 100 });
      await listed.autoPagingEach(session => { if (session.client_reference_id === orderId && session.metadata?.pluto_order_id === orderId) { recovered = session; return false; } });
      if (!recovered) {
        await this.order(orderId).update({ reviewReason: 'Checkout creation outcome could not be resolved automatically. Reserved inventory is retained for staff review.' });
        return fail('Checkout needs staff review. Keep the original order reference.', 409);
      }
    }
    let session = recovered;
    if (!session) {
      try { await this.checkTaxConfiguration(order); }
      catch (error) { if (order.providerState === 'not-sent') await this.release(orderId, ['not-sent']); throw error; }
      const attemptId = randomUUID();
      const previouslySent = await this.db.runTransaction(async tx => {
        const current = (await tx.get(this.order(orderId))).data() as Order;
        if (current.status !== 'provisioning' || (current.provisioningLeaseUntil || 0) > Date.now()) fail('Checkout is already being confirmed. Retry the original attempt shortly.', 409);
        const prior = current.providerState !== 'not-sent';
        tx.update(this.order(orderId), { providerState: 'sending', provisioningAttemptId: attemptId, provisioningLeaseUntil: Date.now() + 120000 }); return prior;
      });
      try { session = await this.stripe().checkout.sessions.create(parameters, { idempotencyKey: `pluto-checkout-${orderId}` }); }
      catch (error: any) {
        const definite = !previouslySent && ['StripeInvalidRequestError', 'StripeAuthenticationError', 'StripePermissionError'].includes(error.type) && [400, 401, 403, 404].includes(error.statusCode);
        const updated = await this.db.runTransaction(async tx => {
          const current = (await tx.get(this.order(orderId))).data() as Order;
          if (current.status !== 'provisioning' || current.provisioningAttemptId !== attemptId) return false;
          tx.update(this.order(orderId), { providerState: definite ? 'rejected' : 'uncertain', provisioningLeaseUntil: 0,
            reviewReason: definite ? 'Stripe rejected Session creation. No payment session was created.' : 'Payment creation outcome is uncertain. Reserved inventory is retained until provider confirmation.' }); return true;
        });
        if (definite && updated) { await this.release(orderId, ['rejected']); return fail('Payments are unavailable. No payment session was created and your reservation was released. Start a new attempt after setup is corrected.', 503); }
        throw error;
      }
    }
    if (session.metadata?.pluto_order_id !== orderId || session.client_reference_id !== orderId || session.livemode !== order.livemode || session.currency !== 'usd' || session.amount_total !== order.total) fail('Checkout totals or environment do not match the reserved order.', 503);
    await this.db.runTransaction(async tx => {
      const ref = this.order(orderId), latest = (await tx.get(ref)).data() as Order;
      if (latest.status === 'provisioning') tx.update(ref, { status: 'open', providerState: 'created', provisioningLeaseUntil: 0, sessionId: session!.id, clientSecret: session!.client_secret, expiresAt: session!.expires_at * 1000 });
      else if (latest.sessionId && latest.sessionId !== session.id) fail('Checkout attempt mismatch.', 409);
    });
    return session;
  }
  async checkTaxConfiguration(order: Pick<Order, 'tax' | 'units' | 'livemode'>) {
    if (order.tax.mode === 'manual') for (const rateId of new Set(order.units.flatMap(u => u.stripeTaxRateIds))) {
      const rate = await this.stripe().taxRates.retrieve(rateId);
      if (!rate.inclusive || !rate.active || rate.livemode !== order.livemode) fail('The event needs active inclusive tax rates in this environment.', 503);
    }
    if (order.tax.mode === 'automatic') await this.checkAutomaticTax(order);
  }
  async checkAutomaticTax(order: Pick<Order, 'tax' | 'units' | 'livemode'>) {
    const settings = await this.stripe().tax.settings.retrieve();
    const registrations = await this.stripe().tax.registrations.list({ status: 'active', limit: 100 });
    if (settings.status !== 'active' || !registrations.data.length) fail('Stripe Tax requires active settings and registrations.', 503);
    for (const unit of order.units) {
      const product = await this.stripe().products.retrieve(unit.stripeProductId);
      if (product.deleted || !product.active || product.livemode !== order.livemode || product.tax_details?.performance_location !== order.tax.performanceLocationId || (typeof product.tax_code === 'string' ? product.tax_code : product.tax_code?.id) !== unit.taxCode) fail('A ticket product does not match the configured venue, tax classification or environment.', 503);
    }
  }
  async fulfillNonCard(orderId: string, order: Order) {
    const units = order.units.map(u => ({ ...u, taxAmount: 0 }));
    let taxTransactionId = '';
    if (order.tax.mode === 'manual' && order.total > 0) {
      const rates = new Map<string, number>();
      for (const rateId of new Set(units.flatMap(u => u.stripeTaxRateIds))) {
        const rate = await this.stripe().taxRates.retrieve(rateId);
        if (!rate.active || !rate.inclusive || rate.livemode !== order.livemode || rate.percentage == null) fail('Cash sales require active inclusive percentage tax rates.', 503);
        rates.set(rateId, rate.percentage);
      }
      units.forEach(unit => { const percentage = unit.stripeTaxRateIds.reduce((n, key) => n + rates.get(key)!, 0); unit.taxAmount = Math.round(unit.amount * percentage / (100 + percentage)); });
    } else if (order.tax.mode === 'automatic' && order.total > 0) {
      await this.checkAutomaticTax(order);
      if (!order.taxCustomerAddress) fail('Cash sales need billing details for Stripe Tax.', 409);
      const calculation = await this.stripe().tax.calculations.create({ currency: 'usd', customer_details: { address: order.taxCustomerAddress, address_source: 'billing' },
        line_items: units.map((unit, index) => ({ amount: unit.amount, quantity: 1, reference: String(index), product: unit.stripeProductId, tax_code: unit.taxCode, tax_behavior: 'inclusive' })), expand: ['line_items'] }, { idempotencyKey: `pluto-cash-tax-${orderId}` });
      if (!calculation.line_items || calculation.line_items.has_more || calculation.line_items.data.length !== units.length) fail('Cash tax allocation could not be verified.', 409);
      for (const line of calculation.line_items.data) { const unit = units[Number(line.reference)]; if (!unit || unit.amount !== line.amount) fail('Cash tax calculation mismatch.', 409); unit.taxAmount = line.amount_tax; }
      if (!calculation.id) fail('Cash tax calculation is incomplete.', 409);
      const transaction = await this.stripe().tax.transactions.createFromCalculation({ calculation: calculation.id, reference: `pluto-cash-${orderId}`, expand: ['line_items'] }, { idempotencyKey: `pluto-cash-tax-record-${orderId}` });
      if (transaction.livemode !== order.livemode || transaction.currency !== 'usd' || !transaction.line_items || transaction.line_items.has_more || transaction.line_items.data.length !== units.length) fail('Cash tax transaction could not be verified.', 409);
      for (const line of transaction.line_items.data) { const unit = units[Number(line.reference)]; if (!unit || unit.amount !== line.amount || unit.taxAmount !== line.amount_tax) fail('Cash tax transaction allocation mismatch.', 409); (unit as Unit).stripeTaxLineItemId = line.id; }
      taxTransactionId = transaction.id;
    }
    await this.fulfill(orderId, { taxAmount: units.reduce((n, unit) => n + unit.taxAmount, 0), taxTransactionId }, units);
  }
  async verifySession(orderId: string, sessionId?: string) {
    const order = (await this.order(orderId).get()).data() as Order | undefined;
    if (!order) fail('Order not found.', 404);
    const sid = order.sessionId || sessionId; if (!sid) return;
    const session = await this.stripe().checkout.sessions.retrieve(sid, { expand: ['payment_intent.latest_charge.balance_transaction'] });
    if (session.metadata?.pluto_order_id !== orderId || session.client_reference_id !== orderId || session.livemode !== order.livemode || session.currency !== 'usd' || session.amount_total !== order.total || (order.sessionId && order.sessionId !== sid)) fail('Payment does not match this order.', 409);
    // Recover a webhook arriving before Session creation was attached to Firestore.
    if (!order.sessionId) await this.order(orderId).update({ sessionId: sid, expiresAt: session.expires_at * 1000 });
    if (session.payment_status === 'paid') {
      const lineItems = await this.stripe().checkout.sessions.listLineItems(sid, { limit: 100 });
      if (lineItems.has_more || lineItems.data.length !== order.units.length) fail('Payment line items do not match the reserved ticket units.', 409);
      const verifiedUnits = order.units.map(u => ({ ...u }));
      const seen = new Set<number>();
      for (const line of lineItems.data) {
        const index = Number(line.metadata?.pluto_unit_index), unit = verifiedUnits[index];
        if (!unit || seen.has(index) || line.metadata?.pluto_offer_id !== unit.offerId || line.quantity !== 1 || line.amount_total !== unit.amount || line.currency !== 'usd') fail('Payment ticket allocation does not match the reserved order.', 409);
        seen.add(index); unit.taxAmount = line.amount_tax; unit.stripeLineItemId = line.id;
      }
      const intent = typeof session.payment_intent === 'object' ? session.payment_intent : null;
      const charge = intent && typeof intent.latest_charge === 'object' ? intent.latest_charge : null;
      const balance = charge && typeof charge.balance_transaction === 'object' ? charge.balance_transaction : null;
      const paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : intent?.id || '';
      if (!paymentIntentId) fail('Paid checkout has no verifiable payment reference.', 409);
      if (order.paymentIntentId && order.paymentIntentId !== paymentIntentId) fail('Checkout payment reference differs from the linked financial event; staff review is required.', 409);
      const checkId = randomUUID();
      // Fail closed while the provider's financial state is checked, including before first issuance.
      // A newer verifier owns the fence; a delayed worker cannot clear its hold.
      await this.order(orderId).update({ financialCheckId: checkId, financialCheckStartedAt: Date.now(), financialBlocked: true });
      const refunds = await this.stripe().refunds.list({ payment_intent: paymentIntentId, limit: 100 });
      const disputes = await this.stripe().disputes.list({ payment_intent: paymentIntentId, limit: 100 });
      const feeKnown = !!balance && Number.isSafeInteger(balance.fee) && balance.fee >= 0 && balance.currency === 'usd';
      await this.fulfill(orderId, { paymentIntentId, receiptUrl: charge?.receipt_url || '',
        ...(feeKnown ? { stripeFee: balance.fee, stripeFeeStatus: 'confirmed', stripeBalanceTransactionId: balance.id, stripeFeeConfirmedAt: Date.now() } : {}),
        taxAmount: session.total_details?.amount_tax || 0 }, verifiedUnits);
      await this.paymentVerified(orderId, checkId);
      await this.db.runTransaction(async tx => {
        const ref = this.order(orderId), current = (await tx.get(ref)).data()!;
        if (current.financialCheckId !== checkId) return;
        const mapped = await tx.get(this.db.collection('ticketingRefunds').where('orderId', '==', orderId));
        const settled = new Set(mapped.docs.filter(d => d.data().status === 'succeeded').flatMap(d => [...d.data().externalStripeRefundIds || [], ...(d.data().stripeRefundId ? [d.data().stripeRefundId] : [])]));
        const dispute = disputes.data.find(d => !['won', 'warning_closed'].includes(d.status));
        const unresolved = refunds.data.some(r => !['failed', 'canceled'].includes(r.status || '') && (r.status !== 'succeeded' || !settled.has(r.id)));
        const reason = dispute ? 'Payment dispute requires staff review.' : refunds.has_more || disputes.has_more ? 'Payment history exceeds the automatic review limit.' : unresolved ? 'A provider refund is pending or needs ticket mapping.' : '';
        tx.update(ref, { financialBlocked: !!reason, financialReviewReason: reason, financialReconciledAt: Date.now(), disputeId: dispute?.id || '', disputeStatus: dispute?.status || '' });
      });
    } else if (session.status === 'expired') await this.release(orderId);
    else if (session.status === 'complete') {
      const intent = typeof session.payment_intent === 'object' ? session.payment_intent : null;
      if (intent?.status === 'canceled' || intent?.status === 'requires_payment_method') await this.release(orderId);
      else await this.order(orderId).update({ status: 'processing' });
    }
    return session;
  }
  protected async paymentVerified(_orderId: string, _checkId: string) { /* Operations reconciles refund allocations before admission is unlocked. */ }
  async fulfill(orderId: string, payment: Record<string, unknown>, verifiedUnits?: Unit[]) {
    await this.db.runTransaction(async tx => {
      const ref = this.order(orderId), order = (await tx.get(ref)).data() as Order;
      if (order.status === 'paid') { tx.update(ref, { ...(order.stripeFeeStatus !== 'confirmed' ? { stripeFee: null, stripeFeeStatus: 'pending' } : {}), ...payment, paymentVerifiedAt: Date.now() }); return; }
      if (order.method === 'rsvp') fail('RSVP admission requires the RSVP approval flow.', 409);
      if (order.status === 'expired') { tx.update(ref, { reviewReason: 'Payment received after stock was released. Staff review required.', ...payment }); return; }
      if (!await this.validUpgradeParent(tx, order)) { tx.update(ref, { status: 'review', reviewReason: 'VIP payment received but its approved RSVP is no longer valid. Staff review required.', clientSecret: null, ...payment }); return; }
      const pools = await Promise.all(Object.keys(order.consumption).map(key => tx.get(this.event(order.eventId).collection('pools').doc(key))));
      const promoRef = order.promoCode ? this.event(order.eventId).collection('promos').doc(order.promoCode) : null;
      const promo = promoRef ? (await tx.get(promoRef)).data() : null;
      for (const pool of pools) { const data = pool.data()!, count = order.consumption[pool.id]; if (data.held < count) fail('Reserved inventory needs review.', 409); tx.update(pool.ref, { held: data.held - count, sold: data.sold + count }); }
      if (promoRef) tx.update(promoRef, { held: promo!.held - 1, used: promo!.used + 1 });
      (verifiedUnits || order.units).forEach((unit, index) => tx.create(this.tickets().doc(ticketId(orderId, index)), { ...unit, orderId, eventId: order.eventId, eventTitle: order.eventTitle,
        ...(order.rsvpOrderId ? { rsvpOrderId: order.rsvpOrderId, rsvpTicketId: order.rsvpTicketId, rsvpTicketVersion: order.rsvpTicketVersion } : {}),
        ownerUid: order.ownerUid, holderEmail: order.email, holderName: order.name, transferCutoff: order.transferCutoff || unit.validFrom, version: 1, status: 'valid', admission: null, refunded: false, index }));
      tx.update(ref, { status: 'paid', paidAt: Date.now(), stripeFee: null, stripeFeeStatus: 'pending', ...payment, ...(verifiedUnits ? { units: verifiedUnits } : {}), clientSecret: null });
      tx.set(this.db.collection('ticketingEmailJobs').doc(`receipt_${orderId}`), { type: 'receipt', orderId, to: order.email, status: 'pending', createdAt: Date.now(), attempts: 0 });
    });
  }
  async release(orderId: string, onlyProviderStates?: string[], audit?: { uid: string; note: string }) {
    await this.db.runTransaction(async tx => {
      const ref = this.order(orderId), order = (await tx.get(ref)).data() as Order;
      if (!['open', 'provisioning', 'processing'].includes(order.status)) return;
      if (onlyProviderStates && (!onlyProviderStates.includes(order.providerState || '') || order.sessionId || order.paymentIntentId)) fail('Provider creation may already have started. Keep the reservation for reconciliation.', 409);
      const pools = await Promise.all(Object.keys(order.consumption).map(key => tx.get(this.event(order.eventId).collection('pools').doc(key))));
      const promoRef = order.promoCode ? this.event(order.eventId).collection('promos').doc(order.promoCode) : null;
      const promo = promoRef ? (await tx.get(promoRef)).data() : null;
      for (const pool of pools) { const data = pool.data()!; tx.update(pool.ref, { held: Math.max(0, data.held - order.consumption[pool.id]) }); }
      if (promoRef) tx.update(promoRef, { held: Math.max(0, promo!.held - 1) });
      tx.update(ref, { status: 'expired', clientSecret: null, expiredAt: Date.now() });
      if (audit) tx.create(this.event(order.eventId).collection('audit').doc(), { action: 'checkout-resolved-without-provider-request', orderId, ...audit, at: Date.now() });
    });
  }
  async cancel(orderId: string, key: unknown, actor: DecodedIdToken | null) {
    const order = await this.authorize(orderId, key, actor);
    if (order.status === 'paid') return { status: 'paid' };
    if (order.method === 'stripe' && order.total > 0) {
      if (!order.sessionId && ['not-sent', 'rejected'].includes(order.providerState || '')) {
        await this.release(orderId, ['not-sent', 'rejected']); return { status: 'expired' };
      }
      const sid = order.sessionId || (await this.findCheckout(orderId, order))?.id;
      if (!sid) fail('Payment creation has not been resolved. Reserved inventory is retained for staff review; cancellation will not create another payment attempt.', 409);
      try { await this.stripe().checkout.sessions.expire(sid); } catch { /* Retrieve authoritative status below. */ }
      await this.verifySession(orderId, sid);
    } else await this.release(orderId);
    const latest = (await this.order(orderId).get()).data()!;
    if (latest.status === 'paid') return { status: 'paid' };
    if (latest.status !== 'expired') fail('Payment is still being confirmed. Keep the original attempt open.', 409);
    return { status: 'expired' };
  }
  async findCheckout(orderId: string, order: Order) {
    const matches: Stripe.Checkout.Session[] = [];
    const listed = this.stripe().checkout.sessions.list({ created: { gte: Math.floor(order.createdAt / 1000) - 5, lte: Math.ceil((order.createdAt + 10 * 60000) / 1000) }, limit: 100 });
    await listed.autoPagingEach(session => { if (session.client_reference_id === orderId && session.metadata?.pluto_order_id === orderId) matches.push(session); });
    if (matches.length > 1) fail('Multiple provider sessions need staff review. No reservation was released.', 409);
    return matches[0];
  }
  async resolveCheckout(orderId: string, rawSessionId: unknown, rawNote: unknown, uid: string) {
    const order = (await this.order(orderId).get()).data() as Order | undefined;
    if (!order) fail('Order not found.', 404);
    await this.role(uid, order.eventId, ['manager']);
    const note = text(rawNote, 'resolution note', 500, true);
    if (order.method !== 'stripe' || order.total <= 0) fail('This order has no Stripe checkout to resolve.', 409);
    if (!order.sessionId && ['not-sent', 'rejected'].includes(order.providerState || '')) {
      await this.release(orderId, ['not-sent', 'rejected'], { uid, note });
    } else {
      const sid = rawSessionId ? id(rawSessionId) : order.sessionId || (await this.findCheckout(orderId, order))?.id;
      if (!sid) fail('No authoritative Session was found. An uncertain payment cannot be released on a timeout or an empty search. Locate the Session in Stripe or keep the reservation under review.', 409);
      const session = await this.verifySession(orderId, sid);
      if (session?.status === 'open' && session.payment_status !== 'paid') {
        try { await this.stripe().checkout.sessions.expire(sid); } catch { /* Verify whether payment won the race. */ }
        await this.verifySession(orderId, sid);
      }
      await this.event(order.eventId).collection('audit').add({ action: 'checkout-provider-resolved', orderId, sessionId: sid, uid, note, at: Date.now() });
    }
    const latest = (await this.order(orderId).get()).data()!;
    if (!['paid', 'expired'].includes(latest.status)) fail('Provider state remains unsettled. No reservation was released.', 409);
    return { orderId, status: latest.status };
  }
  credential(ticket: any, ticketKey: string) { return signTicket({ id: ticketKey, eventId: ticket.eventId, version: ticket.version, validFrom: ticket.validFrom, validUntil: ticket.validUntil }, this.signing()); }
  private calendarUrl(event: any) { return event?.publishedSlug ? `${baseUrl()}/events/${encodeURIComponent(event.publishedSlug)}/calendar.ics` : ''; }
  transferDeadline(ticket: any, event: any) { return Math.min(Date.parse(ticket.transferCutoff || ticket.validFrom), Date.parse((event.liveDraft || event.draft).admissionStartsAt)); }
  async view(orderId: string, accessKey: unknown, actor: DecodedIdToken | null, refresh = false) {
    let order = await this.authorize(orderId, accessKey, actor);
    if (refresh && order.sessionId && order.status !== 'paid') { await this.verifySession(orderId); order = (await this.order(orderId).get()).data() as Order; }
    const tickets = (await this.tickets().where('orderId', '==', orderId).get()).docs;
    const event = (await this.event(order.eventId).get()).data();
    const upgradeValid = await this.db.runTransaction(tx => this.validUpgradeParent(tx, order));
    const held = tickets.filter(t => upgradeValid && !order.financialBlocked && t.data().status === 'valid' && (!t.data().rsvp || order.rsvpStatus === 'approved') && (t.data().ownerUid === actor?.uid || t.data().holderEmail === order.email));
    const venue = held.length ? holderVenue(event?.liveDraft || event?.draft) : null;
    return { orderId, eventId: order.eventId, eventTitle: order.eventTitle, eventSlug: order.eventSlug, calendarUrl: this.calendarUrl(event), eventStatus: event?.status, status: order.status, method: order.method, total: order.total,
      rsvpStatus: order.rsvpStatus || '', approvalRequired: order.approvalRequired === true, decisionNote: order.decisionNote || '',
      rsvpOrderId: order.rsvpOrderId || '', upgradeValid, upgradeUrl: order.method === 'rsvp' && order.rsvpStatus === 'approved' && event?.status === 'published' && (event.liveDraft || event.draft).offers.some((o: any) => o.active && o.kind === 'upgrade' && o.unitAmount > 0) ? `${baseUrl()}/events/${encodeURIComponent(event.publishedSlug || order.eventSlug)}#tickets` : '',
      providerState: order.providerState || 'unknown',
      discount: order.discount, taxAmount: order.taxAmount || 0, refundedAmount: order.refundedAmount || 0, externalRefundAmount: (order as any).externalRefundAmount || 0, reviewReason: order.financialReviewReason || order.reviewReason || '', financialBlocked: !!order.financialBlocked, name: order.name, email: order.email, createdAt: order.createdAt, receiptUrl: order.receiptUrl || '',
      tickets: tickets.map(t => { const d = t.data(), canUse = held.includes(t); return { id: t.id, name: d.name, holderName: d.holderName, status: d.status, validFrom: d.validFrom, validUntil: d.validUntil, admission: d.admission,
        amount: d.amount, calendarUrl: this.calendarUrl(event), venue: canUse ? venue : null, transferable: !d.rsvp && !d.rsvpOrderId && canUse && d.status === 'valid' && !d.admission && event?.status !== 'cancelled' && Date.now() < this.transferDeadline(d, event), qr: canUse && d.status === 'valid' && event?.status !== 'cancelled' ? this.credential(d, t.id) : null }; }), venue };
  }
  async claim(actor: DecodedIdToken) {
    if (!actor.email_verified || !actor.email) fail('Verify your account email before claiming orders.', 403);
    const orders = await this.db.collection('ticketingOrders').where('email', '==', actor.email.toLowerCase()).get();
    for (const doc of orders.docs) await this.db.runTransaction(async tx => {
      const latest = (await tx.get(doc.ref)).data() as Order;
      if (latest.ownerUid && latest.ownerUid !== actor.uid) return;
      const tickets = await tx.get(this.tickets().where('orderId', '==', doc.id));
      tx.update(doc.ref, { ownerUid: actor.uid });
      tickets.docs.filter(t => t.data().holderEmail === actor.email!.toLowerCase()).forEach(t => tx.update(t.ref, { ownerUid: actor.uid }));
    });
    return { claimed: true };
  }
  async mine(actor: DecodedIdToken) {
    const orders = await this.db.collection('ticketingOrders').where('ownerUid', '==', actor.uid).get();
    const tickets = await this.tickets().where('ownerUid', '==', actor.uid).get();
    return { orders: orders.docs.map(d => { const o = d.data(); return { orderId: d.id, eventTitle: o.eventTitle, status: o.status, method: o.method, rsvpStatus: o.rsvpStatus || '', total: o.total, createdAt: o.createdAt }; }).sort((a, b) => b.createdAt - a.createdAt),
      tickets: await Promise.all(tickets.docs.map(async t => { const d = t.data(), event = (await this.event(d.eventId).get()).data(), order = (await this.order(d.orderId).get()).data(), upgradeValid = !!order && await this.db.runTransaction(tx => this.validUpgradeParent(tx, order)); return { id: t.id, orderId: d.orderId, eventTitle: d.eventTitle, name: d.name, holderName: d.holderName, status: d.status,
        admission: d.admission, validFrom: d.validFrom, validUntil: d.validUntil, version: d.version, transferable: upgradeValid && !order?.financialBlocked && !d.rsvp && !d.rsvpOrderId && d.status === 'valid' && !d.admission && event?.status !== 'cancelled' && Date.now() < this.transferDeadline(d, event),
        calendarUrl: this.calendarUrl(event), venue: upgradeValid && !order?.financialBlocked && d.status === 'valid' && (!d.rsvp || order?.rsvpStatus === 'approved') ? holderVenue(event?.liveDraft || event?.draft) : null,
        qr: upgradeValid && !order?.financialBlocked && d.status === 'valid' && event?.status !== 'cancelled' ? this.credential(d, t.id) : null }; })) };
  }
  async recover(rawEmail: unknown) {
    const target = email(rawEmail), docs = await this.db.collection('ticketingOrders').where('email', '==', target).get();
    for (const doc of docs.docs.slice(0, 25)) {
      const token = secret();
      const batch = this.db.batch();
      batch.set(this.db.collection('ticketingRecovery').doc(hash(token)), { orderId: doc.id, accessRevision: doc.data().accessRevision || 0, expiresAt: Date.now() + 30 * 60000, used: false });
      batch.set(this.db.collection('ticketingEmailJobs').doc(`recovery_${hash(token)}`), { type: 'recovery', orderId: doc.id, to: target, token, status: 'pending', attempts: 0, createdAt: Date.now() });
      await batch.commit();
    }
    return { message: 'If we found matching orders, a secure recovery link will be emailed to you.' };
  }
  async acceptRecovery(rawToken: unknown) {
    const token = receipt(rawToken), ref = this.db.collection('ticketingRecovery').doc(hash(token)), accessKey = secret();
    const orderId = await this.db.runTransaction(async tx => {
      const record = (await tx.get(ref)).data(); if (!record || record.used || record.expiresAt < Date.now()) fail('This recovery link is expired or already used.', 403);
      const order = (await tx.get(this.order(record.orderId))).data();
      if (!order || (record.accessRevision || 0) !== (order.accessRevision || 0)) fail('This order link was replaced. Request a new recovery email.', 403);
      tx.update(ref, { used: true }); tx.create(this.db.collection('ticketingAccess').doc(hash(accessKey)), { orderId: record.orderId, accessRevision: order.accessRevision || 0, expiresAt: Date.now() + 24 * 3600000 });
      return record.orderId;
    });
    return { orderId, accessKey };
  }
  async resend(orderId: string, key: unknown, actor: DecodedIdToken | null) {
    const order = await this.authorize(orderId, key, actor);
    if (order.status !== 'paid') fail('Tickets are not available yet.', 409);
    await this.db.collection('ticketingEmailJobs').doc(`resend_${orderId}_${Math.floor(Date.now() / 60000)}`).set({ type: 'receipt', orderId, to: order.email, status: 'pending', attempts: 0, createdAt: Date.now() });
    return { queued: true };
  }
  async transfer(orderId: string, key: unknown, actor: DecodedIdToken | null, ticketKey: string, target: unknown, holderToken?: unknown) {
    const ticketRef = this.tickets().doc(id(ticketKey)), heldTicket = (await ticketRef.get()).data();
    if (!heldTicket || heldTicket.orderId !== orderId) fail('Ticket not found.', 404);
    let holderAccess = false;
    if (actor?.uid && heldTicket.ownerUid === actor.uid) holderAccess = true;
    if (typeof holderToken === 'string' && /^[a-f0-9]{64}$/.test(holderToken)) {
      const proof = (await this.db.collection('ticketingHolderAccess').doc(hash(holderToken)).get()).data();
      holderAccess ||= proof?.ticketId === ticketKey && proof?.version === heldTicket.version;
    }
    const order = holderAccess ? (await this.order(orderId).get()).data() as Order : await this.authorize(orderId, key, actor);
    const targetEmail = email(target), token = secret();
    const event = (await this.event(order.eventId).get()).data()!;
    await this.db.runTransaction(async tx => {
      const ticket = (await tx.get(ticketRef)).data();
      if ((await tx.get(this.order(orderId))).data()?.financialBlocked) fail('Payment needs staff review before transferring.', 409);
      if (!ticket || ticket.rsvp || ticket.rsvpOrderId || ticket.orderId !== orderId || !(holderAccess && ticket.version === heldTicket.version || ticket.ownerUid === actor?.uid || ticket.holderEmail === order.email) || ticket.status !== 'valid' || ticket.admission || event.status === 'cancelled' || Date.now() >= this.transferDeadline(ticket, event)) fail('This ticket cannot be transferred.', 409);
      tx.create(this.db.collection('ticketingTransfers').doc(hash(token)), { ticketId: ticketKey, orderId, email: targetEmail, ticketVersion: ticket.version, expiresAt: this.transferDeadline(ticket, event), accepted: false });
      tx.set(this.db.collection('ticketingEmailJobs').doc(`transfer_${hash(token)}`), { type: 'transfer', to: targetEmail, token, orderId, status: 'pending', attempts: 0, createdAt: Date.now() });
    });
    return { queued: true };
  }
  async acceptTransfer(rawToken: unknown, actor: DecodedIdToken | null) {
    const token = receipt(rawToken), ref = this.db.collection('ticketingTransfers').doc(hash(token));
    let ticketKey = '';
    await this.db.runTransaction(async tx => {
      const transfer = (await tx.get(ref)).data();
      if (!transfer || transfer.accepted || transfer.expiresAt <= Date.now()) fail('This transfer is expired or already accepted.', 409);
      const ticketRef = this.tickets().doc(transfer.ticketId), ticket = (await tx.get(ticketRef)).data();
      if ((await tx.get(this.order(transfer.orderId))).data()?.financialBlocked) fail('Payment needs staff review before transferring.', 409);
      if (!ticket || ticket.rsvp || ticket.rsvpOrderId || ticket.version !== transfer.ticketVersion || ticket.status !== 'valid' || ticket.admission) fail('This ticket is no longer transferable.', 409);
      const event = (await tx.get(this.event(ticket.eventId))).data()!;
      if (event.status === 'cancelled' || Date.now() >= this.transferDeadline(ticket, event)) fail('The event transfer window is closed.', 409);
      ticketKey = transfer.ticketId;
      tx.update(ticketRef, { version: ticket.version + 1, holderEmail: transfer.email, holderName: actor?.email_verified && actor.email?.toLowerCase() === transfer.email ? actor.name || transfer.email : transfer.email,
        ownerUid: actor?.email_verified && actor.email?.toLowerCase() === transfer.email ? actor.uid : '' });
      tx.update(ref, { accepted: true, acceptedAt: Date.now() });
      tx.create(this.db.collection('ticketingHolderAccess').doc(hash(token)), { ticketId: ticketKey, version: ticket.version + 1 });
    });
    return this.holder(token, actor);
  }
  async holder(rawToken: unknown, actor: DecodedIdToken | null) {
    const token = receipt(rawToken), access = (await this.db.collection('ticketingHolderAccess').doc(hash(token)).get()).data();
    if (!access) fail('Ticket access not found.', 404, 'ticket-access-revoked');
    const ticket = (await this.tickets().doc(access.ticketId).get()).data();
    if (!ticket || ticket.version !== access.version || ticket.status !== 'valid') fail('This ticket credential is no longer valid.', 409, 'ticket-access-revoked');
    if ((await this.order(ticket.orderId).get()).data()?.financialBlocked) fail('Payment needs staff review before admission.', 409);
    if (actor?.email_verified && actor.email?.toLowerCase() === ticket.holderEmail && !ticket.ownerUid) await this.tickets().doc(access.ticketId).update({ ownerUid: actor.uid });
    const event = (await this.event(ticket.eventId).get()).data()!;
    if (event.status === 'cancelled') fail('This event has been cancelled. Contact Pluto about your order.', 409);
    return { id: access.ticketId, orderId: ticket.orderId, name: ticket.name, eventTitle: ticket.eventTitle, holderName: ticket.holderName, status: ticket.status,
      validFrom: ticket.validFrom, validUntil: ticket.validUntil, admission: ticket.admission || null, version: ticket.version,
      transferable: !ticket.rsvp && !ticket.admission && Date.now() < this.transferDeadline(ticket, event), qr: this.credential(ticket, access.ticketId),
      calendarUrl: this.calendarUrl(event), venue: holderVenue(event.liveDraft || event.draft) };
  }
  protected async admissionAccess(identity: string | ScannerProof, eventId: string, tx: Transaction, manager = false) {
    if (typeof identity !== 'string') {
      if (manager) fail('Manager access is required for offline resolution.', 403);
      return scannerAccess(this.db, identity, eventId, tx);
    }
    const admin = await tx.get(this.db.collection('adminUsers').doc(identity));
    const scope = await tx.get(this.db.collection('ticketingStaff').doc(`${id(eventId)}_${identity}`));
    if (!admin.exists && !(scope.data()?.roles || []).some((role: string) => manager ? role === 'manager' : ['manager', 'admission'].includes(role))) fail('This account does not have access to this event.', 403);
    return { uid: identity };
  }
  protected async offlineEvidence(tx: Transaction, eventId: string, uid: string, raw: OfflineSubmission | undefined, kind: 'ticket' | 'guest', itemId: string, version: number, managerReview = false) {
    if (!raw?.leaseToken || !raw.itemProof) return { at: Date.now(), rejection: 'offline-unverified', verified: false, leaseHash: '', version, originUid: uid };
    const leaseHash = hash(receipt(raw.leaseToken)), item = readOfflineItem(raw.itemProof, this.signing());
    if (item.leaseHash !== leaseHash || item.eventId !== eventId || item.kind !== kind || item.id !== itemId || item.version !== version) fail('Offline item does not match its prepared manifest.', 409);
    const lease = (await tx.get(this.db.collection('ticketingOfflineLeases').doc(leaseHash))).data();
    if (!lease || lease.eventId !== eventId || (!managerReview && lease.uid !== uid)) fail('Offline preparation belongs to a different scanner or event.', 403);
    const at = integer(raw.deviceTime, 'recorded admission time', 0, Number.MAX_SAFE_INTEGER);
    if (at < lease.generatedAt || at > lease.offlineUntil || at > Date.now() + 120000 || at < Date.parse(item.validFrom) || at > Date.parse(item.validUntil)) fail('Recorded admission is outside the authenticated preparation or admission window.', 409);
    return { at, rejection: managerReview ? 'offline-manager-review' : Date.now() > lease.replayUntil ? 'offline-replay-expired' : '', verified: true, leaseHash, version, originUid: lease.uid as string };
  }
  async scan(eventId: string, qr: unknown, scanId: unknown, identity: string | ScannerProof, offline = false, details?: OfflineSubmission, managerReview = false, source: 'qr' | 'order-dashboard' = 'qr') {
    if (typeof identity === 'string') await this.role(identity, eventId, managerReview ? ['manager'] : ['manager', 'admission']);
    const parsed = readTicket(qr, this.signing()), key = id(scanId);
    if (parsed.eventId !== eventId) fail('This ticket belongs to a different event.', 409);
    return this.db.runTransaction(async tx => {
      // Read the PIN and session in the admission transaction so revocation wins safely.
      const access = await this.admissionAccess(identity, eventId, tx, managerReview), { uid } = access;
      const evidence = offline ? await this.offlineEvidence(tx, eventId, uid, details, 'ticket', parsed.id, parsed.version, managerReview) : null;
      const scanRef = this.event(eventId).collection('scans').doc(key), prior = (await tx.get(scanRef)).data();
      if (prior) { if (prior.ticketId !== parsed.id || prior.uid !== (evidence?.originUid || uid) || (offline && prior.offlineLeaseHash !== evidence?.leaseHash)) fail('Scan attempt mismatch.', 409); return prior; }
      const ticketRef = this.tickets().doc(id(parsed.id)), ticket = (await tx.get(ticketRef)).data();
      const event = (await tx.get(this.event(eventId))).data();
      const order = ticket ? (await tx.get(this.order(ticket.orderId))).data() : null;
      const upgradeValid = !order || await this.validUpgradeParent(tx, order);
      const parentTicket = order?.rsvpTicketId ? (await tx.get(this.tickets().doc(order.rsvpTicketId))).data() : null;
      const at = evidence?.at || Date.now();
      let result = 'accepted';
      if (!ticket || !event || order?.status !== 'paid' || order.financialBlocked || !upgradeValid || ticket.rsvp && order.rsvpStatus !== 'approved' || ticket.version !== parsed.version || ticket.status !== 'valid' || ['cancelled', 'archived'].includes(event.status)) result = 'invalid';
      else if (!Number.isFinite(Date.parse(ticket.validFrom)) || !Number.isFinite(Date.parse(ticket.validUntil)) || at < Date.parse(ticket.validFrom) || at > Date.parse(ticket.validUntil)) result = 'outside-window';
      else if (ticket.admission) result = 'duplicate';
      else if (evidence?.rejection) result = evidence.rejection;
      const record = { ticketId: parsed.id, rsvpTicketId: order?.rsvpTicketId || '', ...access, uid: evidence?.originUid || uid, result, at, syncedAt: Date.now(), offline, name: ticket?.name || '', holderName: ticket?.holderName || order?.name || '', source,
        ...(evidence ? { offlineLeaseHash: evidence.leaseHash, offlineVersion: evidence.version, offlineProofVerified: evidence.verified, submittedBy: uid } : {}) };
      tx.create(scanRef, record); if (result === 'accepted') tx.update(ticketRef, { admission: { at, ...access, scanId: key, offline } });
      if (result === 'accepted' && parentTicket && !parentTicket.admission) tx.update(this.tickets().doc(order!.rsvpTicketId), { admission: { at, ...access, scanId: key, offline, viaUpgradeTicketId: parsed.id } });
      if (result === 'accepted' && source === 'order-dashboard') tx.create(this.event(eventId).collection('audit').doc(), { action: 'ticket-manually-checked-in', orderId: ticket!.orderId, ticketId: parsed.id, scanId: key, uid, at });
      return record;
    });
  }
  async manifest(eventId: string, identity: string | ScannerProof) {
    if (typeof identity === 'string') await this.role(identity, eventId, ['admission']);
    else await scannerAccess(this.db, identity, eventId);
    const tickets = await this.tickets().where('eventId', '==', eventId).get();
    const event = (await this.event(eventId).get()).data();
    const guests = await this.event(eventId).collection('guests').get(), draft = event?.liveDraft || event?.draft;
    const access = typeof identity === 'string' ? { uid: identity, expiresAt: Date.now() + 24 * 3600000 } : await scannerAccess(this.db, identity, eventId);
    const orders = await this.db.collection('ticketingOrders').where('eventId', '==', eventId).get();
    const blocked = new Set(orders.docs.filter(d => d.data().financialBlocked).map(d => d.id));
    const orderNames = new Map(orders.docs.map(d => [d.id, d.data().name]));
    const orderMap = new Map(orders.docs.map(d => [d.id, d.data()])), ticketMap = new Map(tickets.docs.map(d => [d.id, d.data()]));
    const unavailableUpgrades = new Set(orders.docs.filter(d => { const o = d.data(); return o.rsvpOrderId && !approvedRsvpParent(orderMap.get(o.rsvpOrderId), ticketMap.get(o.rsvpTicketId), o); }).map(d => d.id));
    const leaseToken = secret(), leaseHash = hash(leaseToken), generatedAt = Date.now();
    let offlineUntil = Math.min(access.expiresAt, generatedAt + (typeof identity === 'string' ? 24 : 4) * 3600000);
    await this.db.runTransaction(async tx => {
      const current = await this.admissionAccess(identity, eventId, tx);
      const currentEvent = (await tx.get(this.event(eventId))).data();
      if (current.uid !== access.uid || !currentEvent || ['cancelled', 'archived'].includes(currentEvent.status)) fail('Event is not open for offline preparation.', 409);
      if ('expiresAt' in current) offlineUntil = Math.min(offlineUntil, current.expiresAt);
      if (offlineUntil <= generatedAt) fail('Scanner preparation has expired.', 409);
      tx.create(this.db.collection('ticketingOfflineLeases').doc(leaseHash), { eventId, uid: current.uid, generatedAt, offlineUntil, replayUntil: offlineUntil + 48 * 3600000, expiresAt: Timestamp.fromMillis(offlineUntil + 7 * 86400000) });
    });
    const guestValidFrom = draft?.admissionStartsAt || '', guestValidUntil = draft ? new Date(Date.parse(draft.endAt) + 6 * 3600000).toISOString() : '';
    return { eventId, staffUid: access.uid, offlineUntil, generatedAt, leaseToken, verificationKey: keyPair(this.signing()).jwk,
      guests: guests.docs.filter(d => !d.data().deletedAt && !['cancelled', 'archived'].includes(event?.status)).map(d => ({ ...guestEntry(d.id, d.data()), itemProof: signOfflineItem({ leaseHash, eventId, id: d.id, kind: 'guest', version: d.data().version, validFrom: guestValidFrom, validUntil: guestValidUntil }, this.signing()) })), guestValidFrom, guestValidUntil,
      tickets: tickets.docs.map(t => { const d = t.data(), status = ['cancelled', 'archived'].includes(event?.status) || blocked.has(d.orderId) || unavailableUpgrades.has(d.orderId) ? 'invalid' : d.status; return { id: t.id, version: d.version, status, name: d.name, holderName: d.holderName || orderNames.get(d.orderId) || '', rsvpTicketId: d.rsvpTicketId || '', validFrom: d.validFrom, validUntil: d.validUntil, admitted: !!d.admission,
        itemProof: status === 'valid' ? signOfflineItem({ leaseHash, eventId, id: t.id, kind: 'ticket', version: d.version, validFrom: d.validFrom, validUntil: d.validUntil }, this.signing()) : '' }; }) };
  }
  async reviewScan(eventId: string, scanId: unknown, rawNote: unknown, identity: string | ScannerProof) {
    if (typeof identity === 'string') await this.role(identity, eventId, ['admission']);
    const ref = this.event(eventId).collection('scans').doc(id(scanId)), note = text(rawNote, 'review note', 500, true);
    await this.db.runTransaction(async tx => {
      const access = typeof identity === 'string' ? { uid: identity } : await scannerAccess(this.db, identity, eventId, tx), { uid } = access;
      const scan = (await tx.get(ref)).data();
      if (!scan || !scan.offline || scan.result === 'accepted') fail('This scan does not need offline conflict review.', 409);
      tx.update(ref, { reviewedBy: uid, reviewedAt: Date.now(), reviewNote: note });
      tx.create(this.event(eventId).collection('audit').doc(), { action: 'offline-conflict-reviewed', scanId: ref.id, ...access, note, at: Date.now() });
    });
    return { reviewed: true };
  }
  async offlineConflicts(eventId: string, uid: string) {
    await this.role(uid, eventId, ['manager']);
    const scans = await this.event(eventId).collection('scans').where('offline', '==', true).get();
    return { scans: scans.docs.filter(d => d.data().result !== 'accepted' && !d.data().resolution).map(d => ({ scanId: d.id, ...d.data() })).sort((a: any, b: any) => b.syncedAt - a.syncedAt) };
  }
  async resolveOfflineScan(eventId: string, scanId: unknown, rawDecision: unknown, rawNote: unknown, uid: string) {
    await this.role(uid, eventId, ['manager']);
    const key = id(scanId), note = text(rawNote, 'resolution note', 500, true), decision = text(rawDecision, 'resolution', 20, true);
    if (!['confirm', 'reject'].includes(decision)) fail('Choose whether to confirm or reject this recorded admission.');
    return this.db.runTransaction(async tx => {
      await this.admissionAccess(uid, eventId, tx, true);
      const ref = this.event(eventId).collection('scans').doc(key), scan = (await tx.get(ref)).data();
      if (!scan?.offline) fail('Offline scan not found.', 404);
      if (scan.resolution) { if (scan.resolution.decision !== decision) fail('This offline conflict has already been resolved.', 409); return { resolved: true, result: scan.result }; }
      if (scan.result === 'accepted') fail('This admission is already recorded.', 409);
      const event = (await tx.get(this.event(eventId))).data(), draft = event?.liveDraft || event?.draft;
      if (decision === 'confirm') {
        if (!scan.offlineProofVerified || !draft || ['cancelled', 'archived'].includes(event?.status)) fail('This preparation cannot authorize an admission. Keep the conflict for review or reject it.', 409);
        const admission = { at: scan.at, uid: scan.uid, scanId: key, offline: true, resolvedBy: uid, resolvedAt: Date.now() };
        if (scan.kind === 'guest') {
          const guestRef = this.event(eventId).collection('guests').doc(id(scan.guestId)), guest = (await tx.get(guestRef)).data();
          if (!guest || guest.deletedAt || guest.version !== scan.offlineVersion || guest.arrival || scan.at < Date.parse(draft.admissionStartsAt) || scan.at > Date.parse(draft.endAt) + 6 * 3600000) fail('Guest arrival cannot be safely confirmed against the current ledger.', 409);
          tx.update(guestRef, { arrival: admission });
        } else {
          const ticketRef = this.tickets().doc(id(scan.ticketId)), ticket = (await tx.get(ticketRef)).data();
          const order = ticket ? (await tx.get(this.order(ticket.orderId))).data() : null;
          if (!ticket || order?.financialBlocked || ticket.status !== 'valid' || ticket.version !== scan.offlineVersion || ticket.admission || scan.at < Date.parse(ticket.validFrom) || scan.at > Date.parse(ticket.validUntil)) fail('Ticket admission cannot be safely confirmed against the current ledger.', 409);
          tx.update(ticketRef, { admission });
        }
      }
      tx.update(ref, { originalResult: scan.result, ...(decision === 'confirm' ? { result: 'accepted' } : {}), resolution: { decision, note, uid, at: Date.now() } });
      tx.create(this.event(eventId).collection('audit').doc(), { action: 'offline-admission-resolved', scanId: key, decision, uid, note, at: Date.now() });
      return { resolved: true, result: decision === 'confirm' ? 'accepted' : scan.result };
    });
  }
  async staffOrders(eventId: string, uid: string, raw: any = {}) {
    await this.role(uid, eventId, ['manager', 'refund', 'cash']);
    return orderPage(this.db, { ...raw, eventId });
  }
  async staffPerformance(eventId: string, uid: string) {
    await this.role(uid, eventId, ['manager', 'refund', 'cash']);
    const event = (await this.event(eventId).get()).data();
    if (!event) fail('Event not found.', 404);
    const [summary, pools] = await Promise.all([financialSummary(this.db, eventId, event.draft.timezone), this.event(eventId).collection('pools').get()]);
    return { summary, pools: pools.docs.map(d => d.data()) };
  }
  async allOrders(raw: any, uid: string) {
    await this.admin(uid);
    return orderPage(this.db, raw);
  }
  async staffOrder(orderId: string, uid: string) {
    let order = (await this.order(orderId).get()).data(); if (!order) fail('Order not found.', 404);
    await this.role(uid, order.eventId, ['manager', 'refund', 'cash']);
    if (order.method === 'stripe' && order.sessionId && order.status !== 'paid') await this.verifySession(orderId);
    order = (await this.order(orderId).get()).data()!;
    const [eventSnap, tickets, refunds, audit, admin, scope, emails] = await Promise.all([
      this.event(order.eventId).get(), this.tickets().where('orderId', '==', orderId).get(), this.db.collection('ticketingRefunds').where('orderId', '==', orderId).get(),
      this.event(order.eventId).collection('audit').where('orderId', '==', orderId).get(), this.db.collection('adminUsers').doc(uid).get(), this.db.collection('ticketingStaff').doc(`${order.eventId}_${uid}`).get(), this.db.collection('ticketingEmailJobs').where('orderId', '==', orderId).get(),
    ]);
    const roles: string[] = admin.exists ? ['manager', 'refund', 'cash', 'admission'] : scope.data()?.roles || [], draft = eventSnap.data()?.liveDraft || eventSnap.data()?.draft, eventStatus = eventSnap.data()?.status || 'missing';
    const canAdmit = roles.some(r => ['manager', 'admission'].includes(r)), now = Date.now();
    const upgradeValid = await this.db.runTransaction(tx => this.validUpgradeParent(tx, order));
    return { orderId, eventId: order.eventId, eventTitle: order.eventTitle, eventSlug: order.eventSlug, eventStatus, timezone: draft?.timezone || 'America/New_York',
      name: order.name, email: order.email, status: order.status, method: order.method, rsvpStatus: order.rsvpStatus || '', decisionNote: order.decisionNote || '',
      total: order.total, discount: order.discount || 0, taxAmount: order.taxAmount || 0, refundedAmount: order.refundedAmount || 0, externalRefundAmount: order.externalRefundAmount || 0,
      stripeFee: order.stripeFee ?? null, stripeFeeStatus: order.stripeFeeStatus || 'pending', createdAt: order.createdAt, paidAt: order.paidAt || null, expiresAt: order.expiresAt,
      promoCode: order.promoCode || '', promoterId: order.promoterId || '', financialBlocked: !!order.financialBlocked, reviewReason: order.financialReviewReason || order.reviewReason || '',
      providerState: order.providerState || 'unknown', sessionId: order.sessionId || '', paymentIntentId: order.paymentIntentId || '', receiptUrl: order.receiptUrl || '', livemode: order.livemode,
      supportRevision: order.supportRevision || 0,
      rsvpOrderId: order.rsvpOrderId || '',
      emails: emails.docs.map(d => { const e = d.data(); return { id: d.id, type: e.type, to: e.to, status: e.status, deliveryStatus: e.deliveryStatus || '', createdAt: e.createdAt, sentAt: e.sentAt || null, lastError: e.lastError || '' }; }).sort((a, b) => b.createdAt - a.createdAt).slice(0, 20),
      permissions: { canRefund: roles.includes('refund'), canCheckIn: canAdmit, canResolve: roles.includes('manager'), canSupport: roles.includes('manager') },
      tickets: tickets.docs.map(doc => { const t = doc.data();
        const reason = t.admission ? 'Already checked in' : !canAdmit ? 'Admission permission required' : !upgradeValid ? 'Linked RSVP is not approved or valid' : order!.financialBlocked ? 'Payment requires review' : order!.status !== 'paid' ? 'Order is not paid or confirmed' : t.rsvp && order!.rsvpStatus !== 'approved' ? 'RSVP is not approved' : t.status !== 'valid' ? 'Ticket is not valid' : ['cancelled', 'archived', 'missing'].includes(eventStatus) ? 'Event is not open for admission' : !Number.isFinite(Date.parse(t.validFrom)) || !Number.isFinite(Date.parse(t.validUntil)) || now < Date.parse(t.validFrom) || now > Date.parse(t.validUntil) ? 'Outside admission window' : '';
        return { id: doc.id, number: (t.index ?? 0) + 1, name: t.name, kind: t.kind, holderName: t.holderName || order!.name, holderEmail: t.holderEmail || order!.email, status: t.status,
          amount: t.amount, originalAmount: t.originalAmount, discount: t.discount || 0, taxAmount: t.taxAmount || 0, validFrom: t.validFrom, validUntil: t.validUntil, admission: t.admission || null,
          canCheckIn: !reason, checkInReason: reason };
      }).sort((a, b) => a.number - b.number),
      refunds: refunds.docs.map(doc => { const r = doc.data(); return { id: doc.id, amount: r.amount, status: r.status, ticketIds: r.ticketIds || [], approvedBy: r.approvedBy || '', createdAt: r.createdAt, completedAt: r.completedAt || null, stripeRefundId: r.stripeRefundId || '', external: !!r.external, taxReviewRequired: !!r.taxReviewRequired }; }).sort((a, b) => b.createdAt - a.createdAt),
      activity: audit.docs.map(doc => { const a = doc.data(); return { action: a.action, at: a.at, uid: a.uid || '', ticketId: a.ticketId || '', note: a.note || '', amount: a.amount ?? null }; }).sort((a, b) => b.at - a.at).slice(0, 30) };
  }
  async checkInOrderTicket(orderId: string, ticketId: string, scanId: unknown, uid: string) {
    const order = (await this.order(orderId).get()).data(); if (!order) fail('Order not found.', 404);
    await this.role(uid, order.eventId, ['manager', 'refund', 'cash']); await this.role(uid, order.eventId, ['manager', 'admission']);
    const ticket = (await this.tickets().doc(id(ticketId)).get()).data();
    if (!ticket || ticket.orderId !== orderId) fail('This ticket does not belong to the selected order.', 409);
    return this.scan(order.eventId, this.credential(ticket, ticketId), scanId, uid, false, undefined, false, 'order-dashboard');
  }
  async promoterStats(eventId: string, uid: string) {
    await this.role(uid, eventId, ['promoter']);
    const scope = (await this.db.collection('ticketingStaff').doc(`${eventId}_${uid}`).get()).data();
    if (!scope?.promoterId) fail('No promoter attribution is assigned to this account.', 403);
    const orders = await this.db.collection('ticketingOrders').where('eventId', '==', eventId).get();
    const matches = orders.docs.map(d => d.data()).filter(o => o.promoterId === scope.promoterId && o.status === 'paid');
    return { promoterId: scope.promoterId, orders: matches.length, tickets: matches.reduce((n, o) => n + o.units.length, 0), gross: matches.reduce((n, o) => n + o.total, 0), refunds: matches.reduce((n, o) => n + (o.refundedAmount || 0), 0) };
  }
}
