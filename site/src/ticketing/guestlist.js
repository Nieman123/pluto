import { accessKey, action, api, dialog, esc, message } from './api.js';

function guestView(root, guests, options, state) {
  const arrived = guests.filter(g => g.arrived).length;
  root.innerHTML = `<h2>Guest list</h2><p class="guest-list-count" role="status">${guests.length} guests · ${arrived} arrived · ${guests.length - arrived} waiting</p>${options.manage ? '<p>Add one name per person. Guest-list admission does not issue tickets or emails and is counted separately from ticket inventory.</p><form class="guest-add-form"><div class="form-grid"><label>Guest names (one per line)<textarea name="names" required placeholder="Alex Rivera&#10;Sam Taylor" aria-describedby="guest-add-help"></textarea></label><label>Door note (optional)<input name="note" maxlength="300" placeholder="Artist guest list"></label></div><p id="guest-add-help">Paste up to 100 names at a time.</p><button class="button button-primary" type="submit">Add guests</button></form>' : `<p>${options.offline ? 'Prepared guest list · Offline arrivals will be queued for confirmation. Use one offline lane.' : 'Search for a name and mark the guest as arrived. No ticket is needed.'}</p>`}<div class="ticket-toolbar"><label class="guest-search">Search guests<input type="search" value="${esc(state.query)}" placeholder="Name or door note"></label><label>Show<select class="guest-filter"><option value="all">Everyone</option><option value="waiting">Waiting</option><option value="arrived">Arrived</option></select></label><button class="button button-quiet guest-refresh" type="button" ${options.offline ? 'disabled' : ''}>Refresh guest list</button></div><div class="guest-rows"></div>`;
  const search = root.querySelector('input[type=search]'), filter = root.querySelector('.guest-filter'), rows = root.querySelector('.guest-rows'); filter.value = state.filter;
  rows.tabIndex = 0; rows.setAttribute('role', 'region'); rows.setAttribute('aria-label', 'Guest names');
  function drawRows() {
    const matches = guests.filter(g => `${g.name} ${g.note}`.toLowerCase().includes(state.query.toLowerCase()) && (state.filter === 'all' || (state.filter === 'arrived') === !!g.arrived));
    rows.innerHTML = matches.length ? matches.map(g => `<article class="guest-row ${g.arrived ? 'guest-arrived' : ''}"><div><strong>${esc(g.name)}</strong>${g.note ? `<p>${esc(g.note)}</p>` : ''}<p>${g.arrived ? `Arrived ${esc(new Date(g.arrived.at).toLocaleString())}${g.arrived.pending ? ' · Awaiting sync' : ` · ${esc(g.arrived.label)}`}` : 'Waiting for arrival'}</p></div><div class="ticket-toolbar">${options.arrive ? `<button class="button ${g.arrived ? 'button-quiet' : 'button-primary'}" type="button" data-arrive-guest="${esc(g.id)}" aria-label="${g.arrived ? 'Arrived' : 'Mark arrived'}: ${esc(g.name)}" ${g.arrived ? 'disabled' : ''}>${g.arrived ? '✓ Arrived' : 'Mark arrived'}</button>` : ''}${options.manage ? `<button class="button button-quiet" type="button" data-edit-guest="${esc(g.id)}" aria-label="Edit guest: ${esc(g.name)}">Edit</button>` : ''}</div></article>`).join('') : `<p>${guests.length ? 'No guests match your search.' : 'No guests on the list yet.'}</p>`;
    rows.querySelectorAll('[data-arrive-guest]').forEach(button => button.onclick = () => action(button, async () => {
      const result = await options.arrive(button.dataset.arriveGuest);
      await options.refresh();
      if (!['accepted', 'duplicate'].includes(result.result)) throw new Error(result.result === 'outside-window' ? 'Guest check-in is outside the event admission window.' : 'This guest is no longer on the list.');
      message(`${result.name} ${result.result === 'duplicate' ? 'was already marked as arrived' : 'has arrived'}${result.offline ? ' · Offline: queued for confirmation' : ''}.`);
    }));
    rows.querySelectorAll('[data-edit-guest]').forEach(button => button.onclick = () => options.edit(guests.find(g => g.id === button.dataset.editGuest)));
  }
  search.oninput = () => { state.query = search.value; drawRows(); }; filter.onchange = () => { state.filter = filter.value; drawRows(); }; drawRows();
  root.querySelector('.guest-refresh').onclick = event => action(event.currentTarget, options.refresh);
  if (options.manage) {
    let pending;
    root.querySelector('.guest-add-form').onsubmit = event => { event.preventDefault(); action(event.submitter, async () => {
      const form = new FormData(event.target), names = String(form.get('names')).split(/\r?\n/).map(n => n.trim()).filter(Boolean), note = String(form.get('note') || '').trim();
      const signature = JSON.stringify({ names, note });
      if (pending?.signature !== signature) pending = { signature, names, note, attempt: accessKey() };
      const result = await options.add(pending); pending = null; await options.refresh(); message(`${result.added} guest${result.added === 1 ? '' : 's'} added to the list.`);
    }); };
  }
}
export async function adminGuestList(root, eventId) {
  const state = { query: '', filter: 'all' };
  async function refresh() {
    const { guests } = await api('staff/guestlist', { eventId }); if (!root.isConnected) return;
    guestView(root, guests, { manage: true, refresh, add: data => api('staff/guestlist/add', { eventId, ...data }), arrive: guestId => api('staff/guestlist/arrive', { eventId, guestId, scanId: crypto.randomUUID() }), edit: guest => {
      const content = dialog(`<h2>Edit guest</h2><form id="guest-edit-form"><label>Guest name<input name="name" maxlength="100" required value="${esc(guest.name)}"></label><label>Door note<input name="note" maxlength="300" value="${esc(guest.note)}"></label><div class="ticket-toolbar"><button class="button button-primary" type="submit">Save guest</button><button class="button button-quiet" type="button" id="guest-remove">Remove from list</button></div></form><p>${guest.arrived ? 'Arrival is already recorded; editing the name keeps that record.' : 'Updates are available to online door staff immediately.'}</p>`);
      content.querySelector('form').onsubmit = event => { event.preventDefault(); action(event.submitter, async () => {
        const form = new FormData(event.target); await api('staff/guestlist/save', { eventId, guestId: guest.id, version: guest.version, name: form.get('name'), note: form.get('note') }); document.querySelector('#ticketing-dialog').close(); await refresh(); message('Guest updated.');
      }); };
      content.querySelector('#guest-remove').onclick = event => action(event.currentTarget, async () => { await api('staff/guestlist/remove', { eventId, guestId: guest.id, version: guest.version }); document.querySelector('#ticketing-dialog').close(); await refresh(); message('Guest removed from the list.'); });
    } }, state);
  }
  await refresh();
}
export function doorGuestList(root, guests, options) {
  const state = { query: root.querySelector('input[type=search]')?.value || '', filter: root.querySelector('.guest-filter')?.value || 'all' };
  guestView(root, guests, options, state);
}
