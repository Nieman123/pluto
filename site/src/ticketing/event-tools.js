import { accessKey, action, api, dialog, esc, message } from './api.js';
const date = value => value ? new Date(value).toLocaleString() : '—';
function panelAction(root, button, task) {
  return action(button, async () => {
    try { await task(); } catch (error) {
      let status = root.querySelector('[data-panel-error]');
      if (!status) { status = document.createElement('p'); status.dataset.panelError = ''; status.setAttribute('role', 'alert'); root.prepend(status); }
      status.textContent = error.message; status.scrollIntoView({ block: 'nearest' }); throw error;
    }
  });
}
export async function communicationsPanel(eventId) {
  if (!eventId) throw new Error('Select an event first.');
  const root = dialog('<h2>Announcements & reminders</h2><p>Loading event updates…</p>');
  async function draw() {
    const data = await api('staff/communications', { eventId });
    root.innerHTML = `<h2>Announcements & reminders</h2><p>${data.activePasses} active admission passes. Emails go to current confirmed ticket/RSVP holders, once per address. Guest lists contain names only. Free walk-up events have no email audience.</p><p>Schedule changes and cancellations notify attendees automatically when published. Location-release emails link to My tickets. Enable 24-hour and 4-hour reminders in Ticketing setup.</p><form data-announcement><label>Subject / heading<input name="title" maxlength="150" required></label><label>Message<textarea name="body" maxlength="3000" rows="5" required></textarea></label><p>Keep private venue details in Pluto. The email includes an Open Pluto button.</p><article class="announcement-preview" aria-label="Announcement preview"><p class="eyebrow">PLUTO · EVENT UPDATE</p><h3 data-preview-title>Your heading</h3><p data-preview-body>Your message</p><span class="button button-primary">Open Pluto</span></article><button class="button button-primary">Queue announcement emails</button><p data-announcement-status role="status"></p></form><h3>Recent announcements</h3>${data.campaigns.map(c => `<article class="order-activity"><strong>${esc(c.title)}</strong><p>${esc(c.kind)} · ${esc(c.status)} · ${c.queued} email jobs · ${esc(date(c.createdAt))}</p><p>${esc(c.body)}</p></article>`).join('') || '<p>No announcements yet.</p>'}<p>Queued jobs are not proof of delivery. System health tracks email failures.</p>`;
    const form = root.querySelector('[data-announcement]'); let frozen;
    form.oninput = () => { root.querySelector('[data-preview-title]').textContent = form.elements.title.value || 'Your heading'; root.querySelector('[data-preview-body]').textContent = form.elements.body.value || 'Your message'; };
    form.onsubmit = event => { event.preventDefault(); action(event.submitter, async () => {
      if (!frozen) frozen = { eventId, title: form.elements.title.value, body: form.elements.body.value, attempt: accessKey() };
      form.querySelectorAll('input,textarea').forEach(input => { input.disabled = true; });
      try { await api('staff/announcements', frozen); message('Announcement queued. Delivery will continue in the background.'); await draw(); }
      catch (error) { root.querySelector('[data-announcement-status]').textContent = error.message; if ([400, 403, 409].includes(error.status)) { frozen = null; form.querySelectorAll('input,textarea').forEach(input => { input.disabled = false; }); } throw error; }
    }); };
  }
  try { await draw(); } catch (error) { document.querySelector('#ticketing-dialog').close(); throw error; }
}
export async function waitlistPanel(eventId) {
  if (!eventId) throw new Error('Select an event first.');
  const root = dialog('<h2>Waitlist</h2><p>Loading waitlist…</p>'); let entries = [], cursor;
  async function draw(more = false) {
    const data = await api('staff/waitlist', { eventId, ...(more ? { cursor } : {}) }); entries = more ? [...entries, ...data.entries] : data.entries; cursor = data.nextCursor;
    root.innerHTML = `<h2>Waitlist</h2><p>Enable waitlists in Ticketing setup, save, then publish. Each offer reserves one independent admission pass; dependent add-ons are excluded. Available spots are offered in join order with the published claim window. Approval RSVP entries require approval below.</p>${entries.map(e => `<article class="order-activity"><strong>${esc(e.name)} · ${esc(e.offerName)}</strong><p>${esc(e.email)} · ${esc(e.status)} · Joined ${esc(date(e.createdAt))}${e.offerExpiresAt ? ` · Offer expires ${esc(date(e.offerExpiresAt))}` : ''}</p>${['waiting', 'approved'].includes(e.status) && !e.approvedBy ? `<form data-waitlist-approve="${esc(e.id)}"><label>Approval reason<input name="note" required maxlength="500"></label><button class="button button-quiet">Approve for next available spot</button></form>` : ''}</article>`).join('') || '<p>No waitlist entries yet.</p>'}<div class="ticket-toolbar"><button class="button button-quiet" data-waitlist-refresh>Refresh waitlist</button>${cursor ? '<button class="button button-quiet" data-waitlist-more>Load more entries</button>' : ''}</div>`;
    root.querySelector('[data-waitlist-refresh]').onclick = e => panelAction(root, e.currentTarget, () => draw());
    root.querySelector('[data-waitlist-more]')?.addEventListener('click', e => panelAction(root, e.currentTarget, () => draw(true)));
    root.querySelectorAll('[data-waitlist-approve]').forEach(form => form.onsubmit = e => { e.preventDefault(); panelAction(root, e.submitter, async () => { await api('staff/waitlist/approve', { eventId, entryId: form.dataset.waitlistApprove, note: form.elements.note.value }); await draw(); message('Approved. An offer will be emailed when capacity is available.'); }); });
  }
  try { await draw(); } catch (error) { document.querySelector('#ticketing-dialog').close(); throw error; }
}
export async function attendancePanel(eventId) {
  if (!eventId) throw new Error('Select an event first.');
  if (!navigator.onLine) throw new Error('Connect to view live attendance and record exits or re-entry. Offline first arrivals remain in your prepared scanner.');
  const root = dialog('<h2>Door attendance</h2><p>Loading attendance…</p>'); let rows = [], cursor, current, search = '';
  async function draw(more = false) {
    if (!navigator.onLine) throw new Error('Reconnect before updating live attendance.');
    current = await api('staff/attendance', { eventId, ...(more ? { cursor } : {}) }); rows = more ? [...rows, ...current.rows] : current.rows; cursor = current.cursor;
    root.innerHTML = `<h2>Door attendance</h2><div class="ticket-stat-grid">${[['Ticket arrivals', current.counts.tickets], ['RSVP arrivals', current.counts.rsvps], ['Guest-list arrivals', current.counts.guests], ['Walk-up arrivals', current.counts.walkups], ['First arrivals', current.counts.arrivals], ['Recorded inside', current.counts.inside]].map(([label, value]) => `<div class="ticket-stat"><span>${label}</span><strong>${value}</strong></div>`).join('')}</div><p>Checked ${esc(date(current.checkedAt))}. Recorded inside depends on staff recording every exit and re-entry. Offline arrivals appear after synchronization; this is not a venue capacity guarantee.</p>${current.free ? `<form data-walkup><h3>Free-event walk-up counter</h3><p>${current.walkups.inside} inside · ${current.walkups.exits} exits · ${current.walkups.reentries} re-entries</p><label>Number of people<input name="quantity" type="number" min="1" max="500" value="1" required></label><label>Action<select name="action"><option value="arrive">First arrival</option><option value="exit">Exit</option><option value="reenter">Re-entry</option></select></label><button class="button button-primary">Record walk-up count</button></form>` : ''}<div class="ticket-toolbar"><label>Search shown attendees<input data-attendance-search value="${esc(search)}" placeholder="Name or pass"></label><button class="button button-quiet" data-attendance-refresh>Refresh attendance</button></div><div data-attendance-rows></div>${cursor ? '<button class="button button-quiet" data-attendance-more>Load more attendees</button>' : ''}`;
    function display() {
      const list = root.querySelector('[data-attendance-rows]');
      list.innerHTML = rows.filter(r => `${r.name} ${r.pass} ${r.source}`.toLowerCase().includes(search.toLowerCase())).map(r => `<article class="order-activity"><strong>${esc(r.name)}</strong><p>${esc(r.source)} · ${esc(r.pass)} · ${r.arrivedAt ? r.inside ? 'Inside' : 'Outside' : 'Not arrived'}${r.valid ? '' : ' · Pass unavailable'}</p>${r.arrivedAt ? `<button class="button button-quiet" data-door-row="${esc(r.key)}" ${!r.valid && !r.inside ? 'disabled' : ''}>${r.inside ? 'Record exit' : 'Record re-entry'}</button>` : ''}</article>`).join('') || '<p>No matching attendees in the loaded pages.</p>';
      list.querySelectorAll('[data-door-row]').forEach(button => { const row = rows.find(r => r.key === button.dataset.doorRow); let pending; button.onclick = e => panelAction(root, e.currentTarget, async () => { pending ||= { eventId, kind: row.kind, id: row.id, action: row.inside ? 'exit' : 'reenter', version: row.version, attempt: accessKey() }; await api('staff/attendance/move', pending); await draw(); }); });
    }
    display(); root.querySelector('[data-attendance-search]').oninput = e => { search = e.target.value; display(); };
    root.querySelector('[data-attendance-refresh]').onclick = e => panelAction(root, e.currentTarget, () => draw()); root.querySelector('[data-attendance-more]')?.addEventListener('click', e => panelAction(root, e.currentTarget, () => draw(true)));
    const walkup = root.querySelector('[data-walkup]'); let pending;
    if (walkup) walkup.onsubmit = e => {
      e.preventDefault(); panelAction(root, e.submitter, async () => {
        pending ||= { eventId, kind: 'walkup', action: walkup.elements.action.value, quantity: Number(walkup.elements.quantity.value), version: current.walkups.version || 0, attempt: accessKey() };
        walkup.querySelectorAll('input,select').forEach(input => { input.disabled = true; });
        try { await api('staff/attendance/move', pending); await draw(); }
        catch (error) { if ([400, 403, 409].includes(error.status)) { pending = null; walkup.querySelectorAll('input,select').forEach(input => { input.disabled = false; }); } throw error; }
      });
    };
  }
  try { await draw(); } catch (error) { document.querySelector('#ticketing-dialog').close(); throw error; }
}
