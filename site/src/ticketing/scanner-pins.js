import { action, api, dialog, esc, message } from './api.js';

function inputDate(time) {
  const date = new Date(time); return new Date(time - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
export async function scannerPins() {
  const eventId = document.querySelector('#staff-event').value;
  if (!eventId) throw new Error('Choose an event first.');
  let data = await api('staff/scanner-pins', { eventId });
  const content = dialog(`<h2>Ticket Scanner PINs</h2><p>Create a PIN for each door person or lane. They open <a href="/tickets/staff">Admission</a> and enter the PIN to scan this event’s tickets. No account needed.</p><div id="scanner-pin-created" hidden></div><form id="scanner-pin-create"><label>Door person or lane name<input name="label" maxlength="100" placeholder="Alex · Main entrance" required></label><label>Expires (your local time)<input name="expiresAt" type="datetime-local" value="${inputDate(data.defaultExpiresAt)}" required></label><button class="button button-primary" type="submit">Generate scanner PIN</button></form><p>PINs allow admission only. Revoke stops online access immediately. Prepared offline devices can scan for up to 4 hours and check revocation when they reconnect.</p><h3>Your scanner PINs</h3><div id="scanner-pin-list"></div>`);
  let generated;
  function renderList() {
    const list = content.querySelector('#scanner-pin-list');
    const notice = data.legacyPinsRemaining ? `<p role="status">${data.legacyPinsRemaining} active PIN${data.legacyPinsRemaining === 1 ? '' : 's'} still need${data.legacyPinsRemaining === 1 ? 's' : ''} migration. Have the door person log in while online, or revoke and replace the PIN before retiring the old signing key.</p>` : '';
    list.innerHTML = notice + (data.pins.length ? data.pins.map(pin => `<article class="scanner-pin-row"><div><strong>${esc(pin.label)}</strong><p>${pin.revokedAt ? 'Revoked' : pin.expiresAt <= Date.now() ? 'Expired' : 'Active'} · Expires ${esc(new Date(pin.expiresAt).toLocaleString())}${data.migrationEnabled && !pin.lookupKeyId && !pin.revokedAt && pin.expiresAt > Date.now() ? ' · Needs migration' : ''}</p><p>${pin.loginCount} session${pin.loginCount === 1 ? '' : 's'} started${pin.lastUsedAt ? ` · Last used ${esc(new Date(pin.lastUsedAt).toLocaleString())}` : ''}</p></div>${!pin.revokedAt && pin.expiresAt > Date.now() ? `<button class="button button-quiet" type="button" data-revoke-pin="${esc(pin.id)}" aria-label="Revoke PIN for ${esc(pin.label)}">Revoke</button>` : ''}</article>`).join('') : '<p>No PINs yet. Generate one to give your door team scanner access.</p>');
    list.querySelectorAll('[data-revoke-pin]').forEach(button => button.onclick = () => action(button, async () => {
      await api('staff/scanner-pins/revoke', { eventId, pinId: button.dataset.revokePin });
      if (generated?.id === button.dataset.revokePin) { generated = null; content.querySelector('#scanner-pin-created').replaceChildren(); content.querySelector('#scanner-pin-created').hidden = true; }
      data = await api('staff/scanner-pins', { eventId }); renderList(); message('Scanner PIN revoked. Online devices have lost access.');
    }));
  }
  renderList();
  content.querySelector('#scanner-pin-create').onsubmit = event => { event.preventDefault(); action(event.submitter, async () => {
    const form = new FormData(event.target);
    generated = await api('staff/scanner-pins/create', { eventId, label: form.get('label'), expiresAt: new Date(form.get('expiresAt')).getTime() });
    const formatted = `${generated.pin.slice(0, 4)} ${generated.pin.slice(4)}`, created = content.querySelector('#scanner-pin-created');
    created.hidden = false;
    created.innerHTML = `<p class="eyebrow">READY FOR THE DOOR</p><h3>${esc(generated.label)}</h3><label>New scanner PIN<input id="new-scanner-pin" class="scanner-pin-code" readonly value="${formatted}" autocomplete="off"></label><p>Copy this now. The code is shown here once; create a replacement if it’s lost.</p><div class="ticket-toolbar"><button id="copy-scanner-pin" class="button button-primary" type="button">Copy PIN</button><button id="copy-scanner-instructions" class="button button-quiet" type="button">Copy text message</button></div><p id="scanner-copy-status" role="status"></p>`;
    async function copy(value) {
      try { await navigator.clipboard.writeText(value); created.querySelector('#scanner-copy-status').textContent = 'Copied to clipboard.'; }
      catch { created.querySelector('#new-scanner-pin').select(); created.querySelector('#scanner-copy-status').textContent = 'Clipboard unavailable. Select and copy the PIN above.'; }
    }
    created.querySelector('#copy-scanner-pin').onclick = () => action(null, () => copy(generated.pin));
    created.querySelector('#copy-scanner-instructions').onclick = () => action(null, () => copy(`Your Pluto Ticket Scanner PIN is ${formatted}. Open ${location.origin}/tickets/staff and enter it to scan tickets for ${document.querySelector('#workspace-title').textContent}. No account needed. PIN expires ${new Date(generated.expiresAt).toLocaleString()}.`));
    event.target.elements.label.value = '';
    data = await api('staff/scanner-pins', { eventId }); renderList(); created.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    message('Scanner PIN created. Copy the PIN or ready-to-text instructions for your door person.');
  }); };
}
