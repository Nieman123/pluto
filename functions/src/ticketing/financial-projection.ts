import { FieldPath, type Firestore } from 'firebase-admin/firestore';
import { randomUUID } from 'node:crypto';
import { campaignNeedsWork } from './campaign-policy';
import { WorkBudget, processBatch } from './worker-batch';

export const financialSchema = 1;
export const financialKeys = ['orderCount', 'paidOrders', 'tickets', 'gross', 'discounts', 'tax', 'refunds', 'fees', 'pendingFees', 'reviews', 'cash', 'comps', 'revenueGross', 'legacyDates', 'missingDates', 'rsvpTotal', 'rsvpPending', 'rsvpApproved', 'rsvpDeclined', 'rsvpWithdrawn'] as const;
const empty = () => Object.fromEntries(financialKeys.map(key => [key, 0])) as Record<string, number>;
const amount = (value: any) => Number.isSafeInteger(value) ? value : 0;
export function financialTotals(totals: Record<string, number>) {
  return { ...totals, provisional: totals.pendingFees > 0 || totals.reviews > 0, proceeds: totals.gross - totals.refunds - totals.tax - totals.fees };
}
export function localRevenueDay(at: number, timezone: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(at)).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
export const shiftRevenueDay = (day: string, delta: number) => new Date(Date.parse(`${day}T12:00:00Z`) + delta * 86400000).toISOString().slice(0, 10);
export function orderContribution(order: any, timezone: string) {
  const totals = empty();
  if (!order) return { totals, day: '', dayGross: 0, dayOrders: 0 };
  totals.orderCount = 1;
  if (order.method === 'rsvp') {
    totals.rsvpTotal = 1;
    const key = { pending: 'rsvpPending', approved: 'rsvpApproved', declined: 'rsvpDeclined', withdrawn: 'rsvpWithdrawn' }[order.rsvpStatus as string];
    if (key) totals[key] = 1;
  }
  if (order.status !== 'paid') return { totals, day: '', dayGross: 0, dayOrders: 0 };
  totals.paidOrders = 1; totals.tickets = order.units?.length || 0;
  totals.gross = amount(order.total); totals.discounts = amount(order.discount);
  totals.tax = amount(order.taxAmount) - amount(order.refundedTaxAmount);
  totals.refunds = amount(order.refundedAmount) + amount(order.externalRefundAmount);
  totals.fees = amount(order.stripeFee);
  totals.pendingFees = Number(order.method === 'stripe' && order.total > 0 && (order.stripeFeeStatus !== 'confirmed' || !Number.isSafeInteger(order.stripeFee)));
  totals.reviews = Number(!!order.financialBlocked || order.externalRefundAmount > 0);
  totals.cash = order.method === 'cash' ? totals.gross : 0; totals.comps = Number(order.method === 'comp');
  totals.revenueGross = Math.max(0, totals.gross);
  const at = order.paidAt ?? order.createdAt;
  totals.missingDates = Number(totals.revenueGross > 0 && !Number.isFinite(at));
  totals.legacyDates = Number(totals.revenueGross > 0 && Number.isFinite(at) && !Number.isFinite(order.paidAt));
  return { totals, day: totals.revenueGross > 0 && Number.isFinite(at) ? localRevenueDay(at, timezone) : '', dayGross: totals.revenueGross, dayOrders: Number(totals.revenueGross > 0) };
}
const summaryRef = (db: Firestore, eventId: string) => db.collection('ticketingFinancialSummaries').doc(eventId);
const jobRef = (db: Firestore, eventId: string) => db.collection('ticketingFinancialBackfills').doc(eventId);

// Read the CURRENT ledger in the transaction, never a possibly out-of-order
// trigger payload. The stored per-order contribution makes retries idempotent.
export async function syncFinancialOrder(db: Firestore, orderId: string) {
  await db.runTransaction(async tx => {
    const orderRef = db.collection('ticketingOrders').doc(orderId), projectionRef = db.collection('ticketingOrderSummaries').doc(orderId);
    const [orderSnap, priorSnap] = await tx.getAll(orderRef, projectionRef);
    const order = orderSnap.data(), prior = priorSnap.data();
    if (!order && !prior) return;
    const event = order ? (await tx.get(db.collection('ticketingEvents').doc(order.eventId))).data() : null;
    const timezone = event?.draft?.timezone || 'America/New_York';
    const next = order ? { eventId: order.eventId, timezone, ...orderContribution(order, timezone) } : null;
    const eventIds = [...new Set([prior?.eventId, next?.eventId].filter(Boolean))] as string[];
    const states = await tx.getAll(...eventIds.map(eid => summaryRef(db, eid)));
    const generations = states.map(doc => doc.data()?.schema === financialSchema && doc.data()?.generation || randomUUID());
    if (next) Object.assign(next, { generation: generations[eventIds.indexOf(next.eventId)] });
    const signature = (v: any) => v ? JSON.stringify([v.eventId, v.timezone, v.generation, v.day, v.dayGross, v.dayOrders, ...financialKeys.map(key => v.totals[key])]) : '';
    if (signature(next) === signature(prior)) return;
    const now = Date.now();
    eventIds.forEach((eid, index) => {
      const state = states[index].data() || {}, zone = next?.eventId === eid ? timezone : prior!.timezone;
      const generation = generations[index], validState = state.generation === generation;
      const totals = { ...empty(), ...(validState ? state.totals : {}) }, today = localRevenueDay(now, zone), first = shiftRevenueDay(today, -89);
      const daily: Record<string, { gross: number; orders: number }> = Object.fromEntries(Object.entries(validState ? state.daily || {} : {}).filter(([date]) => date >= first && date <= today)) as any;
      for (const [value, sign] of [[prior, -1], [next, 1]] as const) if (value?.eventId === eid) {
        if ((value as any).generation !== generation) continue;
        financialKeys.forEach(key => { totals[key] += sign * (value.totals[key] || 0); });
        if (value.day && value.day >= first && value.day <= today) {
          const day = daily[value.day] ||= { gross: 0, orders: 0 };
          day.gross += sign * value.dayGross; day.orders += sign * value.dayOrders;
        }
      }
      tx.set(summaryRef(db, eid), { schema: financialSchema, generation, timezone: zone, totals, daily, updatedAt: now,
        ready: !!state.ready && validState && state.timezone === zone });
      if (!validState || state.timezone !== zone) tx.set(jobRef(db, eid), { status: 'pending', cursor: '', timezone: zone, requestedAt: now, wakeRevision: now }, { merge: true });
    });
    if (next) tx.set(projectionRef, next); else tx.delete(projectionRef);
  });
}

