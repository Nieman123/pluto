import { action, api, dialog, esc, message } from './api.js';
import { openOrder } from './orders.js';

export async function adminRsvps(root, eventId, summary, refresh) {
  const counts = { pending: summary.rsvpPending, approved: summary.rsvpApproved, declined: summary.rsvpDeclined, withdrawn: summary.rsvpWithdrawn }, count = state => counts[state];
  let rsvps = [], cursor = null, generation = 0, timer;
  root.innerHTML = `<h2>RSVPs</h2><p role="status">${summary.ready ? `${count('pending')} awaiting approval · ${count('approved')} approved · ${count('declined')} declined · ${count('withdrawn')} withdrawn` : 'RSVP totals are being prepared.'}</p><p>Pending requests do not grant admission or hold capacity. Approval creates a named in-app QR and checks available space.</p><div class="ticket-toolbar"><label>Search RSVPs<input type="search" class="rsvp-search" placeholder="Name or email"></label><label>Show<select class="rsvp-filter"><option value="pending">Awaiting approval</option><option value="all">Everyone</option><option value="approved">Approved</option><option value="declined">Declined</option><option value="withdrawn">Withdrawn</option></select></label><button type="button" class="button button-quiet rsvp-refresh">Refresh RSVPs</button></div><div class="rsvp-rows" tabindex="0" role="region" aria-label="RSVP requests"></div><p class="rsvp-page-count" role="status"></p><button class="button button-quiet rsvp-more" hidden>Load more RSVPs</button>`;
  const search = root.querySelector('.rsvp-search'), filter = root.querySelector('.rsvp-filter');
  if (summary.ready && !count('pending')) filter.value = 'all';
  function draw() {
    const matches = rsvps;
    root.querySelector('.rsvp-rows').innerHTML = matches.length ? matches.map(o => `<article class="guest-row"><div><strong>${esc(o.name)}</strong><p>${esc(o.email)}</p><p>${esc(o.rsvpStatus === 'pending' ? 'Awaiting approval' : o.rsvpStatus)} · ${esc(new Date(o.createdAt).toLocaleString())}</p>${o.decisionNote ? `<p>${esc(o.decisionNote)}</p>` : ''}</div><div class="ticket-toolbar">${o.rsvpStatus === 'pending' ? `<button class="button button-primary" type="button" data-rsvp-decision="approve" data-order="${esc(o.orderId)}" aria-label="Approve RSVP: ${esc(o.name)}">Approve</button><button class="button button-quiet" type="button" data-rsvp-decision="decline" data-order="${esc(o.orderId)}" aria-label="Decline RSVP: ${esc(o.name)}">Decline</button>` : o.rsvpStatus === 'approved' ? `<button class="button button-quiet" type="button" data-rsvp-decision="withdraw" data-order="${esc(o.orderId)}" aria-label="Withdraw RSVP: ${esc(o.name)}">Withdraw RSVP</button>` : ''}</div></article>`).join('') : '<p>No RSVPs match this view.</p>';
    root.querySelectorAll('[data-rsvp-decision]').forEach(button => button.onclick = () => {
      const order = rsvps.find(o => o.orderId === button.dataset.order), decision = button.dataset.rsvpDecision;
      const content = dialog(`<h2>${decision === 'approve' ? 'Approve' : decision === 'decline' ? 'Decline' : 'Withdraw'} RSVP</h2><p>${esc(order.name)} · ${esc(order.email)}</p><p>${decision === 'approve' ? 'Approval grants this person admission and creates their in-app QR.' : decision === 'decline' ? 'This person will not receive an admission QR.' : 'This revokes the admission QR and frees unused capacity. A guest who has arrived cannot be withdrawn.'}</p><form id="rsvp-decision-form">${decision === 'withdraw' ? '' : '<label>Note to attendee (optional)<textarea name="note" maxlength="500"></textarea></label>'}<p class="rsvp-error" role="alert"></p><button class="button button-primary" type="submit">${decision === 'approve' ? 'Approve RSVP' : decision === 'decline' ? 'Decline RSVP' : 'Withdraw RSVP'}</button></form>`);
      content.querySelector('form').onsubmit = event => { event.preventDefault(); action(event.submitter, async () => {
        try {
          await api(decision === 'withdraw' ? 'staff/rsvp/withdraw' : 'staff/rsvp/review', { eventId, orderId: order.orderId, decision, note: new FormData(event.target).get('note') || '' });
        } catch (error) { content.querySelector('.rsvp-error').textContent = error.message; return; }
        document.querySelector('#ticketing-dialog').close(); await refresh(); message(`RSVP ${decision === 'approve' ? 'approved' : decision === 'decline' ? 'declined' : 'withdrawn'}.`);
      }); };
    });
    root.querySelectorAll('.guest-row').forEach((row, index) => {
      const button = document.createElement('button'); button.className = 'button button-quiet'; button.textContent = 'Details & support';
      button.onclick = () => action(button, () => openOrder(matches[index].orderId, { refresh })); row.querySelector('.ticket-toolbar').append(button);
    });
  }
  const more = root.querySelector('.rsvp-more'), countText = root.querySelector('.rsvp-page-count');
  async function load(reset = false) {
    const version = ++generation;
    if (reset) { cursor = null; rsvps = []; }
    countText.textContent = 'Loading RSVPs…'; more.hidden = true;
    const result = await api('staff/orders', { eventId, cursor, limit: 50, method: 'rsvp', search: search.value, rsvpStatus: filter.value });
    if (version !== generation || !search.isConnected) return;
    rsvps.push(...result.orders); cursor = result.cursor; draw();
    countText.textContent = rsvps.length + ' RSVPs shown.' + (result.hasMore ? ' Load more to continue through older requests.' : ' End of results.');
    more.hidden = !result.hasMore;
  }
  search.oninput = () => { clearTimeout(timer); generation++; more.hidden = true; timer = setTimeout(() => action(null, () => load(true)), 250); };
  filter.onchange = () => action(null, () => load(true));
  more.onclick = event => action(event.currentTarget, () => load());
  await load(true);
  root.querySelector('.rsvp-refresh').onclick = event => action(event.currentTarget, refresh);
}
