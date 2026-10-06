import { FieldPath, type Firestore } from 'firebase-admin/firestore';
import { fail, hash, id, integer, text } from './domain';

export function safeOrderRow(orderId: string, o: any) {
  return { orderId, eventId: o.eventId, eventTitle: o.eventTitle || '', name: o.name, email: o.email, status: o.status, method: o.method,
    rsvpStatus: o.rsvpStatus || '', decisionNote: o.decisionNote || '', total: o.total, discount: o.discount || 0, taxAmount: o.taxAmount || 0,
    refundedAmount: o.refundedAmount || 0, externalRefundAmount: o.externalRefundAmount || 0, stripeFee: o.stripeFee ?? null,
    createdAt: o.createdAt, promoterId: o.promoterId || '', reviewReason: o.financialReviewReason || o.reviewReason || '' };
}
export async function orderPage(db: Firestore, raw: any) {
  const limit = integer(raw.limit ?? 50, 'page size', 1, 100), search = text(raw.search || '', 'order search', 254).trim().toLowerCase();
  const eventId = raw.eventId ? id(raw.eventId) : '', status = text(raw.status || '', 'order status', 40);
  const method = raw.method === 'rsvp' && eventId ? 'rsvp' : '', rsvpStatus = text(raw.rsvpStatus || '', 'RSVP status', 40), excludeExpired = raw.excludeExpired === true;
  const scope = hash(JSON.stringify([eventId, status, method, rsvpStatus, excludeExpired, search]));
  if (raw.cursor && raw.cursor.scope !== scope) fail('Order filters changed. Restart from the first page.');
  let cursor = raw.cursor ? { createdAt: integer(raw.cursor.createdAt, 'order cursor', 0, Number.MAX_SAFE_INTEGER), orderId: id(raw.cursor.orderId), scope } : null;
  const orders: any[] = []; let scanned = 0, hasMore = false;
  // Index the event/status predicates; bound substring searches per request.
  while (scanned < 500 && orders.length < limit) {
    const size = Math.min(search || rsvpStatus || excludeExpired ? 100 : limit, 500 - scanned);
    let query = db.collection('ticketingOrders').orderBy('createdAt', 'desc').orderBy(FieldPath.documentId(), 'desc').limit(size);
    if (eventId) query = query.where('eventId', '==', eventId);
    if (status) query = query.where('status', '==', status);
    if (method) query = query.where('method', '==', method);
    if (cursor) query = query.startAfter(cursor.createdAt, cursor.orderId);
    const page = await query.get(); hasMore = page.size === size;
    for (let i = 0; i < page.docs.length; i++) {
      const doc = page.docs[i], o = doc.data(); scanned++; cursor = { createdAt: o.createdAt, orderId: doc.id, scope };
      if ((!excludeExpired || o.status !== 'expired') && (!rsvpStatus || rsvpStatus === 'all' || o.rsvpStatus === rsvpStatus) &&
        (!search || `${o.name} ${o.email} ${doc.id} ${o.eventTitle}`.toLowerCase().includes(search))) orders.push(safeOrderRow(doc.id, o));
      if (orders.length === limit) { hasMore = i < page.docs.length - 1 || hasMore; break; }
    }
    if (!hasMore) break;
  }
  return { orders, cursor: hasMore ? cursor : null, hasMore, scanned };
}