export async function financialSummary(db: Firestore, eventId: string, timezone: string, days = 90) {
  const ref = summaryRef(db, eventId), job = jobRef(db, eventId);
  await db.runTransaction(async tx => {
    const [summary, backfill] = await tx.getAll(ref, job), state = summary.data(), work = backfill.data();
    if (!state?.generation || state.timezone !== timezone || state.schema !== financialSchema || !state.ready && work?.status !== 'pending') {
      const reset = !state?.generation || state.schema !== financialSchema;
      tx.set(ref, { ready: false, ...(reset ? { generation: randomUUID(), schema: financialSchema, timezone, totals: empty(), daily: {} } : {}) }, { merge: true });
      if (reset || work?.status !== 'pending' || work.timezone !== timezone) tx.set(job, { status: 'pending', cursor: '', timezone, requestedAt: Date.now(), wakeRevision: Date.now(), leaseUntil: 0, leaseId: null }, { merge: true });
    }
  });
  const state = (await ref.get()).data() || {}, totals = { ...empty(), ...state.totals };
  const today = localRevenueDay(Date.now(), timezone), weekStart = shiftRevenueDay(today, -(new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7), previousWeekStart = shiftRevenueDay(weekStart, -7);
  const daily = Array.from({ length: days }, (_, i) => { const date = shiftRevenueDay(today, 1 - days + i); return { date, ...(state.daily?.[date] || { gross: 0, orders: 0 }) }; });
  const sum = (from: string, until: string) => Object.entries(state.daily || {}).reduce((n, [date, value]: any) => n + (date >= from && date < until ? value.gross : 0), 0);
  return { ...financialTotals(totals),
    ready: !!state.ready && state.timezone === timezone, updatedAt: state.updatedAt || null,
    revenue: { gross: totals.revenueGross, thisWeek: sum(weekStart, shiftRevenueDay(today, 1)), lastWeek: sum(previousWeekStart, weekStart), daily, timezone, legacyDates: totals.legacyDates, missingDates: totals.missingDates } };
}

export const financialBackfillNeedsWork = campaignNeedsWork;
export async function financialBackfillPage(db: Firestore, eventId: string) {
  const ref = jobRef(db, eventId), leaseId = randomUUID();
  const job = await db.runTransaction(async tx => {
    const state = (await tx.get(ref)).data();
    if (!state || state.status !== 'pending' || state.leaseUntil > Date.now()) return null;
    tx.update(ref, { leaseId, leaseUntil: Date.now() + 150000 }); return state;
  });
  if (!job) return;
  try {
    let query = db.collection('ticketingOrders').where('eventId', '==', eventId).orderBy(FieldPath.documentId()).limit(100);
    if (job.cursor) query = query.startAfter(job.cursor);
    const page = await query.get();
    const budget = new WorkBudget(90000); let processed = 0;
    for (const doc of page.docs) { if (!budget.available) break; await syncFinancialOrder(db, doc.id); processed++; }
    await db.runTransaction(async tx => {
      const current = (await tx.get(ref)).data(), event = (await tx.get(db.collection('ticketingEvents').doc(eventId))).data();
      if (current?.leaseId !== leaseId) return;
      if (!event) { tx.update(ref, { status: 'cancelled', leaseUntil: 0 }); return; }
      if (current.cursor !== job.cursor || current.timezone !== job.timezone || event.draft.timezone !== job.timezone) {
        tx.update(ref, { status: 'pending', cursor: '', timezone: event.draft.timezone, leaseUntil: 0, wakeRevision: (current.wakeRevision || 0) + 1 }); return;
      }
      const done = processed === page.size && page.size < 100;
      tx.update(ref, { status: done ? 'done' : 'pending', cursor: done ? '' : page.docs[processed - 1]?.id || job.cursor, leaseUntil: 0, completedAt: done ? Date.now() : null });
      if (done) tx.set(summaryRef(db, eventId), { schema: financialSchema, timezone: job.timezone, ready: true, updatedAt: Date.now() }, { merge: true });
    });
  } catch (error) {
    await db.runTransaction(async tx => { if ((await tx.get(ref)).data()?.leaseId === leaseId) tx.update(ref, { leaseUntil: 0, lastErrorAt: Date.now() }); }); throw error;
  }
}
export async function financialRecovery(db: Firestore, budget = new WorkBudget()) {
  return processBatch(db, 'ticketingFinancialBackfills', ['pending'], 100, async doc => {
    await db.runTransaction(async tx => { const job = (await tx.get(doc.ref)).data(); if (job?.status === 'pending' && !(job.leaseUntil > Date.now())) tx.update(doc.ref, { wakeRevision: (job.wakeRevision || 0) + 1 }); });
  }, budget);
}
