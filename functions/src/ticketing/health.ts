import type { Firestore } from 'firebase-admin/firestore';
import { FieldPath } from 'firebase-admin/firestore';

export interface HealthIssue { id: string; kind: string; severity: 'warning' | 'critical'; title: string; orderId: string; jobId?: string; at: number; detail: string; }
const age = (now: number, at: number, minutes: number) => now - at >= minutes * 60000;
export async function collectHealth(db: Firestore, now = Date.now()) {
  const queries = [
    db.collection('ticketingOrders').where('status', 'in', ['provisioning', 'open', 'processing', 'expired']).limit(501),
    db.collection('ticketingRefunds').where('status', 'in', ['pending', 'processing']).limit(501),
    db.collection('ticketingWebhookInbox').where('status', '==', 'pending').limit(501),
    db.collection('ticketingEmailJobs').where('status', 'in', ['pending', 'review']).limit(501),
    db.collection('ticketingEmailJobs').where('deliveryStatus', 'in', ['bounced', 'failed', 'complained', 'suppressed']).limit(501),
  ];
  const [[orders, refunds, webhooks, emails, delivery], heartbeat, blocked] = await Promise.all([Promise.all(queries.map(q => q.get())), db.collection('ticketingHealth').doc('maintenance').get(), db.collection('ticketingOrders').where('financialBlocked', '==', true).limit(501).get()]);
  const cursorRef = db.collection('ticketingHealth').doc('issuance-cursor'), cursor = (await cursorRef.get()).data();
  const paidQuery = db.collection('ticketingOrders').where('status', '==', 'paid').orderBy(FieldPath.documentId()).limit(51);
  let paid = await (cursor?.after ? paidQuery.startAfter(cursor.after) : paidQuery).get();
  if (paid.empty && cursor?.after) paid = await paidQuery.get();
  const issues: HealthIssue[] = [];
  const add = (id: string, kind: string, title: string, orderId: string, at: number, detail: string, severity: HealthIssue['severity'] = 'warning', jobId?: string) => issues.push({ id, kind, severity, title, orderId, at, detail, ...(jobId ? { jobId } : {}) });
  let checkedPaidOrders = 0;
  const paidIds = new Set(paid.docs.slice(0, 50).map(d => d.id));
  // Reads are bounded. A partial check is explicitly reported, never presented as all-clear.
  const orderDocs = [...new Map([...orders.docs.slice(0, 500), ...blocked.docs.slice(0, 500), ...paid.docs.slice(0, 50)].map(d => [d.id, d])).values()];
  for (const doc of orderDocs) {
    const o = doc.data(), at = o.createdAt || now;
    if (o.financialBlocked || o.financialReviewReason || o.reviewReason) add(`order_${doc.id}`, 'order-review', 'Order needs review', doc.id, at, o.financialReviewReason || o.reviewReason || 'Admission is held pending payment reconciliation.', 'critical');
    else if (['provisioning', 'processing', 'open'].includes(o.status) && age(now, o.expiresAt || at, 10)) add(`order_${doc.id}`, 'checkout', 'Checkout reservation is stalled', doc.id, at, 'Verify the provider outcome before releasing inventory.');
    if (o.status === 'paid' && paidIds.has(doc.id)) {
      checkedPaidOrders++;
      if (!Array.isArray(o.units)) { add(`issuance_${doc.id}`, 'issuance', 'Confirmed order allocation needs review', doc.id, o.paidAt || at, 'The order has no valid ticket allocation. Review the original payment and order record.', 'critical'); continue; }
      const tickets = await db.collection('ticketingTickets').where('orderId', '==', doc.id).count().get();
      if (tickets.data().count !== o.units.length) add(`issuance_${doc.id}`, 'issuance', 'Confirmed order has missing tickets', doc.id, o.paidAt || at, 'Compare issued tickets with the order allocation. No automatic tickets are minted from this alert.', 'critical');
    }
  }
  await cursorRef.set({ after: paid.size > 50 ? paid.docs[49].id : '', checkedAt: now });
  for (const doc of refunds.docs.slice(0, 500)) { const r = doc.data(); if (age(now, r.createdAt || now, 15)) add(`refund_${doc.id}`, 'refund', 'Refund is unresolved', r.orderId, r.createdAt, 'Review its provider reference and original approved ticket allocation.', 'critical', doc.id); }
  for (const doc of webhooks.docs.slice(0, 500)) { const w = doc.data(); if (age(now, w.receivedAt || now, 10) || w.attempts >= 3) add(`webhook_${doc.id}`, 'webhook', 'Payment event is retrying', w.orderId || '', w.receivedAt || now, w.lastError || 'Provider reconciliation has not completed.', 'critical', doc.id); }
  const emailDocs = [...new Map([...emails.docs.slice(0, 500), ...delivery.docs.slice(0, 500)].map(d => [d.id, d])).values()];
  for (const doc of emailDocs) {
    const e = doc.data();
    if (e.status === 'review' || ['bounced', 'failed', 'complained', 'suppressed'].includes(e.deliveryStatus)) add(`email_${doc.id}`, 'email-review', 'Email needs attention', e.orderId || '', e.createdAt || now, e.deliveryStatus ? `Delivery status: ${e.deliveryStatus}. Check the contact before sending a new access link.` : e.lastError || 'Sending outcome requires review.', 'warning', doc.id);
    else if (e.status === 'pending' && age(now, e.createdAt || now, 10)) add(`email_${doc.id}`, 'email', 'Email is waiting to send', e.orderId || '', e.createdAt || now, e.lastError || 'Background delivery has not completed.', 'warning', doc.id);
  }
  const maintenance = heartbeat.data() || {};
  if (!maintenance.completedAt || age(now, maintenance.completedAt, 15)) add('maintenance', 'maintenance', 'Maintenance heartbeat is overdue', '', maintenance.startedAt || now, maintenance.failedAt ? 'The most recent run failed. Check the function logs.' : 'No successful run has been recorded in the last 15 minutes.', 'critical');
  const truncated = [orders, refunds, webhooks, emails, delivery, blocked].some(q => q.size > 500) || paid.size > 50 || !!cursor?.after;
  if (truncated) add('limited-check', 'coverage', 'Health check coverage is limited', '', now, 'This pass checks up to 500 records per queue and 50 paid orders. Continue review in All Orders and provider dashboards.');
  issues.sort((a, b) => Number(b.severity === 'critical') - Number(a.severity === 'critical') || a.at - b.at);
  // Keep the cached Firestore document and response bounded even during a large outage.
  return { checkedAt: now, maintenance, truncated: truncated || issues.length > 200, checkedPaidOrders, issues: issues.slice(0, 200), counts: { critical: issues.filter(i => i.severity === 'critical').length, warning: issues.filter(i => i.severity === 'warning').length,
    pendingRefunds: refunds.size, pendingWebhooks: webhooks.size, pendingEmails: emails.docs.filter(d => d.data().status === 'pending').length } };
}
