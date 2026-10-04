import { accessKey, action, api, dialog, esc, money } from './api.js';

const date = (value, timezone) => value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short', ...(timezone ? { timeZone: timezone } : {}) }).format(new Date(value)) : '—';
const label = value => String(value || '—').replaceAll('-', ' ');
function detail(label, value) { return `<div><dt>${esc(label)}</dt><dd>${esc(value ?? '—')}</dd></div>`; }

function orderRows(root, orders, { includeEvent = false, refresh, openEvent } = {}) {
  root.innerHTML = orders.length ? orders.map(o => `<tr>${includeEvent ? `<td class="order-event">${esc(o.eventTitle)}</td>` : ''}<td class="order-contact">${esc(o.name)}<br>${esc(o.email)}</td><td>${esc(date(o.createdAt))}</td><td>${esc(label(o.rsvpStatus || o.status))}</td><td>${esc(label(o.method))}</td><td class="order-money">${money(o.total)}</td><td>${esc(o.promoterId || '—')}</td><td>${esc(o.reviewReason || '—')}</td><td class="order-actions"><button class="button button-quiet" data-open-order="${esc(o.orderId)}" aria-label="Details for ${esc(o.name)}: ${esc(o.orderId)}">Details</button></td></tr>`).join('') : `<tr><td colspan="${includeEvent ? 9 : 8}">No orders found.</td></tr>`;
  root.querySelectorAll('[data-open-order]').forEach(button => button.onclick = () => action(button, () => openOrder(button.dataset.openOrder, { refresh, openEvent })));
}
function table(includeEvent = false, id = 'order-rows') {
  return `<div class="table-scroll" tabindex="0" role="region" aria-label="${includeEvent ? 'All event orders' : 'Event orders'}"><table class="ticket-table orders-table"><thead><tr>${includeEvent ? '<th>Event</th>' : ''}<th>Buyer</th><th>Ordered</th><th>Status</th><th>Method</th><th>Total</th><th>Promoter</th><th>Review</th><th>Actions</th></tr></thead><tbody id="${id}"></tbody></table></div>`;
}
export function eventOrders(root, orders, { refresh, openEvent, exportOrders, retry } = {}) {
  root.innerHTML = `<h3>Orders</h3><p>Open an order to see buyer details, individual tickets and check-in status.</p><div class="ticket-toolbar"><input id="order-filter" type="search" aria-label="Search orders" placeholder="Search buyer, email or order"><button class="button button-quiet" id="order-export">Export CSV</button>${retry ? '<button class="button button-quiet" id="order-reconcile">Retry pending jobs</button>' : ''}</div>${table()}`;
  const rows = query => orderRows(root.querySelector('#order-rows'), orders.filter(o => `${o.name} ${o.email} ${o.orderId}`.toLowerCase().includes(query.toLowerCase())), { refresh, openEvent });
  rows(''); root.querySelector('#order-filter').oninput = e => rows(e.target.value);
  root.querySelector('#order-export').onclick = e => action(e.currentTarget, exportOrders);
  if (retry) root.querySelector('#order-reconcile').onclick = e => action(e.currentTarget, retry);
}
export async function allOrders(root, events, openEvent) {
  root.innerHTML = `<h2>All Orders</h2><p>Manage purchases and RSVPs across every event.</p><form id="all-order-filters"><div class="form-grid"><label>Search orders<input name="search" type="search" maxlength="254" placeholder="Buyer, email, order ID or event"></label><label>Event<select name="eventId"><option value="">All events</option>${events.map(e => `<option value="${esc(e.id)}">${esc(e.title)}</option>`).join('')}</select></label><label>Order status<select name="status"><option value="">All statuses</option>${['paid', 'pending-approval', 'declined', 'withdrawn', 'open', 'provisioning', 'expired', 'cancelled'].map(s => `<option value="${s}">${esc(label(s))}</option>`).join('')}</select></label></div><div class="ticket-toolbar"><button class="button button-primary" type="submit">Apply filters</button><button class="button button-quiet" id="all-order-refresh" type="button">Refresh orders</button></div></form><p id="all-order-count" role="status"></p>${table(true, 'all-order-rows')}<button class="button button-quiet" id="all-order-more" hidden>Load more orders</button>`;
  let orders = [], cursor = null, filters = {}, generation = 0;
  const form = root.querySelector('form'), more = root.querySelector('#all-order-more'), count = root.querySelector('#all-order-count');
  async function load(reset = false) {
    const version = ++generation;
    if (reset) { filters = Object.fromEntries(new FormData(form)); cursor = null; orders = []; }
    count.textContent = 'Loading orders…'; more.hidden = true;
    const result = await api('staff/all-orders', { ...filters, cursor, limit: 50 });
    if (version !== generation || !form.isConnected) return;
    orders.push(...result.orders); cursor = result.cursor;
    orderRows(root.querySelector('#all-order-rows'), orders, { includeEvent: true, refresh: () => load(true), openEvent });
    count.textContent = `${orders.length} order${orders.length === 1 ? '' : 's'} shown.${result.hasMore ? ' Load more to continue through older orders.' : ' End of results.'}`;
    more.hidden = !result.hasMore;
  }
  form.onsubmit = e => { e.preventDefault(); action(e.submitter, () => load(true)); };
  root.querySelector('#all-order-refresh').onclick = e => action(e.currentTarget, () => load(true));
  more.onclick = e => action(e.currentTarget, () => load());
  await load(true);
}

