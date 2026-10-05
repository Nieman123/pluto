import { BrowserQRCodeReader } from '@zxing/browser';
import { action, api, bind, esc, message, scannerSession, setScannerSession, user } from './api.js';
import { doorGuestList } from './guestlist.js';
import { attendancePanel } from './event-tools.js';
let manifest, verificationKey, cameraControls, scanning = false;
let feedbackTimer, cameraLastQr = '', cameraLastSeenAt = 0;
const eventId = () => document.querySelector('#staff-event').value;
const scannerStorage = 'pluto-scanner-session';
const admissionUid = () => scannerSession?.uid || user?.uid;
const recordedTime = () => Date.now() + (manifest?.deviceClockOffsetMs || 0);
function clearScanFeedback() {
  clearTimeout(feedbackTimer);
  const popup = document.querySelector('#admission-feedback');
  if (popup) { popup.hidden = true; delete popup.dataset.state; popup.querySelectorAll('h2, [data-scan-holder], [data-scan-type], [data-scan-note], .admission-feedback-mark').forEach(node => { node.textContent = ''; }); }
  const announcement = document.querySelector('#admission-feedback-announcement'); if (announcement) announcement.textContent = '';
}
function showScanFeedback(result) {
  const popup = document.querySelector('#admission-feedback'); if (!popup) return;
  clearScanFeedback();
  const accepted = result.result === 'accepted', duplicate = result.result === 'duplicate';
  const title = accepted ? 'Ticket scanned' : duplicate ? 'Already scanned' : result.result === 'outside-window' ? 'Outside admission window' : result.result === 'error' ? 'Scan not confirmed' : 'Ticket not accepted';
  const holder = result.holderName || (accepted || duplicate ? 'Attendee name unavailable' : '');
  const note = accepted ? result.offline ? 'Offline · Queued on this device. Server confirmation pending.' : 'Admission confirmed.' : duplicate ? 'This ticket was already checked in. Do not admit again.' : result.detail || 'No admission recorded.';
  popup.dataset.state = accepted ? result.offline ? 'offline' : 'accepted' : duplicate ? 'duplicate' : 'error';
  popup.querySelector('.admission-feedback-mark').textContent = accepted ? '✓' : '!';
  popup.querySelector('h2').textContent = title;
  popup.querySelector('[data-scan-holder]').textContent = holder;
  popup.querySelector('[data-scan-type]').textContent = result.name || '';
  popup.querySelector('[data-scan-note]').textContent = note;
  popup.hidden = false;
  document.querySelector('#admission-feedback-announcement').textContent = [title, holder, result.name, note].filter(Boolean).join('. ');
  feedbackTimer = setTimeout(clearScanFeedback, 2000);
}
function store() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('pluto-admission', 1);
    request.onupgradeneeded = () => { request.result.createObjectStore('state'); request.result.createObjectStore('queue', { keyPath: 'scanId' }); };
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
}
async function dbOperation(name, mode, operation) {
  const db = await store();
  return new Promise((resolve, reject) => { const transaction = db.transaction(name, mode), request = operation(transaction.objectStore(name)); transaction.oncomplete = () => { resolve(request?.result); db.close(); }; transaction.onerror = () => { reject(transaction.error); db.close(); }; });
}
export async function cacheStaffEvents(result, uid, expiresAt = Date.now() + 24 * 3600000) {
  const events = result.events.filter(e => e.roles.includes('admission') || e.roles.includes('manager')).map(({ id, title, roles }) => ({ id, title, canManage: roles.includes('manager') }));
  const previous = await dbOperation('state', 'readonly', s => s.get('session'));
  await dbOperation('state', 'readwrite', s => s.put({ uid, events, expiresAt, selected: previous?.uid === uid ? previous.selected : '' }, 'session'));
  const selector = document.querySelector('#staff-event');
  selector.innerHTML = '<option value="">Select an event</option>' + events.map(e => `<option value="${esc(e.id)}">${esc(e.title)}</option>`).join('');
  if (events.some(e => e.id === previous?.selected) && previous.uid === uid) selector.value = previous.selected;
}
export async function lockOfflineAdmission(clearCachedSession = true) {
  clearScanFeedback(); cameraLastQr = ''; cameraLastSeenAt = 0;
  document.querySelector('#ticketing-dialog')?.close(); document.querySelector('#ticketing-dialog-content')?.replaceChildren();
  cameraControls?.stop(); cameraControls = null; manifest = null; verificationKey = null;
  if (clearCachedSession) await dbOperation('state', 'readwrite', s => s.delete('session'));
  document.querySelector('#staff-controls').hidden = true;
  document.querySelector('#admission-video').hidden = true;
  document.querySelector('#admission-camera').textContent = 'Start camera';
  document.querySelector('#admission-results').replaceChildren();
  document.querySelector('#admission-conflicts')?.replaceChildren();
  document.querySelector('#door-guestlist').replaceChildren(); document.querySelector('#door-guestlist').hidden = true;
}
function scannerView(active) {
  document.querySelector('#scanner-login').hidden = active;
  document.querySelector('#scanner-session').hidden = !active;
  document.querySelector('#ticketing-auth').hidden = active;
  const selector = document.querySelector('#staff-event'); selector.disabled = active; selector.parentElement.hidden = active;
  if (active) {
    document.querySelector('#scanner-event-title').textContent = scannerSession.eventTitle;
    document.querySelector('#scanner-session-label').textContent = `${scannerSession.label} · Session ends ${new Date(scannerSession.expiresAt).toLocaleString()}`;
  }
}
async function openScanner(session) {
  setScannerSession(session); localStorage.setItem(scannerStorage, JSON.stringify(session));
  await cacheStaffEvents({ events: [{ id: session.eventId, title: session.eventTitle, roles: ['admission'] }] }, session.uid, session.expiresAt);
  document.querySelector('#staff-event').value = session.eventId;
  document.querySelector('#staff-controls').hidden = false; scannerView(true); await restoreManifest();
  message('Scanner ready. Start the camera to check tickets, or prepare offline admission before the doors open.');
}
async function closeScanner(clearStored = true, clearCachedSession = true) {
  setScannerSession(null); if (clearStored) localStorage.removeItem(scannerStorage); await lockOfflineAdmission(clearCachedSession); scannerView(false);
}
export async function initScanner() {
  bind('#admission-attendance', () => attendancePanel(eventId()));
  document.querySelector('#scanner-login-form').onsubmit = event => { event.preventDefault(); action(event.submitter, async () => {
    const session = await api('scanner/login', { pin: new FormData(event.target).get('pin') });
    await lockOfflineAdmission(); await openScanner(session); event.target.reset();
  }); };
  bind('#scanner-logout', async () => {
    try { if (navigator.onLine) await api('scanner/logout'); } finally { await closeScanner(); message('Scanner session ended. Enter a PIN to start again. Queued scans stay on this device.'); }
  });
  window.addEventListener('pluto-scanner-denied', () => action(null, closeScanner));
  window.addEventListener('storage', event => { if (event.key === scannerStorage && scannerSession) action(null, async () => { await closeScanner(false, false); message('Scanner access changed in another tab. Enter your PIN again.'); }); });
  let saved;
  try { saved = JSON.parse(localStorage.getItem(scannerStorage) || 'null'); } catch { localStorage.removeItem(scannerStorage); }
  if (!saved?.token || saved.expiresAt <= Date.now()) { if (saved) await closeScanner(); return false; }
  setScannerSession(saved);
  try {
    if (navigator.onLine) saved = { ...saved, ...await api('scanner/session') };
    await openScanner(saved);
    if (!navigator.onLine) await restoreOfflineAdmission();
    return true;
  } catch (error) {
    // A denied online credential cannot fall back to its offline snapshot.
    await closeScanner(); message(error.message, true); return false;
  }
}
export async function restoreOfflineAdmission() {
  const session = await dbOperation('state', 'readonly', s => s.get('session'));
  if (!session || session.expiresAt <= Date.now()) throw new Error('Prepare offline admission while signed in online. Offline access lasts 24 hours.');
  if (session.uid.startsWith('scanner_') && session.uid !== scannerSession?.uid) throw new Error('Enter your scanner PIN online before preparing offline admission.');
  const selector = document.querySelector('#staff-event');
  selector.innerHTML = session.events.map(e => `<option value="${esc(e.id)}">${esc(e.title)}</option>`).join('');
  if (session.events.some(e => e.id === session.selected)) selector.value = session.selected;
  document.querySelector('#staff-controls').hidden = false;
  await restoreManifest();
  if (!manifest) throw new Error('Offline admission has expired or has not been prepared for this event. Connect and prepare it again.');
  message(`Prepared offline admission. Reconnect ${scannerSession ? 'with this PIN' : 'and sign in'} to sync scans; use one offline lane.`);
}
async function cacheStatus() {
  const queue = (await dbOperation('queue', 'readonly', s => s.getAll())).filter(s => s.eventId === eventId());
  const age = manifest ? Math.floor((Date.now() - manifest.generatedAt) / 60000) : null;
  document.querySelector('#admission-cache-status').textContent = manifest ? `Manifest age: ${age} minutes · ${queue.length} queued scans · ${navigator.onLine ? 'Online' : 'Offline'} · Offline access until ${new Date(manifest.offlineUntil).toLocaleTimeString()}${age > 15 ? ' · Stale snapshot: transfers, refunds and new sales may be missing.' : ''}. Use one offline admission lane; wristbands handle festival re-entry.${scannerSession ? ' PIN revocation takes effect when this device reconnects.' : ''}` : `Prepare an event manifest while online before using offline admission.${scannerSession ? ' PIN offline access lasts up to 4 hours.' : ''}`;
}
export async function restoreManifest(selected = eventId()) {
  clearScanFeedback();
  const session = await dbOperation('state', 'readonly', s => s.get('session'));
  manifest = await dbOperation('state', 'readonly', s => s.get(`manifest-${selected}`));
  if (manifest?.staffUid !== session?.uid || !manifest?.leaseToken || !manifest?.offlineUntil || manifest.offlineUntil <= recordedTime()) manifest = null;
  verificationKey = manifest ? await crypto.subtle.importKey('jwk', manifest.verificationKey, { name: 'Ed25519' }, false, ['verify']) : null;
  if (session) await dbOperation('state', 'readwrite', s => s.put({ ...session, selected }, 'session'));
  await showConflicts();
  await cacheStatus();
  await loadDoorGuests();
}
async function loadDoorGuests() {
  const selected = eventId(), root = document.querySelector('#door-guestlist');
  if (!selected) { root.hidden = true; root.replaceChildren(); return; }
  let guests, offline = !navigator.onLine;
  if (!offline) {
    try { guests = (await api('staff/guestlist', { eventId: selected })).guests; }
    catch (error) { if (error.status) throw error; offline = true; }
  }
  if (selected !== eventId() || document.querySelector('#staff-controls').hidden) return;
  if (offline) {
    if (!manifest || manifest.offlineUntil <= recordedTime()) { root.hidden = false; root.innerHTML = '<h2>Guest list</h2><p>Prepare offline admission while connected to load this event’s guest list.</p>'; return; }
    guests = manifest.guests || [];
  } else if (manifest?.eventId === selected) {
    // New or edited guests need a new preparation proof before offline check-in.
    manifest.guests = (manifest.guests || []).flatMap(prepared => {
      const latest = guests.find(g => g.id === prepared.id && g.version === prepared.version);
      return latest ? [{ ...latest, itemProof: prepared.itemProof }] : [];
    }); await dbOperation('state', 'readwrite', s => s.put(manifest, `manifest-${selected}`));
  }
  const pending = (await dbOperation('queue', 'readonly', s => s.getAll())).filter(s => s.eventId === selected && s.kind === 'guest');
  const display = guests.map(g => pending.some(s => s.guestId === g.id) ? { ...g, arrived: { at: pending.find(s => s.guestId === g.id).deviceTime, label: scannerSession?.label || 'Event staff', pending: true } } : g);
  root.hidden = false;
  doorGuestList(root, display, { offline, refresh: loadDoorGuests, arrive: arriveGuest });
}
async function offlineSession() {
  const session = await dbOperation('state', 'readonly', s => s.get('session'));
  if (!session || session.expiresAt <= recordedTime() || session.uid !== manifest?.staffUid || !manifest?.leaseToken || !manifest?.offlineUntil || manifest.offlineUntil <= recordedTime() || manifest.eventId !== eventId()) throw new Error('Offline admission access has expired. Prepare again online.');
  return session;
}
async function offlineGuestArrival(guestId, scanId) {
  const session = await offlineSession(), guest = manifest.guests?.find(g => g.id === guestId);
  if (!guest?.itemProof) throw new Error('This guest is missing from the prepared list. Prepare it again online.');
  if (recordedTime() < Date.parse(manifest.guestValidFrom) || recordedTime() > Date.parse(manifest.guestValidUntil)) throw new Error('Guest check-in is outside the event admission window.');
  if (guest.arrived) return { result: 'duplicate', name: guest.name };
  const arrival = { at: recordedTime(), label: scannerSession?.label || 'Event staff', offline: true, pending: true }, db = await store();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(['state', 'queue'], 'readwrite'), state = tx.objectStore('state'), queue = tx.objectStore('queue'), request = state.get(`manifest-${eventId()}`);
    request.onsuccess = () => { const current = request.result, entry = current?.guests?.find(g => g.id === guestId);
      if (!entry || entry.arrived || current.staffUid !== session.uid || current.leaseToken !== manifest.leaseToken || entry.version !== guest.version || current.offlineUntil <= recordedTime()) { tx.abort(); return; }
      entry.arrived = arrival; state.put(current, `manifest-${eventId()}`);
      queue.add({ kind: 'guest', scanId, eventId: eventId(), guestId, guestVersion: guest.version, leaseToken: manifest.leaseToken, itemProof: guest.itemProof, ticketId: `guest_${guestId}`, name: guest.name, deviceTime: arrival.at, staffUid: session.uid });
    };
    tx.oncomplete = () => { db.close(); resolve(); }; tx.onabort = () => { db.close(); reject(new Error('This guest was already marked locally, or offline access changed. Refresh the list.')); }; tx.onerror = () => { db.close(); reject(tx.error); };
  });
  guest.arrived = arrival; return { result: 'accepted', name: guest.name, offline: true };
}
async function arriveGuest(guestId) {
  const scanId = crypto.randomUUID(); let result;
  if (!navigator.onLine) result = await offlineGuestArrival(guestId, scanId);
  else {
    try { result = await api('staff/guestlist/arrive', { eventId: eventId(), guestId, scanId }); }
    catch (error) { if (error.status) throw error; result = await offlineGuestArrival(guestId, scanId); }
  }
  await cacheStatus(); return result;
}
async function showConflicts() {
  let root = document.querySelector('#admission-conflicts');
  if (!root) { root = Object.assign(document.createElement('div'), { id: 'admission-conflicts' }); document.querySelector('#admission-results').after(root); }
  const session = await dbOperation('state', 'readonly', s => s.get('session')), canManage = !scannerSession && session?.uid === user?.uid && session?.events.some(e => e.id === eventId() && e.canManage);
  document.querySelector('#admission-manager-import').hidden = !canManage;
  let records = (await dbOperation('state', 'readonly', s => s.getAll())).filter(s => s.scanId && s.eventId === eventId() && s.result);
  if (canManage && navigator.onLine && eventId()) {
    const server = await api('staff/offline-conflicts', { eventId: eventId() });
    records = server.scans.map(s => ({ ...s, result: { result: s.result }, note: s.reviewNote || '', reviewed: false }));
  }
  root.innerHTML = records.length ? `<h2>Offline conflicts</h2>${records.map(s => `<article class="ticket-card"><p>${esc(s.kind === 'guest' ? `Guest: ${s.name}` : s.ticketId)} · ${esc(s.result.result)} · ${s.reviewed ? 'Reviewed' : 'Needs review'}</p>${s.reviewed ? `<p>${esc(s.note)}</p>` : `<label>Review note<input data-conflict-note="${esc(s.scanId)}" maxlength="500"></label><button type="button" data-review-conflict="${esc(s.scanId)}">Record review</button>`}</article>`).join('')}` : '';
  root.querySelectorAll('[data-review-conflict]').forEach(button => button.onclick = () => action(button, async () => {
    const note = root.querySelector(`[data-conflict-note="${button.dataset.reviewConflict}"]`).value.trim(); if (!note) throw new Error('Add a review note first.');
    await api('staff/scan-review', { eventId: eventId(), scanId: button.dataset.reviewConflict, note });
    const record = records.find(s => s.scanId === button.dataset.reviewConflict);
    await dbOperation('state', 'readwrite', s => s.put({ ...record, reviewed: true, note }, `conflict-${record.scanId}`)); await showConflicts();
  }));
  if (canManage) root.querySelectorAll('[data-review-conflict]').forEach(button => {
    button.textContent = 'Reject recorded admission';
    button.onclick = () => action(button, () => resolve(button.dataset.reviewConflict, 'reject'));
    const confirm = Object.assign(document.createElement('button'), { type: 'button', textContent: 'Confirm recorded admission' });
    confirm.onclick = () => action(confirm, () => resolve(button.dataset.reviewConflict, 'confirm')); button.before(confirm);
  });
  async function resolve(scanId, decision) {
    const note = root.querySelector(`[data-conflict-note="${scanId}"]`).value.trim(); if (!note) throw new Error('Add a resolution note first.');
    await api('staff/offline-resolve', { eventId: eventId(), scanId, decision, note }); await showConflicts(); await loadDoorGuests(); message('Recorded admission resolved with an audit record.');
  }
}
function bytes(encoded) { return Uint8Array.from(atob(encoded.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0)); }
async function offlineScan(qr, scanId) {
  const session = await offlineSession();
  if (!manifest || manifest.eventId !== eventId() || !verificationKey) throw new Error('This event has no prepared offline manifest.');
  const [prefix, data, signature, extra] = qr.split('.');
  if (prefix !== 'PLUTO1' || extra || !await crypto.subtle.verify('Ed25519', verificationKey, bytes(signature), new TextEncoder().encode(data))) throw new Error('Invalid ticket signature.');
  const token = JSON.parse(new TextDecoder().decode(bytes(data))), ticket = manifest.tickets.find(t => t.id === token.id);
  if (token.eventId !== eventId() || !ticket?.itemProof || ticket.version !== token.version || ticket.status !== 'valid') throw new Error('Ticket is not valid in the prepared manifest. Refresh it online if the ticket is new or transferred.');
  if (recordedTime() < Date.parse(ticket.validFrom) || recordedTime() > Date.parse(ticket.validUntil)) throw new Error('Ticket is outside its admission window.');
  if (ticket.admitted) return { result: 'duplicate', name: ticket.name, holderName: ticket.holderName };
  const db = await store();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction(['state', 'queue'], 'readwrite'), state = transaction.objectStore('state'), queued = transaction.objectStore('queue');
    const request = state.get(`manifest-${eventId()}`);
    request.onsuccess = () => { const current = request.result, unit = current?.tickets.find(t => t.id === token.id); if (!unit || unit.admitted || current.staffUid !== session.uid || current.leaseToken !== manifest.leaseToken || current.offlineUntil <= recordedTime()) { transaction.abort(); return; } unit.admitted = true; state.put(current, `manifest-${eventId()}`); queued.add({ scanId, eventId: eventId(), qr, ticketId: ticket.id, deviceTime: recordedTime(), leaseToken: manifest.leaseToken, itemProof: ticket.itemProof, staffUid: session.uid }); };
    transaction.oncomplete = () => { db.close(); resolve(); }; transaction.onabort = () => { db.close(); reject(new Error('This ticket was already admitted locally.')); }; transaction.onerror = () => { db.close(); reject(transaction.error); };
  });
  ticket.admitted = true; return { result: 'accepted', name: ticket.name, holderName: ticket.holderName, offline: true };
}
async function scan(qr) {
  if (scanning) return; scanning = true;
  const selected = eventId(), uid = admissionUid();
  const stillActive = () => eventId() === selected && admissionUid() === uid && !document.querySelector('#staff-controls').hidden;
  clearScanFeedback();
  try {
    if (!eventId()) throw new Error('Choose an event first.');
    const scanId = crypto.randomUUID(); let result;
    if (!navigator.onLine) result = await offlineScan(qr, scanId);
    else {
      try {
        result = await api('staff/scan', { eventId: eventId(), qr, scanId });
        if (result.result === 'accepted' || result.result === 'duplicate') {
          const ticket = manifest?.tickets.find(t => t.id === result.ticketId);
          if (ticket) { ticket.admitted = true; await dbOperation('state', 'readwrite', s => s.put(manifest, `manifest-${eventId()}`)); }
        }
      }
      catch (error) {
        // Permission or validation failures never downgrade to offline admission.
        if (error.status) throw error;
        result = await offlineScan(qr, scanId);
      }
    }
    if (!stillActive()) return;
    message('');
    showScanFeedback(result);
    const root = document.querySelector('#admission-results'), card = document.createElement('article'); card.className = `ticket-card admission-${result.result}`;
    card.innerHTML = `<strong>${esc(result.result.toUpperCase())}</strong><p>${esc(result.holderName)}${result.holderName ? ' · ' : ''}${esc(result.name)}${result.offline ? ' · Offline: queued for server confirmation' : ''}</p>`; root.prepend(card);
    if (root.children.length > 30) root.lastElementChild.remove(); await cacheStatus().catch(error => message(error.message, true));
  } catch (error) {
    if (stillActive()) showScanFeedback({ result: 'error', detail: error.message });
    throw error;
  } finally { setTimeout(() => { scanning = false; }, 1800); }
}
async function replay() {
  if (!navigator.onLine) throw new Error('Connect to the internet to replay queued scans.');
  const session = await dbOperation('state', 'readonly', s => s.get('session'));
  const uid = admissionUid();
  if (!uid || session?.uid !== uid) throw new Error('Use the scanner PIN or staff account that prepared these scans.');
  const queue = await dbOperation('queue', 'readonly', s => s.getAll()); let conflicts = 0, accepted = 0;
  for (const item of queue.filter(i => i.eventId === eventId())) {
    if (item.staffUid !== uid) throw new Error('This queue belongs to another scanner PIN or staff account. Use that access to sync it.');
    const result = await api(item.kind === 'guest' ? 'staff/guestlist/arrive' : 'staff/scan', { ...item, offline: true });
    if (result.result !== 'accepted') {
      conflicts++; const root = document.querySelector('#admission-results'), row = document.createElement('p'); row.textContent = `Review offline conflict ${item.ticketId}: ${result.result}`; root.prepend(row);
      await dbOperation('state', 'readwrite', s => s.put({ ...item, result, reviewed: false }, `conflict-${item.scanId}`));
    } else accepted++;
    await dbOperation('queue', 'readwrite', s => s.delete(item.scanId));
  }
  message(`Synced ${accepted} admissions. ${conflicts} conflicts require staff review.`); await showConflicts(); await cacheStatus(); await loadDoorGuests();
}
export function initAdmission() {
  if (!document.querySelector('#admission-form')) return;
  bind('#admission-feedback-close', clearScanFeedback);
  bind('#admission-manager-import', async () => {
    if (!navigator.onLine || !user || scannerSession) throw new Error('Sign in as an event manager online to review this device’s queue.');
    const queue = (await dbOperation('queue', 'readonly', s => s.getAll())).filter(item => item.eventId === eventId());
    for (const item of queue) {
      await api('staff/offline-submit', item); await dbOperation('queue', 'readwrite', s => s.delete(item.scanId));
    }
    await showConflicts(); await cacheStatus(); message('Queued admissions imported for manager review. Confirm or reject each entry with a note.');
  });
  bind('#admission-sync', async () => {
    if (!eventId()) throw new Error('Choose an event first.');
    await replay(); const latest = await api('staff/manifest', { eventId: eventId() }); latest.deviceClockOffsetMs = latest.generatedAt - Date.now(); await dbOperation('state', 'readwrite', s => s.put(latest, `manifest-${eventId()}`)); await restoreManifest();
    await navigator.serviceWorker.register('/tickets/admission-sw.js', { scope: '/tickets/' }); message(`Admission is prepared for offline use${scannerSession ? ' for up to 4 hours' : ''}. Keep this device signed in and use one offline lane.`);
  });
  bind('#admission-replay', replay);
  document.querySelector('#admission-form').onsubmit = event => { event.preventDefault(); action(event.submitter, () => scan(new FormData(event.target).get('qr'))); };
  document.querySelector('#staff-event').addEventListener('change', () => action(null, () => restoreManifest()));
  bind('#admission-camera', async () => {
    const video = document.querySelector('#admission-video');
    cameraLastQr = ''; cameraLastSeenAt = 0;
    if (cameraControls) { cameraControls.stop(); cameraControls = null; video.hidden = true; document.querySelector('#admission-camera').textContent = 'Start camera'; return; }
    video.hidden = false; const reader = new BrowserQRCodeReader();
    try { cameraControls = await reader.decodeFromConstraints({ video: { facingMode: 'environment' } }, video, result => {
      if (!result) return;
      const qr = result.getText(), now = Date.now(), sameCodeInView = qr === cameraLastQr && now - cameraLastSeenAt < 2500;
      if (qr === cameraLastQr) cameraLastSeenAt = now;
      // Keep continuous frames of one QR from replacing its confirmation with a duplicate warning.
      if (scanning || sameCodeInView) return;
      cameraLastQr = qr; cameraLastSeenAt = now;
      scan(qr).catch(error => message(error.message, true));
    }); document.querySelector('#admission-camera').textContent = 'Stop camera'; }
    catch (error) { video.hidden = true; throw error; }
  });
  const refreshConnection = () => action(null, async () => { await cacheStatus(); if (!document.querySelector('#staff-controls').hidden) await loadDoorGuests(); });
  window.addEventListener('online', refreshConnection); window.addEventListener('offline', refreshConnection);
}
