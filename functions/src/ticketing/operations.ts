import { createHmac, randomInt, randomUUID } from 'node:crypto';
import { FieldPath } from 'firebase-admin/firestore';
import { type Order } from './orders';
import { Guests } from './guests';
import { fail, hash, id, integer, receipt, secret, text, ticketId } from './domain';
import { appTicketsUrl, baseUrl, isLive, keyPair, resendKey } from './config';
import { scannerAccess } from './scanner-access';

export class Operations extends Guests {
  scannerPinHash(pin: string) {
    // A keyed lookup prevents a leaked database from enumerating the short PIN space.
    const key = keyPair(this.signing()).privateKey.export({ type: 'pkcs8', format: 'der' });
    return createHmac('sha256', key).update(`pluto-scanner-pin-v1:${pin}`).digest('hex');
  }
  async scannerPins(eventId: string, uid: string) {
    await this.role(uid, eventId);
    const event = (await this.event(eventId).get()).data(); if (!event) fail('Event not found.', 404);
    const pins = await this.db.collection('ticketingScannerPins').where('eventId', '==', eventId).get();
    return { defaultExpiresAt: Date.parse((event.liveDraft || event.draft).endAt) + 6 * 3600000,
      pins: pins.docs.map(d => { const p = d.data(); return { id: d.id, label: p.label, expiresAt: p.expiresAt, createdAt: p.createdAt,
        revokedAt: p.revokedAt || null, loginCount: p.loginCount || 0, lastUsedAt: p.lastUsedAt || null }; }).sort((a, b) => b.createdAt - a.createdAt) };
  }
  async createScannerPin(eventId: string, rawLabel: unknown, rawExpiry: unknown, uid: string) {
    await this.role(uid, eventId);
    const event = (await this.event(eventId).get()).data(); if (!event) fail('Event not found.', 404);
    if (['cancelled', 'archived'].includes(event.status)) fail('This event is no longer open for scanner access.', 409);
    const label = text(rawLabel, 'door person or lane name', 100, true), end = Date.parse((event.liveDraft || event.draft).endAt);
    const expiresAt = rawExpiry == null ? end + 6 * 3600000 : Number(rawExpiry);
    if (!Number.isSafeInteger(expiresAt) || expiresAt <= Date.now() || expiresAt > end + 24 * 3600000 || expiresAt > Date.now() + 366 * 86400000) fail('Choose a future expiry within 24 hours of the event ending and within the next year.');
    const pinId = randomUUID(), ref = this.db.collection('ticketingScannerPins').doc(pinId);
    for (let attempt = 0; attempt < 5; attempt++) {
      const pin = String(randomInt(100000000)).padStart(8, '0'), lookup = this.db.collection('ticketingScannerPinLookup').doc(this.scannerPinHash(pin));
      const created = await this.db.runTransaction(async tx => {
        if ((await tx.get(lookup)).exists) return false;
        tx.create(lookup, { pinId });
        tx.create(ref, { eventId, label, expiresAt, createdAt: Date.now(), createdBy: uid, loginCount: 0 });
        tx.create(this.event(eventId).collection('audit').doc(), { action: 'scanner-pin-created', pinId, label, expiresAt, uid, at: Date.now() });
        return true;
      });
      if (created) return { id: pinId, pin, label, expiresAt, eventId };
    }
    return fail('A scanner PIN could not be generated. Please retry.', 503);
  }
  async revokeScannerPin(eventId: string, pinId: string, uid: string) {
    await this.role(uid, eventId);
    const ref = this.db.collection('ticketingScannerPins').doc(id(pinId));
    await this.db.runTransaction(async tx => {
      const pin = (await tx.get(ref)).data(); if (!pin || pin.eventId !== eventId) fail('Scanner PIN not found.', 404);
      if (pin.revokedAt) return;
      tx.update(ref, { revokedAt: Date.now(), revokedBy: uid });
      tx.create(this.event(eventId).collection('audit').doc(), { action: 'scanner-pin-revoked', pinId, uid, at: Date.now() });
    });
    return { revoked: true };
  }
  async scannerLogin(rawPin: unknown, ip: string) {
    await this.rateLimit(ip, 'scanner-login-ip', 40);
    const pin = typeof rawPin === 'string' ? rawPin.replace(/[\s-]/g, '') : '';
    if (!/^\d{8}$/.test(pin)) fail('Enter a valid 8-digit scanner PIN.', 401);
    const lookupHash = this.scannerPinHash(pin);
    await this.rateLimit(lookupHash, 'scanner-login-pin', 20);
    const token = secret(), sessionRef = this.db.collection('ticketingScannerSessions').doc(hash(token));
    const result = await this.db.runTransaction(async tx => {
      const lookup = (await tx.get(this.db.collection('ticketingScannerPinLookup').doc(lookupHash))).data();
      const pinRef = this.db.collection('ticketingScannerPins').doc(lookup?.pinId || 'missing'), p = (await tx.get(pinRef)).data();
      if (!p || p.revokedAt || p.expiresAt <= Date.now()) fail('This scanner PIN is invalid, expired or revoked. Ask your event organizer for a new PIN.', 401);
      const event = (await tx.get(this.event(p.eventId))).data();
      if (!event || ['cancelled', 'archived'].includes(event.status)) fail('This scanner PIN is invalid, expired or revoked. Ask your event organizer for a new PIN.', 401);
      const expiresAt = Math.min(p.expiresAt, Date.now() + 24 * 3600000);
      tx.create(sessionRef, { pinId: pinRef.id, eventId: p.eventId, expiresAt, createdAt: Date.now() });
      tx.update(pinRef, { loginCount: (p.loginCount || 0) + 1, lastUsedAt: Date.now() });
      tx.create(this.event(p.eventId).collection('audit').doc(), { action: 'scanner-pin-login', pinId: pinRef.id, sessionId: sessionRef.id, label: p.label, at: Date.now() });
      return { uid: `scanner_${pinRef.id}`, eventId: p.eventId, eventTitle: (event.liveDraft || event.draft).title, label: p.label, expiresAt };
    });
    return { ...result, token };
  }
  async scannerSession(token: string) {
    const access = await scannerAccess(this.db, { scannerToken: token });
    const event = (await this.event(access.eventId).get()).data();
    if (!event || ['cancelled', 'archived'].includes(event.status)) fail('This event is no longer open for scanner access.', 403);
    return { uid: access.uid, eventId: access.eventId, eventTitle: (event.liveDraft || event.draft).title, label: access.scannerLabel, expiresAt: access.expiresAt };
  }
  async scannerLogout(token: string) {
    if (/^[a-f0-9]{64}$/.test(token || '')) {
      const ref = this.db.collection('ticketingScannerSessions').doc(hash(token));
      await this.db.runTransaction(async tx => { if ((await tx.get(ref)).exists) tx.update(ref, { revokedAt: Date.now() }); });
    }
    return { signedOut: true };
  }
  async refund(orderId: string, ticketIds: unknown, attempt: unknown, uid: string) {
    const order = (await this.order(orderId).get()).data() as Order | undefined;
    if (!order) fail('Order not found.', 404);
    await this.role(uid, order.eventId, ['refund']);
    if (order.method === 'stripe') await this.reconcileRefunds(orderId);
    if (!Array.isArray(ticketIds) || !ticketIds.length || ticketIds.length > 20 || new Set(ticketIds).size !== ticketIds.length) fail('Select the tickets to refund.');
    const ids = ticketIds.map(id), refundId = hash(receipt(attempt)), ref = this.db.collection('ticketingRefunds').doc(refundId), inputHash = hash(JSON.stringify({ orderId, ids: [...ids].sort() }));
    await this.db.runTransaction(async tx => {
      const existing = (await tx.get(ref)).data();
      if (existing) { if (existing.inputHash !== inputHash) fail('Refund attempt mismatch.', 409); return; }
      const latest = (await tx.get(this.order(orderId))).data() as Order;
      if (latest.status !== 'paid') fail('This order is not paid.', 409);
      if ((latest as any).externalRefundAmount > 0) fail('Map the existing Stripe Dashboard refund to tickets before approving another refund.', 409);
      const tickets = await Promise.all(ids.map(key => tx.get(this.tickets().doc(key))));
      for (const ticket of tickets) if (!ticket.exists || ticket.data()!.orderId !== orderId || ticket.data()!.status !== 'valid') fail('A selected ticket is not eligible for this refund.', 409);
      const amount = tickets.reduce((n, t) => n + t.data()!.amount, 0);
      const taxAmount = tickets.reduce((n, t) => n + (t.data()!.taxAmount || 0), 0);
      const pending = await tx.get(this.db.collection('ticketingRefunds').where('orderId', '==', orderId));
      const allocated = pending.docs.filter(d => ['pending', 'processing', 'succeeded'].includes(d.data().status)).reduce((n, d) => n + d.data().amount, 0);
      if (allocated + amount > latest.total) fail('This refund would exceed the original payment.', 409);
      tx.create(ref, { orderId, eventId: latest.eventId, ticketIds: ids, inputHash, amount, taxAmount, status: 'pending', approvedBy: uid, createdAt: Date.now(), method: latest.method,
        taxReviewRequired: latest.method === 'stripe' && latest.tax.mode === 'automatic' && amount < latest.total && (latest.taxAmount || 0) > 0 });
      tickets.forEach(t => tx.update(t.ref, { status: 'refund-pending', refundId }));
      tx.create(this.event(latest.eventId).collection('audit').doc(), { action: 'refund-approved', uid, refundId, orderId, amount, at: Date.now() });
    });
    await this.processRefund(refundId);
    return { refundId, ...(await ref.get()).data() };
  }
  async processRefund(refundId: string) {
    const ref = this.db.collection('ticketingRefunds').doc(id(refundId)), refund = (await ref.get()).data();
    if (!refund || ['succeeded', 'failed'].includes(refund.status)) return;
    const order = (await this.order(refund.orderId).get()).data() as Order;
    if (order.method !== 'stripe' || refund.amount === 0) {
      if (order.method === 'cash' && order.taxTransactionId && refund.amount > 0 && !refund.stripeTaxReversalId) {
        if (Date.now() - refund.createdAt > 23 * 3600000) fail('Cash tax reversal needs staff review after the safe retry window.', 409);
        const tickets = await Promise.all(refund.ticketIds.map((key: string) => this.tickets().doc(key).get()));
        if (tickets.some(t => !t.data()?.stripeTaxLineItemId)) fail('The original cash tax allocations are missing.', 409);
        const reversal = await this.stripe().tax.transactions.createReversal({ mode: 'partial', original_transaction: order.taxTransactionId, reference: `pluto-refund-tax-${refundId}`,
          line_items: tickets.map(t => ({ original_line_item: t.data()!.stripeTaxLineItemId, amount: -t.data()!.amount, amount_tax: -(t.data()!.taxAmount || 0), reference: t.id, quantity: 1 })) }, { idempotencyKey: `pluto-refund-tax-${refundId}` });
        if (reversal.livemode !== order.livemode || reversal.currency !== 'usd') fail('Tax reversal environment mismatch.', 409);
        await ref.update({ stripeTaxReversalId: reversal.id });
      }
      await this.finishRefund(refundId, 'succeeded'); return;
    }
    if (!order.paymentIntentId) fail('Payment reference is missing; staff review is required.', 409);
    if (!refund.stripeRefundId && Date.now() - refund.createdAt > 23 * 3600000) {
      const prior = await this.stripe().refunds.list({ payment_intent: order.paymentIntentId, limit: 100 });
      const recovered = prior.data.find(r => r.metadata?.pluto_refund_id === refundId);
      if (!recovered || prior.has_more) { await this.order(refund.orderId).update({ reviewReason: 'Refund creation outcome needs review before any further refund attempt.' }); return fail('The unresolved refund requires staff review.', 409); }
      await ref.update({ stripeRefundId: recovered.id }); refund.stripeRefundId = recovered.id;
    }
    const result = refund.stripeRefundId ? await this.stripe().refunds.retrieve(refund.stripeRefundId) : await this.stripe().refunds.create({ payment_intent: order.paymentIntentId, amount: refund.amount,
      metadata: { pluto_refund_id: refundId, pluto_order_id: refund.orderId } }, { idempotencyKey: `pluto-refund-${refundId}` });
    if (result.amount !== refund.amount || result.payment_intent !== order.paymentIntentId) fail('Refund does not match the approved request.', 409);
    await ref.update({ stripeRefundId: result.id, status: 'processing' });
    if (result.status === 'succeeded') await this.finishRefund(refundId, 'succeeded');
    else if (result.status === 'failed' || result.status === 'canceled') await this.finishRefund(refundId, 'failed');
  }
  async finishRefund(refundId: string, result: string) {
    await this.db.runTransaction(async tx => {
      const ref = this.db.collection('ticketingRefunds').doc(refundId), refund = (await tx.get(ref)).data();
      if (!refund || ['succeeded', 'failed'].includes(refund.status)) return;
      const orderRef = this.order(refund.orderId), order = (await tx.get(orderRef)).data() as Order;
      const event = (await tx.get(this.event(order.eventId))).data()!;
      const tickets = await Promise.all(refund.ticketIds.map((key: string) => tx.get(this.tickets().doc(key))));
      const consumption: Record<string, number> = {};
      for (const ticket of tickets) {
        const t = ticket.data()!;
        const offer = (event.liveDraft || event.draft).offers.find((o: any) => o.id === t.offerId);
        if (!t.admission && event.status === 'published' && offer?.active && Date.now() < Date.parse(offer.salesEnd)) for (const [key, count] of Object.entries(t.pools)) consumption[key] = (consumption[key] || 0) + (count as number);
      }
      const pools = await Promise.all(Object.keys(consumption).map(key => tx.get(this.event(order.eventId).collection('pools').doc(key))));
      if (result === 'succeeded') {
        pools.forEach(pool => tx.update(pool.ref, { sold: Math.max(0, pool.data()!.sold - consumption[pool.id]) }));
        tickets.forEach(t => tx.update(t.ref, { status: 'refunded', refunded: true, version: t.data()!.version + 1 }));
        tx.update(orderRef, { refundedAmount: (order.refundedAmount || 0) + refund.amount, refundedTaxAmount: (order.refundedTaxAmount || 0) + (refund.taxAmount || 0),
          ...(refund.external && JSON.stringify([...(order as any).externalStripeRefundIds || []].sort()) === JSON.stringify([...refund.externalStripeRefundIds || []].sort()) ? { externalRefundAmount: 0, externalStripeRefundIds: [] } : {}),
          ...(refund.taxReviewRequired ? { reviewReason: 'Confirm Stripe Tax partial-refund reporting against the refunded ticket tax allocations.' } : {}) });
        tx.set(this.db.collection('ticketingEmailJobs').doc(`refund_${refundId}`), { type: 'refund', orderId: refund.orderId, to: order.email, amount: refund.amount, status: 'pending', attempts: 0, createdAt: Date.now() });
      } else tickets.forEach(t => { if (t.data()!.refundId === refundId) tx.update(t.ref, { status: 'valid', refundId: null }); });
      tx.update(ref, { status: result, completedAt: Date.now() });
    });
  }
  async reconcileRefunds(orderId: string) {
    const order = (await this.order(orderId).get()).data() as Order;
    if (!order.paymentIntentId || order.method !== 'stripe') return;
    const refunds = await this.stripe().refunds.list({ payment_intent: order.paymentIntentId, limit: 100 });
    if (refunds.has_more) { await this.order(orderId).update({ reviewReason: 'Stripe refund history exceeds the automatic review limit.' }); return; }
    for (const refund of refunds.data) {
      const rid = refund.metadata?.pluto_refund_id;
      if (rid) {
        const local = (await this.db.collection('ticketingRefunds').doc(rid).get()).data();
        if (local?.orderId === orderId) await this.processRefund(rid);
      }
    }
    const records = await this.db.collection('ticketingRefunds').where('orderId', '==', orderId).get();
    const mapped = new Set(records.docs.flatMap(d => [...d.data().externalStripeRefundIds || [], ...(d.data().stripeRefundId ? [d.data().stripeRefundId] : [])]));
    let unmatched = 0;
    const unmatchedIds: string[] = [];
    for (const refund of refunds.data) {
      if (refund.status === 'succeeded' && !mapped.has(refund.id)) { unmatched += refund.amount; unmatchedIds.push(refund.id); }
    }
    if (unmatched) {
      const tickets = await this.tickets().where('orderId', '==', orderId).get();
      const already = records.docs.filter(d => d.data().status === 'succeeded').reduce((n, d) => n + d.data().amount, 0);
      if (unmatched + already === order.total) {
        const valid = tickets.docs.filter(t => t.data().status === 'valid');
        if (valid.length) {
          const ref = this.db.collection('ticketingRefunds').doc(`external_${hash(unmatchedIds.sort().join(','))}`);
          await this.db.runTransaction(async tx => {
            if ((await tx.get(ref)).exists) return;
            const currentOrder = (await tx.get(this.order(orderId))).data()!;
            const currentRefunds = await tx.get(this.db.collection('ticketingRefunds').where('orderId', '==', orderId));
            const snapshots = await Promise.all(valid.map(t => tx.get(t.ref)));
            const selected = snapshots.filter(t => t.data()?.status === 'valid');
            const settled = currentRefunds.docs.filter(d => d.data().status === 'succeeded').reduce((n, d) => n + d.data().amount, 0);
            if (selected.reduce((n, t) => n + t.data()!.amount, 0) !== unmatched || settled + unmatched !== currentOrder.total || currentRefunds.docs.some(d => ['pending', 'processing'].includes(d.data().status))) {
              tx.update(this.order(orderId), { externalRefundAmount: unmatched, externalStripeRefundIds: unmatchedIds, reviewReason: currentOrder.disputeId ? 'Payment dispute requires staff review; a Dashboard refund also needs ticket mapping.' : 'A Dashboard refund needs ticket mapping.' });
              return;
            }
            tx.create(ref, { orderId, eventId: order.eventId, ticketIds: selected.map(t => t.id), amount: unmatched, taxAmount: selected.reduce((n, t) => n + (t.data()!.taxAmount || 0), 0), status: 'pending', external: true, externalStripeRefundIds: unmatchedIds, createdAt: Date.now() });
            snapshots.filter(t => t.data()?.status === 'valid').forEach(t => tx.update(t.ref, { status: 'refund-pending', refundId: ref.id }));
          });
          if ((await ref.get()).exists) await this.finishRefund(ref.id, 'succeeded');
        }
      } else await this.order(orderId).update({ reviewReason: (order as any).disputeId ? 'Payment dispute requires staff review; a Dashboard partial refund also needs ticket mapping.' : 'A Dashboard partial refund needs ticket mapping.', externalRefundAmount: unmatched, externalStripeRefundIds: unmatchedIds });
    }
  }
  async mapExternalRefund(orderId: string, ticketIds: unknown, uid: string) {
    const order = (await this.order(orderId).get()).data() as Order | undefined;
    if (!order) fail('Order not found.', 404);
    await this.role(uid, order.eventId, ['refund']); await this.reconcileRefunds(orderId);
    if (!Array.isArray(ticketIds) || !ticketIds.length || ticketIds.length > 20 || new Set(ticketIds).size !== ticketIds.length) fail('Select tickets covered by the existing refund.');
    const ids = ticketIds.map(id);
    const refundId = await this.db.runTransaction(async tx => {
      const latest = (await tx.get(this.order(orderId))).data()!;
      if (!latest.externalRefundAmount || !latest.externalStripeRefundIds?.length) fail('No unmapped Dashboard refund remains.', 409);
      const tickets = await Promise.all(ids.map(key => tx.get(this.tickets().doc(key))));
      if (tickets.some(t => !t.exists || t.data()!.orderId !== orderId || t.data()!.status !== 'valid')) fail('Selected tickets are not eligible for refund mapping.', 409);
      if (tickets.reduce((n, t) => n + t.data()!.amount, 0) !== latest.externalRefundAmount) fail('Selected ticket amounts must exactly match the existing Dashboard refund. Amounts that do not cover whole tickets require manual support.', 409);
      const ref = this.db.collection('ticketingRefunds').doc(`external_${hash([...latest.externalStripeRefundIds].sort().join(','))}`);
      if ((await tx.get(ref)).exists) return ref.id;
      tx.create(ref, { orderId, eventId: order.eventId, ticketIds: ids, amount: latest.externalRefundAmount, taxAmount: tickets.reduce((n, t) => n + (t.data()!.taxAmount || 0), 0), status: 'pending', external: true, externalStripeRefundIds: latest.externalStripeRefundIds, approvedBy: uid, createdAt: Date.now(), taxReviewRequired: order.tax.mode === 'automatic' && (order.taxAmount || 0) > 0 });
      tickets.forEach(t => tx.update(t.ref, { status: 'refund-pending', refundId: ref.id }));
      tx.update(this.order(orderId), { externalRefundAmount: 0, externalStripeRefundIds: [], reviewReason: latest.disputeId ? 'Payment dispute requires staff review.' : '' });
      tx.create(this.event(order.eventId).collection('audit').doc(), { action: 'dashboard-refund-mapped', uid, orderId, refundId: ref.id, at: Date.now() });
      return ref.id;
    });
    await this.finishRefund(refundId, 'succeeded'); return { mapped: true };
  }
  async processWebhook(inboxId: string) {
    const ref = this.db.collection('ticketingWebhookInbox').doc(id(inboxId)), entry = (await ref.get()).data();
    if (!entry || entry.status === 'done') return;
    try {
      if (entry.livemode !== isLive()) fail('Webhook environment mismatch.', 409);
      let orderId = entry.orderId;
      if (entry.type.startsWith('checkout.session.')) {
        if (!orderId) { const session = await this.stripe().checkout.sessions.retrieve(entry.objectId); orderId = session.metadata?.pluto_order_id; }
        if (orderId) await this.verifySession(orderId, entry.objectId);
      } else if (entry.type.startsWith('payment_intent.')) {
        if (!orderId) { const intent = await this.stripe().paymentIntents.retrieve(entry.objectId); orderId = intent.metadata?.pluto_order_id; }
        if (orderId) await this.verifySession(orderId);
      } else if (entry.type.startsWith('refund.') || entry.type === 'charge.refunded' || entry.type.startsWith('charge.dispute.')) {
        let pi = entry.paymentIntentId;
        if (!pi && entry.chargeId) { const charge = await this.stripe().charges.retrieve(entry.chargeId); pi = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id; }
        if (!orderId && pi) orderId = (await this.db.collection('ticketingOrders').where('paymentIntentId', '==', pi).limit(1).get()).docs[0]?.id;
        if (orderId) {
          if (entry.type.startsWith('charge.dispute.')) await this.order(orderId).update({ reviewReason: 'Payment dispute requires staff review.', disputeId: entry.objectId });
          else await this.reconcileRefunds(orderId);
        }
      }
      await ref.update({ status: 'done', completedAt: Date.now(), orderId: orderId || '' });
    } catch (error: any) { await ref.update({ status: 'pending', attempts: (entry.attempts || 0) + 1, lastError: error instanceof Error ? error.name : 'unavailable', retryAt: Date.now() + Math.min(3600000, 1000 * 2 ** Math.min(entry.attempts || 0, 12)) }); throw error; }
  }
  async emailJob(jobId: string) {
    const ref = this.db.collection('ticketingEmailJobs').doc(id(jobId));
    const job = await this.db.runTransaction(async tx => {
      const d = (await tx.get(ref)).data();
      if (!d || ['sent', 'review'].includes(d.status) || (d.leaseUntil || 0) > Date.now() || (d.retryAt || 0) > Date.now()) return null;
      if (d.firstDeliveryAt && Date.now() - d.firstDeliveryAt > 23 * 3600000) { tx.update(ref, { status: 'review', lastError: 'Email delivery outcome needs review after the provider idempotency window.' }); return null; }
      tx.update(ref, { leaseUntil: Date.now() + 120000, attempts: (d.attempts || 0) + 1 }); return d;
    });
    if (!job) return;
    try {
      const order = (await this.order(job.orderId).get()).data() as Order;
      let subject = `Your ${order.eventTitle} tickets`, message = '';
      if (job.type === 'recovery') message = `Recover your order in the Pluto app: ${appTicketsUrl()}#recovery=${job.token}\nThis link expires in 30 minutes and can be used once.`;
      else if (job.type === 'transfer') { subject = `A ${order.eventTitle} ticket was sent to you`; message = `Accept your ticket in the Pluto app: ${appTicketsUrl()}#transfer=${job.token}\nTransfers close when the event's first admission window opens.`; }
      else if (job.type === 'refund') { subject = `${order.eventTitle} refund confirmation`; message = `Your refund of $${(job.amount / 100).toFixed(2)} was approved and processed. Refunded tickets are no longer valid.`; }
      else {
        // Email grants financial order access only to the original payer; transferred QR credentials are filtered in view().
        const token = job.token || secret(), recoveryRef = this.db.collection('ticketingRecovery').doc(hash(token));
        if (!job.token) await ref.update({ token });
        await this.db.runTransaction(async tx => { if (!(await tx.get(recoveryRef)).exists) tx.create(recoveryRef, { orderId: job.orderId, expiresAt: Date.now() + 30 * 86400000, used: false }); });
        message = `Thanks for joining us. Your order total is $${(order.total / 100).toFixed(2)}.\nOpen the Pluto app to view your receipt, tickets and venue details: ${appTicketsUrl()}#recovery=${token}\nThis link can be opened once within 30 days. You can request another link from My tickets. Admission tickets are kept in the app; no ticket PDF is attached.`;
      }
      const key = resendKey.value(); if (!key) fail('Email delivery is not configured yet.', 503);
      if (!job.firstDeliveryAt) await ref.update({ firstDeliveryAt: Date.now() });
      const result = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Idempotency-Key': `pluto-${jobId}` }, body: JSON.stringify({ from: process.env.TICKETING_EMAIL_FROM || 'Pluto Events <tickets@pluto.events>', to: [job.to], subject, text: message }), signal: AbortSignal.timeout(20000) });
      if (!result.ok) fail('Email provider could not confirm delivery.', 503);
      await ref.update({ status: 'sent', sentAt: Date.now(), leaseUntil: 0, token: null });
    } catch (error: any) { await ref.update({ leaseUntil: 0, status: 'pending', retryAt: Date.now() + Math.min(3600000, 1000 * 2 ** Math.min(job.attempts || 0, 12)), lastError: error.name || 'unavailable' }); }
  }
  async maintenance() {
    const now = Date.now(), summary: Record<string, number> = { orders: 0, refunds: 0, webhooks: 0, emails: 0, errors: 0 };
    const unsettled = await this.pendingBatch('ticketingOrders', ['provisioning', 'open', 'processing'], 200);
    for (const doc of unsettled.docs) {
      try {
        const order = doc.data() as Order;
        if (order.method !== 'stripe' || order.total === 0) { await this.fulfillNonCard(doc.id, order); }
        else {
          if (!order.sessionId) await this.provision(doc.id, order);
          const session = await this.verifySession(doc.id);
          const event = (await this.event(order.eventId).get()).data();
          if (session?.status === 'open' && (order.expiresAt <= now || event?.status !== 'published')) {
            try { await this.stripe().checkout.sessions.expire(session.id); } catch { /* A concurrent successful payment can win; retrieve before releasing. */ }
            await this.verifySession(doc.id);
          }
        }
        summary.orders++;
      } catch { summary.errors++; }
    }
    const refunds = await this.pendingBatch('ticketingRefunds', ['pending', 'processing'], 100);
    for (const doc of refunds.docs) { try { if (doc.data().external) await this.finishRefund(doc.id, 'succeeded'); else await this.processRefund(doc.id); summary.refunds++; } catch { summary.errors++; } }
    const inbox = await this.pendingBatch('ticketingWebhookInbox', ['pending'], 100);
    for (const doc of inbox.docs) if ((doc.data().retryAt || 0) <= now) { try { await this.processWebhook(doc.id); summary.webhooks++; } catch { summary.errors++; } }
    const jobs = await this.pendingBatch('ticketingEmailJobs', ['pending'], 100);
    for (const doc of jobs.docs) { await this.emailJob(doc.id); summary.emails++; }
    return summary;
  }
  async pendingBatch(collection: string, statuses: string[], size: number) {
    const cursor = this.db.collection('ticketingWorkerCursors').doc(collection), state = (await cursor.get()).data();
    const query = this.db.collection(collection).where('status', statuses.length === 1 ? '==' : 'in', statuses.length === 1 ? statuses[0] : statuses).orderBy(FieldPath.documentId()).limit(size);
    let batch = await (state?.after ? query.startAfter(state.after) : query).get();
    if (batch.empty && state?.after) batch = await query.get();
    await cursor.set({ after: batch.size === size ? batch.docs[batch.docs.length - 1].id : '', updatedAt: Date.now() });
    return batch;
  }
}