export async function openOrder(orderId, { refresh: changed, openEvent } = {}) {
  const content = dialog('<h2>Order details</h2><p>Loading order…</p>'), attempts = new Map();
  document.querySelector('#ticketing-dialog').scrollTop = 0;
  let order, notice = '', errorNotice = false, refundAttempt = accessKey(), selected;
  async function run(button, fn) {
    return action(button, async () => { try { await fn(); } catch (error) { notice = error.message; errorNotice = true; const status = content.querySelector('[data-order-notice]'); status.textContent = notice; status.classList.add('error'); } });
  }
  async function draw() {
    order = await api('staff/order', { orderId });
    const scroll = document.querySelector('#ticketing-dialog').scrollTop;
    content.innerHTML = `<h2>Order details</h2><h3>${esc(order.eventTitle)}</h3><div class="ticket-toolbar"><button class="button button-quiet" id="order-detail-refresh">Refresh order</button><button class="button button-quiet" id="order-detail-tickets">Jump to tickets</button>${openEvent ? '<button class="button button-quiet" id="order-detail-event">Open event dashboard</button>' : ''}${/^https:\/\//.test(order.receiptUrl) ? `<a class="button button-quiet" href="${esc(order.receiptUrl)}" target="_blank" rel="noopener noreferrer">Payment receipt ↗</a>` : ''}</div><p data-order-notice class="${errorNotice ? 'error' : ''}" role="status" aria-live="polite">${esc(notice)}</p>
    <section><h3>Buyer & order</h3><dl class="order-details">${detail('Buyer', order.name)}${detail('Purchase email', order.email)}${detail('Order ID', order.orderId)}${detail('Status', label(order.status))}${detail('Method', label(order.method))}${detail('Ordered', date(order.createdAt, order.timezone))}${detail('Paid / confirmed', date(order.paidAt, order.timezone))}${detail('Event timezone', order.timezone)}${order.rsvpStatus ? detail('RSVP', label(order.rsvpStatus)) : ''}${detail('Promo code', order.promoCode || '—')}${detail('Promoter', order.promoterId || '—')}</dl>${order.decisionNote ? `<p>${esc(order.decisionNote)}</p>` : ''}${order.financialBlocked || order.reviewReason ? `<p class="order-review" role="status">${esc(order.reviewReason || 'Payment requires staff review. Admission is blocked.')}</p>` : ''}</section>
    <section><h3>Payment & refunds</h3><dl class="order-details">${detail('Total paid / due', money(order.total))}${detail('Discount', money(order.discount))}${detail('Inclusive tax', money(order.taxAmount))}${detail('Refunded', money(order.refundedAmount))}${detail('Refund awaiting ticket mapping', money(order.externalRefundAmount))}${detail('Stripe payment fee', order.method !== 'stripe' || !order.total ? 'Not applicable' : order.stripeFee === null ? 'Pending' : money(order.stripeFee))}${order.paymentIntentId ? detail('Stripe payment reference', order.paymentIntentId) : ''}${order.sessionId ? detail('Stripe checkout reference', order.sessionId) : ''}</dl></section>
    <section data-individual-tickets><h3>Individual tickets</h3><p>Check in only the ticket belonging to the person who has arrived. Other tickets in this order remain available.</p><div class="order-ticket-list">${order.tickets.length ? order.tickets.map(t => `<article class="order-ticket" data-order-ticket="${esc(t.id)}"><h4>Ticket ${t.number} · ${esc(t.name)}</h4><dl class="order-details">${detail('Current holder', t.holderName)}${detail('Holder email', t.holderEmail)}${detail('Ticket ID', t.id)}${detail('Ticket status', label(t.status))}${detail('Price paid', money(t.amount))}${detail('Admission starts', date(t.validFrom, order.timezone))}${detail('Admission ends', date(t.validUntil, order.timezone))}${t.admission ? detail('Checked in', date(t.admission.at, order.timezone)) + detail('Checked in by', t.admission.uid) : ''}</dl>${t.admission ? '<p class="order-check-in-status">✓ Checked in</p>' : `<p>${esc(t.checkInReason || 'Not checked in')}</p>${order.permissions.canCheckIn ? `<button class="button button-primary" data-check-in="${esc(t.id)}" aria-label="Check in ticket ${t.number}: ${esc(t.name)}" ${t.canCheckIn ? '' : 'disabled'}>Check in this ticket</button>` : ''}`}</article>`).join('') : '<p>No tickets have been issued for this order yet.</p>'}</div></section>
    ${order.method === 'rsvp' ? '<p>RSVPs have no payment to refund. Approval and withdrawal are managed in the event dashboard.</p>' : order.permissions.canRefund ? `<section><h3>Refund exceptions</h3><p>All ticket sales are final. Approve a refund only when Pluto has agreed to an exception.</p><form id="refund-form">${order.tickets.map(t => `<label><input type="checkbox" name="ticket" value="${esc(t.id)}" ${t.status !== 'valid' ? 'disabled' : ''}> Ticket ${t.number} · ${esc(t.name)} · ${money(t.amount)} · ${esc(label(t.status))}${t.admission ? ' · already admitted (capacity will not reopen)' : ''}</label>`).join('')}${order.externalRefundAmount ? `<p>An existing Stripe refund of ${money(order.externalRefundAmount)} needs ticket mapping.</p><button type="button" class="button button-quiet" id="map-dashboard-refund">Map existing refund to selected tickets</button>` : ''}<button class="button button-primary" type="submit" ${order.externalRefundAmount || order.status !== 'paid' ? 'disabled' : ''}>Approve selected ticket refunds</button></form><p>Refunds return to the original payment method. Cash refunds must be returned at the till.</p></section>` : ''}
    ${order.refunds.length ? `<section><h3>Refund history</h3>${order.refunds.map(r => `<article class="order-activity"><strong>${money(r.amount)} · ${esc(label(r.status))}</strong><p>${esc(date(r.createdAt, order.timezone))}${r.approvedBy ? ` · Approved by ${esc(r.approvedBy)}` : ''}${r.external ? ' · Stripe Dashboard refund' : ''}</p><p>Tickets: ${esc(r.ticketIds.map(id => order.tickets.find(t => t.id === id)?.number || id).join(', '))}</p>${r.taxReviewRequired ? '<p>Tax reporting requires review.</p>' : ''}</article>`).join('')}</section>` : ''}
    ${order.permissions.canResolve && order.method === 'stripe' && order.total > 0 && order.status !== 'paid' ? `<form id="checkout-resolution-form"><h3>Resolve checkout reservation</h3><p>Creation state: ${esc(order.providerState)}. Verify payment with Stripe before releasing inventory.</p><label>Stripe Session ID (optional)<input name="sessionId" placeholder="cs_test_…"></label><label>Resolution note<input name="note" required maxlength="500"></label><button class="button button-quiet">Verify Stripe checkout & resolve reservation</button></form>` : ''}
    ${order.activity.length ? `<section><h3>Order activity</h3>${order.activity.map(a => `<article class="order-activity"><strong>${esc(label(a.action))}</strong><p>${esc(date(a.at, order.timezone))}${a.uid ? ` · ${esc(a.uid)}` : ''}</p>${a.ticketId ? `<p>Ticket ${esc(order.tickets.find(t => t.id === a.ticketId)?.number || a.ticketId)}</p>` : ''}${a.note ? `<p>${esc(a.note)}</p>` : ''}</article>`).join('')}</section>` : ''}`;
    document.querySelector('#ticketing-dialog').scrollTop = scroll;
    content.querySelector('#order-detail-refresh').onclick = e => run(e.currentTarget, draw);
    content.querySelector('#order-detail-tickets').onclick = () => content.querySelector('[data-individual-tickets]').scrollIntoView({ block: 'start' });
    if (openEvent) content.querySelector('#order-detail-event').onclick = e => run(e.currentTarget, async () => { document.querySelector('#ticketing-dialog').close(); await openEvent(order.eventId); });
    content.querySelectorAll('[data-check-in]').forEach(button => button.onclick = e => run(e.currentTarget, async () => {
      const ticketId = button.dataset.checkIn; if (!attempts.has(ticketId)) attempts.set(ticketId, crypto.randomUUID());
      const result = await api('staff/order/check-in', { orderId, ticketId, scanId: attempts.get(ticketId) }); attempts.delete(ticketId);
      notice = result.result === 'accepted' ? 'Ticket checked in. The other tickets in this order have not changed.' : result.result === 'duplicate' ? 'This ticket was already checked in. No additional admission was recorded.' : result.result === 'outside-window' ? 'This ticket is outside its admission window.' : 'Check-in rejected. Review the current ticket and payment status below.';
      errorNotice = !['accepted', 'duplicate'].includes(result.result); await draw(); if (result.result === 'accepted') await changed?.();
    }));
    const refund = content.querySelector('#refund-form');
    if (refund) {
      refund.onsubmit = e => { e.preventDefault(); run(e.submitter, async () => {
        selected ??= new FormData(refund).getAll('ticket'); if (!selected.length) { selected = undefined; throw new Error('Select at least one ticket.'); }
        await api('staff/refund', { orderId, ticketIds: selected, attempt: refundAttempt }); notice = 'Refund approved. Pending refunds remain blocked from admission.'; errorNotice = false; selected = undefined; refundAttempt = accessKey(); await draw(); await changed?.();
      }); };
      content.querySelector('#map-dashboard-refund')?.addEventListener('click', e => run(e.currentTarget, async () => {
        const ticketIds = new FormData(refund).getAll('ticket'); if (!ticketIds.length) throw new Error('Select the tickets covered by this refund.');
        await api('staff/refund-external', { orderId, ticketIds }); notice = 'Existing refund mapped. No additional money was refunded.'; errorNotice = false; await draw(); await changed?.();
      }));
    }
    const resolution = content.querySelector('#checkout-resolution-form');
    if (resolution) resolution.onsubmit = e => { e.preventDefault(); run(e.submitter, async () => { const fields = new FormData(resolution); await api('staff/checkout-resolve', { orderId, sessionId: fields.get('sessionId'), note: fields.get('note') }); notice = 'Checkout reconciled. Review the order status.'; errorNotice = false; await draw(); await changed?.(); }); };
  }
  try { await draw(); } catch (error) { content.innerHTML = `<h2>Order details</h2><p class="error" role="alert">${esc(error.message)}</p>`; throw error; }
}
