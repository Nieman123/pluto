import Stripe from 'stripe';
import { randomUUID } from 'node:crypto';
import { type DecodedIdToken } from 'firebase-admin/auth';
import { type Firestore } from 'firebase-admin/firestore';
import { Catalog } from './catalog';
import { apiVersion, appTicketsUrl, baseUrl, isLive, keyPair, readTicket, signTicket, stripeClient } from './config';
import { assertCapacity, cart, email, fail, hash, id, integer, receipt, secret, text, ticketId, type EventDraft, type Unit } from './domain';

export interface Order {
  eventId: string; eventTitle: string; eventSlug: string; ownerUid: string; email: string; name: string; accessHash: string; inputHash: string;
  status: string; method: string; units: Unit[]; consumption: Record<string, number>; promoCode: string; total: number; discount: number;
  tax: EventDraft['tax']; currency: string; livemode: boolean; createdAt: number; expiresAt: number; promoterId: string;
  sessionId?: string; clientSecret?: string; paymentIntentId?: string; receiptUrl?: string; stripeFee?: number; taxAmount?: number;
  refundedAmount?: number; refundedTaxAmount?: number; reviewReason?: string;
  transferCutoff?: string;
  taxTransactionId?: string; taxCustomerAddress?: { country: string; state: string; postal_code: string; line1: string; city: string } | null;
}
type Dependencies = { stripe?: Stripe; signingKey?: string };
export class Orders extends Catalog {
  constructor(db?: Firestore, private dependencies: Dependencies = {}) { super(db); }
  stripe() { return this.dependencies.stripe || stripeClient(); }
  signing() { return this.dependencies.signingKey; }
  order(orderId: string) { return this.db.collection('ticketingOrders').doc(id(orderId)); }
  tickets() { return this.db.collection('ticketingTickets'); }
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
      if (access?.orderId === orderId && access.expiresAt > Date.now()) return order;
    }
    return fail('Use your secure order link or sign in with the purchasing account.', 403);
  }
  async checkout(raw: any, actor: DecodedIdToken | null, method = 'stripe', staffUid = '') {
    const eventId = id(raw.eventId), accessKey = receipt(raw.accessKey), orderId = hash(accessKey), ref = this.order(orderId);
    const contact = { email: email(raw.email), name: text(raw.name, 'name', 150, true), ownerUid: actor?.uid || '' };
    const requestHash = hash(JSON.stringify({ eventId, items: raw.items, promoCode: raw.promoCode || '', ...contact, method,
      ...(method !== 'stripe' ? { cashReceived: raw.cashReceived || 0, reason: raw.reason || '', taxState: raw.taxState || '', taxPostalCode: raw.taxPostalCode || '', taxCity: raw.taxCity || '', taxLine1: raw.taxLine1 || '' } : {}) }));
    // Configuration fails before inventory is reserved or payment is accepted.
    keyPair(this.signing()); if (method === 'stripe') this.stripe();
    if (method !== 'stripe') await this.role(staffUid, eventId, ['cash']);
    const now = Date.now();
    await this.db.runTransaction(async tx => {
      const existing = (await tx.get(ref)).data() as Order | undefined;
      if (existing) { if (existing.inputHash !== requestHash) fail('This checkout attempt has different details. Use the original cart or start a new attempt.', 409); return; }
      const event = (await tx.get(this.event(eventId))).data();
      if (!event || event.status !== 'published') fail('Ticket sales are not open for this event.', 409);
      const draft = (event.liveDraft || event.draft) as EventDraft;
      if (now >= Date.parse(draft.endAt)) fail('This event has ended.', 409);
      if (isLive() && (!draft.tax.confirmed || draft.tax.mode === 'sandbox')) fail('Live sales need confirmed event taxes.', 503);
      const priced = cart(draft, raw.items, raw.promoCode, now);
      if (method === 'cash' && integer(raw.cashReceived, 'cash received', 0, 100000000) < priced.total) fail('Cash received must cover the order total.');
      if (method === 'comp') {
        text(raw.reason, 'comp reason', 500, true);
        priced.units.forEach(unit => { unit.discount = unit.originalAmount; unit.amount = 0; });
        priced.discount = priced.units.reduce((n, u) => n + u.originalAmount, 0); priced.total = 0;
      }
      const taxCustomerAddress = method === 'cash' && draft.tax.mode === 'automatic' && priced.total > 0 ? { country: 'US', state: text(raw.taxState, 'billing state', 2, true).toUpperCase(), postal_code: text(raw.taxPostalCode, 'billing ZIP', 10, true), line1: text(raw.taxLine1, 'billing street', 500, true), city: text(raw.taxCity, 'billing city', 100, true) } : null;
      if (taxCustomerAddress && (!/^[A-Z]{2}$/.test(taxCustomerAddress.state) || !/^\d{5}(?:-\d{4})?$/.test(taxCustomerAddress.postal_code))) fail('Check the US billing state and ZIP for the cash tax calculation.');
      const poolSnapshots = await Promise.all(Object.keys(priced.consumption).map(key => tx.get(this.event(eventId).collection('pools').doc(key))));
      const pools: Record<string, any> = Object.fromEntries(poolSnapshots.map(s => [s.id, s.data()])); assertCapacity(priced.consumption, pools);
      const promoRef = priced.promoCode ? this.event(eventId).collection('promos').doc(priced.promoCode) : null;
      const promotion = promoRef ? (await tx.get(promoRef)).data() : null;
      if (promoRef && (!promotion || promotion.held + promotion.used >= promotion.limit)) fail('This promotion has reached its redemption limit.', 409);
      let promoterId = '';
      if (raw.promoterId && Number.isFinite(raw.promoterClickedAt) && raw.promoterClickedAt <= now && now - raw.promoterClickedAt <= 30 * 86400000) {
        const promoter = (await tx.get(this.event(eventId).collection('promoters').doc(id(raw.promoterId)))).data();
        if (promoter?.active === true) promoterId = id(raw.promoterId);
      }
      for (const [key, count] of Object.entries(priced.consumption)) tx.update(this.event(eventId).collection('pools').doc(key), { held: pools[key].held + count });
      if (promoRef) tx.update(promoRef, { held: promotion!.held + 1 });
      tx.create(ref, { eventId, eventTitle: draft.title, eventSlug: draft.slug, ...contact, accessHash: hash(accessKey), inputHash: requestHash,
        ...priced, tax: draft.tax, taxCustomerAddress, currency: 'usd', livemode: isLive(), status: 'provisioning', method, createdAt: now, expiresAt: now + 35 * 60000,
        promoterId, staffUid, transferCutoff: draft.admissionStartsAt, cashReceived: method === 'cash' ? raw.cashReceived : 0, compReason: method === 'comp' ? raw.reason : '', refundedAmount: 0, revision: event.publishedRevision, apiVersion });
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
    if (Date.now() - order.createdAt > 23 * 3600000) { await this.order(orderId).update({ reviewReason: 'Unresolved creation exceeded the safe idempotency window.' }); return fail('Checkout needs staff review. Start no further payment attempts for this order.', 409); }
    const parameters: Stripe.Checkout.SessionCreateParams = {
      mode: 'payment', ui_mode: 'embedded_page', customer_email: order.email, client_reference_id: orderId,
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
    if (order.tax.mode === 'manual') for (const rateId of new Set(order.units.flatMap(u => u.stripeTaxRateIds))) {
      const rate = await this.stripe().taxRates.retrieve(rateId); if (!rate.inclusive || !rate.active || rate.livemode !== order.livemode) fail('The event needs active inclusive tax rates in this environment.', 503);
    }
    if (order.tax.mode === 'automatic') await this.checkAutomaticTax(order);
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
    const session = recovered || await this.stripe().checkout.sessions.create(parameters, { idempotencyKey: `pluto-checkout-${orderId}` });
    if (session.livemode !== order.livemode || session.currency !== 'usd' || session.amount_total !== order.total) fail('Checkout totals or environment do not match the reserved order.', 503);
    await this.db.runTransaction(async tx => {
      const ref = this.order(orderId), latest = (await tx.get(ref)).data() as Order;
      if (latest.status === 'provisioning') tx.update(ref, { status: 'open', sessionId: session.id, clientSecret: session.client_secret, expiresAt: session.expires_at * 1000 });
      else if (latest.sessionId && latest.sessionId !== session.id) fail('Checkout attempt mismatch.', 409);
    });
    return session;
  }
  async checkAutomaticTax(order: Order) {
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
      await this.fulfill(orderId, { paymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : intent?.id || '', receiptUrl: charge?.receipt_url || '', stripeFee: balance?.fee || 0, taxAmount: session.total_details?.amount_tax || 0 }, verifiedUnits);
    } else if (session.status === 'expired') await this.release(orderId);
    else if (session.status === 'complete') {
      const intent = typeof session.payment_intent === 'object' ? session.payment_intent : null;
      if (intent?.status === 'canceled' || intent?.status === 'requires_payment_method') await this.release(orderId);
      else await this.order(orderId).update({ status: 'processing' });
    }
    return session;
  }
  async fulfill(orderId: string, payment: Record<string, unknown>, verifiedUnits?: Unit[]) {
    await this.db.runTransaction(async tx => {
      const ref = this.order(orderId), order = (await tx.get(ref)).data() as Order;
      if (order.status === 'paid') return;
      if (order.status === 'expired') { tx.update(ref, { reviewReason: 'Payment received after stock was released. Staff review required.', ...payment }); return; }
      const pools = await Promise.all(Object.keys(order.consumption).map(key => tx.get(this.event(order.eventId).collection('pools').doc(key))));
      const promoRef = order.promoCode ? this.event(order.eventId).collection('promos').doc(order.promoCode) : null;
      const promo = promoRef ? (await tx.get(promoRef)).data() : null;
      for (const pool of pools) { const data = pool.data()!, count = order.consumption[pool.id]; if (data.held < count) fail('Reserved inventory needs review.', 409); tx.update(pool.ref, { held: data.held - count, sold: data.sold + count }); }
      if (promoRef) tx.update(promoRef, { held: promo!.held - 1, used: promo!.used + 1 });
      (verifiedUnits || order.units).forEach((unit, index) => tx.create(this.tickets().doc(ticketId(orderId, index)), { ...unit, orderId, eventId: order.eventId, eventTitle: order.eventTitle,
        ownerUid: order.ownerUid, holderEmail: order.email, holderName: order.name, transferCutoff: order.transferCutoff || unit.validFrom, version: 1, status: 'valid', admission: null, refunded: false, index }));
      tx.update(ref, { status: 'paid', paidAt: Date.now(), ...payment, ...(verifiedUnits ? { units: verifiedUnits } : {}), clientSecret: null });
      tx.set(this.db.collection('ticketingEmailJobs').doc(`receipt_${orderId}`), { type: 'receipt', orderId, to: order.email, status: 'pending', createdAt: Date.now(), attempts: 0 });
    });
  }
  async release(orderId: string) {
    await this.db.runTransaction(async tx => {
      const ref = this.order(orderId), order = (await tx.get(ref)).data() as Order;
      if (!['open', 'provisioning', 'processing'].includes(order.status)) return;
      const pools = await Promise.all(Object.keys(order.consumption).map(key => tx.get(this.event(order.eventId).collection('pools').doc(key))));
      const promoRef = order.promoCode ? this.event(order.eventId).collection('promos').doc(order.promoCode) : null;
      const promo = promoRef ? (await tx.get(promoRef)).data() : null;
      for (const pool of pools) { const data = pool.data()!; tx.update(pool.ref, { held: Math.max(0, data.held - order.consumption[pool.id]) }); }
      if (promoRef) tx.update(promoRef, { held: Math.max(0, promo!.held - 1) });
      tx.update(ref, { status: 'expired', clientSecret: null, expiredAt: Date.now() });
    });
  }
  async cancel(orderId: string, key: unknown, actor: DecodedIdToken | null) {
    const order = await this.authorize(orderId, key, actor);
    if (order.status === 'paid') return { status: 'paid' };
    if (order.method === 'stripe' && order.total > 0) {
      const sid = order.sessionId || (await this.provision(orderId, order)).id;
      try { await this.stripe().checkout.sessions.expire(sid); } catch { /* Retrieve authoritative status below. */ }
      await this.verifySession(orderId, sid);
    } else await this.release(orderId);
    const latest = (await this.order(orderId).get()).data()!;
    if (latest.status === 'paid') return { status: 'paid' };
    if (latest.status !== 'expired') fail('Payment is still being confirmed. Keep the original attempt open.', 409);
    return { status: 'expired' };
  }
  credential(ticket: any, ticketKey: string) { return signTicket({ id: ticketKey, eventId: ticket.eventId, version: ticket.version, validFrom: ticket.validFrom, validUntil: ticket.validUntil }, this.signing()); }
  transferDeadline(ticket: any, event: any) { return Math.min(Date.parse(ticket.transferCutoff || ticket.validFrom), Date.parse((event.liveDraft || event.draft).admissionStartsAt)); }
  async view(orderId: string, accessKey: unknown, actor: DecodedIdToken | null, refresh = false) {
    let order = await this.authorize(orderId, accessKey, actor);
    if (refresh && order.sessionId && order.status !== 'paid') { await this.verifySession(orderId); order = (await this.order(orderId).get()).data() as Order; }
    const tickets = (await this.tickets().where('orderId', '==', orderId).get()).docs;
    const event = (await this.event(order.eventId).get()).data();
    const held = tickets.filter(t => !t.data().refunded && (t.data().ownerUid === actor?.uid || t.data().holderEmail === order.email));
    return { orderId, eventId: order.eventId, eventTitle: order.eventTitle, eventSlug: order.eventSlug, eventStatus: event?.status, status: order.status, method: order.method, total: order.total,
      discount: order.discount, taxAmount: order.taxAmount || 0, refundedAmount: order.refundedAmount || 0, externalRefundAmount: (order as any).externalRefundAmount || 0, reviewReason: order.reviewReason || '', name: order.name, email: order.email, createdAt: order.createdAt, receiptUrl: order.receiptUrl || '',
      tickets: tickets.map(t => { const d = t.data(), canUse = held.includes(t); return { id: t.id, name: d.name, holderName: d.holderName, status: d.status, validFrom: d.validFrom, validUntil: d.validUntil, admission: d.admission,
        amount: d.amount, transferable: canUse && d.status === 'valid' && !d.admission && event?.status !== 'cancelled' && Date.now() < this.transferDeadline(d, event), qr: canUse && d.status === 'valid' && event?.status !== 'cancelled' ? this.credential(d, t.id) : null }; }),
      venue: held.length ? { name: (event?.liveDraft || event?.draft)?.venueName || '', address: (event?.liveDraft || event?.draft)?.address || '', directions: (event?.liveDraft || event?.draft)?.directions || '' } : null };
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
    return { orders: orders.docs.map(d => { const o = d.data(); return { orderId: d.id, eventTitle: o.eventTitle, status: o.status, total: o.total, createdAt: o.createdAt }; }).sort((a, b) => b.createdAt - a.createdAt),
      tickets: await Promise.all(tickets.docs.map(async t => { const d = t.data(), event = (await this.event(d.eventId).get()).data(); return { id: t.id, orderId: d.orderId, eventTitle: d.eventTitle, name: d.name, holderName: d.holderName, status: d.status,
        admission: d.admission, transferable: d.status === 'valid' && !d.admission && event?.status !== 'cancelled' && Date.now() < this.transferDeadline(d, event),
        qr: d.status === 'valid' && event?.status !== 'cancelled' ? this.credential(d, t.id) : null }; })) };
  }
  async recover(rawEmail: unknown) {
    const target = email(rawEmail), docs = await this.db.collection('ticketingOrders').where('email', '==', target).get();
    for (const doc of docs.docs.slice(0, 25)) {
      const token = secret();
      const batch = this.db.batch();
      batch.set(this.db.collection('ticketingRecovery').doc(hash(token)), { orderId: doc.id, expiresAt: Date.now() + 30 * 60000, used: false });
      batch.set(this.db.collection('ticketingEmailJobs').doc(`recovery_${hash(token)}`), { type: 'recovery', orderId: doc.id, to: target, token, status: 'pending', attempts: 0, createdAt: Date.now() });
      await batch.commit();
    }
    return { message: 'If we found matching orders, a secure recovery link will be emailed to you.' };
  }
  async acceptRecovery(rawToken: unknown) {
    const token = receipt(rawToken), ref = this.db.collection('ticketingRecovery').doc(hash(token)), accessKey = secret();
    const orderId = await this.db.runTransaction(async tx => {
      const record = (await tx.get(ref)).data(); if (!record || record.used || record.expiresAt < Date.now()) fail('This recovery link is expired or already used.', 403);
      tx.update(ref, { used: true }); tx.create(this.db.collection('ticketingAccess').doc(hash(accessKey)), { orderId: record.orderId, expiresAt: Date.now() + 24 * 3600000 });
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
      if (!ticket || ticket.orderId !== orderId || !(holderAccess && ticket.version === heldTicket.version || ticket.ownerUid === actor?.uid || ticket.holderEmail === order.email) || ticket.status !== 'valid' || ticket.admission || event.status === 'cancelled' || Date.now() >= this.transferDeadline(ticket, event)) fail('This ticket cannot be transferred.', 409);
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
      if (!ticket || ticket.version !== transfer.ticketVersion || ticket.status !== 'valid' || ticket.admission) fail('This ticket is no longer transferable.', 409);
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
    if (!access) fail('Ticket access not found.', 404);
    const ticket = (await this.tickets().doc(access.ticketId).get()).data();
    if (!ticket || ticket.version !== access.version || ticket.status !== 'valid') fail('This ticket credential is no longer valid.', 409);
    if (actor?.email_verified && actor.email?.toLowerCase() === ticket.holderEmail && !ticket.ownerUid) await this.tickets().doc(access.ticketId).update({ ownerUid: actor.uid });
    const event = (await this.event(ticket.eventId).get()).data()!;
    if (event.status === 'cancelled') fail('This event has been cancelled. Contact Pluto about your order.', 409);
    return { id: access.ticketId, orderId: ticket.orderId, name: ticket.name, eventTitle: ticket.eventTitle, holderName: ticket.holderName, status: ticket.status,
      transferable: !ticket.admission && Date.now() < this.transferDeadline(ticket, event), qr: this.credential(ticket, access.ticketId),
      venue: { name: (event.liveDraft || event.draft).venueName, address: (event.liveDraft || event.draft).address, directions: (event.liveDraft || event.draft).directions } };
  }
  async scan(eventId: string, qr: unknown, scanId: unknown, uid: string, offline = false) {
    await this.role(uid, eventId, ['admission']);
    const parsed = readTicket(qr, this.signing()), key = id(scanId);
    if (parsed.eventId !== eventId) fail('This ticket belongs to a different event.', 409);
    return this.db.runTransaction(async tx => {
      const scanRef = this.event(eventId).collection('scans').doc(key), prior = (await tx.get(scanRef)).data();
      if (prior) { if (prior.ticketId !== parsed.id || prior.uid !== uid) fail('Scan attempt mismatch.', 409); return prior; }
      const ticketRef = this.tickets().doc(id(parsed.id)), ticket = (await tx.get(ticketRef)).data();
      const event = (await tx.get(this.event(eventId))).data();
      let result = 'accepted';
      if (!ticket || ticket.version !== parsed.version || ticket.status !== 'valid' || event?.status === 'cancelled') result = 'invalid';
      else if (Date.now() < Date.parse(ticket.validFrom) || Date.now() > Date.parse(ticket.validUntil)) result = 'outside-window';
      else if (ticket.admission) result = 'duplicate';
      const record = { ticketId: parsed.id, uid, result, at: Date.now(), offline, name: ticket?.name || '' };
      tx.create(scanRef, record); if (result === 'accepted') tx.update(ticketRef, { admission: { at: Date.now(), uid, scanId: key, offline } });
      return record;
    });
  }
  async manifest(eventId: string, uid: string) {
    await this.role(uid, eventId, ['admission']);
    const tickets = await this.tickets().where('eventId', '==', eventId).get();
    const event = (await this.event(eventId).get()).data();
    return { eventId, generatedAt: Date.now(), verificationKey: keyPair(this.signing()).jwk,
      tickets: tickets.docs.map(t => { const d = t.data(); return { id: t.id, version: d.version, status: event?.status === 'cancelled' ? 'invalid' : d.status, name: d.name, validFrom: d.validFrom, validUntil: d.validUntil, admitted: !!d.admission }; }) };
  }
  async reviewScan(eventId: string, scanId: unknown, rawNote: unknown, uid: string) {
    await this.role(uid, eventId, ['admission']);
    const ref = this.event(eventId).collection('scans').doc(id(scanId)), note = text(rawNote, 'review note', 500, true);
    await this.db.runTransaction(async tx => {
      const scan = (await tx.get(ref)).data();
      if (!scan || !scan.offline || scan.result === 'accepted') fail('This scan does not need offline conflict review.', 409);
      tx.update(ref, { reviewedBy: uid, reviewedAt: Date.now(), reviewNote: note });
      tx.create(this.event(eventId).collection('audit').doc(), { action: 'offline-conflict-reviewed', scanId: ref.id, uid, note, at: Date.now() });
    });
    return { reviewed: true };
  }
  async staffOrders(eventId: string, uid: string) {
    await this.role(uid, eventId, ['manager', 'refund', 'cash']);
    const orders = await this.db.collection('ticketingOrders').where('eventId', '==', eventId).get();
    const pools = await this.event(eventId).collection('pools').get();
    return { orders: orders.docs.map(d => { const { accessHash, clientSecret, inputHash, ...safe } = d.data(); return { orderId: d.id, ...safe }; }).sort((a: any, b: any) => b.createdAt - a.createdAt),
      pools: pools.docs.map(d => d.data()) };
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
